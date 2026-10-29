import type { MarcaVisual } from "./render";
import type { Marca, Tono } from "./schemas";

/** Velocidad de la voz: la del tono si la define, si no la de la configuración. */
export const velocidadDe = (marca: Marca, tono: Tono | null) => tono?.velocidad ?? marca.velocidad;

/** La marca con la velocidad de voz y los acentos del tono aplicados. */
export const aplicarTono = (marca: Marca, tono: Tono | null): Marca => ({ ...marca, velocidad: velocidadDe(marca, tono), colores: coloresDe(marca, tono) });

/** Colores de la marca con los acentos del tono encima. */
export const coloresDe = (marca: Marca, tono: Tono | null): Marca["colores"] => ({
  ...marca.colores,
  ...(tono?.acento ? { acento: tono.acento } : {}),
  ...(tono?.acento2 ? { acento2: tono.acento2 } : {}),
});

/** Lo que necesita Remotion (y la vista previa de la app) para dibujar con el estilo del tono. */
export const visualDe = (marca: Marca, tono: Tono | null | undefined): MarcaVisual => ({
  usuario: marca.usuario,
  colores: coloresDe(marca, tono ?? null),
  tipografia: marca.tipografia,
  animacion: tono?.animacion ?? "normal",
});
