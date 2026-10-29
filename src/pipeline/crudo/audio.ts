import { readFile, rename } from "node:fs/promises";
import { CLI_REMOTION, ejecutar } from "../proceso";
import type { Trabajo } from "../trabajo";

let ffmpegCompleto: Promise<boolean> | null = null;
/** ¿Hay un ffmpeg del sistema con los filtros de limpieza? */
const hayFfmpegCompleto = () =>
  (ffmpegCompleto ??= ejecutar("ffmpeg", ["-hide_banner", "-filters"])
    .then((out) => /\bafftdn\b/.test(out) && /\bhighpass\b/.test(out))
    .catch(() => false));

const OBJETIVO_LUFS = -14;
/** -1,5 dBTP en lineal. */
const TECHO = 10 ** (-1.5 / 20);

/** Corre ffmpeg: el del sistema si tiene los filtros de limpieza, si no el que trae Remotion. */
const correr = (completo: boolean, args: string[], opts: { signal?: AbortSignal; devolverStderr?: boolean } = {}) =>
  completo
    ? ejecutar("ffmpeg", ["-hide_banner", "-nostats", ...args], opts)
    : ejecutar(process.execPath, [CLI_REMOTION, "ffmpeg", "-hide_banner", "-nostats", ...args], opts);

/** Loudness integrada (LUFS) que mide ebur128 con la cadena dada. */
const medirLufs = async (entrada: string, filtro: string, signal?: AbortSignal) => {
  const out = await ejecutar("ffmpeg", ["-hide_banner", "-nostats", "-i", entrada, "-vn", "-af", `${filtro}${filtro ? "," : ""}ebur128=framelog=quiet`, "-f", "null", "-"], { signal, devolverStderr: true });
  const i = /Integrated loudness:\s*I:\s*(-?[\d.]+)/.exec(out)?.[1];
  return i === undefined ? NaN : Number(i);
};

/**
 * Limpieza de la voz, en mono y devuelta en estéreo (así lo que se mide es lo que suena en el render):
 * pasa-altos (ruido grave, golpes al micrófono), reducción de ruido suave, compresor de voz, la ganancia
 * exacta que falta para -14 LUFS (lo que usan las redes) y un limitador a -1,5 dBTP con sobremuestreo.
 * (loudnorm solo, con picos altos, cae al modo dinámico y quedaba en -25 LUFS en vez de -14.)
 * Sale en 48 kHz para el render; para whisper y la energía, una versión de 16 kHz mono sin comprimir.
 */
export const pasoLimpieza = async (t: Trabajo, original: string, signal?: AbortSignal) => {
  const limpio = t.ruta("audio", "limpio.wav");
  const entrada = t.ruta(original);
  const completo = await hayFfmpegCompleto();
  let detalle: string;
  if (completo) {
    const cadena = "aformat=channel_layouts=mono,highpass=f=80,afftdn=nr=10:nf=-45:tn=1,acompressor=threshold=0.03:ratio=4:attack=5:release=150:knee=4,aformat=channel_layouts=stereo";
    const antes = await medirLufs(entrada, "", signal);
    const comprimido = await medirLufs(entrada, cadena, signal);
    const ganancia = Number.isFinite(comprimido) ? OBJETIVO_LUFS - comprimido : 0;
    const filtro = `${cadena},volume=${ganancia.toFixed(2)}dB,aresample=192000,alimiter=limit=${TECHO.toFixed(4)}:level=false:attack=1:release=20,aresample=48000`;
    await correr(true, ["-loglevel", "error", "-y", "-i", entrada, "-vn", "-af", filtro, "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", `${limpio}.tmp.wav`], { signal });
    const despues = await medirLufs(`${limpio}.tmp.wav`, "", signal);
    detalle = `Audio limpio: ${despues.toFixed(1)} LUFS (venía en ${antes.toFixed(1)}; objetivo ${OBJETIVO_LUFS}), ruido reducido y voz comprimida.`;
  } else {
    await correr(false, ["-loglevel", "error", "-y", "-i", entrada, "-vn", "-af", `loudnorm=I=${OBJETIVO_LUFS}:TP=-1.5:LRA=11`, "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", `${limpio}.tmp.wav`], { signal });
    detalle = `Audio normalizado hacia ${OBJETIVO_LUFS} LUFS con loudnorm. Para reducir ruido y comprimir la voz instalá ffmpeg en el sistema: el que trae Remotion no tiene esos filtros.`;
  }
  // el audio que se analiza (whisper y energía) va SIN compresor: comprimir sube el ruido de fondo de las
  // pausas y la detección de voz deja de encontrar silencios (en un clip con público no quedaba ninguna pausa)
  const analisis = completo ? "aformat=channel_layouts=mono,highpass=f=80,afftdn=nr=10:nf=-45:tn=1" : "aformat=channel_layouts=mono";
  await correr(completo, ["-loglevel", "error", "-y", "-i", entrada, "-vn", "-af", analisis, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", t.ruta("audio", "limpio16k.wav")], { signal });
  await rename(`${limpio}.tmp.wav`, limpio);
  await t.log(`${detalle} (audio/limpio.wav)`);
};

/** Muestras de un WAV PCM de 16 bits mono (busca el bloque "data" en vez de suponer 44 bytes de cabecera). */
export const leerWav16 = (buf: Buffer): { muestras: Int16Array; frecuencia: number } => {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") throw new Error("No es un WAV.");
  let pos = 12;
  let frecuencia = 16000;
  while (pos + 8 <= buf.length) {
    const id = buf.toString("ascii", pos, pos + 4);
    const tam = buf.readUInt32LE(pos + 4);
    if (id === "fmt ") frecuencia = buf.readUInt32LE(pos + 12);
    if (id === "data") {
      const datos = buf.subarray(pos + 8, pos + 8 + Math.min(tam, buf.length - pos - 8));
      const copia = new Int16Array(Math.floor(datos.length / 2));
      for (let i = 0; i < copia.length; i++) copia[i] = datos.readInt16LE(i * 2);
      return { muestras: copia, frecuencia };
    }
    pos += 8 + tam + (tam % 2);
  }
  throw new Error("El WAV no tiene datos.");
};

/** Energía de la voz en dB cada `pasoMs` (bloques de 10 ms por defecto), a partir de un WAV de 16 bits mono. */
export const envolvente = async (wav: string, pasoMs = 10): Promise<{ db: Float32Array; pasoMs: number }> => {
  const { muestras, frecuencia } = leerWav16(await readFile(wav));
  const porBloque = Math.round((frecuencia * pasoMs) / 1000);
  const n = Math.floor(muestras.length / porBloque);
  const db = new Float32Array(n);
  for (let b = 0; b < n; b++) {
    let s = 0;
    for (let k = b * porBloque; k < (b + 1) * porBloque; k++) {
      const v = muestras[k]! / 32768;
      s += v * v;
    }
    db[b] = 10 * Math.log10(s / porBloque + 1e-10);
  }
  return { db, pasoMs };
};

/**
 * Umbral de voz: piso de ruido (percentil 10) + el 30 % de la distancia hasta la voz (percentil 90), entre
 * 6 y 14 dB. Así se adapta al ruido de fondo: un audio de celular en la calle tiene el piso en -36 dB y las
 * pausas en -32; con un umbral fijo de -40 dB todo contaba como voz y no se cortaba ninguna pausa.
 */
export const umbralVoz = (db: Float32Array) => {
  const orden = Array.from(db).sort((a, b) => a - b);
  if (!orden.length) return -45;
  const piso = orden[Math.floor(orden.length * 0.1)]!;
  const voz = orden[Math.floor(orden.length * 0.9)]!;
  const margen = Math.min(14, Math.max(6, (voz - piso) * 0.3));
  return Math.min(-18, Math.max(-60, piso + margen));
};
