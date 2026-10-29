import { readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { CarasSchema, type Caras } from "../../shared/crudo";
import { z } from "zod";
import { ejecutar, ffmpeg, ffprobe } from "../proceso";
import { PYTHON_VENV, RAIZ } from "../rutas";
import type { Trabajo } from "../trabajo";

/** Datos del video original (ya con la rotación del celular aplicada). */
export const InfoVideoSchema = z.object({
  archivo: z.string(),
  ancho: z.number().int().positive(),
  alto: z.number().int().positive(),
  fps: z.number().positive(),
  duracionMs: z.number().positive(),
  tieneAudio: z.boolean(),
  /** Medidas del proxy de 720p que se usa para analizar y para la vista previa. */
  proxy: z.object({ archivo: z.string(), ancho: z.number().int(), alto: z.number().int() }),
});
export type InfoVideo = z.infer<typeof InfoVideoSchema>;

const fraccion = (s: string | undefined) => {
  const [a, b] = (s ?? "").split("/").map(Number);
  return a && b ? a / b : a || 0;
};

type StreamProbe = { codec_type?: string; width?: number; height?: number; avg_frame_rate?: string; r_frame_rate?: string; side_data_list?: { rotation?: number }[]; tags?: { rotate?: string } };

/** Lee medidas, fps, duración y rotación con ffprobe. Falla con un mensaje claro si no es un video. */
export const analizarVideo = async (archivo: string) => {
  let datos: { streams?: StreamProbe[]; format?: { duration?: string } };
  try {
    datos = JSON.parse(await ffprobe(["-show_streams", "-show_format", "-of", "json", archivo])) as typeof datos;
  } catch {
    throw new Error("El archivo no es un video que se pueda leer (¿está dañado o incompleto?).");
  }
  const v = datos.streams?.find((s) => s.codec_type === "video");
  if (!v?.width || !v.height) throw new Error("El archivo no tiene imagen de video.");
  const rot = Math.abs(Number(v.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? v.tags?.rotate ?? 0)) % 180;
  const [ancho, alto] = rot === 90 ? [v.height, v.width] : [v.width, v.height];
  const duracionMs = Number(datos.format?.duration ?? 0) * 1000;
  if (!duracionMs) throw new Error("No pude medir la duración del video.");
  return {
    ancho,
    alto,
    fps: Math.round((fraccion(v.avg_frame_rate) || fraccion(v.r_frame_rate) || 30) * 1000) / 1000,
    duracionMs,
    tieneAudio: Boolean(datos.streams?.some((s) => s.codec_type === "audio")),
  };
};

/** Medidas del proxy: el lado corto a 720 px (pares, como pide h264). */
export const medidasProxy = (ancho: number, alto: number) => {
  const escala = Math.min(1, 720 / Math.min(ancho, alto));
  const par = (n: number) => Math.max(2, Math.round((n * escala) / 2) * 2);
  return { ancho: par(ancho), alto: par(alto) };
};

/** Busca el original del trabajo (original.mp4 / .mov / .m4v). */
export const archivoOriginal = async (t: Trabajo) => {
  const original = (await readdir(t.dir)).find((f) => /^original\.(mp4|mov|m4v)$/i.test(f));
  if (!original) throw new Error("No encuentro el video original del trabajo.");
  return original;
};

/**
 * Paso "subida": valida el original y genera el proxy de 720p (keyframe cada segundo, para que la vista
 * previa salte rápido a cualquier punto). Se escribe a un temporal y se renombra al terminar.
 */
export const pasoSubida = async (t: Trabajo, signal?: AbortSignal): Promise<InfoVideo> => {
  const archivo = await archivoOriginal(t);
  const info = await analizarVideo(t.ruta(archivo));
  if (!info.tieneAudio) throw new Error("El video no tiene audio: para editar un crudo hace falta tu voz.");
  const proxy = medidasProxy(info.ancho, info.alto);
  t.actividad("Generando la versión liviana (720p) para analizar…");
  const tmp = t.ruta("proxy.parcial.mp4");
  await ffmpeg(
    [
      "-y",
      "-i",
      t.ruta(archivo),
      "-vf",
      `scale=${proxy.ancho}:${proxy.alto}`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "26",
      "-g",
      String(Math.max(1, Math.round(info.fps))),
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      tmp,
    ],
    signal,
  ).catch(async (e: Error) => {
    await rm(tmp, { force: true });
    throw e;
  });
  await rename(tmp, t.ruta("proxy.mp4"));
  await detectarCaras(t, signal);
  const completo: InfoVideo = { archivo, ...info, proxy: { archivo: "proxy.mp4", ...proxy } };
  await t.escribir("video.json", completo);
  await t.log(
    `Video: ${info.ancho}×${info.alto} a ${info.fps} fps, ${(info.duracionMs / 1000).toFixed(1)} s${info.alto >= info.ancho ? " (vertical)" : " (horizontal: va con fondo desenfocado; el reencuadre queda para después)"}.`,
  );
  return completo;
};

/**
 * Dónde está la cara (un fotograma por segundo del proxy, con OpenCV) para que los subtítulos no la tapen.
 * Si falla (sin OpenCV, video raro) no frena el trabajo: los subtítulos van a la altura de siempre.
 */
export const detectarCaras = async (t: Trabajo, signal?: AbortSignal): Promise<Caras | null> => {
  t.actividad("Buscando tu cara en el video (para no taparla con los subtítulos)…");
  try {
    const salida = await ejecutar(PYTHON_VENV, [path.join(RAIZ, "src", "pipeline", "crudo", "caras.py"), t.ruta("proxy.mp4"), "1"], { signal });
    const caras = CarasSchema.parse(JSON.parse(salida));
    await t.escribir("caras.json", caras);
    const con = caras.muestras.filter((m) => m.cara).length;
    await t.log(`Cara detectada en ${con} de ${caras.muestras.length} segundos.`);
    return caras;
  } catch (e) {
    await t.log(`No pude buscar la cara (${(e as Error).message.slice(0, 160)}). Los subtítulos van a la altura de siempre; para esto hace falta \`npm run setup\`.`, "error");
    return null;
  }
};
