import { z } from "zod";

/**
 * Kit de marca de un perfil: logos, símbolo, avatares, paleta con roles, tipografías propias, recursos
 * gráficos e íconos, más las reglas de uso que salen del manual. Vive en config/perfiles/<slug>/kit/ con un
 * manifiesto kit.json (rutas relativas a esa carpeta) y las reglas en reglas.json + marca.md.
 */

/** Un recurso con su versión vectorial y/o raster (rutas relativas a la carpeta del kit). */
export const ArchivoKitSchema = z.object({ svg: z.string().nullable().default(null), png: z.string().nullable().default(null) });
export type ArchivoKit = z.infer<typeof ArchivoKitSchema>;

/** Variantes del logo: cada una para un tipo de fondo (el manual dice cuál va dónde). */
export const VARIANTES_LOGO = ["principal", "negativo", "monocromo", "sobre_rojo", "fondo_blanco", "horizontal"] as const;
export type VarianteLogo = (typeof VARIANTES_LOGO)[number];
export const VARIANTES_SIMBOLO = ["principal", "negativo", "monocromo", "sobre_rojo"] as const;
export type VarianteSimbolo = (typeof VARIANTES_SIMBOLO)[number];
export const RECURSOS_KIT = ["punto", "separador", "marcador", "destacado", "patron"] as const;
export type RecursoKit = (typeof RECURSOS_KIT)[number];

/** Función de cada color en la marca. */
export const ROLES_COLOR = ["acento", "texto", "fondo", "fondo2", "secundario", "otro"] as const;
export type RolColor = (typeof ROLES_COLOR)[number];
export const NOMBRES_ROL: Record<RolColor, string> = {
  acento: "Acento (firma, puntos y destacados)",
  texto: "Texto (logo, títulos y lectura)",
  fondo: "Fondo principal",
  fondo2: "Fondo secundario",
  secundario: "Secundario (fechas, fuentes, epígrafes)",
  otro: "Otro",
};

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const ColorKitSchema = z.object({ nombre: z.string().min(1).max(40), hex, rol: z.enum(ROLES_COLOR) });
export type ColorKit = z.infer<typeof ColorKitSchema>;

export const FuenteKitSchema = z.object({
  familia: z.string().min(1).max(60),
  archivo: z.string(),
  /** Licencia que vino con la fuente (ej. OFL), relativa al kit. */
  licencia: z.string().nullable().default(null),
  variable: z.boolean().default(false),
  /** Pesos disponibles (la variable cubre un rango). */
  pesos: z.array(z.number().int().min(100).max(900)).default([400]),
  /** "titulos" = logo, títulos y lectura; "datos" = fechas, fuentes y numeración. */
  uso: z.enum(["titulos", "datos", "general"]).default("general"),
});
export type FuenteKit = z.infer<typeof FuenteKitSchema>;

export const KitSchema = z.object({
  version: z.literal(1).default(1),
  importado: z.string(),
  /** De dónde se importó (carpeta o zip), solo informativo. */
  origen: z.string().default(""),
  logos: z.partialRecord(z.enum(VARIANTES_LOGO), ArchivoKitSchema).default({}),
  simbolos: z.partialRecord(z.enum(VARIANTES_SIMBOLO), ArchivoKitSchema).default({}),
  avatares: z.array(ArchivoKitSchema.extend({ nombre: z.string() })).default([]),
  colores: z.array(ColorKitSchema).default([]),
  fuentes: z.array(FuenteKitSchema).default([]),
  recursos: z.partialRecord(z.enum(RECURSOS_KIT), ArchivoKitSchema).default({}),
  iconos: z.record(z.string(), ArchivoKitSchema).default({}),
  sprite: z.string().nullable().default(null),
  /** Íconos que dibujó la app con las mismas reglas que los del kit (SVG saneado). */
  extendidos: z.record(z.string(), z.object({ svg: z.string(), nombre: z.string(), creado: z.string() })).default({}),
  manual: z.string().nullable().default(null),
  /** Imagen de resumen de la identidad, si vino. */
  resumen: z.string().nullable().default(null),
});
export type Kit = z.infer<typeof KitSchema>;

/** Reglas de uso de la marca, en un formato que usa el pipeline (las saca Claude del manual, o van por defecto). */
export const ReglasMarcaSchema = z.object({
  concepto: z.string().max(300).default(""),
  lema: z.string().max(200).default(""),
  /** Qué variante del logo va sobre cada tipo de fondo. */
  logoPorFondo: z
    .object({
      claro: z.enum(VARIANTES_LOGO).default("principal"),
      oscuro: z.enum(VARIANTES_LOGO).default("negativo"),
      acento: z.enum(VARIANTES_LOGO).default("sobre_rojo"),
      unaTinta: z.enum(VARIANTES_LOGO).default("monocromo"),
    })
    .prefault({}),
  /** Margen libre alrededor del logo, en diámetros del punto. */
  margenEnPuntos: z.number().min(0).max(10).default(2),
  /** Ancho mínimo (px) de cada pieza; por debajo, la versión más chica (símbolo). */
  minimos: z.object({ logo: z.number().default(180), horizontal: z.number().default(280), simbolo: z.number().default(32) }).prefault({}),
  noSobreFotos: z.boolean().default(true),
  tipografia: z
    .object({
      titulos: z.string().default(""),
      datos: z.string().default(""),
      /** Pesos permitidos en títulos y lectura. */
      pesos: z.array(z.number().int()).default([400, 500, 600]),
      /** Tamaños sugeridos sobre una pieza de `anchoReferencia` px. */
      escala: z.object({ titulo: z.number().default(64), cuerpo: z.number().default(32), fuente: z.number().default(24), anchoReferencia: z.number().default(1080) }).prefault({}),
      sinParrafosEnMayusculas: z.boolean().default(true),
      /** Formato de fechas y fuentes, ej. "26 OCT 2026 / FUENTE 01". */
      formatoFecha: z.string().default("DD MMM AAAA / FUENTE NN"),
    })
    .prefault({}),
  /** Etiquetas explícitas de bloque (CONTEXTO, DATO, OPINIÓN, FUENTE…). */
  etiquetas: z.array(z.string().min(1).max(20)).default([]),
  /** % máximo del cuadro que puede ser color de acento (fuera de transiciones e impactos). */
  acentoMaxPct: z.number().min(1).max(100).default(15),
  /** Tinta de apoyo del acento (ej. el rosa del destacado), que no cuenta como color nuevo. */
  apoyoAcento: hex.nullable().default(null),
  /** Color de las líneas finas (separador). */
  linea: hex.nullable().default(null),
  notas: z.array(z.string().max(300)).default([]),
});
export type ReglasMarca = z.infer<typeof ReglasMarcaSchema>;

/** Conteo para mostrar al importar ("encontré 5 logos, 3 avatares…"). */
export const resumenKit = (k: Kit) => ({
  logos: Object.keys(k.logos).length,
  simbolos: Object.keys(k.simbolos).length,
  avatares: k.avatares.length,
  colores: k.colores.length,
  fuentes: k.fuentes.length,
  recursos: Object.keys(k.recursos).length,
  iconos: Object.keys(k.iconos).length,
  extendidos: Object.keys(k.extendidos).length,
  manual: Boolean(k.manual),
});

export const textoResumenKit = (k: Kit) => {
  const r = resumenKit(k);
  const n = (c: number, uno: string, varios: string) => `${c} ${c === 1 ? uno : varios}`;
  return [
    n(r.logos, "logo", "logos"),
    n(r.simbolos, "símbolo", "símbolos"),
    n(r.avatares, "avatar", "avatares"),
    n(r.colores, "color", "colores"),
    n(r.fuentes, "fuente", "fuentes"),
    n(r.recursos, "recurso", "recursos"),
    n(r.iconos, "ícono", "íconos"),
  ].join(", ") + (r.manual ? " y el manual" : "");
};

/** El color de un rol (o null). */
export const colorDeRol = (k: Pick<Kit, "colores">, rol: RolColor) => k.colores.find((c) => c.rol === rol)?.hex ?? null;
