import { fitTextOnNLines } from "@remotion/layout-utils";

export type Ajuste = { fontSize: number; lineas: number };

/**
 * Busca el tamaño de letra más grande para que `text` entre en una caja de ancho × alto,
 * probando de 1 a `maxLineas` líneas. Nunca devuelve algo que se corte.
 */
export const ajustarTexto = (opts: {
  text: string;
  ancho: number;
  alto: number;
  fontFamily: string;
  fontWeight: number;
  maxFont: number;
  minFont?: number;
  maxLineas?: number;
  interlineado?: number;
  mayusculas?: boolean;
}): Ajuste => {
  const interlineado = opts.interlineado ?? 1.12;
  const minFont = opts.minFont ?? 28;
  let mejor: Ajuste = { fontSize: minFont, lineas: opts.maxLineas ?? 4 };
  for (let n = 1; n <= (opts.maxLineas ?? 4); n++) {
    const { fontSize, lines } = fitTextOnNLines({
      text: opts.text,
      maxLines: n,
      // margen del 4 % por diferencias de medición y el escalado de énfasis
      maxBoxWidth: opts.ancho * 0.96,
      fontFamily: opts.fontFamily,
      fontWeight: opts.fontWeight,
      maxFontSize: opts.maxFont,
      textTransform: opts.mayusculas ? "uppercase" : undefined,
      validateFontIsLoaded: true,
    });
    const altoPorAltura = opts.alto / (lines.length * interlineado);
    const tam = Math.floor(Math.min(fontSize, altoPorAltura));
    if (tam > mejor.fontSize) mejor = { fontSize: tam, lineas: lines.length };
  }
  return { ...mejor, fontSize: Math.max(minFont, mejor.fontSize) };
};
