/** Utilidades para el texto que pega el usuario (una frase o un artículo entero). */

/** Desde cuántas palabras el texto se toma como material principal (no como una idea). */
export const UMBRAL_MATERIAL = 150;

export const contarPalabras = (texto: string) => texto.split(/\s+/).filter(Boolean).length;

export const esMaterial = (texto: string) => contarPalabras(texto) > UMBRAL_MATERIAL;

/** Carga en lote: las ideas se separan con una línea que dice solo `---` (un texto largo tiene saltos de línea). */
export const separarLote = (texto: string) =>
  texto
    .split(/^[ \t]*---[ \t]*$/m)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

/** Nombre corto para mostrar en la cola y armar el id: la primera línea con contenido, recortada. */
export const etiquetaDe = (texto: string, max = 100) => {
  const primera = texto
    .split(/\r?\n/)
    .map((l) => l.replace(/^[#>*\-\s]+/, "").trim())
    .find((l) => l.length > 0) ?? texto.trim();
  return primera.length > max ? `${primera.slice(0, max).replace(/\s+\S*$/, "")}…` : primera;
};
