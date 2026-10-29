import type { FastifyInstance } from "fastify";
import { createWriteStream } from "node:fs";
import { mkdir, rename } from "node:fs/promises";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import { cola } from "../pipeline/cola";
import { actualizarItem, cambiarBusqueda, cambiarUrl, pedirCapturaChrome, quitarItem, usarCapturaPropia, usarImagenSubida, usarImagenUrl } from "../pipeline/crudo/material";
import { cortarClip } from "../pipeline/crudo/clipsCrudo";
import { recursosDe } from "../pipeline/biblioteca";
import { medidasImagen } from "../pipeline/crudo/imagenes";
import { InfoVideoSchema } from "../pipeline/crudo/medios";
import { armarPropsCrudo } from "../pipeline/crudo/props";
import { guardarMarca, leerMarca } from "../pipeline/config";
import { fasterWhisperInstalado, modeloBajado } from "../pipeline/crudo/transcripcion";
import { guardarUltimasOpciones, leerUltimasOpciones } from "../pipeline/crudo/opciones";
import { listarPerfiles, slugPorDefecto } from "../pipeline/perfiles";
import { IDS_MOODS, PedidoCrudoSchema } from "../shared/opcionesCrudo";
import { leerCatalogoMusica, MusicaTrabajoSchema, ponerMusica, type MusicaTrabajo } from "../pipeline/musica";
import { IDS_MODELOS_TRANSCRIPCION, MB_PREGUNTAR_DESCARGA, MODELOS_TRANSCRIPCION } from "../shared/transcripcion";
import { completarSubida, ErrorSubida, guardarParte, iniciarSubida, MAX_BYTES, TAM_PARTE } from "../pipeline/crudo/subida";
import { Trabajo } from "../pipeline/trabajo";
import { calcularTramos, CortesSchema, resumirCortes, TranscripcionSchema } from "../shared/cortes";
import { MaterialSchema } from "../shared/material";
import { ReporteMarcaSchema } from "../pipeline/marca/verificador";

const abrirCrudo = async (id: string) => {
  try {
    const t = await Trabajo.abrir(id);
    if ((await t.estado()).tipo === "crudo") return t;
  } catch {
    // cae al 404
  }
  throw Object.assign(new Error(`No existe el crudo ${id}`), { statusCode: 404 });
};

const detalleCrudo = async (t: Trabajo) => {
  const estado = await t.estado();
  const video = await t.leer("video.json", InfoVideoSchema);
  const transcripcion = await t.leer("transcripcion.json", TranscripcionSchema);
  const cortes = await t.leer("cortes.json", CortesSchema);
  const material = await t.leer("material.json", MaterialSchema);
  const tramos = transcripcion && cortes ? calcularTramos(transcripcion.palabras, cortes, transcripcion.duracionMs) : null;
  const url = (rel: string) => `/jobs/${t.id}/${rel}`;
  return {
    estado,
    video: video ? { ...video, url: url(video.archivo), proxyUrl: url(video.proxy.archivo) } : null,
    transcripcion,
    cortes,
    tramos,
    musica: await t.leer("musica.json", MusicaTrabajoSchema),
    material: material ? material.items.map((it) => ({ ...it, capturaUrl: it.noticia?.captura ? url(it.noticia.captura) : null, imagenUrl: it.imagen?.archivo ? url(it.imagen.archivo) : null, clipUrl: it.clip ? url(it.clip.archivo) : null })) : null,
    resumen: transcripcion && cortes && tramos ? resumirCortes(transcripcion.palabras, cortes, transcripcion.duracionMs, tramos) : null,
    final: t.existe("video.mp4") && estado.pasos.render === "hecho" ? url("video.mp4") : null,
    portada: t.existe("portada.png") ? url("portada.png") : null,
    marcaReporte: await t.leer("marca-reporte.json", ReporteMarcaSchema),
    /** Props de la vista previa (Remotion Player): con el proxy de 720p. */
    props: video && transcripcion && cortes ? await armarPropsCrudo(t, await leerMarca(), `/jobs/${t.id}`, { proxy: true }).catch(() => null) : null,
  };
};
export type DetalleCrudo = Awaited<ReturnType<typeof detalleCrudo>>;

/** Rutas de "Editar crudo". Van en un plugin aparte: el parser binario solo aplica acá. */
export const registrarCrudo = async (app: FastifyInstance) => {
  await app.register(async (r) => {
    // las partes llegan como bytes crudos y se escriben al disco en streaming (sin pasar por memoria)
    r.addContentTypeParser("application/octet-stream", (_req, payload, hecho) => hecho(null, payload));

    const error = (e: unknown) => (e instanceof ErrorSubida ? Object.assign(new Error(e.message), { statusCode: 400 }) : e);

    // ---------- música de fondo ----------

    r.get("/api/musica", async () => ({ pistas: await leerCatalogoMusica() }));

    /** Cambiar la música de un crudo en la revisión: otra pista, otro mood, el volumen o sacarla. */
    r.put<{ Params: { id: string } }>("/api/crudos/:id/musica", async (req) => {
      const pedido = z
        .object({ activa: z.boolean().optional(), mood: z.enum(IDS_MOODS).optional(), pista: z.string().optional(), volumen: z.number().min(0).max(0.3).optional() })
        .parse(req.body);
      const t = await abrirCrudo(req.params.id);
      const previa = (await t.leer("musica.json", MusicaTrabajoSchema)) ?? { activa: false, mood: "chill" as const, motivo: "", pista: null, archivo: null, bpm: 0, volumen: 0.08 };
      const nueva: MusicaTrabajo = { ...previa, activa: pedido.activa ?? previa.activa, volumen: pedido.volumen ?? previa.volumen };
      const cambiaPista = (pedido.pista && pedido.pista !== previa.pista) || (pedido.mood && pedido.mood !== previa.mood) || (nueva.activa && !previa.archivo);
      if (cambiaPista) {
        const mood = pedido.mood ?? (await leerCatalogoMusica()).find((p) => p.archivo === pedido.pista)?.mood ?? previa.mood;
        const elegida = await ponerMusica(t, mood, { pista: pedido.pista });
        Object.assign(nueva, { mood, motivo: "elegido a mano en la revisión", pista: elegida?.pista.archivo ?? null, archivo: elegida?.rel ?? null, bpm: elegida?.pista.bpm ?? 0 });
      }
      await t.escribir("musica.json", nueva);
      if ((await t.estado()).pasos.render === "hecho") await t.invalidarDesde("render");
      return detalleCrudo(t);
    });

    // ---------- modelos de transcripción ----------

    r.get("/api/transcripcion", async () => {
      const marca = await leerMarca();
      const modelos = [];
      for (const m of MODELOS_TRANSCRIPCION) {
        modelos.push({ ...m, bajado: await modeloBajado(m.id, marca.crudo.motorTranscripcion), aprobado: m.mb <= MB_PREGUNTAR_DESCARGA || marca.crudo.modelosAprobados.includes(m.id) });
      }
      return { modelos, fasterWhisper: await fasterWhisperInstalado() };
    });

    /** Aprobás bajar un modelo grande: queda aprobado para siempre y se retoman los crudos que lo esperaban. */
    r.post("/api/transcripcion/aprobar", async (req) => {
      const { modelo } = z.object({ modelo: z.enum(IDS_MODELOS_TRANSCRIPCION) }).parse(req.body);
      const marca = await leerMarca();
      if (!marca.crudo.modelosAprobados.includes(modelo)) await guardarMarca({ ...marca, crudo: { ...marca.crudo, modelosAprobados: [...marca.crudo.modelosAprobados, modelo] } });
      const retomados = (await Trabajo.listar()).filter((e) => e.descargaPendiente?.modelo === modelo);
      for (const e of retomados) await cola.encolar(e.id);
      return { retomados: retomados.map((e) => e.id) };
    });

    /** "Usar otro modelo" para un crudo (ej. uno más chico que ya está bajado) y retomarlo. */
    r.post<{ Params: { id: string } }>("/api/crudos/:id/modelo", async (req) => {
      const { modelo } = z.object({ modelo: z.enum(IDS_MODELOS_TRANSCRIPCION) }).parse(req.body);
      const t = await abrirCrudo(req.params.id);
      if (cola.enCurso === t.id) throw Object.assign(new Error("El crudo se está procesando: cancelalo primero."), { statusCode: 409 });
      await t.actualizar((e) => {
        e.opciones.modeloWhisper = modelo;
        e.descargaPendiente = undefined;
      });
      await t.invalidarDesde("transcripcion");
      await t.log(`Transcribo con el modelo "${modelo}".`);
      await cola.encolar(t.id);
      return { ok: true };
    });

    r.post("/api/crudos", async (req) => {
      const body = z
        .object({ nombre: z.string().trim().min(1).max(260), bytes: z.number().int().positive().max(MAX_BYTES, "El video pesa más de 8 GB.") })
        .safeParse(req.body);
      if (!body.success) throw Object.assign(new Error(body.error.issues.map((i) => i.message).join("; ")), { statusCode: 400 });
      try {
        return await iniciarSubida(body.data.nombre, body.data.bytes);
      } catch (e) {
        throw error(e);
      }
    });

    r.put<{ Params: { id: string; n: string } }>(
      "/api/crudos/subidas/:id/partes/:n",
      { bodyLimit: TAM_PARTE + 1024 },
      async (req) => {
        try {
          return await guardarParte(req.params.id, Number(req.params.n), req.body as Readable);
        } catch (e) {
          throw error(e);
        }
      },
    );

    /** Todo lo que necesita la revisión: video, transcripción, cortes y tramos ya calculados. */
    r.get<{ Params: { id: string } }>("/api/crudos/:id", async (req) => detalleCrudo(await abrirCrudo(req.params.id)));

    /** Guarda lo que tocaste en el editor por transcripción. "automatico: true" vuelve a los cortes sugeridos. */
    r.put<{ Params: { id: string } }>("/api/crudos/:id/cortes", async (req) => {
      const t = await abrirCrudo(req.params.id);
      if (cola.enCurso === t.id) throw Object.assign(new Error("El trabajo se está procesando: esperá a que termine."), { statusCode: 409 });
      const tr = await t.leer("transcripcion.json", TranscripcionSchema);
      const cortes = await t.leer("cortes.json", CortesSchema);
      if (!tr || !cortes) throw Object.assign(new Error("Todavía no están los cortes."), { statusCode: 409 });
      const n = tr.palabras.length;
      const indice = z.number().int().min(0).max(n - 1);
      const pausa = z.number().int().min(-1).max(n - 1);
      const body = z
        .object({
          automatico: z.boolean(),
          manual: z.object({ quitar: z.array(indice), conservar: z.array(indice), pausasConservadas: z.array(pausa), pausasCortadas: z.array(pausa) }),
        })
        .safeParse(req.body);
      if (!body.success) throw Object.assign(new Error(body.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")), { statusCode: 400 });
      const unicos = (a: number[]) => [...new Set(a)].sort((x, y) => x - y);
      const m = body.data.manual;
      const nuevo = {
        ...cortes,
        automatico: body.data.automatico,
        manual: body.data.automatico
          ? { quitar: [], conservar: [], pausasConservadas: [], pausasCortadas: [] }
          : { quitar: unicos(m.quitar), conservar: unicos(m.conservar), pausasConservadas: unicos(m.pausasConservadas), pausasCortadas: unicos(m.pausasCortadas) },
      };
      await t.escribir("cortes.json", nuevo);
      // si ya estaba renderizado, el video viejo deja de coincidir con los cortes
      const e = await t.estado();
      if (e.pasos.render === "hecho") await t.invalidarDesde("render");
      return detalleCrudo(t);
    });

    // ---------- material (noticias, datos, fotos) ----------

    const conMaterial = async (id: string, mid: string, fn: (t: Trabajo) => Promise<unknown>) => {
      const t = await abrirCrudo(id);
      if (cola.enCurso === t.id) throw Object.assign(new Error("El trabajo se está procesando: esperá a que termine."), { statusCode: 409 });
      if (!/^m\d{2}$/.test(mid)) throw Object.assign(new Error("Material inválido."), { statusCode: 400 });
      try {
        await fn(t);
      } catch (e) {
        throw Object.assign(new Error((e as Error).message), { statusCode: 400 });
      }
      return detalleCrudo(t);
    };

    r.post<{ Params: { id: string; mid: string } }>("/api/crudos/:id/material/:mid/quitar", async (req) => {
      const { quitar } = z.object({ quitar: z.boolean() }).parse(req.body);
      return conMaterial(req.params.id, req.params.mid, (t) => quitarItem(t, req.params.mid, quitar));
    });

    r.post<{ Params: { id: string; mid: string } }>("/api/crudos/:id/material/:mid/url", async (req) => {
      const body = z.object({ url: z.string().url("Pegá una URL completa (https://…)") }).safeParse(req.body);
      if (!body.success) throw Object.assign(new Error(body.error.issues[0]!.message), { statusCode: 400 });
      return conMaterial(req.params.id, req.params.mid, (t) => cambiarUrl(t, req.params.mid, body.data.url));
    });

    r.post<{ Params: { id: string; mid: string } }>("/api/crudos/:id/material/:mid/chrome", async (req) =>
      conMaterial(req.params.id, req.params.mid, (t) => pedirCapturaChrome(t, req.params.mid)),
    );

    /** "Pegar URL de una imagen" (persona, lugar o concepto). */
    r.post<{ Params: { id: string; mid: string } }>("/api/crudos/:id/material/:mid/imagen-url", async (req) => {
      const { url } = z.object({ url: z.string().url() }).parse(req.body);
      const t = await abrirCrudo(req.params.id);
      try {
        await usarImagenUrl(t, req.params.mid, url);
      } catch (e) {
        throw Object.assign(new Error(`No pude usar esa imagen: ${(e as Error).message.split("\n")[0]}`), { statusCode: 400 });
      }
      return detalleCrudo(t);
    });

    /** "Subir imagen" (los bytes de la imagen). */
    r.put<{ Params: { id: string; mid: string } }>("/api/crudos/:id/material/:mid/imagen", { bodyLimit: 15 * 1024 * 1024 }, async (req) => {
      const t = await abrirCrudo(req.params.id);
      const datos = await new Promise<Buffer>((ok, mal) => {
        const partes: Buffer[] = [];
        (req.body as Readable).on("data", (p: Buffer) => partes.push(p)).on("end", () => ok(Buffer.concat(partes))).on("error", mal);
      });
      try {
        await usarImagenSubida(t, req.params.mid, datos);
      } catch (e) {
        throw Object.assign(new Error((e as Error).message), { statusCode: 400 });
      }
      return detalleCrudo(t);
    });

    /** "Cambiar clip": corta un tramo del clip elegido (misma duración) en lugar del anterior. */
    r.post<{ Params: { id: string; mid: string } }>("/api/crudos/:id/material/:mid/clip", async (req) => {
      const { clip } = z.object({ clip: z.string() }).parse(req.body);
      const t = await abrirCrudo(req.params.id);
      const c = (await recursosDe("video")).find((x) => x.id === clip);
      if (!c) throw Object.assign(new Error("Ese clip ya no está en la biblioteca."), { statusCode: 404 });
      await actualizarItem(t, req.params.mid, async (it) => {
        if (!it.clip) throw new Error("Ese material no es un clip.");
        const dur = Math.min(it.clip.duracionS, c.duracion);
        const { desde, dur: d } = await cortarClip(t, c, Math.max(0, (c.duracion - dur) / 2), dur, it.clip.archivo);
        return { ...it, estado: "listo", clip: { id: c.id, ruta: c.archivo, nombre: c.nombre, desdeS: desde, duracionS: d, archivo: it.clip.archivo, motivo: "elegido a mano en la revisión" } };
      });
      return detalleCrudo(t);
    });

    r.post<{ Params: { id: string; mid: string } }>("/api/crudos/:id/material/:mid/busqueda", async (req) => {
      const { busqueda } = z.object({ busqueda: z.string().trim().min(2).max(80) }).parse(req.body);
      return conMaterial(req.params.id, req.params.mid, (t) => cambiarBusqueda(t, req.params.mid, busqueda));
    });

    /** "Subir mi captura": la imagen llega en bruto (PNG o JPG, hasta 15 MB). */
    r.put<{ Params: { id: string; mid: string } }>("/api/crudos/:id/material/:mid/captura", { bodyLimit: 15 * 1024 * 1024 }, async (req) =>
      conMaterial(req.params.id, req.params.mid, async (t) => {
        await mkdir(t.ruta("capturas"), { recursive: true });
        const rel = `capturas/${req.params.mid}-propia.img`;
        await pipeline(req.body as Readable, createWriteStream(t.ruta(rel)));
        const { ancho, alto, ext } = await medidasImagen(t.ruta(rel));
        const final = rel.replace(/\.img$/, ext);
        await rename(t.ruta(rel), t.ruta(final));
        await usarCapturaPropia(t, req.params.mid, final, ancho, alto);
      }),
    );

    /** "Renderizar": aprueba la revisión y sigue con el render 1080×1920 del original. */
    r.post<{ Params: { id: string } }>("/api/crudos/:id/renderizar", async (req) => {
      const t = await abrirCrudo(req.params.id);
      if (!t.existe("cortes.json")) throw Object.assign(new Error("Todavía no está lista la edición."), { statusCode: 409 });
      const pendientes = ((await t.leer("material.json", MaterialSchema))?.items ?? []).filter((i) => i.estado === "pendiente").length;
      await t.marcarPaso("revision", "hecho");
      await t.log(`Edición aprobada${pendientes ? ` (${pendientes} material(es) pendiente(s) quedan afuera)` : ""}.`);
      await cola.encolar(t.id);
      return { ok: true };
    });

    /** Une las partes, crea el trabajo y lo pone en la cola (el primer paso genera el proxy). */
    /** Opciones con las que arranca el formulario: las últimas que usaste. */
    r.get("/api/crudos/opciones", async () => {
      const marca = await leerMarca();
      return leerUltimasOpciones(slugPorDefecto(marca, await listarPerfiles(marca)));
    });

    r.post<{ Params: { id: string } }>("/api/crudos/subidas/:id/completar", async (req) => {
      try {
        // sin cuerpo (CLI, versiones viejas de la app): valores por defecto
        const cuerpo = req.body && typeof req.body === "object" && Object.keys(req.body).length ? PedidoCrudoSchema.safeParse(req.body) : null;
        if (cuerpo && !cuerpo.success) throw Object.assign(new Error(cuerpo.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")), { statusCode: 400 });
        if (cuerpo?.success) await guardarUltimasOpciones(cuerpo.data);
        const t = await completarSubida(req.params.id, cuerpo?.success ? cuerpo.data : undefined);
        await cola.encolar(t.id);
        return { id: t.id };
      } catch (e) {
        throw error(e);
      }
    });
  });
};
