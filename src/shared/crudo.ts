import type { Caption } from "@remotion/captions";
import { z } from "zod";
import { aEditado, aEditadoCercano, motivoQuitar, type Cortes, type PalabraCrudo, type Tramo } from "./cortes";
import { ALTO, ANCHO, SUBTITULOS, SUBTITULOS_Y, ZONA_SEGURA, type MarcaVisual } from "./render";
import type { PlantillaMaterial } from "./material";
import type { MarcoFoto } from "./schemas";

/** Rectángulo (px) dentro del cuadro de 1080×1920. */
export type Rect = { x: number; y: number; w: number; h: number };

/**
 * Cómo entra el video en el cuadro vertical: si ya es vertical (o casi) lo llena recortando los costados;
 * si es horizontal o cuadrado va entero al medio, con el mismo video desenfocado de fondo.
 * (El reencuadre inteligente de horizontal a vertical queda para después.)
 */
export const encuadre = (ancho: number, alto: number): { modo: "llenar" | "ajustar"; rect: Rect } => {
  const proporcion = ancho / alto;
  if (proporcion <= 0.75) {
    const escala = Math.max(ANCHO / ancho, ALTO / alto);
    const w = ancho * escala;
    const h = alto * escala;
    return { modo: "llenar", rect: { x: (ANCHO - w) / 2, y: (ALTO - h) / 2, w, h } };
  }
  const h = (ANCHO / ancho) * alto;
  return { modo: "ajustar", rect: { x: 0, y: (ALTO - h) / 2, w: ANCHO, h } };
};

/** Salida de caras.py: la cara principal (caja normalizada 0–1) un fotograma por segundo. */
export const CarasSchema = z.object({
  ancho: z.number(),
  alto: z.number(),
  muestras: z.array(z.object({ t: z.number(), cara: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullable() })),
});
export type Caras = z.infer<typeof CarasSchema>;

/** Franja vertical (px en el cuadro final) donde suele estar la cara, o null si casi nunca se ve una. */
export const franjaCara = (caras: Caras, video: { ancho: number; alto: number }): { arriba: number; abajo: number } | null => {
  // las cajas muy chicas casi siempre son falsos positivos (un cartel, una mano)
  const validas = caras.muestras.map((m) => m.cara).filter((c): c is [number, number, number, number] => c !== null && c[2] * c[3] >= 0.01);
  if (validas.length < Math.max(2, caras.muestras.length * 0.2)) return null;
  const { rect } = encuadre(video.ancho, video.alto);
  const percentil = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))]!;
  const arriba = percentil(validas.map((c) => c[1]), 0.1);
  const abajo = percentil(validas.map((c) => c[1] + c[3]), 0.9);
  // la cara ocupa un poco más que la caja del detector (pelo, mentón)
  const alto = abajo - arriba;
  return { arriba: rect.y + (arriba - alto * 0.1) * rect.h, abajo: rect.y + (abajo + alto * 0.15) * rect.h };
};

/** Centros posibles de los subtítulos, en orden de preferencia (siempre dentro de la zona segura). */
const CANDIDATOS_SUBS = [SUBTITULOS_Y, Math.round(ALTO * 0.74), Math.round(ALTO * 0.24)];
const MEDIO_ALTO_SUBS = SUBTITULOS.alto / 2 + 20;

/**
 * Centro vertical de los subtítulos: el primero de los candidatos que no pisa la cara. En un video horizontal
 * "ajustado" se prueba primero justo debajo del video. Si ninguno sirve, el que menos la pisa.
 */
export const posicionSubtitulos = (caras: Caras | null, video: { ancho: number; alto: number }): number => {
  const { modo, rect } = encuadre(video.ancho, video.alto);
  const candidatos = [...CANDIDATOS_SUBS];
  if (modo === "ajustar") {
    const debajo = Math.round(rect.y + rect.h + MEDIO_ALTO_SUBS + 30);
    if (debajo + MEDIO_ALTO_SUBS <= ALTO - ZONA_SEGURA.abajo) candidatos.unshift(debajo);
  }
  const cara = caras ? franjaCara(caras, video) : null;
  if (!cara) return candidatos[0]!;
  const pisa = (y: number) => Math.max(0, Math.min(y + MEDIO_ALTO_SUBS, cara.abajo) - Math.max(y - MEDIO_ALTO_SUBS, cara.arriba));
  return candidatos.find((y) => pisa(y) === 0) ?? [...candidatos].sort((a, b) => pisa(a) - pisa(b))[0]!;
};

/**
 * Subtítulos en la línea de tiempo del video ya cortado: solo las palabras que quedan (los "[...]" no se
 * escriben). Formato de @remotion/captions: cada palabra salvo la primera empieza con espacio.
 */
export const captionsEditadas = (palabras: PalabraCrudo[], cortes: Cortes, tramos: Tramo[]): Caption[] => {
  const out: Caption[] = [];
  palabras.forEach((p, i) => {
    if (p.sinTranscribir || motivoQuitar(cortes, i) !== null) return;
    const ini = aEditado(tramos, p.inicioMs) ?? aEditadoCercano(tramos, p.inicioMs);
    const fin = aEditado(tramos, p.finMs) ?? aEditadoCercano(tramos, p.finMs);
    const startMs = Math.round(ini);
    const endMs = Math.max(startMs + 1, Math.round(fin));
    out.push({ text: out.length ? ` ${p.texto.trim()}` : p.texto.trim(), startMs, endMs, timestampMs: Math.round((startMs + endMs) / 2), confidence: p.prob });
  });
  return out;
};

/** Props de la composición "Crudo" de Remotion. Las rutas ya son URLs. */
export type CrudoProps = {
  marca: MarcaVisual;
  video: { src: string; ancho: number; alto: number; fps: number };
  /** Voz limpia (el audio del video original se silencia). */
  audioSrc: string | null;
  tramos: Tramo[];
  /** Zoom de los tramos impares (1 = sin zoom). */
  zoom: number;
  captions: Caption[];
  enfasis: string[];
  subtitulosY: number;
  paginaSubtitulosMs: number;
  /** Material en pantalla (noticias, datos, fotos), en ms del video cortado. */
  material: MaterialRender[];
  sfx: SfxRender[];
  volumenSfx: number;
  /** Música de fondo (normalizada a -14 LUFS): `volumen` en los silencios, baja sola cuando se habla. */
  musica?: { src: string; volumen: number; desdeMs: number } | null;
  /**
   * Cierre "Seguir": placa final de 2,5 s y tarjetas flotantes en los momentos (ms del video cortado) en que la
   * persona dice "seguime"; `tarjetaY` = dónde va la tarjeta para no tapar la cara; `pop` = sonido del toque.
   */
  cierre?: { placa: boolean; momentos: number[]; tarjetaY: number; texto: string; pop: string | null } | null;
  /** Línea editorial: dónde empieza cada bloque (ms del video cortado) y su etiqueta (CONTEXTO, DATO, OPINIÓN…). */
  bloques?: { ms: number; etiqueta: string }[];
};

export type MaterialRender =
  | {
      tipo: "noticia";
      desdeMs: number;
      hastaMs: number;
      imagen: string;
      medio: string;
      fecha: string | null;
      titulo: string;
      resaltado: string | null;
      /** Dónde está la frase resaltada dentro de la captura (0–1). */
      rects: { x: number; y: number; w: number; h: number }[];
      /** ancho / alto de la captura. */
      proporcion: number | null;
    }
  | { tipo: "imagen"; desdeMs: number; hastaMs: number; imagen: string; credito: string | null; etiqueta: string | null; marco?: MarcoFoto }
  | { tipo: "clip"; desdeMs: number; hastaMs: number; video: string }
  | { tipo: "tarjeta"; desdeMs: number; hastaMs: number; titulo: string; texto: string | null }
  | { tipo: "plantilla"; desdeMs: number; hastaMs: number; plantilla: PlantillaMaterial; props: Record<string, unknown> };

export type SfxRender = { src: string; enMs: number; volumen: number };

/** Frames de la placa final "Seguir" (2,5 s a 30 fps; la misma constante que usa Remotion). */
export const FRAMES_PLACA = 75;

/** Duración total en frames del video cortado (más la placa final "Seguir", si va). */
export const framesCrudo = (tramos: Tramo[], fps: number, conPlaca = false) =>
  Math.max(1, Math.ceil((tramos.reduce((n, t) => n + t.finMs - t.inicioMs, 0) / 1000) * fps)) + (conPlaca ? FRAMES_PLACA : 0);

/** "seguime", "seguinos", "sígueme", "síganme", "suscribite"… (sin tildes ni signos). */
const PIDE_SEGUIR = /^(s[ií]gu[ea]me|segu[ií]me|segu[ií]nos|s[ií]ganme|s[ií]gannos|s[ií]guenos|suscr[ií]b[ei]te|suscr[ií]banse)$/i;

/** Momentos (ms del video cortado) en que la persona pide que la sigan, separados por al menos 10 s. */
export const momentosSeguir = (captions: Caption[]): number[] => {
  const out: number[] = [];
  for (const c of captions) {
    const w = c.text.trim().replace(/[^\p{L}]/gu, "");
    if (PIDE_SEGUIR.test(w) && (out.length === 0 || c.startMs - out.at(-1)! > 10_000)) out.push(c.startMs);
  }
  return out;
};

/** Alto aproximado de la tarjeta flotante "Seguir" (px). */
const ALTO_TARJETA_SEGUIR = 190;

/**
 * Dónde va la tarjeta flotante "Seguir" (borde de arriba, px): arriba en la zona segura si la cara no está ahí; si
 * no, justo encima de los subtítulos; si tampoco, debajo de ellos.
 */
export const posicionTarjetaSeguir = (caras: Caras | null, video: { ancho: number; alto: number }, subtitulosY: number): number => {
  const cara = caras ? franjaCara(caras, video) : null;
  const candidatos = [ZONA_SEGURA.arriba + 10, subtitulosY - MEDIO_ALTO_SUBS - 20 - ALTO_TARJETA_SEGUIR, subtitulosY + MEDIO_ALTO_SUBS + 20];
  const libre = (y: number) => !cara || y + ALTO_TARJETA_SEGUIR <= cara.arriba || y >= cara.abajo;
  return candidatos.find((y) => libre(y) && y + ALTO_TARJETA_SEGUIR <= ALTO - ZONA_SEGURA.abajo + 60) ?? candidatos[0]!;
};

/**
 * Ganancia de cada efecto para que suenen parejo (~-16 LUFS). Medido con ebur128 sobre los sintetizados:
 * whoosh -11,4 · golpe -13,1 · ding -16,2 · riser -17,7 LUFS (el pop es muy corto para medirlo: se iguala con el ding).
 */
export const GANANCIA_SFX = { whoosh: 0.58, pop: 0.9, golpe: 0.7, ding: 1, riser: 1 } as const;
export type NombreSfx = keyof typeof GANANCIA_SFX;

/** Duración del riser sintetizado: se ubica para que termine justo en el remate. */
export const DURACION_RISER_MS = 1600;

/**
 * Efectos en el video cortado: los que decidió Claude (anclados a palabras del original) más los fijos del
 * material (whoosh al entrar cada captura o foto, pop en cada dato).
 */
export const sfxEnPantalla = (
  efectos: { tipo: "golpe" | "ding" | "riser"; origenMs: number }[],
  material: MaterialRender[],
  tramos: Tramo[],
  src: (nombre: NombreSfx) => string | null,
  duracionRiserMs = DURACION_RISER_MS,
): SfxRender[] => {
  const out: SfxRender[] = [];
  const poner = (nombre: NombreSfx, enMs: number) => {
    const s = src(nombre);
    if (s && enMs >= 0) out.push({ src: s, enMs, volumen: GANANCIA_SFX[nombre] });
  };
  for (const e of efectos) {
    const ms = aEditado(tramos, e.origenMs);
    if (ms === null) continue; // la palabra se cortó: el efecto no va
    poner(e.tipo, e.tipo === "riser" ? Math.max(0, ms - duracionRiserMs) : Math.max(0, ms - 30));
  }
  for (const m of material) {
    if (m.tipo === "plantilla") poner("pop", m.desdeMs + 200);
    else poner("whoosh", Math.max(0, m.desdeMs - 150));
  }
  return out.sort((a, b) => a.enMs - b.enMs);
};
