import { z } from "zod";
import { IDS_MOODS } from "./opcionesCrudo";

/**
 * Biblioteca: clips de video, música y efectos de sonido organizados en categorías que crea el usuario
 * ("Colorados", "Memes varios"…). Los archivos se COPIAN a biblioteca/medios/ (así funciona igual después de
 * clonar o mover el proyecto) y el índice vive en biblioteca/biblioteca.json, con rutas relativas.
 */

export const TIPOS_RECURSO = [
  { id: "video", nombre: "Clips de video" },
  { id: "musica", nombre: "Música" },
  { id: "sfx", nombre: "Efectos de sonido" },
] as const;
export type TipoRecurso = (typeof TIPOS_RECURSO)[number]["id"];
export const IDS_TIPOS_RECURSO = TIPOS_RECURSO.map((t) => t.id) as [TipoRecurso, ...TipoRecurso[]];

export const EXT_VIDEO = /\.(mp4|mov|m4v|webm|mkv|avi)$/i;
export const EXT_AUDIO = /\.(mp3|m4a|wav|ogg|oga|flac|aac|opus)$/i;
/** Un audio de menos de esto (s) se importa como efecto de sonido si no se elige otra cosa. */
export const MAX_SEGUNDOS_SFX = 20;

export const EtiquetasClipSchema = z.object({
  lugar: z.array(z.string().max(60)).max(8).default([]),
  personas: z.array(z.string().max(60)).max(8).default([]),
  objetos: z.array(z.string().max(60)).max(12).default([]),
  accion: z.array(z.string().max(60)).max(8).default([]),
  mood: z.array(z.string().max(40)).max(5).default([]),
});
export type EtiquetasClip = z.infer<typeof EtiquetasClipSchema>;
export const etiquetasVacias = (): EtiquetasClip => ({ lugar: [], personas: [], objetos: [], accion: [], mood: [] });

export const NombreCategoria = z.string().trim().min(1, "Poné un nombre").max(60, "Máximo 60 caracteres");

export const CategoriaSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,64}$/),
  nombre: NombreCategoria,
  creada: z.string(),
});
export type Categoria = z.infer<typeof CategoriaSchema>;

export const RecursoSchema = z.object({
  /** Estable: no cambia al renombrar ni al mover de categoría. */
  id: z.string().regex(/^[a-z0-9]{6,32}$/),
  tipo: z.enum(IDS_TIPOS_RECURSO),
  categoria: z.string(),
  nombre: z.string().trim().min(1).max(160),
  /** Relativo a biblioteca/medios/. */
  archivo: z.string(),
  /** De dónde se importó (solo informativo: la app nunca vuelve a leer ahí). */
  origen: z.string().default(""),
  duracion: z.number(),
  ancho: z.number().default(0),
  alto: z.number().default(0),
  orientacion: z.enum(["vertical", "horizontal", "cuadrado"]).nullable().default(null),
  audio: z.boolean().default(false),
  /** Lo que se dice (si se transcribió). */
  transcripcion: z.string().nullable().default(null),
  descripcion: z.string().default(""),
  etiquetas: EtiquetasClipSchema.prefault({}),
  /** "claude" = la escribió Claude mirando 3 fotogramas; "manual" = la editaste vos; "nombre" = sale del nombre del archivo. */
  descripcionPor: z.enum(["claude", "manual", "nombre", "ninguna"]).default("ninguna"),
  /** Análisis (v1.1): en qué situaciones sirve el clip, categorías semánticas, tono y por qué es gracioso. */
  usos: z.array(z.string().max(160)).max(8).default([]),
  semantica: z.array(z.string().max(40)).max(12).default([]),
  tono: z.string().max(80).default(""),
  humor: z.string().max(240).default(""),
  /** El clip pierde su gracia sin su audio (una frase, un grito, un efecto): en "Automático" suena. */
  audioClave: z.boolean().default(false),
  /** Idioma de lo que se dice (lo detecta whisper) y volumen medio del audio (dB; null = sin medir). */
  idioma: z.string().max(8).nullable().default(null),
  volumenDb: z.number().nullable().default(null),
  /** Qué fases del análisis ya se hicieron (fecha ISO), para reanudar sin repetir. */
  analisis: z
    .object({
      /** Local y gratis: fotogramas, volumen y transcripción. */
      local: z.string().nullable().default(null),
      /** Claude mirando los fotogramas. */
      claude: z.string().nullable().default(null),
      error: z.string().nullable().default(null),
    })
    .prefault({}),
  /** Música: ánimo para la elección automática. */
  mood: z.enum(IDS_MOODS).nullable().default(null),
  bytes: z.number(),
  /** Huella del contenido (primer MB + tamaño): detecta duplicados aunque el archivo tenga otro nombre. */
  huella: z.string(),
  importado: z.string(),
});
export type Recurso = z.infer<typeof RecursoSchema>;

/** Versión del índice: la 2 (v1.1) suma el análisis de cada clip. Las anteriores se migran al leerlas. */
export const VERSION_BIBLIOTECA = 2;
export const BibliotecaSchema = z.object({
  version: z.number().int().default(VERSION_BIBLIOTECA),
  categorias: z.array(CategoriaSchema).default([]),
  recursos: z.array(RecursoSchema).default([]),
});
export type Biblioteca = z.infer<typeof BibliotecaSchema>;

/** Categorías con las que arranca una instalación nueva (se pueden renombrar o borrar). */
export const CATEGORIAS_INICIALES = ["Colorados", "Memes varios"] as const;

export const slugCategoria = (nombre: string) =>
  nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "categoria";

export const orientacionDe = (ancho: number, alto: number): NonNullable<Recurso["orientacion"]> => (alto > ancho * 1.1 ? "vertical" : ancho > alto * 1.1 ? "horizontal" : "cuadrado");

const sinTildes = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Texto para buscar un recurso (nombre, descripción, etiquetas, transcripción y de dónde vino), sin tildes. */
export const textoBusqueda = (r: Pick<Recurso, "nombre" | "origen" | "descripcion" | "transcripcion" | "etiquetas"> & Partial<Pick<Recurso, "usos" | "semantica" | "tono" | "humor">>) =>
  sinTildes([r.nombre, r.origen, r.descripcion, r.transcripcion ?? "", ...Object.values(r.etiquetas).flat(), ...(r.usos ?? []), ...(r.semantica ?? []), r.tono ?? "", r.humor ?? ""].join(" "));

/** Campos del análisis de un recurso recién importado (todavía sin analizar). */
export const analisisVacio = () => ({ usos: [], semantica: [], tono: "", humor: "", audioClave: false, idioma: null, volumenDb: null, analisis: { local: null, claude: null, error: null } });

/** ¿El audio del clip vale la pena (no es silencio ni un zumbido muy bajo)? Sin medir, se confía en que tiene audio. */
export const tieneAudioUtil = (r: Pick<Recurso, "audio" | "volumenDb">) => r.audio && (r.volumenDb === null || r.volumenDb > -45);

/** ¿El recurso coincide con todas las palabras buscadas? */
export const coincideBusqueda = (r: Parameters<typeof textoBusqueda>[0], consulta: string) => {
  const texto = textoBusqueda(r);
  return sinTildes(consulta)
    .split(/\s+/)
    .filter(Boolean)
    .every((p) => texto.includes(p));
};


/** Qué categorías se usan en un video: con la lista vacía, todas. */
export const enCategorias = (r: Pick<Recurso, "categoria">, categorias: string[]) => !categorias.length || categorias.includes(r.categoria);

/** Duración de un clip insertado en un video (s): el mejor tramo de 2 a 5 s. */
export const TRAMO_CLIP = { min: 2, max: 5 } as const;

export { UsoBibliotecaSchema, type UsoBiblioteca } from "./opcionesCrudo";
