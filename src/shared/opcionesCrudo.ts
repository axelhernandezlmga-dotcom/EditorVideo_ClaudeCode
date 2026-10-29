import { z } from "zod";
import { ModoEdicionSchema } from "./modos";
import { ESTILOS_SUBTITULOS, TAMANOS_SUBTITULOS, type EstiloSubtitulos, type TamanoSubtitulos } from "./perfiles";

/** Moods de la música de fondo (una carpeta por mood en assets/musica/). */
export const MOODS = [
  { id: "feliz", nombre: "Feliz" },
  { id: "triste", nombre: "Triste" },
  { id: "epica", nombre: "Épica" },
  { id: "tension", nombre: "Tensión" },
  { id: "misterio", nombre: "Misterio" },
  { id: "motivacional", nombre: "Motivacional" },
  { id: "chill", nombre: "Chill" },
  { id: "comica", nombre: "Cómica" },
] as const;
export type Mood = (typeof MOODS)[number]["id"];
export const IDS_MOODS = MOODS.map((m) => m.id) as [Mood, ...Mood[]];

/** Pausa más larga que se deja (ms) según el umbral de silencio elegido. */
export const PAUSA_SILENCIO = { rapido: 200, normal: 350, suave: 600 } as const;
export type UmbralSilencio = keyof typeof PAUSA_SILENCIO;

/**
 * Intensidad de la edición: cuánto zoom en los cortes, cuántos efectos de sonido y cuánto material en pantalla.
 * `materialCada` = como mucho una noticia, dato o foto cada tantos segundos.
 */
export const INTENSIDADES = {
  sobria: { nombre: "Sobria", detalle: "Pocos efectos, cortes suaves", zoom: 1.04, maxSfx: 2, materialCada: 18 },
  dinamica: { nombre: "Dinámica", detalle: "El equilibrio de siempre", zoom: 1.1, maxSfx: 5, materialCada: 11 },
  explosiva: { nombre: "Explosiva", detalle: "Zoom fuerte, muchos efectos y material", zoom: 1.18, maxSfx: 9, materialCada: 7 },
} as const;
export type Intensidad = keyof typeof INTENSIDADES;

export const DURACIONES_MAX = [0, 30, 60, 90] as const;

/** Qué clips de la biblioteca se usan al editar un video (crudo o animado). */
export const UsoBibliotecaSchema = z.object({
  /** "Incluir clips de la biblioteca": no, automático (Claude elige cuándo tienen sentido) o solo los elegidos a mano. */
  modo: z.enum(["no", "auto", "manual"]).default("auto"),
  /** Categorías de donde se pueden sacar clips; vacía = todas (también las que crees después). */
  categorias: z.array(z.string()).max(100).default([]),
  /** Clips elegidos a mano (ids de la biblioteca). */
  elegidos: z.array(z.string()).max(50).default([]),
});
export type UsoBiblioteca = z.infer<typeof UsoBibliotecaSchema>;

/**
 * Opciones del formulario al subir un crudo. Se guardan en el estado.json del trabajo (opciones.crudo) y las
 * últimas usadas en data/opciones-crudo.json para proponerlas la próxima vez.
 */
export const OpcionesCrudoSchema = z.object({
  /** Modo de edición: cambia qué material se busca y cómo se compone (ver shared/modos.ts). */
  modo: ModoEdicionSchema.default("normal"),
  /** Paleta para este video: "perfil" = la del perfil; si no, el id de una de PALETAS. */
  paleta: z.string().default("perfil"),
  musica: z
    .object({
      activa: z.boolean().default(true),
      mood: z.enum(["auto", ...IDS_MOODS]).default("auto"),
      /** Volumen de la música respecto de la voz (0,06–0,10 ≈ -24 a -20 dB). */
      volumen: z.number().min(0).max(0.3).default(0.08),
    })
    .prefault({}),
  clips: UsoBibliotecaSchema.prefault({}),
  imagenes: z.boolean().default(true),
  /** null = el estilo y tamaño del perfil. */
  subtitulos: z
    .object({
      estilo: z.enum(ESTILOS_SUBTITULOS.map((e) => e.id) as [EstiloSubtitulos, ...EstiloSubtitulos[]]),
      tamano: z.enum(Object.keys(TAMANOS_SUBTITULOS) as [TamanoSubtitulos, ...TamanoSubtitulos[]]),
    })
    .nullable()
    .default(null),
  cortes: z
    .object({
      silencio: z.enum(Object.keys(PAUSA_SILENCIO) as [UmbralSilencio, ...UmbralSilencio[]]).default("normal"),
      muletillas: z.boolean().default(true),
    })
    .prefault({}),
  sfx: z.boolean().default(true),
  intensidad: z.enum(Object.keys(INTENSIDADES) as [Intensidad, ...Intensidad[]]).default("dinamica"),
  cierre: z.boolean().default(true),
  /** Segundos; 0 = sin límite. */
  duracionMax: z.union([z.literal(0), z.literal(30), z.literal(60), z.literal(90)]).default(0),
});
export type OpcionesCrudo = z.infer<typeof OpcionesCrudoSchema>;

/** Lo que el formulario manda al apretar "Procesar". */
export const PedidoCrudoSchema = z.object({
  perfil: z.string().regex(/^[a-z0-9-]+$/),
  auto: z.boolean().default(false),
  crudo: OpcionesCrudoSchema,
});
export type PedidoCrudo = z.infer<typeof PedidoCrudoSchema>;
