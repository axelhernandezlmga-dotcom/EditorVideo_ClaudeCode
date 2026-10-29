import { CortesSchema, TranscripcionSchema } from "../../shared/cortes";
import type { Paso } from "../../shared/schemas";
import { ErrorClaude } from "../claude";
import { leerMarca } from "../config";
import type { ResultadoEjecucion } from "../runner";
import type { Trabajo } from "../trabajo";
import { pasoLimpieza } from "./audio";
import { pasoCortes } from "./cortes";
import { pasoMaterial } from "./material";
import { detectarBloques } from "./bloques";
import { perfilDeTrabajo } from "../perfiles";
import { pasoSfx } from "./sfx";
import { InfoVideoSchema, pasoSubida } from "./medios";
import { pasoRenderCrudo } from "./render";
import { FaltaPermisoDescarga, pasoTranscripcion } from "./transcripcion";

const NOMBRES: Partial<Record<Paso, string>> = {
  subida: "Preparando el video",
  limpieza: "Limpiando el audio",
  transcripcion: "Transcribiendo palabra por palabra",
  cortes: "Buscando silencios, muletillas y tomas repetidas",
  material: "Buscando noticias, datos e imágenes",
  sfx: "Eligiendo efectos de sonido",
  revision: "Revisión",
  render: "Renderizando el video",
  entrega: "Preparando la entrega",
};

/**
 * Corre (o reanuda) un trabajo de crudo. Igual que el runner de ideas: cada paso mira si su salida ya
 * existe y está marcada como hecha, y si es así lo saltea.
 */
export const ejecutarCrudo = async (t: Trabajo, signal?: AbortSignal): Promise<ResultadoEjecucion> => {
  const marca = await leerMarca();
  let pasoActual: Paso = "subida";
  const iniciar = async (p: Paso) => {
    pasoActual = p;
    if (signal?.aborted) throw new Error("Cancelado");
    await t.marcarPaso(p, "en_curso");
    t.actividad(`${NOMBRES[p] ?? p}…`);
  };
  const hecho = async (p: Paso) => (await t.estado()).pasos[p] === "hecho";
  await t.actualizar((e) => {
    e.estado = "trabajando";
    e.error = undefined;
  });
  try {
    // 1 · subida: validar el original y generar el proxy de 720p
    let video = (await hecho("subida")) && t.existe("proxy.mp4") ? await t.leer("video.json", InfoVideoSchema) : null;
    if (!video) {
      await iniciar("subida");
      video = await pasoSubida(t, signal);
      await t.marcarPaso("subida", "hecho");
    }

    // 2 · audio limpio (-14 LUFS + ruido)
    if (!(await hecho("limpieza")) || !t.existe("audio", "limpio16k.wav")) {
      await iniciar("limpieza");
      await pasoLimpieza(t, video.archivo, signal);
      await t.marcarPaso("limpieza", "hecho");
    }

    // 3 · transcripción palabra por palabra
    let tr = (await hecho("transcripcion")) ? await t.leer("transcripcion.json", TranscripcionSchema) : null;
    if (!tr) {
      await iniciar("transcripcion");
      tr = await pasoTranscripcion(t, marca, video.duracionMs, signal);
      await t.marcarPaso("transcripcion", "hecho");
    }

    // 4 · cortes sugeridos (pausas, muletillas, tomas repetidas)
    let cortes = (await hecho("cortes")) ? await t.leer("cortes.json", CortesSchema) : null;
    if (!cortes) {
      await iniciar("cortes");
      cortes = await pasoCortes(t, tr, marca, signal);
      await t.marcarPaso("cortes", "hecho");
    }

    // 5 · noticias, datos y fotos (con fuente real; lo que no se pudo capturar queda PENDIENTE)
    if (!(await hecho("material")) || !t.existe("material.json")) {
      await iniciar("material");
      await pasoMaterial(t, tr, cortes, marca, signal);
      await t.marcarPaso("material", "hecho");
    }
    // perfil con línea editorial: dónde pasa de los hechos al contexto o a la opinión (para el marcador)
    const perfil = await perfilDeTrabajo(t, marca);
    if (perfil.lineaEditorial === "hechos_contexto_opinion" && !t.existe("bloques.json")) await detectarBloques(t, tr, cortes, marca, signal);

    // 6 · efectos de sonido (golpes, dings y riser; whoosh y pop van solos con el material)
    if (!(await hecho("sfx")) || !t.existe("sfx.json")) {
      await iniciar("sfx");
      await pasoSfx(t, tr, cortes, marca, signal);
      await t.marcarPaso("sfx", "hecho");
    }

    // 7 · revisión: se espera a que apruebes (botón "Renderizar" o npm run crudo -- --aprobar)
    const auto = (await t.estado()).opciones.auto ?? marca.modoAutomatico;
    if (auto && !(await hecho("revision"))) await t.marcarPaso("revision", "salteado");
    const revisado = (await t.estado()).pasos.revision;
    if (revisado !== "hecho" && revisado !== "salteado") {
      await t.marcarPaso("revision", "en_curso");
      await t.actualizar((e) => {
        e.estado = "esperando_revision";
      });
      await t.log("Edición lista para revisar.");
      return "esperando_revision";
    }

    // 8 · render 1080×1920 con el original
    if (!(await hecho("render")) || !t.existe("video.mp4")) {
      await iniciar("render");
      await pasoRenderCrudo(t, marca, signal);
      await t.marcarPaso("render", "hecho");
    }

    await iniciar("entrega");
    await t.marcarPaso("entrega", "hecho");
    await t.actualizar((e) => {
      e.estado = "listo";
      e.progresoRender = undefined;
    });
    t.actividad("¡Listo!");
    await t.log(`Listo: ${t.ruta("video.mp4")} (fuentes y créditos en fuentes.md)`);
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
