/** Cómo se ve un personaje: piel, pelo, ropa y accesorios. Todo con colores de la casa o de la paleta del perfil. */

export const TIPOS_PELO = ["pelado", "corto", "peinado", "largo", "rodete", "cola", "rulos", "flequillo"] as const;
export type TipoPelo = (typeof TIPOS_PELO)[number];

export const TIPOS_TORSO = ["remera", "camisa", "saco", "guardapolvo", "buzo", "chaleco", "uniforme", "cardigan"] as const;
export type TipoTorso = (typeof TIPOS_TORSO)[number];

export type Apariencia = {
  /** Color o token ("piel1" … "piel5"). */
  piel: string;
  pelo: { tipo: TipoPelo; color: string };
  /** Forma de la cara. */
  cara: "ovalada" | "redonda" | "cuadrada";
  /** Ancho del cuerpo (0,85 flaco … 1,3 robusto). */
  contextura: number;
  /** Alto total (1 = adulto promedio). */
  altura: number;
  torso: TipoTorso;
  colorTorso: string;
  /** Camisa debajo del saco, guardapolvo, chaleco o cardigan. */
  colorInterior?: string;
  piernas: "pantalon" | "pollera";
  colorPiernas: string;
  zapatos: string;
  lentes?: boolean;
  bigote?: boolean;
  barba?: boolean;
  arrugas?: boolean;
  /** Pestañas y labios marcados. */
  pestanas?: boolean;
  sombrero?: "gorra" | "casco" | "gorro_policia" | null;
  colorSombrero?: string;
  corbata?: string;
  estetoscopio?: boolean;
  credencial?: boolean;
  mochila?: string;
  /** Lleva bastón en la mano de atrás cuando no la usa para otra cosa. */
  baston?: boolean;
};
