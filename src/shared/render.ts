import type { Caption } from "@remotion/captions";
import type { EstiloSubtitulos, TamanoSubtitulos } from "./perfiles";
import type { Escena, Marca } from "./schemas";
import type { ReglasMarca, VarianteLogo, VarianteSimbolo } from "./kit";
import type { IdEstilo } from "../remotion/ilustracion/estilo";
import type { Apariencia } from "../remotion/ilustracion/personajes/apariencia";

export const FPS = 30;
export const ANCHO = 1080;
export const ALTO = 1920;
/** Duración de cada transición entre escenas, en frames. */
export const FRAMES_TRANSICION = 8;
/** Silencio extra al final de cada escena (debe ser mayor que la transición). */
export const COLCHON_MS = 380;

/** Zonas seguras (px) para 1080×1920: nada importante fuera de este rectángulo. */
export const ZONA_SEGURA = {
  arriba: Math.round(ALTO * 0.15), // 288
  abajo: Math.round(ALTO * 0.2), // 384
  derecha: Math.round(ANCHO * 0.12), // 130
  izquierda: 80,
} as const;

/**
 * Distribución vertical (sin superposiciones):
 *  15–57 %  contenido de la escena (elemento visual + texto; el texto principal va en 25–45 %)
 *  60–68 %  subtítulos
 */
export const CAJA_CONTENIDO = {
  x: ZONA_SEGURA.izquierda,
  y: ZONA_SEGURA.arriba + 10, // 298
  ancho: ANCHO - ZONA_SEGURA.izquierda - ZONA_SEGURA.derecha, // 870
  alto: Math.round(ALTO * 0.57) - (ZONA_SEGURA.arriba + 10), // 796 → termina en 1094
} as const;

/** Franja del texto principal de la escena (25–45 % de la altura). */
export const ZONA_TEXTO = { y: Math.round(ALTO * 0.25), alto: Math.round(ALTO * 0.2) } as const; // 480–864

/** Franja de los subtítulos (60–68 % de la altura). */
export const SUBTITULOS = { y: Math.round(ALTO * 0.6), alto: Math.round(ALTO * 0.08) } as const; // 1152–1306
/** Centro vertical de los subtítulos (64 %). */
export const SUBTITULOS_Y = SUBTITULOS.y + SUBTITULOS.alto / 2;

/** Estilo de las animaciones según el tono del video. */
export type Animacion = "tranquila" | "normal" | "rebote";

/**
 * Kit de marca tal como lo usa Remotion: colores por rol, fuentes locales (URL), los SVG en texto (logos,
 * símbolo, íconos) y las reglas. Si está, los componentes de marca reemplazan a los genéricos.
 */
export type KitVisual = {
  colores: { acento: string; texto: string; fondo: string; fondo2: string; secundario: string; apoyo: string; linea: string };
  fuentes: { titulos: { url: string; variable: boolean } | null; datos: { url: string; variable: boolean } | null };
  logos: Partial<Record<VarianteLogo, string>>;
  simbolos: Partial<Record<VarianteSimbolo, string>>;
  /** Íconos del kit y extendidos (SVG en texto), por id. */
  iconos: Record<string, string>;
  reglas: ReglasMarca;
  /** Fecha del video para las líneas de fecha y fuente ("26 OCT 2026"). */
  fecha: string;
  /** Fuentes del guion, para "FUENTE 01 · medio". */
  fuentesGuion: { titulo: string; dominio: string }[];
};

/** La tipografía de una marca con kit se llama "kit" (sus fuentes se cargan aparte). */
export type TipografiaVisual = Marca["tipografia"] | "kit";

export type MarcaVisual = Pick<Marca, "usuario" | "colores"> & {
  tipografia: TipografiaVisual;
  kit?: KitVisual;
  animacion?: Animacion;
  /** Del perfil: nombre visible, insignia de verificado (solo si lo es) y foto o logo (URL). */
  nombre?: string;
  verificado?: boolean;
  foto?: string | null;
  subtitulos?: { estilo: EstiloSubtitulos; tamano: TamanoSubtitulos; fondo: string };
  /** Hay placa final "Seguir": el cierre de la última escena no muestra su propio botón. */
  conPlacaSeguir?: boolean;
  /** Va encima de un video real (crudos): la marca de agua de un color va en blanco. */
  sobreVideo?: boolean;
  /** Con kit y un tono agresivo: la energía viene del ritmo y del punto rojo (nunca de efectos genéricos). */
  energia?: "alta";
  /** Escenas ilustradas: el estilo del video y el narrador dibujado del perfil (lo que falte, el de la casa). */
  ilustracion?: { estilo: IdEstilo; narrador?: Partial<Apariencia> };
};

export type EscenaRender = Escena & {
  duracionFrames: number;
  audioSrc: string | null;
  /** Tiempos relativos al inicio de la escena. */
  captions: Caption[];
  stockSrc?: string | null;
  /** foto_real: la foto verificada (o null: va la tarjeta de texto). */
  foto?: { src: string; credito: string | null } | null;
  /** foto_real en collage: las otras fotos verificadas. */
  fotosExtra?: { src: string; credito: string | null }[];
  /** Con kit: fecha que se sacó de un título y va en su línea de Plex Mono («18 AGO 2026»). */
  fechaMarca?: string;
  /** escena_ilustrada: objetos que la app dibujó para este video (SVG saneado), por id. */
  svgs?: Record<string, string>;
};

export type VideoProps = {
  marca: MarcaVisual;
  escenas: EscenaRender[];
  musicaSrc: string | null;
  volumenMusica: number;
  sfxSrc: string | null;
  /** "Pop" corto para las transiciones de tipo zoom (opcional). */
  popSrc?: string | null;
  paginaSubtitulosMs: number;
  /** Muestra las zonas seguras (solo para depurar). */
  mostrarZonas?: boolean;
  /** Placa final "Seguir" (2,5 s) después de la última escena. */
  cierre?: boolean;
  /** Apertura de marca (frames) antes de la primera escena; solo con kit. */
  apertura?: number;
  /** "Tic" de la apertura de marca. */
  ticSrc?: string | null;
  /** Lo que se corrigió por las reglas de la marca al armar el video (para el reporte). */
  correccionesMarca?: string[];
};

export type PortadaProps = {
  marca: MarcaVisual;
  titulo: string;
  escena: EscenaRender | null;
};

export const FRAME_PORTADA = 75;

export const msAFrames = (ms: number) => Math.ceil((ms / 1000) * FPS);

export const duracionEscenaFrames = (duracionAudioMs: number) =>
  Math.max(msAFrames(duracionAudioMs + COLCHON_MS), FRAMES_TRANSICION * 3);

/** Frame donde empieza cada escena dentro del video (teniendo en cuenta que las transiciones se superponen). */
export const iniciosEscenas = (duraciones: number[]): number[] => {
  const inicios: number[] = [];
  let t = 0;
  for (const d of duraciones) {
    inicios.push(t);
    t += d - FRAMES_TRANSICION;
  }
  return inicios;
};

/** Frames del video animado: las escenas (con transiciones superpuestas) más la placa "Seguir" si va. */
export const duracionVideo = (p: Pick<VideoProps, "escenas" | "cierre" | "apertura">) => (p.apertura ?? 0) + duracionTotalFrames(p.escenas.map((e) => e.duracionFrames)) + (p.cierre ? 75 : 0);

export const duracionTotalFrames = (duraciones: number[]) =>
  duraciones.length === 0
    ? 1
    : duraciones.reduce((a, b) => a + b, 0) - FRAMES_TRANSICION * (duraciones.length - 1);
