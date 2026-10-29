import { z } from "zod";

/**
 * De dónde sale una imagen, en orden de prioridad: la foto de la propia noticia, un sitio oficial (gub.uy, la
 * institución, Parlamento, intendencias), Wikimedia Commons, otra nota de prensa del mismo hecho. "stock" solo para
 * conceptos abstractos; "manual" = la pegaste o subiste vos.
 */
export const ORIGENES_IMAGEN = ["noticia", "oficial", "wikimedia", "prensa", "stock", "manual"] as const;
export type OrigenImagen = (typeof ORIGENES_IMAGEN)[number];

export const CandidataImagenSchema = z.object({
  url: z.string().url().describe("URL directa de la imagen, o de la página que la tiene como imagen principal"),
  pagina: z.string().url().nullable().default(null).describe("Página donde aparece (para el crédito)"),
  origen: z.enum(ORIGENES_IMAGEN),
  credito: z.string().max(80).default("").describe("Ej: Presidencia, El País, Wikimedia Commons"),
});
export type CandidataImagen = z.infer<typeof CandidataImagenSchema>;
