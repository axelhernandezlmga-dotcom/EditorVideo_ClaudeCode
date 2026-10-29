import { z } from "zod";

/**
 * Cortes de un crudo, decididos palabra por palabra. Todo lo demás (tramos que quedan, duración final,
 * tiempos remapeados de subtítulos y material) se calcula de acá, en el servidor, en el editor web y en Remotion.
 */

export const PalabraCrudoSchema = z.object({
  texto: z.string(),
  inicioMs: z.number(),
  finMs: z.number(),
  prob: z.number().nullable().default(null),
  /** Sonido de voz donde whisper no escribió nada (casi siempre un "eh" o "mmm" que omitió). */
  sinTranscribir: z.boolean().default(false),
});
export type PalabraCrudo = z.infer<typeof PalabraCrudoSchema>;

export const TranscripcionSchema = z.object({
  modelo: z.string(),
  duracionMs: z.number().positive(),
  palabras: z.array(PalabraCrudoSchema),
});
export type Transcripcion = z.infer<typeof TranscripcionSchema>;

/** "largo" = frase quitada para no pasar de la duración máxima elegida al subir el crudo. */
export const TIPOS_CORTE = ["pausa", "muletilla", "toma", "largo", "manual"] as const;
export type TipoCorte = (typeof TIPOS_CORTE)[number];

export const CortesSchema = z.object({
  pausaMaxMs: z.number().int().min(100),
  margenMs: z.number().int().min(0),
  /** true = se usan los cortes sugeridos tal cual; al editar a mano pasa a false. */
  automatico: z.boolean().default(true),
  sugeridos: z.object({
    /** Palabras que conviene quitar (muletillas y tomas descartadas). */
    palabras: z.array(z.object({ i: z.number().int().min(0), tipo: z.enum(["muletilla", "toma", "largo"]), motivo: z.string() })),
  }),
  manual: z
    .object({
      /** Palabras que quitaste a mano. */
      quitar: z.array(z.number().int().min(0)).default([]),
      /** Palabras sugeridas que recuperaste. */
      conservar: z.array(z.number().int().min(0)).default([]),
      /** Pausas largas que preferiste no cortar (índice de la palabra anterior a la pausa). */
      pausasConservadas: z.array(z.number().int().min(-1)).default([]),
      /** Pausas cortas que cortaste igual. */
      pausasCortadas: z.array(z.number().int().min(-1)).default([]),
    })
    .prefault({}),
});
export type Cortes = z.infer<typeof CortesSchema>;

export type Tramo = { inicioMs: number; finMs: number };
export type ResumenCortes = Record<TipoCorte, { cantidad: number; ms: number }>;

/** Por qué se quita cada palabra (o null si queda). */
export const motivoQuitar = (c: Cortes, i: number): TipoCorte | null => {
  if (c.manual.quitar.includes(i)) return "manual";
  if (c.manual.conservar.includes(i)) return null;
  return c.sugeridos.palabras.find((p) => p.i === i)?.tipo ?? null;
};

/** ¿Se corta la pausa que sigue a la palabra `i`? (`i = -1` es el silencio del principio). */
export const pausaCortada = (c: Cortes, palabras: PalabraCrudo[], i: number, duracionMs: number): boolean => {
  if (c.manual.pausasCortadas.includes(i)) return true;
  if (c.manual.pausasConservadas.includes(i)) return false;
  const desde = i < 0 ? 0 : (palabras[i]?.finMs ?? 0);
  const hasta = palabras[i + 1]?.inicioMs ?? duracionMs;
  return hasta - desde > c.pausaMaxMs;
};

/**
 * Tramos del original que quedan en el video, en orden. Cada palabra conservada aporta su intervalo, estirado
 * hacia cada lado: hasta la palabra vecina si esa pausa no se corta (y la vecina también queda), o solo
 * `margenMs` de aire si se corta, sin invadir nunca la palabra vecina. Después se unen los que se tocan.
 */
export const calcularTramos = (palabras: PalabraCrudo[], c: Cortes, duracionMs: number): Tramo[] => {
  const queda = palabras.map((_, i) => motivoQuitar(c, i) === null);
  const intervalos: Tramo[] = [];
  for (let i = 0; i < palabras.length; i++) {
    if (!queda[i]) continue;
    const p = palabras[i]!;
    const limiteIzq = i > 0 ? palabras[i - 1]!.finMs : 0;
    const limiteDer = i < palabras.length - 1 ? palabras[i + 1]!.inicioMs : duracionMs;
    // la pausa de la izquierda se conserva entera si no se corta y del otro lado hay algo que también queda (o el comienzo)
    const izqEntera = !pausaCortada(c, palabras, i - 1, duracionMs) && (i === 0 || queda[i - 1]);
    const derEntera = !pausaCortada(c, palabras, i, duracionMs) && (i === palabras.length - 1 || queda[i + 1]);
    intervalos.push({
      inicioMs: Math.max(0, izqEntera ? limiteIzq : Math.max(limiteIzq, p.inicioMs - c.margenMs)),
      finMs: Math.min(duracionMs, derEntera ? limiteDer : Math.min(limiteDer, p.finMs + c.margenMs)),
    });
  }
  const unidos: Tramo[] = [];
  for (const t of intervalos) {
    const prev = unidos.at(-1);
    if (prev && t.inicioMs <= prev.finMs + 1) prev.finMs = Math.max(prev.finMs, t.finMs);
    else if (t.finMs > t.inicioMs) unidos.push({ ...t });
  }
  return unidos;
};

export const duracionTramos = (tramos: Tramo[]) => tramos.reduce((n, t) => n + t.finMs - t.inicioMs, 0);

/** Tiempo del original → tiempo del video cortado (null si ese momento se cortó). */
export const aEditado = (tramos: Tramo[], ms: number): number | null => {
  let acumulado = 0;
  for (const t of tramos) {
    if (ms < t.inicioMs) return null;
    if (ms <= t.finMs) return acumulado + ms - t.inicioMs;
    acumulado += t.finMs - t.inicioMs;
  }
  return null;
};

/** Como `aEditado`, pero si el momento se cortó devuelve el inicio del tramo siguiente (para anclar material). */
export const aEditadoCercano = (tramos: Tramo[], ms: number): number => {
  let acumulado = 0;
  for (const t of tramos) {
    if (ms <= t.finMs) return acumulado + Math.max(0, ms - t.inicioMs);
    acumulado += t.finMs - t.inicioMs;
  }
  return acumulado;
};

/** Tiempo del video cortado → tiempo del original. */
export const aOriginal = (tramos: Tramo[], ms: number): number => {
  let acumulado = 0;
  for (const t of tramos) {
    const d = t.finMs - t.inicioMs;
    if (ms <= acumulado + d) return t.inicioMs + ms - acumulado;
    acumulado += d;
  }
  return tramos.at(-1)?.finMs ?? 0;
};

/** Cuánto se cortó de cada tipo: cada hueco entre tramos se atribuye a lo que había adentro. */
export const resumirCortes = (palabras: PalabraCrudo[], c: Cortes, duracionMs: number, tramos = calcularTramos(palabras, c, duracionMs)): ResumenCortes => {
  const r: ResumenCortes = { pausa: { cantidad: 0, ms: 0 }, muletilla: { cantidad: 0, ms: 0 }, toma: { cantidad: 0, ms: 0 }, largo: { cantidad: 0, ms: 0 }, manual: { cantidad: 0, ms: 0 } };
  const huecos: Tramo[] = [];
  let t = 0;
  for (const tr of tramos) {
    if (tr.inicioMs > t) huecos.push({ inicioMs: t, finMs: tr.inicioMs });
    t = tr.finMs;
  }
  if (duracionMs > t) huecos.push({ inicioMs: t, finMs: duracionMs });
  for (const h of huecos) {
    const motivos = palabras
      .map((p, i) => (p.inicioMs >= h.inicioMs - 1 && p.finMs <= h.finMs + 1 ? motivoQuitar(c, i) : null))
      .filter((m): m is TipoCorte => m !== null);
    // prioridad: lo que decidiste a mano, después recortes por duración, tomas y muletillas; si no hay palabras, es una pausa
    const tipo: TipoCorte = (["manual", "largo", "toma", "muletilla"] as const).find((m) => motivos.includes(m)) ?? "pausa";
    r[tipo].cantidad++;
    r[tipo].ms += h.finMs - h.inicioMs;
  }
  return r;
};

/** Normaliza para comparar palabras: minúsculas, sin tildes ni puntuación. */
export const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");

// "ah" no: suele ser una interjección con sentido ("¡Ah, la gente inventa cada cosa!")
const MULETILLAS_SIEMPRE = /^(e+h*|e+m+|h?m+|u+h+m*)$/;

/**
 * Muletillas por reglas: "eh", "mmm" y sonidos sin transcribir siempre; "este" cuando está suelto (seguido de
 * coma o pausa); "o sea" cuando se repite; palabras dichas dos veces seguidas ("que que") se quita la primera.
 */
export const detectarMuletillas = (palabras: PalabraCrudo[]): { i: number; motivo: string }[] => {
  const out: { i: number; motivo: string }[] = [];
  const n = palabras.map((p) => normalizar(p.texto));
  const pausaDespues = (i: number) => (palabras[i + 1]?.inicioMs ?? Infinity) - (palabras[i]?.finMs ?? 0);
  const pausaAntes = (i: number) => (palabras[i]?.inicioMs ?? 0) - (palabras[i - 1]?.finMs ?? -Infinity);
  let ultimoOSea = -Infinity;
  for (let i = 0; i < palabras.length; i++) {
    const p = palabras[i]!;
    const w = n[i]!;
    if (p.sinTranscribir) out.push({ i, motivo: "Sonido sin palabra (probablemente un \"eh\")" });
    else if (MULETILLAS_SIEMPRE.test(w)) out.push({ i, motivo: `"${p.texto.trim()}"` });
    else if (w === "este" && (/[,…]|\.\.\.$/.test(p.texto) || pausaDespues(i) > 250 || (pausaAntes(i) > 250 && n[i + 1] !== undefined && MULETILLAS_SIEMPRE.test(n[i + 1]!)))) {
      out.push({ i, motivo: '"este" de relleno' });
    } else if (w === "o" && n[i + 1] === "sea") {
      const t = p.inicioMs;
      const repetido = (n[i + 2] === "o" && n[i + 3] === "sea") || t - ultimoOSea < 12_000;
      if (repetido) out.push({ i, motivo: '"o sea" repetido' }, { i: i + 1, motivo: '"o sea" repetido' });
      ultimoOSea = t;
      i++;
    } else if (w.length > 0 && w === n[i + 1] && !/^\d+$/.test(w) && pausaDespues(i) < 400 && !/[,;:!?]$/.test(p.texto.trim())) {
      // con coma ("indignado, indignado") suele ser énfasis a propósito: se deja
      out.push({ i, motivo: `"${p.texto.trim()}" repetido` });
    }
  }
  return out;
};

/** Frases para detectar tomas repetidas: se separan en las pausas largas o en un punto. */
export const agruparFrases = (palabras: PalabraCrudo[], pausaMs = 600): { desde: number; hasta: number }[] => {
  const frases: { desde: number; hasta: number }[] = [];
  let desde = 0;
  for (let i = 0; i < palabras.length; i++) {
    const p = palabras[i]!;
    const sig = palabras[i + 1];
    if (!sig || sig.inicioMs - p.finMs > pausaMs || /[.?!]$/.test(p.texto.trim())) {
      frases.push({ desde, hasta: i });
      desde = i + 1;
    }
  }
  return frases;
};
