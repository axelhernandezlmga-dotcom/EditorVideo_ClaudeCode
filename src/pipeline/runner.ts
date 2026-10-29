import { CortesSchema, TranscripcionSchema } from "../shared/cortes";
import { estiloIlustracionDe, GuionSchema, VozSchema, type Guion, type Marca, type Paso, type Voz } from "../shared/schemas";
import { ErrorClaude } from "./claude";
import { pasoLimpieza } from "./crudo/audio";
import { pasoCortes } from "./crudo/cortes";
import { ejecutarCrudo } from "./crudo/runner";
import { FaltaPermisoDescarga, pasoTranscripcion } from "./crudo/transcripcion";
import { leerMarca } from "./config";
import { pasoEntrega } from "./pasos/entrega";
import { generarGuion } from "./pasos/guion";
import { pasoRender } from "./pasos/render";
import { pasoVisuales, VisualesSchema } from "./pasos/visuales";
import { pasoVoz } from "./pasos/voz";
import { extrasDePerfil, marcaConPerfil, perfilDeTrabajo } from "./perfiles";
import { aplicarTono, tonoDelTrabajo } from "./tonos";
import type { Trabajo } from "./trabajo";
import { guionSinSalteadas, leerGrabacion, pasoVozPropia } from "./vozPropia";
import { anotarFaltantes, normalizarIlustradas } from "./ilustracion/preparar";

export type ResultadoEjecucion = "listo" | "esperando_revision" | "esperando_voz" | "pausado" | "cancelado" | "error";

const NOMBRES: Partial<Record<Paso, string>> = {
  guion: "Investigando y escribiendo el guion",
  revision: "Revisión",
  voz: "Generando la voz",
  visuales: "Preparando música y visuales",
  render: "Renderizando el video",
  entrega: "Preparando la entrega",
  grabacion: "Esperando tu voz",
  limpieza: "Limpiando tu grabación",
  transcripcion: "Transcribiendo tu voz palabra por palabra",
  cortes: "Buscando silencios, muletillas y tomas repetidas",
  revision_voz: "Revisión de tu voz",
};

/**
 * "Mi voz": espera tu grabación (estado esperando_voz, que sobrevive a cerrar la app), la limpia, la
 * transcribe y la corta con el motor de crudos, para en la revisión de cortes (salvo en automático) y arma
 * la voz por escena. Devuelve la voz y el guion sin las escenas salteadas, o en qué estado quedó esperando.
 */
const vozPropia = async (t: Trabajo, guion: Guion, marca: Marca, auto: boolean, iniciar: (p: Paso) => Promise<void>, signal?: AbortSignal): Promise<{ voz: Voz; guion: Guion } | "esperando_voz" | "esperando_revision"> => {
  const hecho = async (p: Paso) => (await t.estado()).pasos[p] === "hecho";
  const g = await leerGrabacion(t);
  if (!g || !t.existe(g.archivo)) {
    if ((await t.estado()).pasos.grabacion !== "en_curso") await t.log("Guion listo: esperando tu voz. Grabala o subila desde la app (Cola → Grabar o subir tu voz).");
    await t.marcarPaso("grabacion", "en_curso");
    await t.actualizar((e) => {
      e.estado = "esperando_voz";
    });
    return "esperando_voz";
  }
  if (!(await hecho("grabacion"))) await t.marcarPaso("grabacion", "hecho");

  if (!(await hecho("limpieza")) || !t.existe("audio", "limpio16k.wav")) {
    await iniciar("limpieza");
    await pasoLimpieza(t, g.archivo, signal);
    await t.marcarPaso("limpieza", "hecho");
  }
  let tr = (await hecho("transcripcion")) ? await t.leer("transcripcion.json", TranscripcionSchema) : null;
  if (!tr) {
    await iniciar("transcripcion");
    tr = await pasoTranscripcion(t, marca, g.duracionMs, signal);
    await t.marcarPaso("transcripcion", "hecho");
  }
  let cortes = (await hecho("cortes")) ? await t.leer("cortes.json", CortesSchema) : null;
  if (!cortes) {
    await iniciar("cortes");
    // las mismas reglas prudentes que en los crudos (ante la duda no se corta; las repeticiones enfáticas quedan)
    cortes = await pasoCortes(t, tr, marca, signal);
    await t.marcarPaso("cortes", "hecho");
  }

  const revisada = (await t.estado()).pasos.revision_voz;
  if (auto && revisada !== "hecho") await t.marcarPaso("revision_voz", "salteado");
  else if (revisada !== "hecho" && revisada !== "salteado") {
    await t.marcarPaso("revision_voz", "en_curso");
    await t.actualizar((e) => {
      e.estado = "esperando_revision";
    });
    await t.log("Tu voz está lista para revisar (cortes y escenas).");
    return "esperando_revision";
  }

  const previa = (await hecho("voz")) ? await t.leer("voz.json", VozSchema) : null;
  if (previa?.propia && previa.escenas.every((e) => t.existe(e.archivo))) return { voz: previa, guion: guionSinSalteadas(guion, previa.propia.salteadas) };
  await iniciar("voz");
  const r = await pasoVozPropia(t, guion, tr, cortes, signal);
  await t.marcarPaso("voz", "hecho");
  return r;
};

/**
 * Corre (o reanuda) un trabajo. Cada paso mira si su salida ya existe y es válida, y si es así lo saltea:
 * por eso volver a llamar a esta función después de un corte continúa donde quedó.
 */
export const ejecutarTrabajo = async (t: Trabajo, signal?: AbortSignal): Promise<ResultadoEjecucion> => {
  if ((await t.estado()).tipo === "crudo") return ejecutarCrudo(t, signal);
  const marca = await leerMarca();
  let pasoActual: Paso = "guion";
  const iniciar = async (p: Paso) => {
    pasoActual = p;
    if (signal?.aborted) throw new Error("Cancelado");
    await t.marcarPaso(p, "en_curso");
    t.actividad(`${NOMBRES[p] ?? p}…`);
  };
  await t.actualizar((e) => {
    e.estado = "trabajando";
    e.error = undefined;
  });
  try {
    const estado = await t.estado();
    const tono = await tonoDelTrabajo(marca, estado.opciones.tono, (l) => void t.log(l, "error"));
    // perfil con el que se firma (@, colores, tipografía) y, encima, la velocidad de la voz y acentos del tono
    const perfil = await perfilDeTrabajo(t, marca);
    const marcaPerfil = marcaConPerfil(marca, perfil);
    const marcaTono = aplicarTono(marcaPerfil, tono);

    // 2 · guion
    let guion = await t.leer("guion.json", GuionSchema);
    if (!guion || estado.pasos.guion !== "hecho") {
      await iniciar("guion");
      guion = await generarGuion(t, await t.entrada(), marcaPerfil, signal, estado.opciones.instruccion);
      await t.escribir("guion.json", guion);
      await t.log(`Guion listo: "${guion.titulo}" (${guion.escenas.length} escenas, ${guion.escenas.reduce((n, e) => n + e.narracion.split(/\s+/).length, 0)} palabras)`);
      await t.marcarPaso("guion", "hecho");
    }

    // 3 · revisión
    const auto = estado.opciones.auto ?? marca.modoAutomatico;
    if (auto) {
      if (estado.pasos.revision !== "hecho") await t.marcarPaso("revision", "salteado");
    } else if (estado.pasos.revision !== "hecho") {
      await t.marcarPaso("revision", "en_curso");
      await t.actualizar((e) => {
        e.estado = "esperando_revision";
      });
      await t.log("Guion listo para revisar.");
      return "esperando_revision";
    }

    // 4 · voz: la de la IA, o la tuya ("Mi voz")
    let voz: Voz | null = null;
    if (estado.opciones.modo === "mi_voz") {
      const r = await vozPropia(t, guion, marca, auto, iniciar, signal);
      if (typeof r === "string") return r;
      ({ voz, guion } = r);
    } else voz = (await t.estado()).pasos.voz === "hecho" ? await t.leer("voz.json", VozSchema) : null;
    if (!voz || voz.escenas.length !== guion.escenas.length) {
      await iniciar("voz");
      voz = await pasoVoz(t, guion, marcaTono, tono, signal);
      await t.log(`Voz lista (${voz.voz}, ${(voz.escenas.reduce((n, e) => n + e.duracionMs, 0) / 1000).toFixed(1)} s de narración)`);
      await t.marcarPaso("voz", "hecho");
    }

    // 5/7 · visuales y música
    let visuales = (await t.estado()).pasos.visuales === "hecho" ? await t.leer("visuales.json", VisualesSchema) : null;
    if (!visuales) {
      await iniciar("visuales");
      visuales = await pasoVisuales(t, guion, marca, signal, perfil?.moodsMusica ?? []);
      await t.marcarPaso("visuales", "hecho");
    }
    // escenas ilustradas: lo que no está en la biblioteca (ni se pudo dibujar) va con lo más parecido
    if (guion.escenas.some((e) => e.plantilla === "escena_ilustrada")) {
      const r = normalizarIlustradas(guion, visuales.svgs, undefined, t.id);
      guion = r.guion;
      if (r.faltantes.length) {
        await anotarFaltantes(r.faltantes);
        await t.log(`Ilustración: no estaban ${r.faltantes.map((f) => `${f.id} (→ ${f.reemplazo ?? "sacado"})`).join(", ")}. Quedan anotados en assets/ilustracion/faltantes.json.`);
      }
    }

    // 8 · render
    if ((await t.estado()).pasos.render !== "hecho" || !t.existe("video.mp4") || !t.existe("portada.png")) {
      await iniciar("render");
      // las escenas ilustradas usan el estilo elegido (o el del tono) y el narrador dibujado del perfil
      const ilustracion = { estilo: estiloIlustracionDe(estado.opciones.estiloIlustracion, tono?.id), narrador: perfil?.narrador };
      await pasoRender(t, guion, voz, visuales, marcaTono, tono?.animacion ?? "normal", signal, { ...(await extrasDePerfil(perfil, t)), ilustracion }, estado.opciones.cierre ?? true);
      await t.log("Video renderizado: video.mp4 + portada.png");
      await t.marcarPaso("render", "hecho");
    }

    await iniciar("entrega");
    await pasoEntrega(t, guion, visuales, marca);
    await t.marcarPaso("entrega", "hecho");
    await t.actualizar((e) => {
      e.estado = "listo";
      e.progresoRender = undefined;
    });
    t.actividad("¡Listo!");
    await t.log(`Listo: ${t.ruta("video.mp4")}`);
    return "listo";
  } catch (e) {
    const err = e as Error;
    const cancelado = signal?.aborted || err.name === "AbortError" || /cancel/i.test(err.message);
    const pausado = (e instanceof ErrorClaude && e.tipo === "limite") || e instanceof FaltaPermisoDescarga;
    await t.marcarPaso(pasoActual, cancelado || pausado ? "pendiente" : "error");
    await t.actualizar((est) => {
      est.estado = cancelado ? "cancelado" : pausado ? "pausado" : "error";
      est.error = cancelado ? "Cancelado por el usuario" : err.message;
    });
    await t.log(cancelado ? "Trabajo cancelado." : `${NOMBRES[pasoActual] ?? pasoActual}: ${err.message}`, cancelado ? "info" : "error");
    return cancelado ? "cancelado" : pausado ? "pausado" : "error";
  }
};
