import type { FichaObjeto } from "./objetos/tipos";

/**
 * Objeto dibujado por la app (SVG ya saneado con sanearSvg, en una caja de -100 a 100): se anima con las
 * acciones genéricas (entrar, caer, flotar, rebotar…), como cualquier otro objeto de la biblioteca.
 */
export const fichaSvg = (id: string, contenido: string): FichaObjeto => ({
  nombre: id.replaceAll("_", " "),
  etiquetas: [id],
  acciones: [],
  tam: [100, 100],
  // eslint-disable-next-line react/no-danger
  Dibujo: () => <g dangerouslySetInnerHTML={{ __html: contenido }} />,
});
