/**
 * Censura de malas palabras para lo que se lee en pantalla (subtítulos, textos de las escenas, publicación).
 * La voz las sigue diciendo completas: esto solo cambia el texto ("pelotudo" → "p*lotudo").
 * Las suaves (salame, nabo, bobeta, gil) no se censuran.
 */
export const PUTEADAS = [
  "pelotud[oa]s?",
  "bolud[oa]s?",
  "guampud[oa]s?",
  "conchud[oa]s?",
  "conchas?",
  "carajos?",
  "mierdas?",
  "put[oa]s?",
  "putead[oa]s?",
  "pijas?",
  "chot[oa]s?",
  "forr[oa]s?",
  "cul[oa]s?",
  "ortos?",
  "cag(?:ar|ada|adas|ado|ados|[oó]n|ona|ando|aste|ó)",
  "garchas?",
  "vergas?",
  "porongas?",
  "coños?",
  "joder",
];

const REGEX = new RegExp(`(?<![\\p{L}\\p{N}])(?:${PUTEADAS.join("|")})(?![\\p{L}\\p{N}])`, "giu");

/** "pelotudo" → "p*lotudo" (se tapa la segunda letra, se respeta la primera). */
const tapar = (palabra: string) => `${palabra[0]}*${palabra.slice(2)}`;

export const censurar = (texto: string) => texto.replace(REGEX, tapar);

export const tienePuteadas = (texto: string) => {
  REGEX.lastIndex = 0;
  const hay = REGEX.test(texto);
  REGEX.lastIndex = 0;
  return hay;
};

/** Censura todos los strings de un objeto (props de una escena), sin tocar números ni claves. */
export const censurarProfundo = <T,>(valor: T): T => {
  if (typeof valor === "string") return censurar(valor) as T;
  if (Array.isArray(valor)) return valor.map(censurarProfundo) as T;
  if (valor && typeof valor === "object") return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, censurarProfundo(v)])) as T;
  return valor;
};
