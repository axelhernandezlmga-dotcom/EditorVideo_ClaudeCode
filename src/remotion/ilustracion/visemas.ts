import type { Caption } from "@remotion/captions";

/**
 * Bocas para sincronizar con la voz (visemas simples). Salen de los tiempos por palabra que ya tiene cada
 * escena (whisper, Gemini o tu propia grabación): cada palabra se reparte en sus vocales y las consonantes
 * que cierran o muerden el labio.
 *   X = cerrada en reposo · A = bien abierta · E = abierta ancha · I = sonrisa angosta
 *   O = redonda · U = redonda chica · M = labios apretados (m, b, p) · F = labio bajo los dientes (f, v)
 */
export type Visema = "X" | "A" | "E" | "I" | "O" | "U" | "M" | "F";

const LETRA: Record<string, Visema> = {
  a: "A", á: "A", e: "E", é: "E", i: "I", í: "I", y: "I", o: "O", ó: "O", u: "U", ú: "U", ü: "U",
  m: "M", b: "M", p: "M", f: "F", v: "F",
};

/** Secuencia de bocas de una palabra (sin repetir dos iguales seguidas). */
export const visemasDePalabra = (palabra: string): Visema[] => {
  const out: Visema[] = [];
  for (const ch of palabra.toLowerCase()) {
    const v = LETRA[ch];
    if (v && out[out.length - 1] !== v) out.push(v);
  }
  // palabras sin vocales reconocibles ("eh" ya tiene; "mmm" da M; números o siglas) → boca media
  return out.length ? out : ["E"];
};

/** Boca en el momento `ms` (relativo a la escena). Fuera de las palabras, cerrada. */
export const visemaEn = (captions: Caption[], ms: number): Visema => {
  const c = captions.find((c) => ms >= c.startMs && ms < c.endMs);
  if (!c) return "X";
  const dur = Math.max(1, c.endMs - c.startMs);
  // la boca se cierra un instante entre palabras seguidas
  if (ms > c.endMs - Math.min(45, dur * 0.15)) return "X";
  const seq = visemasDePalabra(c.text.replace(/[^\p{L}\p{N}]/gu, ""));
  const i = Math.min(seq.length - 1, Math.floor(((ms - c.startMs) / dur) * seq.length));
  return seq[i]!;
};

/** Apertura (0–1) de cada boca: también la usa el cuerpo para acompañar el habla con la cabeza. */
export const APERTURA: Record<Visema, number> = { X: 0, M: 0, F: 0.25, I: 0.35, U: 0.45, E: 0.65, O: 0.8, A: 1 };
