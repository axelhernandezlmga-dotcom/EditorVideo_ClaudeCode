import { z } from "zod";
import { TIPOS_PELO, TIPOS_TORSO } from "../remotion/ilustracion/personajes/apariencia";

/**
 * Perfiles: la identidad de cada cuenta para la que se editan videos (nombre, @, verificado, colores,
 * tipografía, foto y estilo de subtítulos). Se guardan en config/perfiles/<slug>.json.
 */

export const TIPOGRAFIAS = [
  { id: "Montserrat", nombre: "Montserrat", detalle: "Gruesa y clásica" },
  { id: "Anton", nombre: "Anton", detalle: "Condensada, de impacto" },
  { id: "Poppins", nombre: "Poppins", detalle: "Redondeada y amable" },
  { id: "Bebas Neue", nombre: "Bebas Neue", detalle: "Alta y angosta, de titular" },
  { id: "Oswald", nombre: "Oswald", detalle: "Condensada y seria, de noticiero" },
] as const;
export type Tipografia = (typeof TIPOGRAFIAS)[number]["id"];
export const IDS_TIPOGRAFIAS = TIPOGRAFIAS.map((t) => t.id) as [Tipografia, ...Tipografia[]];

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color en formato #RRGGBB");

export const ColoresPerfilSchema = z.object({
  /** Fondo de placas y tarjetas. */
  fondo: color,
  /** Segundo fondo (degradés, barras). */
  fondo2: color,
  texto: color,
  /** Color principal: palabra que se está diciendo, resaltador, botón "Seguir". */
  acento: color,
  /** Segundo acento: palabras de énfasis, etiqueta del medio. */
  acento2: color,
  /** Fondo de los subtítulos (en los estilos "caja" y "resaltado"). */
  subtitulos: color,
});
export type ColoresPerfil = z.infer<typeof ColoresPerfilSchema>;

export const ESTILOS_SUBTITULOS = [
  { id: "contorno", nombre: "Contorno", detalle: "Letras con borde negro (el clásico de TikTok)" },
  { id: "caja", nombre: "Caja", detalle: "Sobre una franja de color" },
  { id: "resaltado", nombre: "Resaltado", detalle: "La palabra que se dice va dentro de una píldora de color" },
  { id: "sombra", nombre: "Sombra", detalle: "Sin borde, solo sombra (más limpio)" },
] as const;
export type EstiloSubtitulos = (typeof ESTILOS_SUBTITULOS)[number]["id"];

export const TAMANOS_SUBTITULOS = { chico: 0.8, normal: 1, grande: 1.2 } as const;
export type TamanoSubtitulos = keyof typeof TAMANOS_SUBTITULOS;

/** Paletas prediseñadas. Todas con texto claro: los subtítulos van encima del video. */
export const PALETAS: { id: string; nombre: string; colores: ColoresPerfil }[] = [
  { id: "fabrica", nombre: "Fábrica", colores: { fondo: "#0B1020", fondo2: "#1E2A5A", texto: "#FFFFFF", acento: "#FFD23F", acento2: "#FF4D6D", subtitulos: "#000000" } },
  { id: "noticiero", nombre: "Noticiero", colores: { fondo: "#0A2A66", fondo2: "#1456C8", texto: "#FFFFFF", acento: "#4FC3F7", acento2: "#1456C8", subtitulos: "#0A2A66" } },
  { id: "urgente", nombre: "Urgente", colores: { fondo: "#0D0D0D", fondo2: "#B71C1C", texto: "#FFFFFF", acento: "#FF1744", acento2: "#B71C1C", subtitulos: "#000000" } },
  { id: "celeste", nombre: "Celeste", colores: { fondo: "#0E3A63", fondo2: "#75AADB", texto: "#FFFFFF", acento: "#75AADB", acento2: "#F5C518", subtitulos: "#0E3A63" } },
  { id: "elegante", nombre: "Elegante", colores: { fondo: "#0A0A0A", fondo2: "#2B2B2B", texto: "#F5F0E6", acento: "#D4AF37", acento2: "#8C6D1F", subtitulos: "#000000" } },
  { id: "neon", nombre: "Neón", colores: { fondo: "#0B0221", fondo2: "#2D0B59", texto: "#FFFFFF", acento: "#39FF14", acento2: "#FF00E6", subtitulos: "#0B0221" } },
  { id: "pastel", nombre: "Pastel", colores: { fondo: "#3D3553", fondo2: "#B8A9E3", texto: "#FFFFFF", acento: "#FFB5D8", acento2: "#9AD0EC", subtitulos: "#3D3553" } },
  { id: "tierra", nombre: "Tierra", colores: { fondo: "#2B1D14", fondo2: "#7A4E2D", texto: "#FFF8EE", acento: "#E2A24F", acento2: "#A3542B", subtitulos: "#2B1D14" } },
  { id: "selva", nombre: "Selva", colores: { fondo: "#0B2A1D", fondo2: "#1E6B47", texto: "#FFFFFF", acento: "#7CFC9A", acento2: "#F2C14E", subtitulos: "#0B2A1D" } },
  { id: "atardecer", nombre: "Atardecer", colores: { fondo: "#2A0F3D", fondo2: "#F2545B", texto: "#FFFFFF", acento: "#FFB347", acento2: "#F2545B", subtitulos: "#2A0F3D" } },
];

export const SLUG_PERFIL = /^[a-z0-9][a-z0-9-]{0,47}$/;

export const PerfilSchema = z.object({
  slug: z.string().regex(SLUG_PERFIL, "Solo minúsculas, números y guiones"),
  nombre: z.string().trim().min(1, "Poné un nombre").max(60),
  usuario: z
    .string()
    .trim()
    .regex(/^@[\w.]{1,40}$/, "El @ va con letras, números, puntos o guiones bajos (ej. @mi.canal)"),
  verificado: z.boolean().default(false),
  /** Id de una de PALETAS, o "propia" si se eligieron los colores a mano. */
  paleta: z.string().default("propia"),
  colores: ColoresPerfilSchema,
  tipografia: z.enum(IDS_TIPOGRAFIAS).default("Montserrat"),
  /** Archivo de la foto o logo dentro de config/perfiles/ (ej. "mi-canal.png"), o null. */
  foto: z.string().regex(/^[a-z0-9-]+\.(png|jpe?g|webp)$/).nullable().default(null),
  subtitulos: z
    .object({
      estilo: z.enum(ESTILOS_SUBTITULOS.map((e) => e.id) as [EstiloSubtitulos, ...EstiloSubtitulos[]]).default("contorno"),
      tamano: z.enum(Object.keys(TAMANOS_SUBTITULOS) as [TamanoSubtitulos, ...TamanoSubtitulos[]]).default("normal"),
    })
    .prefault({}),
  /**
   * Narrador dibujado de este perfil (aparece en sus videos ilustrados). Lo que falte sale del narrador
   * por defecto; los colores aceptan #RRGGBB o un token ("acento", "piel3", "marino"…).
   */
  /** Línea editorial: con "hechos_contexto_opinion" el video se arma en bloques etiquetados (DATO/FUENTE → CONTEXTO → OPINIÓN). */
  lineaEditorial: z.enum(["ninguna", "hechos_contexto_opinion"]).default("ninguna"),
  /** Intensidad de los efectos que se propone por defecto en los crudos de este perfil. */
  intensidadPorDefecto: z.enum(["sobria", "dinamica", "explosiva"]).optional(),
  /** Ánimos de música permitidos para este perfil (vacío = cualquiera). */
  moodsMusica: z.array(z.string().max(20)).max(8).default([]),
  narrador: z
    .object({
      piel: z.string().max(20),
      pelo: z.object({ tipo: z.enum(TIPOS_PELO), color: z.string().max(20) }),
      cara: z.enum(["ovalada", "redonda", "cuadrada"]),
      contextura: z.number().min(0.85).max(1.3),
      altura: z.number().min(0.9).max(1.05),
      torso: z.enum(TIPOS_TORSO),
      colorTorso: z.string().max(20),
      colorInterior: z.string().max(20),
      piernas: z.enum(["pantalon", "pollera"]),
      colorPiernas: z.string().max(20),
      zapatos: z.string().max(20),
      lentes: z.boolean(),
      bigote: z.boolean(),
      barba: z.boolean(),
      pestanas: z.boolean(),
      corbata: z.string().max(20),
    })
    .partial()
    .optional(),
});
export type Perfil = z.infer<typeof PerfilSchema>;

/** "Mi Canal" → "mi-canal". */
export const slugPerfil = (texto: string) =>
  texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^@/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "perfil";

/** Si los colores coinciden con una paleta, su id; si no, "propia". */
export const paletaDe = (c: ColoresPerfil) => PALETAS.find((p) => (Object.keys(c) as (keyof ColoresPerfil)[]).every((k) => p.colores[k].toLowerCase() === c[k].toLowerCase()))?.id ?? "propia";

/**
 * Un perfil leído de afuera (API, archivo viejo o de otra versión) completado con los valores por defecto:
 * los campos que falten no rompen nada y los que sobren se ignoran. Si está muy roto, null.
 */
export const completarPerfil = (p: unknown): Perfil | null => {
  const r = PerfilSchema.safeParse(p);
  if (r.success) return r.data;
  // último intento: lo mínimo que hace falta para mostrarlo (slug, nombre y @), el resto por defecto
  const o = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
  if (typeof o.slug !== "string" || !SLUG_PERFIL.test(o.slug)) return null;
  const base = PALETAS[0]!.colores;
  const colores = { ...base, ...(typeof o.colores === "object" && o.colores ? (o.colores as object) : {}) };
  const r2 = PerfilSchema.safeParse({
    slug: o.slug,
    nombre: typeof o.nombre === "string" && o.nombre.trim() ? o.nombre : o.slug,
    usuario: typeof o.usuario === "string" && /^@[\w.]{1,40}$/.test(o.usuario) ? o.usuario : "@perfil",
    verificado: o.verificado === true,
    colores: ColoresPerfilSchema.safeParse(colores).success ? colores : base,
  });
  return r2.success ? r2.data : null;
};
