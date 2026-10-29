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
  /** Música: ánimo para la elección automática. */
  mood: z.enum(IDS_MOODS).nullable().default(null),
  bytes: z.number(),
  /** Huella del contenido (primer MB + tamaño): detecta duplicados aunque el archivo tenga otro nombre. */
  huella: z.string(),
  importado: z.string(),
});
export type Recurso = z.infer<typeof RecursoSchema>;

export const BibliotecaSchema = z.object({
  version: z.literal(1).default(1),
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
export const textoBusqueda = (r: Pick<Recurso, "nombre" | "origen" | "descripcion" | "transcripcion" | "etiquetas">) =>
  sinTildes([r.nombre, r.origen, r.descripcion, r.transcripcion ?? "", ...Object.values(r.etiquetas).flat()].join(" "));

/** ¿El recurso coincide con todas las palabras buscadas? */
export const coincideBusqueda = (r: Parameters<typeof textoBusqueda>[0], consulta: string) => {
  const texto = textoBusqueda(r);
  return sinTildes(consulta)
    .split(/\s+/)
    .filter(Boolean)
    .every((p) => texto.includes(p));
};

/** Palabras con contenido (para medir qué tan relacionado está un clip con un texto). */
export const palabrasClave = (s: string) => new Set(sinTildes(s).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 3));

/**
 * Los clips más relacionados con un texto (guion o transcripción): puntaje por palabras en común. Sirve para
 * no mandarle a Claude un catálogo de miles de clips; si el catálogo es chico, van todos.
 */
export const clipsRelacionados = <T extends Recurso>(clips: T[], texto: string, max = 120): T[] => {
  if (clips.length <= max) return clips;
  const claves = palabrasClave(texto);
  const puntaje = (c: T) => {
    let n = 0;
    for (const w of palabrasClave(textoBusqueda(c))) if (claves.has(w)) n++;
    return n;
  };
  return clips
    .map((c, i) => ({ c, p: puntaje(c), i }))
    .sort((a, b) => b.p - a.p || a.i - b.i)
    .slice(0, max)
    .map((x) => x.c);
};

/** Qué categorías se usan en un video: con la lista vacía, todas. */
export const enCategorias = (r: Pick<Recurso, "categoria">, categorias: string[]) => !categorias.length || categorias.includes(r.categoria);

/** Duración de un clip insertado en un video (s): el mejor tramo de 2 a 5 s. */
export const TRAMO_CLIP = { min: 2, max: 5 } as const;

export { UsoBibliotecaSchema, type UsoBiblioteca } from "./opcionesCrudo";
