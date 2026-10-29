import { createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Caption } from "@remotion/captions";
import { aEditado, calcularTramos, motivoQuitar, type Cortes, type Transcripcion } from "../shared/cortes";
import { COLCHON_MS, duracionEscenaFrames, FPS, FRAMES_TRANSICION, iniciosEscenas } from "../shared/render";
import type { Guion, Voz } from "../shared/schemas";
import { alinearConGuion, GrabacionSchema, type AlineacionEscena, type Grabacion, type TomaEscena } from "../shared/vozPropia";
import { desplazar } from "./alinear";
import { duracionMs, ejecutar, ffmpeg } from "./proceso";
import type { Trabajo } from "./trabajo";

/** Formatos que se aceptan al subir tu voz (las notas de voz de WhatsApp son .opus u .ogg). */
export const EXTENSIONES_VOZ = [".m4a", ".mp3", ".wav", ".ogg", ".opus", ".webm", ".aac", ".flac", ".mp4"] as const;
export const MAX_BYTES_VOZ = 400 * 1024 * 1024;
/** Silencio entre tomas al unir las grabaciones escena por escena. */
const SILENCIO_ENTRE_TOMAS_MS = 600;

export class ErrorVoz extends Error {}

/** ffmpeg del sistema si está (lee todo: opus, aac, webm sin duración); si no, el de Remotion. */
const convertir = async (args: string[], signal?: AbortSignal) => {
  try {
    await ejecutar("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args], { signal });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    await ffmpeg(args, signal);
  }
};

/** Cualquier audio → WAV 48 kHz mono (lo que espera la limpieza). */
const aWav = (entrada: string, salida: string, signal?: AbortSignal) => convertir(["-y", "-i", entrada, "-vn", "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", salida], signal);

const extensionValida = (nombre: string) => {
  const ext = path.extname(nombre).toLowerCase();
  if (!(EXTENSIONES_VOZ as readonly string[]).includes(ext)) throw new ErrorVoz(`Ese formato (${ext || "sin extensión"}) no lo leo. Subí ${EXTENSIONES_VOZ.join(", ")}.`);
  return ext;
};

/** Guarda en disco lo que llega (en streaming) y avisa si se pasa del máximo. */
const guardarStream = async (datos: Readable, destino: string) => {
  let bytes = 0;
  datos.on("data", (c: Buffer) => {
    bytes += c.length;
    if (bytes > MAX_BYTES_VOZ) datos.destroy(new ErrorVoz("El audio pesa más de 400 MB."));
  });
  await pipeline(datos, createWriteStream(destino));
  if (bytes === 0) throw new ErrorVoz("El archivo llegó vacío.");
};

/** Cuando llega una grabación nueva, todo lo que salió de la anterior se rehace. */
const reiniciarDesdeGrabacion = async (t: Trabajo, g: Grabacion) => {
  await t.escribir("voz/grabacion.json", g);
  await t.invalidarDesde("limpieza");
  await t.marcarPaso("grabacion", "hecho");
  await t.actualizar((e) => {
    if (e.estado === "esperando_voz") e.estado = "en_cola";
  });
  await t.log(`Tu voz llegó: ${g.nombre} (${(g.duracionMs / 1000).toFixed(1)} s${g.tomas.length ? `, ${g.tomas.length} tomas por escena` : ""}).`);
};

/** Un archivo entero (subido o grabado de corrido en el navegador). */
export const recibirArchivoVoz = async (t: Trabajo, datos: Readable, nombre: string, forma: "archivo" | "navegador") => {
  const ext = extensionValida(nombre);
  await mkdir(t.ruta("voz"), { recursive: true });
  const bruto = t.ruta("voz", `subido${ext}`);
  await guardarStream(datos, bruto);
  const wav = t.ruta("voz", "original.wav");
  try {
    await aWav(bruto, wav);
  } catch {
    throw new ErrorVoz("No pude leer ese audio. Probá exportarlo como .m4a o .mp3.");
  }
  const g: Grabacion = { archivo: "voz/original.wav", nombre, forma, duracionMs: await duracionMs(wav), tomas: [] };
  if (g.duracionMs < 1500) throw new ErrorVoz("La grabación dura menos de 2 segundos.");
  await reiniciarDesdeGrabacion(t, g);
  return g;
};

const archivoToma = (n: number) => `toma-${String(n + 1).padStart(2, "0")}`;

/** Una toma de una escena (grabación escena por escena): reemplaza la anterior de esa escena. */
export const recibirTomaEscena = async (t: Trabajo, escena: number, datos: Readable, nombre: string) => {
  const ext = extensionValida(nombre);
  const dir = t.ruta("voz", "tomas");
  await mkdir(dir, { recursive: true });
  for (const viejo of await readdir(dir)) if (viejo.startsWith(`${archivoToma(escena)}.`)) await rm(path.join(dir, viejo), { force: true });
  const bruto = path.join(dir, `${archivoToma(escena)}.bruto${ext}`);
  await guardarStream(datos, bruto);
  await aWav(bruto, path.join(dir, `${archivoToma(escena)}.wav`));
  await rm(bruto, { force: true });
  return { escena, duracionMs: await duracionMs(path.join(dir, `${archivoToma(escena)}.wav`)) };
};

/** Tomas por escena que ya están grabadas. */
export const tomasGrabadas = async (t: Trabajo): Promise<{ escena: number; duracionMs: number; url: string }[]> => {
  if (!t.existe("voz", "tomas")) return [];
  const out = [];
  for (const f of (await readdir(t.ruta("voz", "tomas"))).sort()) {
    const m = /^toma-(\d+)\.wav$/.exec(f);
    if (m) out.push({ escena: Number(m[1]) - 1, duracionMs: await duracionMs(t.ruta("voz", "tomas", f)), url: `/jobs/${t.id}/voz/tomas/${f}` });
  }
  return out;
};

/** Une las tomas por escena (en orden, con un silencio entre medio) y sigue el trabajo. */
export const unirTomas = async (t: Trabajo) => {
  const tomas = await tomasGrabadas(t);
  if (!tomas.length) throw new ErrorVoz("Todavía no grabaste ninguna escena.");
  const silencio = t.ruta("voz", "silencio.wav");
  await convertir(["-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", (SILENCIO_ENTRE_TOMAS_MS / 1000).toFixed(3), "-c:a", "pcm_s16le", silencio]);
  const lista = t.ruta("voz", "lista.txt");
  const ventanas: TomaEscena[] = [];
  let cursor = 0;
  const lineas: string[] = [];
  for (const tm of tomas) {
    lineas.push(`file '${t.ruta("voz", "tomas", `${archivoToma(tm.escena)}.wav`)}'`, `file '${silencio}'`);
    ventanas.push({ escena: tm.escena, desdeMs: cursor, hastaMs: cursor + tm.duracionMs });
    cursor += tm.duracionMs + SILENCIO_ENTRE_TOMAS_MS;
  }
  await writeFile(lista, lineas.join("\n"), "utf8");
  const unido = t.ruta("voz", "unido.wav");
  await convertir(["-y", "-f", "concat", "-safe", "0", "-i", lista, "-c:a", "pcm_s16le", `${unido}.tmp.wav`]);
  await rename(`${unido}.tmp.wav`, unido);
  await rm(lista, { force: true });
  await rm(silencio, { force: true });
  const g: Grabacion = { archivo: "voz/unido.wav", nombre: `${tomas.length} tomas grabadas en la app`, forma: "escenas", duracionMs: await duracionMs(unido), tomas: ventanas };
  await reiniciarDesdeGrabacion(t, g);
  return g;
};

export const leerGrabacion = (t: Trabajo) => t.leer("voz/grabacion.json", GrabacionSchema);

/** Alineación con el guion a partir de la transcripción y los cortes de ahora (para la revisión y para armar la voz). */
export const alineacionActual = (guion: Guion, tr: Transcripcion, cortes: Cortes, g: Grabacion | null): AlineacionEscena[] =>
  alinearConGuion(
    guion.escenas.map((e) => e.narracion),
    tr.palabras,
    (i) => motivoQuitar(cortes, i) === null,
    g?.tomas ?? [],
  );

/**
 * Paso "voz" de "Mi voz": corta tu grabación limpia con los cortes aprobados, la reparte por escena según
 * la alineación y deja voz.json igual que la voz de la IA (un audio por escena con sus tiempos por
 * palabra). Los subtítulos son TU transcripción, no el texto del guion. Devuelve también el guion sin
 * las escenas que te salteaste.
 */
export const pasoVozPropia = async (t: Trabajo, guion: Guion, tr: Transcripcion, cortes: Cortes, signal?: AbortSignal): Promise<{ voz: Voz; guion: Guion }> => {
  const g = await leerGrabacion(t);
  const alineacion = alineacionActual(guion, tr, cortes, g);
  await t.escribir("voz/alineacion.json", alineacion);
  const quedan = alineacion.filter((a) => !a.salteada && a.palabras.length);
  if (!quedan.length) throw new Error("No encontré en tu grabación ninguna escena del guion. ¿Subiste el audio correcto?");
  const salteadas = alineacion.filter((a) => a.salteada).map((a) => a.escena);
  if (salteadas.length) await t.log(`Te salteaste ${salteadas.length === 1 ? "la escena" : "las escenas"} ${salteadas.map((s) => s + 1).join(", ")}: ${salteadas.length === 1 ? "sale" : "salen"} del video.`, "error");

  // 1 · audio cortado entero (solo los tramos que quedan), desde el audio limpio de 48 kHz
  const tramos = calcularTramos(tr.palabras, cortes, tr.duracionMs);
  const cortado = t.ruta("audio", "mi-voz-cortada.wav");
  const filtros = tramos.map((tm, k) => `[0:a]atrim=start=${(tm.inicioMs / 1000).toFixed(3)}:end=${(tm.finMs / 1000).toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:d=0.008,afade=t=out:st=${Math.max(0, (tm.finMs - tm.inicioMs) / 1000 - 0.008).toFixed(3)}:d=0.008[s${k}]`);
  const grafo = `${filtros.join(";")};${tramos.map((_, k) => `[s${k}]`).join("")}concat=n=${tramos.length}:v=0:a=1[out]`;
  t.actividad("Cortando tu grabación…");
  // el grafo va como argumento (sin shell): el script por archivo cambió de nombre entre versiones de ffmpeg
  await convertir(["-y", "-i", t.ruta("audio", "limpio.wav"), "-filter_complex", grafo, "-map", "[out]", "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", cortado], signal);
  const durCortado = await duracionMs(cortado);

  // 2 · límites entre escenas en el audio cortado: a mitad del silencio entre la última palabra de una y la primera de la otra
  const tiempos = (i: number) => {
    const p = tr.palabras[i]!;
    return { ini: aEditado(tramos, p.inicioMs) ?? 0, fin: aEditado(tramos, p.finMs) ?? aEditado(tramos, p.inicioMs) ?? 0 };
  };
  const rangos = quedan.map((a) => ({ a, ini: tiempos(a.palabras[0]!).ini, fin: tiempos(a.palabras.at(-1)!).fin }));
  const limites = rangos.map((r, k) => (k === 0 ? 0 : (rangos[k - 1]!.fin + r.ini) / 2));
  limites.push(durCortado);

  const escenas: Voz["escenas"] = [];
  for (const [k, r] of rangos.entries()) {
    const ini = Math.max(0, Math.min(limites[k]!, r.ini - 120));
    const fin = Math.min(durCortado, Math.max(limites[k + 1]!, r.fin + 150));
    const archivo = `audio/mi-voz-escena-${String(r.a.escena + 1).padStart(2, "0")}.wav`;
    await convertir(["-y", "-i", cortado, "-ss", (ini / 1000).toFixed(3), "-to", (fin / 1000).toFixed(3), "-c:a", "pcm_s16le", t.ruta(archivo)], signal);
    const dur = await duracionMs(t.ruta(archivo));
    const captions: Caption[] = r.a.palabras
      .filter((i) => !tr.palabras[i]!.sinTranscribir)
      .map((i, n) => {
        const { ini: a, fin: b } = tiempos(i);
        const startMs = Math.max(0, Math.min(dur - 1, a - ini));
        const endMs = Math.max(startMs + 1, Math.min(dur, b - ini));
        const texto = tr.palabras[i]!.texto.trim();
        return { text: n === 0 ? texto : ` ${texto}`, startMs, endMs, timestampMs: Math.round((startMs + endMs) / 2), confidence: tr.palabras[i]!.prob };
      });
    escenas.push({ archivo, duracionMs: dur, captions, origenTiempos: "whisper" });
  }

  const voz: Voz = { voz: "propia", velocidad: "+0%", tono: "+0Hz", escenas, propia: { salteadas } };
  await t.escribir("voz.json", voz);
  const inicios = iniciosEscenas(escenas.map((e) => duracionEscenaFrames(e.duracionMs)));
  await t.escribir("captions.json", escenas.flatMap((e, i) => desplazar(e.captions, ((inicios[i] ?? 0) / FPS) * 1000)));

  // audio completo con el mismo espaciado que el video (para la galería y la entrega)
  const gapMs = COLCHON_MS - (FRAMES_TRANSICION / FPS) * 1000;
  const silencio = t.ruta("audio", "silencio.wav");
  await convertir(["-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", Math.max(0.05, gapMs / 1000).toFixed(3), "-c:a", "pcm_s16le", silencio], signal);
  const lista = t.ruta("audio", "lista.txt");
  await writeFile(lista, escenas.flatMap((e) => [`file '${t.ruta(e.archivo)}'`, `file '${silencio}'`]).join("\n"), "utf8");
  await convertir(["-y", "-f", "concat", "-safe", "0", "-i", lista, "-c:a", "libmp3lame", "-b:a", "128k", t.ruta("audio", "completo.mp3")], signal);
  await rm(lista, { force: true });
  await rm(silencio, { force: true });

  await t.log(`Tu voz quedó en ${escenas.length} escenas (${(escenas.reduce((n, e) => n + e.duracionMs, 0) / 1000).toFixed(1)} s, subtítulos con lo que dijiste de verdad).`);
  return { voz, guion: guionSinSalteadas(guion, salteadas) };
};

/** El guion sin las escenas que no dijiste (lo que se renderiza). */
export const guionSinSalteadas = (guion: Guion, salteadas: number[]): Guion => ({ ...guion, escenas: guion.escenas.filter((_, i) => !salteadas.includes(i)) });
