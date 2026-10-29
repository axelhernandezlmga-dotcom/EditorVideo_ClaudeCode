import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import type { Caption } from "@remotion/captions";
import { transcribe, toCaptions } from "@remotion/install-whisper-cpp";
import type { PalabraTiempo } from "./alinear";
import { ffmpeg } from "./proceso";
import { RAIZ } from "./rutas";

export const WHISPER_DIR = path.join(RAIZ, "whisper.cpp");
export const WHISPER_VERSION = "1.5.5";
export const WHISPER_MODELO = "base" as const;

export const RUTA_MODELO = path.join(WHISPER_DIR, `ggml-${WHISPER_MODELO}.bin`);
export const whisperDisponible = () => existsSync(RUTA_MODELO);

/** whisper devuelve sub-palabras: las que no empiezan con espacio son continuación de la anterior. */
export const unirSubpalabras = (captions: Caption[]): (PalabraTiempo & { prob: number | null })[] => {
  const palabras: (PalabraTiempo & { prob: number | null })[] = [];
  for (const c of captions) {
    const previa = palabras.at(-1);
    if (previa && !/^\s/.test(c.text)) {
      previa.texto += c.text;
      previa.finMs = Math.max(previa.finMs, c.endMs);
      if (c.confidence !== null && previa.prob !== null) previa.prob = Math.min(previa.prob, c.confidence);
    } else if (c.text.trim()) {
      palabras.push({ texto: c.text.trim(), inicioMs: c.startMs, finMs: c.endMs, prob: c.confidence });
    }
  }
  return palabras;
};

/** Transcribe un audio localmente y devuelve tiempos por palabra (respaldo cuando el TTS no los da). */
export const tiemposConWhisper = async (audio: string, signal?: AbortSignal): Promise<PalabraTiempo[]> => {
  if (!whisperDisponible()) {
    throw new Error("whisper.cpp no está instalado. Corré `npm run setup` para instalar el respaldo de subtítulos.");
  }
  const wav = audio.replace(/\.[^.]+$/, ".16k.wav");
  await ffmpeg(["-y", "-i", audio, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav], signal);
  try {
    const salida = await transcribe({
      inputPath: wav,
      whisperPath: WHISPER_DIR,
      whisperCppVersion: WHISPER_VERSION,
      model: WHISPER_MODELO,
      tokenLevelTimestamps: true,
      language: "es",
      printOutput: false,
      signal,
    });
    return unirSubpalabras(toCaptions({ whisperCppOutput: salida }).captions);
  } finally {
    await rm(wav, { force: true });
  }
};
