import { z } from "zod";
import type { PalabraCrudo } from "./cortes";

/**
 * "Modo mi voz": emparejar lo que dijiste (transcripción palabra por palabra, ya sin lo cortado) con las
 * escenas del guion. Si improvisaste o cambiaste palabras, manda lo que dijiste: cada palabra dicha cae en
 * la escena de la palabra del guion con la que se emparejó (o en la de la anterior, si fue improvisada).
 * Una escena de la que casi no dijiste nada se marca como salteada y sale del video.
 */

/** Una toma grabada escena por escena: dónde quedó dentro del audio unido. */
export const TomaEscenaSchema = z.object({ escena: z.number().int().min(0), desdeMs: z.number().min(0), hastaMs: z.number().min(0) });
export type TomaEscena = z.infer<typeof TomaEscenaSchema>;

/** Lo que se grabó: un archivo entero, o tomas por escena ya unidas en un solo audio. */
export const GrabacionSchema = z.object({
  /** Archivo original dentro del trabajo (voz/original.<ext> o voz/unido.wav). */
  archivo: z.string(),
  nombre: z.string().max(260),
  forma: z.enum(["archivo", "navegador", "escenas"]),
  duracionMs: z.number().positive(),
  tomas: z.array(TomaEscenaSchema).default([]),
});
export type Grabacion = z.infer<typeof GrabacionSchema>;

export type AlineacionEscena = {
  escena: number;
  /** Índices (en la transcripción) de las palabras dichas que van en esta escena. */
  palabras: number[];
  /** Qué parte de las palabras del guion de esta escena se dijo (0–1). */
  cobertura: number;
  salteada: boolean;
};

/** Debajo de esta cobertura (y con casi nada dicho) la escena se considera salteada. */
export const COBERTURA_MINIMA = 0.3;

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");

const distancia = (a: string, b: string) => {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let previo = d[0]!;
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j]!;
      d[j] = Math.min(d[j]! + 1, d[j - 1]! + 1, previo + (a[i - 1] === b[j - 1] ? 0 : 1));
      previo = tmp;
    }
  }
  return d[b.length]!;
};

/** 2 = misma palabra, 1 = parecida (whisper la escribió distinto o la dijiste en otra forma), -1 = distinta. */
export const parecido = (a: string, b: string) => {
  if (!a || !b) return -1;
  if (a === b) return 2;
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b.slice(0, 4)) || distancia(a, b) <= Math.floor(Math.max(a.length, b.length) / 4))) return 1;
  return -1;
};

/** Alineación global (Needleman-Wunsch): pares [índice en el guion, índice en lo dicho] de las palabras emparejadas. */
export const emparejar = (guion: string[], dicho: string[]): [number, number][] => {
  const n = guion.length;
  const m = dicho.length;
  const HUECO = -1;
  const p = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  for (let i = 1; i <= n; i++) p[i]![0] = i * HUECO;
  for (let j = 1; j <= m; j++) p[0]![j] = j * HUECO;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      p[i]![j] = Math.max(p[i - 1]![j - 1]! + parecido(guion[i - 1]!, dicho[j - 1]!), p[i - 1]![j]! + HUECO, p[i]![j - 1]! + HUECO);
    }
  }
  const pares: [number, number][] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const s = parecido(guion[i - 1]!, dicho[j - 1]!);
    if (p[i]![j] === p[i - 1]![j - 1]! + s) {
      if (s > 0) pares.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (p[i]![j] === p[i - 1]![j]! + HUECO) i--;
    else j--;
  }
  return pares.reverse();
};

/**
 * Reparte las palabras dichas (las que quedan después de los cortes) entre las escenas del guion.
 * Con tomas por escena manda la toma; si no, la alineación con el guion.
 */
export const alinearConGuion = (narraciones: string[], palabras: PalabraCrudo[], queda: (i: number) => boolean, tomas: TomaEscena[] = []): AlineacionEscena[] => {
  const guion: { w: string; escena: number }[] = narraciones.flatMap((n, escena) => n.split(/\s+/).map(norm).filter(Boolean).map((w) => ({ w, escena })));
  const dichas = palabras.map((p, i) => ({ p, i })).filter(({ p, i }) => queda(i) && !p.sinTranscribir && norm(p.texto));
  const pares = emparejar(
    guion.map((g) => g.w),
    dichas.map(({ p }) => norm(p.texto)),
  );
  const emparejada = new Map(pares.map(([g, d]) => [d, g]));
  const dichasPorEscena = narraciones.map(() => 0);
  for (const [g] of pares) dichasPorEscena[guion[g]!.escena]!++;
  const totalPorEscena = narraciones.map((_, s) => guion.filter((g) => g.escena === s).length);

  // escena de cada palabra dicha: la de su pareja, o la de la anterior si fue improvisada (y nunca para atrás)
  let escena: number[];
  if (tomas.length) {
    escena = dichas.map(({ p }) => {
      const t = tomas.find((t) => p.inicioMs >= t.desdeMs - 50 && p.inicioMs < t.hastaMs) ?? tomas.reduce((a, b) => (Math.abs(b.desdeMs - p.inicioMs) < Math.abs(a.desdeMs - p.inicioMs) ? b : a));
      return t.escena;
    });
  } else {
    const primera = pares.length ? guion[pares[0]![0]]!.escena : 0;
    let actual = primera;
    escena = dichas.map((_, k) => {
      const g = emparejada.get(k);
      if (g !== undefined) actual = Math.max(actual, guion[g]!.escena);
      return actual;
    });
  }

  const asignadas = narraciones.map((): number[] => []);
  escena.forEach((s, k) => asignadas[s]!.push(dichas[k]!.i));
  const out: AlineacionEscena[] = narraciones.map((_, s) => {
    const cobertura = totalPorEscena[s] ? dichasPorEscena[s]! / totalPorEscena[s]! : 0;
    const casiNada = asignadas[s]!.length < Math.max(3, totalPorEscena[s]! * COBERTURA_MINIMA);
    // con tomas por escena: salteada solo si no hay toma de esa escena
    const salteada = tomas.length ? !tomas.some((t) => t.escena === s) || asignadas[s]!.length === 0 : cobertura < COBERTURA_MINIMA && casiNada;
    return { escena: s, palabras: asignadas[s]!, cobertura, salteada };
  });
  // lo poco que se dijo en una escena salteada se suma a la escena vecina que sí queda
  for (const e of out) {
    if (!e.salteada || !e.palabras.length) continue;
    const destino = [...out.slice(0, e.escena)].reverse().find((x) => !x.salteada) ?? out.slice(e.escena + 1).find((x) => !x.salteada);
    if (destino) destino.palabras = [...destino.palabras, ...e.palabras].sort((a, b) => a - b);
    e.palabras = [];
  }
  return out;
};
