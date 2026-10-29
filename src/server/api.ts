import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";
import open from "open";
import { z } from "zod";
import { GuionSchema, MarcaSchema, PASOS, TonoSchema, type Estado } from "../shared/schemas";
import { ModoEdicionSchema } from "../shared/modos";
import { UsoBibliotecaSchema } from "../shared/opcionesCrudo";
import { borrarTrabajo, espacioJobs, espacioTrabajo, recuperarTrabajo } from "../pipeline/borrado";
import { cola } from "../pipeline/cola";
import { estadoClaves, guardarClave, NOMBRES_CLAVES, probarClave } from "../pipeline/claves";
import { agregarCredencial, borrarCredencial, editarCredencial, listarCredenciales, probarCredencial, SERVICIOS, tienePrueba } from "../pipeline/credenciales";
import { guardarMarca, leerMarca, leerMarcaConAvisos } from "../pipeline/config";
import { bus, type Evento } from "../pipeline/eventos";
import { pedirIdeas, regenerarEscena } from "../pipeline/pasos/guion";
import { RAIZ } from "../pipeline/rutas";
import { guardarTono, leerTono, listarTonos } from "../pipeline/tonos";
import { Trabajo } from "../pipeline/trabajo";
import { DIR_PRUEBAS_VOZ, generarMuestra, listarMuestras, TEXTOS_MUESTRA } from "../pipeline/muestras";
import { estiloGemini } from "../pipeline/pasos/voz";
import { proveedorDeVoz, VOCES_GEMINI_DISPONIBLES } from "../pipeline/tts";
import { sintetizarGemini } from "../pipeline/tts/gemini";
import { leerUso } from "../pipeline/usoGemini";
import { instalarKokoro, kokoroInstalado } from "../pipeline/instalar";
import { registrarCrudo } from "./crudo";
import { registrarVozPropia } from "./vozPropia";
import { ReporteMarcaSchema } from "../pipeline/marca/verificador";
import { archivoCA, estadoHttps, ipsLocales } from "./https";
import { registrarBiblioteca } from "./biblioteca";
import { registrarPerfiles } from "./perfiles";
import { fijarPerfil, guardarUltimoPerfilAnimados, leerPerfil } from "../pipeline/perfiles";
import { listarVoces, proveedor, vocesKokoro, type VozDisponible } from "./voces";

/** Error con mensaje para el usuario (en español) y código HTTP. */
class ErrorApi extends Error {
  constructor(
    readonly codigo: number,
    message: string,
  ) {
    super(message);
  }
}

const parsear = <T extends z.ZodType>(schema: T, datos: unknown): z.infer<T> => {
  const r = schema.safeParse(datos);
  if (!r.success) throw new ErrorApi(400, r.error.issues.map((i) => `${i.path.join(".") || "datos"}: ${i.message}`).join("; "));
  return r.data;
};

const abrir = async (id: string) => {
  try {
    return await Trabajo.abrir(id);
  } catch {
    throw new ErrorApi(404, `No existe el trabajo ${id}`);
  }
};

const leerTexto = async (t: Trabajo, archivo: string) => (t.existe(archivo) ? readFile(t.ruta(archivo), "utf8") : null);

/** Detalle completo de un trabajo para la UI. */
const detalle = async (t: Trabajo) => {
  const estado = await t.estado();
  const guion = await t.leer("guion.json", GuionSchema);
  const log = (await leerTexto(t, "log.txt"))?.trim().split("\n").slice(-200) ?? [];
  return {
    estado,
    guion,
    publicacion: await leerTexto(t, "publicacion.txt"),
    fuentes: guion?.fuentes ?? [],
    log,
    archivos: {
      video: t.existe("video.mp4") ? `/jobs/${t.id}/video.mp4` : null,
      portada: t.existe("portada.png") ? `/jobs/${t.id}/portada.png` : null,
    },
    enCola: cola.ids.includes(t.id) || cola.enCurso === t.id,
    marcaReporte: await t.leer("marca-reporte.json", ReporteMarcaSchema),
  };
};

export const registrarApi = async (app: FastifyInstance) => {
  app.setErrorHandler((err, _req, reply) => {
    const e = err instanceof Error ? err : new Error(String(err));
    const codigo = e instanceof ErrorApi ? e.codigo : ((e as { statusCode?: number }).statusCode ?? 500);
    if (codigo >= 500) app.log.error(e);
    void reply.code(codigo).send({ error: e.message });
  });

  // ---------- trabajos ----------

  app.get("/api/trabajos", async () => {
    const estados = await Trabajo.listar();
    return estados.map((e) => {
      const dir = path.join(RAIZ, "jobs", e.id);
      return {
        ...e,
        portada: existsSync(path.join(dir, "portada.png")) ? `/jobs/${e.id}/portada.png` : null,
        video: existsSync(path.join(dir, "video.mp4")) ? `/jobs/${e.id}/video.mp4` : null,
      };
    });
  });

  app.get<{ Params: { id: string } }>("/api/trabajos/:id", async (req) => detalle(await abrir(req.params.id)));

  /** Crea uno o varios trabajos (una idea o un texto largo por elemento) y los pone en la cola. */
  app.post("/api/trabajos", async (req) => {
    const body = parsear(
      z.object({
        ideas: z.array(z.string().trim().min(3, "La idea es muy corta")).min(1, "Escribí al menos una idea").max(30),
        voz: z.string().optional(),
        auto: z.boolean().optional(),
        tono: z.string().optional(),
        perfil: z.string().regex(/^[a-z0-9-]+$/).optional(),
        cierre: z.boolean().optional(),
        modo: z.enum(["ia", "mi_voz"]).optional(),
        estiloIlustracion: z.enum(["auto", "plano", "cartoon", "documental"]).optional(),
        cantidadIlustracion: z.enum(["poca", "media", "mucha"]).optional(),
        opinion: z.string().trim().max(800).optional(),
        modoEdicion: ModoEdicionSchema.optional(),
        biblioteca: UsoBibliotecaSchema.optional(),
      }),
      req.body,
    );
    if (body.tono) await leerTono(body.tono).catch((e: Error) => Promise.reject(new ErrorApi(400, e.message)));
    const perfil = body.perfil ? await leerPerfil(body.perfil) : null;
    if (body.perfil && !perfil) throw new ErrorApi(400, `No existe el perfil ${body.perfil}`);
    if (perfil) await guardarUltimoPerfilAnimados(perfil.slug);
    const ids: string[] = [];
    for (const idea of body.ideas) {
      const t = await Trabajo.crear(idea, {
        voz: body.voz,
        auto: body.auto,
        tono: body.tono,
        perfil: body.perfil,
        cierre: body.cierre,
        modo: body.modo,
        estiloIlustracion: body.estiloIlustracion,
        cantidadIlustracion: body.cantidadIlustracion,
        opinion: body.opinion || undefined,
        modoEdicion: body.modoEdicion,
        biblioteca: body.biblioteca,
      });
      if (perfil) await fijarPerfil(t, perfil);
      ids.push(t.id);
      await cola.encolar(t.id);
    }
    return { ids };
  });

  app.post<{ Params: { id: string } }>("/api/trabajos/:id/cancelar", async (req) => {
    await cola.cancelar((await abrir(req.params.id)).id);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/api/trabajos/:id/reanudar", async (req) => {
    const t = await abrir(req.params.id);
    await cola.encolar(t.id);
    return { ok: true };
  });

  /** Guarda el guion editado en la revisión (valida con el mismo esquema que usa Claude). */
  app.put<{ Params: { id: string } }>("/api/trabajos/:id/guion", async (req) => {
    const t = await abrir(req.params.id);
    if (cola.enCurso === t.id) throw new ErrorApi(409, "El trabajo se está procesando: esperá a que termine o cancelalo.");
    const guion = parsear(GuionSchema, req.body);
    await t.escribir("guion.json", guion);
    // si ya había voz, se rehace (las escenas que no cambiaron reutilizan su audio)
    const e = await t.estado();
    if (e.pasos.voz !== "pendiente") await t.invalidarDesde("voz");
    await t.log("Guion editado desde la app.");
    return detalle(t);
  });

  app.post<{ Params: { id: string } }>("/api/trabajos/:id/aprobar", async (req) => {
    const t = await abrir(req.params.id);
    if (!t.existe("guion.json")) throw new ErrorApi(409, "Todavía no hay guion para aprobar.");
    await t.marcarPaso("revision", "hecho");
    await t.log("Guion aprobado.");
    await cola.encolar(t.id);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/api/trabajos/:id/regenerar-guion", async (req) => {
    const t = await abrir(req.params.id);
    if (cola.enCurso === t.id) throw new ErrorApi(409, "El trabajo se está procesando: cancelalo primero.");
    const { instruccion } = parsear(z.object({ instruccion: z.string().max(500).optional() }), req.body ?? {});
    await t.actualizar((e) => {
      e.opciones.instruccion = instruccion?.trim() || undefined;
    });
    await t.invalidarDesde("guion");
    await t.log(`Regenerando guion${instruccion ? ` (indicación: ${instruccion})` : ""}.`);
    await cola.encolar(t.id);
    return { ok: true };
  });

  app.post<{ Params: { id: string; n: string } }>("/api/trabajos/:id/escenas/:n/regenerar", async (req) => {
    const t = await abrir(req.params.id);
    const { instruccion } = parsear(z.object({ instruccion: z.string().max(500).optional() }), req.body ?? {});
    const guion = await t.leer("guion.json", GuionSchema);
    const n = Number(req.params.n);
    if (!guion || !Number.isInteger(n) || n < 0 || n >= guion.escenas.length) throw new ErrorApi(404, "Esa escena no existe.");
    const marca = await leerMarca();
    t.actividad(`Regenerando la escena ${n + 1}…`);
    const escena = await regenerarEscena(t, guion, n, marca, instruccion);
    const nuevo = parsear(GuionSchema, { ...guion, escenas: guion.escenas.map((e, i) => (i === n ? escena : e)) });
    await t.escribir("guion.json", nuevo);
    if ((await t.estado()).pasos.voz !== "pendiente") await t.invalidarDesde("voz");
    await t.log(`Escena ${n + 1} regenerada.`);
    return detalle(t);
  });

  /** "Rehacer con otra voz": cambia la voz y rehace desde la voz (guion y revisión quedan). */
  app.post<{ Params: { id: string } }>("/api/trabajos/:id/rehacer-voz", async (req) => {
    const t = await abrir(req.params.id);
    if (cola.enCurso === t.id) throw new ErrorApi(409, "El trabajo se está procesando: cancelalo primero.");
    const { voz } = parsear(z.object({ voz: z.string().min(3) }), req.body);
    await t.actualizar((e) => {
      e.opciones.voz = voz;
    });
    await t.invalidarDesde("voz");
    await t.log(`Rehaciendo con la voz ${voz}.`);
    await cola.encolar(t.id);
    return { ok: true };
  });

  // ---------- borrar trabajos (nunca nada fuera de jobs/) ----------

  /** Espacio de jobs/ y de cada trabajo, para mostrar cuánto se libera ANTES de confirmar. */
  app.get("/api/espacio", async () => {
    const trabajos: Record<string, Awaited<ReturnType<typeof espacioTrabajo>>> = {};
    for (const e of await Trabajo.listar()) trabajos[e.id] = await espacioTrabajo(e.id).catch(() => ({ total: 0, liberaDisco: 0, liberaSoloFinal: 0 }));
    return { jobs: await espacioJobs(), trabajos };
  });

  app.post("/api/trabajos/borrar", async (req) => {
    const { ids, modo, cancelarEnCurso } = parsear(
      z.object({ ids: z.array(z.string()).min(1).max(500), modo: z.enum(["lista", "disco", "soloFinal"]), cancelarEnCurso: z.boolean().default(false) }),
      req.body,
    );
    const borrados: string[] = [];
    const errores: { id: string; error: string }[] = [];
    let liberados = 0;
    for (const id of ids) {
      try {
        if (cola.enCurso === id) {
          if (!cancelarEnCurso) throw new Error("se está procesando (confirmá que querés cancelarlo)");
          await cola.cancelar(id);
          await cola.esperarLibre(id);
        } else if (cola.ids.includes(id)) await cola.cancelar(id);
        liberados += await borrarTrabajo(id, modo);
        borrados.push(id);
      } catch (e) {
        errores.push({ id, error: (e as Error).message });
      }
    }
    return { borrados, errores, liberados, jobs: await espacioJobs() };
  });

  app.post("/api/trabajos/recuperar", async (req) => {
    const { ids } = parsear(z.object({ ids: z.array(z.string()).min(1).max(500) }), req.body);
    for (const id of ids) await recuperarTrabajo((await abrir(id)).id);
    return { ok: true };
  });

  /** "Vaciar cola": cancela lo pendiente; el que se está procesando solo si se confirma. */
  app.post("/api/cola/vaciar", async (req) => {
    const { cancelarEnCurso } = parsear(z.object({ cancelarEnCurso: z.boolean().default(false) }), req.body ?? {});
    return { cancelados: await cola.vaciar(cancelarEnCurso) };
  });

  /** Abre la carpeta del trabajo en el explorador de archivos de la compu donde corre la app. */
  app.post<{ Params: { id: string } }>("/api/trabajos/:id/abrir-carpeta", async (req) => {
    const t = await abrir(req.params.id);
    await open(t.dir);
    return { ok: true };
  });

  // ---------- ideas ----------

  app.post("/api/ideas", async (req) => {
    const { tema } = parsear(z.object({ tema: z.string().max(200).optional() }), req.body ?? {});
    const marca = await leerMarca();
    return { ideas: await pedirIdeas(marca, { tema: tema?.trim() || undefined }) };
  });

  // ---------- tonos (prompts/tonos/*.md) ----------

  app.get("/api/tonos", async () => ({ tonos: await listarTonos() }));

  /** Crea o edita un tono. */
  app.put<{ Params: { id: string } }>("/api/tonos/:id", async (req) => {
    const tono = parsear(TonoSchema, { ...(req.body as object), id: req.params.id });
    const existentes = (await listarTonos()).map((t) => t.id);
    const faltan = tono.incluye.filter((i) => i === tono.id || !existentes.includes(i));
    if (faltan.length) throw new ErrorApi(400, `"Incluye" tiene tonos que no existen o es el mismo: ${faltan.join(", ")}`);
    return { tono: await guardarTono(tono) };
  });

  // ---------- voces ----------

  let vocesCache: VozDisponible[] | null = null;
  app.get("/api/voces", async () => {
    // Kokoro se mira cada vez: puede instalarse con la app abierta
    vocesCache ??= [...VOCES_GEMINI_DISPONIBLES, ...(await listarVoces())];
    return { voces: [...vocesCache, ...(await vocesKokoro())] };
  });

  /** Muestra corta de una voz (se genera una vez y se guarda en .cache/voces). */
  app.get<{ Querystring: { voz?: string; velocidad?: string } }>("/api/voces/muestra", async (req, reply) => {
    const voz = parsear(z.string().regex(/^[\w:-]+$/, "Voz inválida"), req.query.voz);
    const marca = await leerMarca();
    const velocidad = parsear(MarcaSchema.shape.velocidad, req.query.velocidad ?? marca.velocidad);
    const dir = path.join(RAIZ, ".cache", "voces");
    await mkdir(dir, { recursive: true });
    const prov = proveedorDeVoz(voz);
    const base = path.join(dir, `${voz.replace(":", "-")}${prov === "gemini" ? "" : velocidad.replace(/[^\d+-]/g, "")}`);
    const ext = prov === "edge" ? ".mp3" : ".wav";
    if (!existsSync(base + ext)) {
      const voseo = prov === "gemini" || /es-(UY|AR)/.test(voz);
      const texto = voseo ? "¡Hola! Así sueno yo. ¿Querés que cuente tus videos?" : "¡Hola! Así sueno yo. ¿Quieres que cuente tus vídeos?";
      if (prov === "gemini") await sintetizarGemini({ texto, voz, estilo: estiloGemini(null, velocidad), salida: base + ext });
      else await proveedor(prov).sintetizar({ texto, voz, velocidad, tono: marca.tono, salidaSinExt: base, sinTiempos: true });
    }
    return enviarArchivo(reply, base + ext, ext === ".mp3" ? "audio/mpeg" : "audio/wav");
  });

  // ---------- comparar voces (archivos en pruebas-voz/) ----------

  app.get("/api/pruebas-voz", async () => ({ muestras: await listarMuestras(), textos: TEXTOS_MUESTRA }));

  /** Genera la muestra de cada voz elegida leyendo el texto de un tono (con sus notas de dirección). */
  app.post("/api/pruebas-voz", async (req) => {
    const pedido = parsear(
      z.object({
        tono: z.string().regex(/^[a-z0-9-]+$/),
        voces: z.array(z.string().regex(/^[\w:-]+$/)).min(1).max(4),
        texto: z.string().max(600).optional(),
      }),
      req.body,
    );
    const marca = await leerMarca();
    const muestras = [];
    for (const voz of pedido.voces) {
      try {
        muestras.push(await generarMuestra(marca, pedido.tono, voz, { texto: pedido.texto }));
      } catch (e) {
        throw new ErrorApi(502, `No pude generar la muestra de ${voz}: ${(e as Error).message}`);
      }
    }
    return { muestras };
  });

  app.get<{ Params: { archivo: string } }>("/api/pruebas-voz/:archivo", async (req, reply) => {
    const archivo = parsear(z.string().regex(/^[\w-]+\.(wav|mp3)$/, "Archivo inválido"), req.params.archivo);
    const ruta = path.join(DIR_PRUEBAS_VOZ, archivo);
    if (!existsSync(ruta)) throw new ErrorApi(404, "No existe esa muestra");
    return reply.type(archivo.endsWith(".mp3") ? "audio/mpeg" : "audio/wav").header("Cache-Control", "no-cache").send(await readFile(ruta));
  });

  // ---------- Kokoro (voz offline, opcional) ----------

  const instalacionKokoro: { instalando: boolean; lineas: string[]; error?: string } = { instalando: false, lineas: [] };

  app.get("/api/kokoro", async () => ({ instalado: await kokoroInstalado(), ...instalacionKokoro }));

  /** Arranca la instalación en segundo plano (baja ~350 MB); la UI consulta GET /api/kokoro para ver cómo va. */
  app.post("/api/kokoro/instalar", async () => {
    if (!instalacionKokoro.instalando) {
      Object.assign(instalacionKokoro, { instalando: true, lineas: [], error: undefined });
      instalarKokoro((l) => instalacionKokoro.lineas.push(l))
        .catch((e: Error) => {
          instalacionKokoro.error = e.message;
        })
        .finally(() => {
          instalacionKokoro.instalando = false;
        });
    }
    return { instalado: false, ...instalacionKokoro };
  });

  // ---------- uso diario de Gemini (medidor de la barra) ----------

  app.get("/api/uso-gemini", async () => leerUso());

  // ---------- configuración ----------

  app.get("/api/config", async () => leerMarcaConAvisos());

  app.put("/api/config", async (req) => {
    const r = MarcaSchema.safeParse((req.body as { marca?: unknown } | null)?.marca);
    if (!r.success) throw new ErrorApi(400, r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    return { marca: await guardarMarca(r.data), avisos: [] };
  });

  // ---------- claves (.env): nunca se devuelven, solo los últimos 4 caracteres ----------

  const NombreClave = z.enum(NOMBRES_CLAVES);

  app.get("/api/claves", async () => ({ claves: await estadoClaves() }));

  /** Guarda (o borra con null) una clave y la prueba. */
  app.put<{ Params: { nombre: string } }>("/api/claves/:nombre", async (req) => {
    const nombre = parsear(NombreClave, req.params.nombre);
    const { valor } = parsear(z.object({ valor: z.string().trim().max(300).nullable() }), req.body);
    await guardarClave(nombre, valor || null).catch((e: Error) => Promise.reject(new ErrorApi(400, e.message)));
    if (valor) await probarClave(nombre);
    return { claves: await estadoClaves() };
  });

  app.post<{ Params: { nombre: string } }>("/api/claves/:nombre/probar", async (req) => {
    const nombre = parsear(NombreClave, req.params.nombre);
    if (!(await probarClave(nombre))) throw new ErrorApi(400, "Esa clave no está configurada.");
    return { claves: await estadoClaves() };
  });

  // ---------- API keys de cualquier servicio (la clave nunca vuelve entera: solo los últimos 4) ----------

  app.get("/api/credenciales", async () => ({ propias: await listarCredenciales(), servicios: SERVICIOS.map((s) => ({ ...s, probable: tienePrueba(s.id) || Boolean(s.integrada) })) }));

  const conErrorApi = async <T>(fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch (e) {
      throw new ErrorApi(400, e instanceof z.ZodError ? e.issues.map((i) => i.message).join("; ") : (e as Error).message);
    }
  };

  app.post("/api/credenciales", async (req) => {
    const r = await conErrorApi(() => agregarCredencial(req.body));
    return { ...r, propias: await listarCredenciales(), claves: await estadoClaves() };
  });

  app.put<{ Params: { id: string } }>("/api/credenciales/:id", async (req) => {
    await conErrorApi(() => editarCredencial(req.params.id, req.body));
    return { propias: await listarCredenciales() };
  });

  app.delete<{ Params: { id: string } }>("/api/credenciales/:id", async (req) => {
    await conErrorApi(() => borrarCredencial(req.params.id));
    return { propias: await listarCredenciales() };
  });

  app.post<{ Params: { id: string } }>("/api/credenciales/:id/probar", async (req) => {
    await conErrorApi(() => probarCredencial(req.params.id));
    return { propias: await listarCredenciales() };
  });

  // ---------- eventos en vivo (SSE) ----------

  app.get("/api/eventos", (req, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const enviar = (e: Evento | { tipo: "cola"; enCurso: string | null; pendientes: string[] }) => reply.raw.write(`data: ${JSON.stringify(e)}\n\n`);
    enviar({ tipo: "cola", enCurso: cola.enCurso, pendientes: cola.ids });
    const quitar = bus.escuchar((e) => {
      enviar(e);
      if (e.tipo === "estado") enviar({ tipo: "cola", enCurso: cola.enCurso, pendientes: cola.ids });
    });
    const latido = setInterval(() => reply.raw.write(": latido\n\n"), 20_000);
    req.raw.on("close", () => {
      clearInterval(latido);
      quitar();
    });
  });

  app.get("/api/pasos", async () => ({ pasos: PASOS }));

  /** https de la red local (para grabar con el micrófono del celular). */
  app.get("/api/https", async () => {
    const e = estadoHttps();
    return { ...e, ca: Boolean(e.ca ?? (await archivoCA())), direcciones: e.activo ? ipsLocales().map((ip) => `https://${ip}:${e.puerto}`) : [] };
  });
  /** La autoridad local de mkcert, para instalar en el celular (una sola vez). */
  app.get("/api/https/ca", async (_req, reply) => {
    const ca = estadoHttps().ca ?? (await archivoCA());
    if (!ca) throw new ErrorApi(404, "Todavía no hay certificado: instalá mkcert y reiniciá la app.");
    return reply
      .header("Content-Type", "application/x-x509-ca-cert")
      .header("Content-Disposition", 'attachment; filename="fabrica-videos-ca.pem"')
      .send(await readFile(ca));
  });

  await registrarCrudo(app);
  await registrarVozPropia(app);
  await registrarPerfiles(app);
  await registrarBiblioteca(app);
};

const enviarArchivo = async (reply: FastifyReply, archivo: string, tipo: string) => {
  const datos = await readFile(archivo);
  return reply.type(tipo).header("Cache-Control", "max-age=86400").send(datos);
};

export type DetalleTrabajo = Awaited<ReturnType<typeof detalle>>;
export type ResumenTrabajo = Estado & { portada: string | null; video: string | null };
