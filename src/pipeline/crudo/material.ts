import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { motivoQuitar, type Cortes, type Transcripcion } from "../../shared/cortes";
import { DeteccionSchema, MaterialSchema, type Deteccion, type ItemMaterial, type Material } from "../../shared/material";
import { INTENSIDADES, OpcionesCrudoSchema } from "../../shared/opcionesCrudo";
import { PropsPorPlantilla, type Guion, type Marca } from "../../shared/schemas";
import { pedirAClaude } from "../claude";
import { instruccionesModo, promptConTono } from "../tonos";
import { DENSIDAD_CRUDO, MODOS_EDICION } from "../../shared/modos";
import { normalizarIlustradas, resumenCatalogo } from "../ilustracion/preparar";
import type { Trabajo } from "../trabajo";
import { capturarNoticia, CapturaFallida, cerrarNavegador } from "./captura";
import { detectarClips } from "./clipsCrudo";
import { bajarImagen, creditoCorto, datosDePagina, elegirImagenReal, verificarImagen, type Intento } from "./imagenesReales";
import { ejecutar } from "../proceso";
import { leerMarca } from "../config";
import { buscarPixabayVarias } from "./imagenes";

const fechaHoy = () => new Date().toLocaleDateString("es-UY", { day: "numeric", month: "long", year: "numeric" });

/** Transcripción numerada (solo lo que queda en el video), en renglones de ~12 palabras con su segundo. */
export const transcripcionNumerada = (tr: Transcripcion, cortes: Cortes) => {
  const quedan = tr.palabras.map((p, i) => ({ p, i })).filter(({ p, i }) => !p.sinTranscribir && motivoQuitar(cortes, i) === null);
  const renglones: string[] = [];
  for (let k = 0; k < quedan.length; k += 12) {
    const grupo = quedan.slice(k, k + 12);
    renglones.push(`(${(grupo[0]!.p.inicioMs / 1000).toFixed(1)} s) ${grupo.map(({ p, i }) => `[${i}] ${p.texto}`).join(" ")}`);
  }
  return renglones.join("\n");
};

/** Pasa un ítem detectado por Claude a material.json (todavía sin captura ni foto). */
const aItem = (d: Deteccion, n: number, tr: Transcripcion): ItemMaterial | null => {
  const a = tr.palabras[Math.min(d.palabra_inicio, d.palabra_fin)];
  const b = tr.palabras[Math.max(d.palabra_inicio, d.palabra_fin)];
  if (!a || !b) return null;
  const base = {
    id: `m${String(n + 1).padStart(2, "0")}`,
    tipo: d.tipo,
    frase: d.frase,
    origenMs: a.inicioMs,
    origenFinMs: b.finMs,
    estado: "pendiente" as const,
    discrepancia: d.coincide ? undefined : (d.discrepancia ?? "Lo que se dice no coincide con la fuente."),
  };
  if (d.tipo === "noticia") {
    if (!d.url) return null;
    return { ...base, noticia: { url: d.url, titulo: d.titulo ?? d.frase, medio: d.medio ?? new URL(d.url).hostname.replace(/^www\./, ""), fecha: d.fecha ?? null, resaltado: d.resaltado ?? null, captura: null, rects: [], pedirChrome: false } };
  }
  if (d.tipo === "dato") {
    // la visualización más rica que vino bien formada
    const opciones = [
      ["grafico", d.grafico],
      ["comparacion", d.comparacion],
      ["linea_tiempo", d.linea_tiempo],
      ["mapa", d.mapa],
      ["dato_numero", d.dato_numero],
    ] as const;
    for (const [plantilla, props] of opciones) {
      const r = props ? PropsPorPlantilla[plantilla].safeParse(props) : null;
      if (r?.success) return { ...base, estado: "listo", dato: { plantilla, props: r.data as Record<string, unknown>, fuente: d.fuente ?? null } };
    }
    return null;
  }
  if (d.tipo === "escena") {
    const r = d.escena_ilustrada ? PropsPorPlantilla.escena_ilustrada.safeParse(d.escena_ilustrada) : null;
    if (!r?.success) return null;
    // solo ids del catálogo (lo desconocido va al más parecido o se saca)
    const escena = normalizarIlustradas({ escenas: [{ plantilla: "escena_ilustrada", props: r.data, narracion: d.frase, palabras_clave_stock: [], palabras_enfasis: [] }] } as unknown as Guion, {}).guion.escenas[0]!;
    return { ...base, estado: "listo", dato: { plantilla: "escena_ilustrada", props: escena.props as Record<string, unknown>, fuente: null } };
  }
  const busqueda = d.busqueda ?? d.etiqueta ?? null;
  if (!busqueda) return null;
  const imagen = { busqueda, archivo: null, etiqueta: d.etiqueta ?? null, credito: null, licencia: null, paginaFuente: null, proveedor: null, verificacion: null, marco: d.marco };
  if (d.tipo === "concepto") return { ...base, imagen: { ...imagen, origen: "stock" as const, queDebeVerse: d.que_debe_verse ?? busqueda, candidatas: [] } };
  // persona o lugar: imágenes reales (nunca stock); si ninguna se confirma, la tarjeta de texto
  return {
    ...base,
    imagen: { ...imagen, origen: null, queDebeVerse: d.que_debe_verse ?? d.etiqueta ?? busqueda, candidatas: (d.imagenes ?? []).filter((c) => c.origen !== "stock") },
    tarjeta: { titulo: d.etiqueta ?? busqueda, texto: d.dato_tarjeta ?? null },
  };
};

/** Saca la captura de una noticia; si no se puede, la deja PENDIENTE con el motivo. */
export const resolverNoticia = async (t: Trabajo, it: ItemMaterial): Promise<ItemMaterial> => {
  if (!it.noticia) return it;
  await mkdir(t.ruta("capturas"), { recursive: true });
  const rel = `capturas/${it.id}.png`;
  try {
    const c = await capturarNoticia(it.noticia.url, t.ruta(rel), it.noticia.resaltado);
    return {
      ...it,
      estado: "listo",
      motivo: undefined,
      noticia: { ...it.noticia, captura: rel, rects: c.rects, ancho: c.ancho, alto: c.alto, fecha: it.noticia.fecha ?? c.fecha, origen: "playwright", pedirChrome: false },
    };
  } catch (e) {
    const motivo = e instanceof CapturaFallida ? e.message : `Error al capturar: ${(e as Error).message.split("\n")[0]}`;
    return { ...it, estado: "pendiente", motivo };
  }
};

/** Lo que se probó para cada imagen (investigacion.json): candidatas, qué dijo la verificación visual y cuál quedó. */
export type Investigacion = Record<string, { que: string; intentos: Intento[]; elegida: string | null }>;

/**
 * Imagen de una persona, un lugar o un concepto.
 * - Persona o lugar: imágenes REALES (noticia → oficial → Wikimedia → prensa), cada una verificada mirándola; si
 *   ninguna se confirma, queda la tarjeta de texto (y en la revisión se puede pegar una URL o subir una imagen).
 * - Concepto abstracto: foto de stock de Pixabay, presentada como "Imagen ilustrativa".
 */
export const resolverImagen = async (t: Trabajo, it: ItemMaterial, signal?: AbortSignal, investigacion?: Investigacion): Promise<ItemMaterial> => {
  if (!it.imagen) return it;
  const marca = await leerMarca();
  const que = it.imagen.queDebeVerse ?? it.imagen.busqueda;
  try {
    if (it.tipo === "concepto") {
      const clave = process.env.PIXABAY_API_KEY;
      if (!clave) return { ...it, estado: "pendiente", motivo: "Falta la PIXABAY_API_KEY para buscar fotos de conceptos." };
      // el stock también se mira: tiene que ilustrar el concepto de forma realista y seria (nada de disfraces o ficción)
      const que = `una foto realista y seria que ilustre el concepto "${it.imagen.queDebeVerse ?? it.imagen.busqueda}" en un video de noticias (puede ser genérica; NO sirven disfraces, cosplay, ficción, escenas montadas, armas de utilería, humor, ni carteles, textos, patentes o uniformes de otro país que choquen con un video uruguayo, ni nada que pueda confundirse con un hecho real concreto)`;
      const intentos: Intento[] = [];
      for (const [n, foto] of (await buscarPixabayVarias(clave, it.imagen.busqueda, signal)).slice(0, 4).entries()) {
        const rel = `material/${it.id}-stock-${n + 1}.jpg`;
        const intento: Intento = { url: foto.url, pagina: foto.pagina, origen: "stock", credito: "Imagen ilustrativa", imagen: foto.url, procedencia: `foto de stock de Pixabay (${foto.pagina})`, veredicto: null, error: null };
        intentos.push(intento);
        try {
          await bajarImagen(foto.url, t.ruta(rel), signal);
          intento.veredicto = await verificarImagen(t.ruta(rel), que, it.frase, marca.modeloClaude, signal, intento.procedencia);
          if (intento.veredicto.muestra === "si") {
            if (investigacion) investigacion[it.id] = { que, intentos, elegida: rel };
            return { ...it, estado: "listo", motivo: undefined, imagen: { ...it.imagen, archivo: rel, credito: "Imagen ilustrativa", licencia: foto.licencia, paginaFuente: foto.pagina, proveedor: "pixabay", origen: "stock", verificacion: intento.veredicto.motivo } };
          }
          await rm(t.ruta(rel), { force: true });
        } catch (e) {
          intento.error = (e as Error).message.split("\n")[0]!;
        }
      }
      if (investigacion) investigacion[it.id] = { que, intentos, elegida: null };
      // un concepto sin buena imagen no va (mejor la cara de la persona que una foto que no cierra)
      return { ...it, estado: "quitado", imagen: { ...it.imagen, archivo: null, verificacion: null }, motivo: `Ninguna foto de stock ilustraba bien "${it.imagen.busqueda}": lo saqué. Podés pegar una URL o subir una imagen.` };
    }
    const { elegida, intentos } = await elegirImagenReal(t, it.id, it.imagen.candidatas, que, it.frase, it.imagen.busqueda, marca.modeloClaude, signal);
    if (investigacion) investigacion[it.id] = { que, intentos, elegida: elegida?.archivo ?? null };
    if (!elegida) {
      const probadas = intentos.length ? ` Probé ${intentos.length}: ${intentos.map((i) => `${i.origen} (${i.error ?? i.veredicto?.motivo ?? "?"})`).join("; ").slice(0, 400)}` : "";
      return { ...it, estado: "listo", motivo: `No encontré una imagen real que muestre ${que}: va una tarjeta de texto.${probadas}`, imagen: { ...it.imagen, archivo: null } };
    }
    return {
      ...it,
      estado: "listo",
      motivo: undefined,
      imagen: {
        ...it.imagen,
        archivo: elegida.archivo,
        credito: creditoCorto(elegida),
        licencia: elegida.origen === "wikimedia" ? elegida.credito : null,
        paginaFuente: elegida.pagina ?? elegida.url,
        proveedor: elegida.origen === "wikimedia" ? "wikimedia" : null,
        origen: elegida.origen,
        verificacion: elegida.veredicto?.motivo ?? null,
      },
    };
  } catch (e) {
    return { ...it, estado: it.tarjeta ? "listo" : "pendiente", motivo: `No pude conseguir la imagen: ${(e as Error).message.split("\n")[0]}` };
  }
};

/** fuentes.md: de dónde sale cada noticia y dato, y el crédito de cada foto. */
export const escribirFuentes = async (t: Trabajo, m: Material) => {
  const lineas = ["# Fuentes y créditos", ""];
  for (const it of m.items.filter((i) => i.estado !== "quitado")) {
    if (it.noticia) lineas.push(`- Noticia: [${it.noticia.titulo}](${it.noticia.url}) · ${it.noticia.medio}${it.noticia.fecha ? ` · ${it.noticia.fecha}` : ""}`);
    if (it.dato?.fuente) lineas.push(`- Dato: [${it.dato.fuente.titulo}](${it.dato.fuente.url})`);
    if (it.imagen?.archivo) lineas.push(`- Foto (${it.imagen.busqueda}, ${it.imagen.origen ?? "?"}): ${it.imagen.credito ?? ""} — ${it.imagen.paginaFuente ?? ""}${it.imagen.verificacion ? `\n  - Verificada: ${it.imagen.verificacion}` : ""}`);
    else if (it.tarjeta && it.estado !== "quitado") lineas.push(`- ${it.tarjeta.titulo}: tarjeta de texto (no hubo imagen real verificada)`);
    if (it.clip) lineas.push(`- Clip propio: ${it.clip.ruta} (${it.clip.desdeS.toFixed(1)}–${(it.clip.desdeS + it.clip.duracionS).toFixed(1)} s)`);
    if (it.discrepancia) lineas.push(`  - AVISO: no coincide con la fuente: ${it.discrepancia}`);
  }
  await t.escribirTexto("fuentes.md", `${lineas.join("\n")}\n`);
};

/** Paso "material": detecta con Claude + WebSearch, captura noticias y baja fotos. */
export const pasoMaterial = async (t: Trabajo, tr: Transcripcion, cortes: Cortes, marca: Marca, signal?: AbortSignal): Promise<Material> => {
  const opciones = OpcionesCrudoSchema.parse((await t.estado()).opciones.crudo ?? {});
  const modo = opciones.modo;
  const cada = Math.max(4, Math.round(INTENSIDADES[opciones.intensidad].materialCada * DENSIDAD_CRUDO[modo]));
  // qué tipos se aceptan según el modo (y si se pidieron imágenes)
  const tipos = new Set<string>(modo === "graficos" ? ["dato", "noticia"] : ["noticia", "dato", "persona", "lugar", "concepto", ...(modo === "situacional" ? ["escena"] : [])]);
  if (!opciones.imagenes) for (const x of ["noticia", "persona", "lugar", "concepto"]) tipos.delete(x);
  const r = await pedirAClaude({
    prompt: [
      `Fecha de hoy: ${fechaHoy()}.`,
      `Nicho de la cuenta: ${marca.nicho}.`,
      `Cantidad: como mucho un elemento cada ~${cada} s de video (edición ${INTENSIDADES[opciones.intensidad].nombre.toLowerCase()}${modo !== "normal" ? `, modo ${MODOS_EDICION.find((m) => m.id === modo)!.nombre}` : ""}).`,
      opciones.imagenes ? "" : "IMPORTANTE: en este video NO van noticias ni fotos. Detectá solo datos (tipo \"dato\")" + (modo === "situacional" ? " y escenas (tipo \"escena\")." : "."),
      modo === "situacional" ? `\nCatálogo de ilustración para las escenas (usá solo estos ids):\n${resumenCatalogo()}` : "",
      "",
      "Transcripción (cada palabra con su número):",
      transcripcionNumerada(tr, cortes),
    ].join("\n"),
    schema: DeteccionSchema,
    cwd: t.dir,
    systemPromptFile: await promptConTono(t.dir, "material.md", null, marca, [await instruccionesModo(modo, "crudo")]),
    model: marca.modeloClaude,
    signal,
    onActividad: (a) => t.actividad(a),
    onLog: (l) => void t.log(l),
  });
  const investigacion: Investigacion = {};
  const items = r.items
    .filter((d) => tipos.has(d.tipo))
    .map((d, n) => aItem(d, n, tr))
    .filter((x): x is ItemMaterial => x !== null);
  const resueltos: ItemMaterial[] = [];
  try {
    for (const it of items) {
      if (signal?.aborted) throw new Error("Cancelado");
      if (it.tipo === "noticia") {
        t.actividad(`Capturando "${it.noticia!.titulo.slice(0, 60)}"…`);
        resueltos.push(await resolverNoticia(t, it));
      } else if (it.imagen) {
        t.actividad(`Buscando una imagen real de ${it.imagen.queDebeVerse ?? it.imagen.busqueda}…`);
        resueltos.push(await resolverImagen(t, it, signal, investigacion));
      } else resueltos.push(it);
    }
  } finally {
    await cerrarNavegador();
  }
  // clips propios (Mis clips) que corresponden a lo que se dice
  resueltos.push(...(await detectarClips(t, tr, cortes, opciones.clips, marca, resueltos.length + 1, signal)));
  const material: Material = { items: resueltos };
  await t.escribir("material.json", material);
  await t.escribir("investigacion.json", investigacion);
  await escribirFuentes(t, material);
  const listos = resueltos.filter((i) => i.estado === "listo").length;
  const pendientes = resueltos.filter((i) => i.estado === "pendiente");
  const avisos = resueltos.filter((i) => i.discrepancia).length;
  await t.log(
    `Material: ${listos} listo(s)${pendientes.length ? `, ${pendientes.length} PENDIENTE(s) (${pendientes.map((p) => p.motivo).join("; ")})` : ""}${avisos ? `, ${avisos} aviso(s) de que no coincide con la fuente` : ""}.`,
  );
  return material;
};

// ---------- cambios desde la revisión (y desde la skill /capturar-noticias) ----------

/** Lee material.json, aplica `fn` al ítem `id`, guarda y reescribe fuentes.md. */
export const actualizarItem = async (t: Trabajo, id: string, fn: (it: ItemMaterial) => ItemMaterial | Promise<ItemMaterial>): Promise<Material> => {
  const m = await t.leer("material.json", MaterialSchema);
  const it = m?.items.find((x) => x.id === id);
  if (!m || !it) throw new Error(`No existe el material ${id}.`);
  const nuevo = await fn(it);
  const material = { items: m.items.map((x) => (x.id === id ? nuevo : x)) };
  await t.escribir("material.json", material);
  await escribirFuentes(t, material);
  // si ya estaba renderizado, el video deja de coincidir con el material
  if ((await t.estado()).pasos.render === "hecho") await t.invalidarDesde("render");
  return material;
};

/** ¿El ítem tiene lo que necesita para mostrarse? (para "restaurar" algo que quitaste) */
export const tieneContenido = (it: ItemMaterial) => Boolean(it.noticia?.captura || it.imagen?.archivo || it.dato || it.clip || it.tarjeta);

export const quitarItem = (t: Trabajo, id: string, quitar: boolean) =>
  actualizarItem(t, id, (it) => ({ ...it, estado: quitar ? "quitado" : tieneContenido(it) ? "listo" : "pendiente" }));

/** "Pegar otra URL": vuelve a capturar con la URL nueva. */
export const cambiarUrl = (t: Trabajo, id: string, url: string) =>
  actualizarItem(t, id, async (it) => {
    if (!it.noticia) throw new Error("Ese material no es una noticia.");
    try {
      // el nombre del medio ("Telenoche") se conserva si la nota sigue siendo del mismo sitio
      const mismoSitio = new URL(url).hostname === new URL(it.noticia.url).hostname;
      const medio = mismoSitio ? it.noticia.medio : new URL(url).hostname.replace(/^www\./, "");
      return await resolverNoticia(t, { ...it, noticia: { ...it.noticia, url, captura: null, rects: [], medio } });
    } finally {
      await cerrarNavegador();
    }
  });

/**
 * Captura puesta a mano: la subiste vos ("subida") o la sacó la skill /capturar-noticias ("chrome").
 * `rects` = dónde está la frase a resaltar (0–1); si no se sabe, va sin resaltado.
 */
export const usarCapturaPropia = (t: Trabajo, id: string, rel: string, ancho: number, alto: number, origen: "subida" | "chrome" = "subida", rects: { x: number; y: number; w: number; h: number }[] = []) =>
  actualizarItem(t, id, (it) => {
    if (!it.noticia) throw new Error("Ese material no es una noticia.");
    return { ...it, estado: "listo", motivo: undefined, noticia: { ...it.noticia, captura: rel, rects, ancho, alto, origen, pedirChrome: false } };
  });

/** "Capturar con Chrome": queda para la skill /capturar-noticias (usa tu Chrome con tus sesiones iniciadas). */
export const pedirCapturaChrome = (t: Trabajo, id: string) =>
  actualizarItem(t, id, (it) => {
    if (!it.noticia) throw new Error("Ese material no es una noticia.");
    return { ...it, estado: "pendiente", motivo: "Esperando la captura con tu Chrome: abrí Claude Code con `claude --chrome` y escribí /capturar-noticias.", noticia: { ...it.noticia, pedirChrome: true } };
  });

/** "Otra foto": busca de nuevo con otras palabras. */
export const cambiarBusqueda = (t: Trabajo, id: string, busqueda: string) =>
  actualizarItem(t, id, async (it) => {
    if (!it.imagen) throw new Error("Ese material no es una foto.");
    return resolverImagen(t, { ...it, imagen: { ...it.imagen, busqueda, archivo: null } });
  });

/** "Pegar URL de una imagen" en la revisión: se baja, se mira (para avisarte si no parece eso) y se usa igual. */
export const usarImagenUrl = (t: Trabajo, id: string, url: string) =>
  actualizarItem(t, id, async (it) => {
    if (!it.imagen) throw new Error("Ese material no lleva imagen.");
    const rel = `material/${it.id}-manual-${Date.now() % 100000}.jpg`;
    const pagina = /\.(jpe?g|png|webp|avif|gif)(\?|$)/i.test(url) ? null : await datosDePagina(url);
    const directa = pagina?.imagen ?? url;
    await bajarImagen(directa, t.ruta(rel));
    const v = await verificarImagen(t.ruta(rel), it.imagen.queDebeVerse ?? it.imagen.busqueda, it.frase, (await leerMarca()).modeloClaude, undefined, pagina?.titulo ? `imagen principal de la página "${pagina.titulo}"` : null).catch(() => null);
    const host = new URL(url).hostname.replace(/^www\./, "");
    return {
      ...it,
      estado: "listo",
      motivo: v && v.muestra !== "si" ? `Ojo: al mirarla me parece que no muestra eso (${v.motivo}). La dejo porque la elegiste vos.` : undefined,
      imagen: { ...it.imagen, archivo: rel, credito: `Foto: ${host}`, paginaFuente: url, proveedor: null, origen: "manual", verificacion: v ? `${v.muestra}: ${v.motivo}` : null },
    };
  });

/** "Subir imagen" en la revisión: la convierte a JPG y la usa (origen "manual", sin crédito en pantalla). */
export const usarImagenSubida = (t: Trabajo, id: string, datos: Buffer) =>
  actualizarItem(t, id, async (it) => {
    if (!it.imagen) throw new Error("Ese material no lleva imagen.");
    const rel = `material/${it.id}-subida-${Date.now() % 100000}.jpg`;
    const tmp = t.ruta(`${rel}.original`);
    await mkdir(t.ruta("material"), { recursive: true });
    await writeFile(tmp, datos);
    try {
      await ejecutar("ffmpeg", ["-v", "error", "-y", "-i", tmp, "-frames:v", "1", "-vf", "scale='min(1600,iw)':-2", "-q:v", "3", t.ruta(rel)]);
    } catch {
      throw new Error("No pude leer esa imagen: subí un JPG, PNG o WEBP.");
    } finally {
      await rm(tmp, { force: true });
    }
    return { ...it, estado: "listo", motivo: undefined, imagen: { ...it.imagen, archivo: rel, credito: null, paginaFuente: null, proveedor: null, origen: "manual", verificacion: "La subiste vos." } };
  });
