import type { Caption } from "@remotion/captions";

/** Palabra con tiempos, tal como la da el TTS o whisper (puede venir sin puntuación). */
export type PalabraTiempo = { texto: string; inicioMs: number; finMs: number };

export const normalizarPalabra = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");

/** Parecido entre dos palabras normalizadas: 2 iguales, 1 parecidas ("afap"/"fap", "sabes"/"sabés"), -1 distintas. */
const parecido = (a: string, b: string) => {
  if (a === b) return 2;
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a) || a.endsWith(b) || b.endsWith(a))) return 1;
  return distancia(a, b) <= Math.max(1, Math.floor(Math.max(a.length, b.length) / 4)) ? 1 : -1;
};

const distancia = (a: string, b: string) => {
  let previa = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const fila = [i];
    for (let j = 1; j <= b.length; j++) fila[j] = Math.min(previa[j]! + 1, fila[j - 1]! + 1, previa[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    previa = fila;
  }
  return previa[b.length]!;
};

/**
 * Asigna tiempos a cada palabra del guion (con su puntuación original) usando los tiempos reconocidos.
 * Alineación global (Needleman-Wunsch): una palabra mal reconocida ("cuatro" → "4") no desfasa el resto.
 * Las palabras que no se pueden emparejar se interpolan entre sus vecinas.
 */
export const alinear = (narracion: string, reconocidas: PalabraTiempo[], duracionMs: number): Caption[] => {
  const tokens = narracion.split(/\s+/).filter(Boolean);
  const rec = reconocidas.filter((r) => normalizarPalabra(r.texto));
  const a = tokens.map(normalizarPalabra);
  const b = rec.map((r) => normalizarPalabra(r.texto));
  const n = a.length;
  const m = b.length;
  const HUECO = -0.6;
  // puntajes y de dónde vino cada celda (0 = diagonal, 1 = salta palabra del guion, 2 = salta palabra reconocida)
  const ancho = m + 1;
  const puntaje = new Float64Array((n + 1) * ancho);
  const origen = new Uint8Array((n + 1) * ancho);
  for (let i = 1; i <= n; i++) {
    puntaje[i * ancho] = i * HUECO;
    origen[i * ancho] = 1;
  }
  for (let j = 1; j <= m; j++) {
    puntaje[j] = j * HUECO;
    origen[j] = 2;
  }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      // una palabra del guion sin letras (ej. "—") no empareja con nada
      const diag = puntaje[(i - 1) * ancho + j - 1]! + (a[i - 1] ? parecido(a[i - 1]!, b[j - 1]!) : -2);
      const arriba = puntaje[(i - 1) * ancho + j]! + HUECO;
      const izq = puntaje[i * ancho + j - 1]! + HUECO;
      const mejor = Math.max(diag, arriba, izq);
      puntaje[i * ancho + j] = mejor;
      origen[i * ancho + j] = mejor === diag ? 0 : mejor === arriba ? 1 : 2;
    }
  }
  const tiempos: ({ ini: number; fin: number } | null)[] = tokens.map(() => null);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const o = origen[i * ancho + j];
    if (o === 0) {
      // una sustitución ("cuatro" ↔ "4") también se queda con los tiempos: está en el mismo lugar
      if (a[i - 1]) tiempos[i - 1] = { ini: rec[j - 1]!.inicioMs, fin: rec[j - 1]!.finMs };
      i--;
      j--;
    } else if (o === 1) i--;
    else j--;
  }
  // interpolación de huecos
  for (let i = 0; i < tokens.length; i++) {
    if (tiempos[i]) continue;
    let a = i - 1;
    while (a >= 0 && !tiempos[a]) a--;
    let b = i;
    while (b < tokens.length && !tiempos[b]) b++;
    const desde = a >= 0 ? tiempos[a]!.fin : 0;
    const hasta = b < tokens.length ? tiempos[b]!.ini : duracionMs;
    const huecos = b - a - 1;
    const paso = Math.max(0, hasta - desde) / huecos;
    for (let k = a + 1; k < b; k++) {
      const idx = k - a - 1;
      tiempos[k] = { ini: desde + paso * idx, fin: desde + paso * (idx + 1) };
    }
  }
  return tokens.map((t, i) => {
    const { ini, fin } = tiempos[i]!;
    const startMs = Math.round(Math.min(Math.max(0, ini), Math.max(0, duracionMs - 1)));
    const endMs = Math.max(startMs + 1, Math.round(Math.min(fin, duracionMs)));
    return { text: i === 0 ? t : ` ${t}`, startMs, endMs, timestampMs: Math.round((startMs + endMs) / 2), confidence: null };
  });
};

/** Desplaza captions de una escena para ubicarlas en la línea de tiempo del video completo. */
export const desplazar = (captions: Caption[], ms: number): Caption[] =>
  captions.map((c) => ({ ...c, startMs: c.startMs + ms, endMs: c.endMs + ms, timestampMs: c.timestampMs === null ? null : c.timestampMs + ms }));
