import type { ReglasMarca, VarianteLogo, VarianteSimbolo } from "./kit";

/**
 * Reglas de marca que se aplican "por construcción" (las usan los componentes de Remotion y el verificador):
 * qué variante del logo va sobre cada fondo, cuándo pasar al símbolo y el contraste del texto.
 */

const rgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.replace("#", "").slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Luminancia relativa (WCAG). */
export const luminanciaRelativa = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Contraste WCAG entre dos colores (1 a 21). */
export const contraste = (a: string, b: string) => {
  const [l1, l2] = [luminanciaRelativa(a), luminanciaRelativa(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
};

/** Distancia simple entre dos colores (0–441). */
export const distanciaColor = (a: string, b: string) => {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
};

export type TipoFondo = "claro" | "oscuro" | "acento";

/** Qué tipo de fondo es un color: el acento de la marca, oscuro o claro. */
export const tipoDeFondo = (fondo: string, acento: string): TipoFondo => (distanciaColor(fondo, acento) < 60 ? "acento" : luminanciaRelativa(fondo) < 0.18 ? "oscuro" : "claro");

export type EleccionLogo = { pieza: "logo"; variante: VarianteLogo } | { pieza: "simbolo"; variante: VarianteSimbolo };

/**
 * La pieza de marca que corresponde a un fondo y un ancho: el logo en la variante del fondo; el horizontal si
 * se pide y entra; y si no llega al mínimo, la «C.» (en la variante equivalente).
 */
export const elegirLogo = (fondo: string, anchoPx: number, reglas: Pick<ReglasMarca, "logoPorFondo" | "minimos">, acento: string, opciones: { horizontal?: boolean } = {}): EleccionLogo => {
  const tipo = tipoDeFondo(fondo, acento);
  const variante = reglas.logoPorFondo[tipo];
  if (opciones.horizontal && anchoPx >= reglas.minimos.horizontal) return { pieza: "logo", variante: "horizontal" };
  if (!opciones.horizontal && anchoPx >= reglas.minimos.logo) return { pieza: "logo", variante };
  const simbolo: VarianteSimbolo = variante === "negativo" || variante === "sobre_rojo" || variante === "monocromo" ? variante : "principal";
  return { pieza: "simbolo", variante: simbolo };
};

/** ¿Un texto es un "párrafo en mayúsculas"? (más de 3 palabras, casi todo en mayúsculas). Las etiquetas cortas valen. */
export const parrafoEnMayusculas = (texto: string) => {
  const palabras = texto.split(/\s+/).filter((w) => /\p{L}{2,}/u.test(w));
  if (palabras.length <= 3) return false;
  const letras = texto.replace(/[^\p{L}]/gu, "");
  const mayus = letras.replace(/[^\p{Lu}]/gu, "");
  return letras.length > 0 && mayus.length / letras.length > 0.8;
};

/** "26 OCT 2026" en el formato del manual. */
export const fechaMarca = (d: Date) => `${String(d.getDate()).padStart(2, "0")} ${["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"][d.getMonth()]} ${d.getFullYear()}`;

/** Piezas de un SVG de logo con letras trazadas (para animarlas): viewBox, transform, trazados y el punto. */
export type PiezasSvg = {
  viewBox: string;
  ancho: number;
  alto: number;
  transform: string;
  trazados: { d: string; fill: string }[];
  punto: { cx: number; cy: number; r: number; fill: string } | null;
};

export const piezasSvg = (svg: string): PiezasSvg | null => {
  const vb = /viewBox="([^"]+)"/.exec(svg)?.[1];
  if (!vb) return null;
  const [, , ancho, alto] = vb.split(/[\s,]+/).map(Number) as [number, number, number, number];
  const transform = /<g[^>]*transform="([^"]+)"/.exec(svg)?.[1] ?? "";
  const trazados = [...svg.matchAll(/<path([^>]*)\/?>/g)].map((m) => ({ d: /\sd="([^"]+)"/.exec(m[1]!)?.[1] ?? "", fill: /fill="([^"]+)"/.exec(m[1]!)?.[1] ?? "#000" })).filter((t) => t.d);
  const c = /<circle([^>]*)\/?>/.exec(svg)?.[1];
  const num = (a: string) => Number(new RegExp(`${a}="([^"]+)"`).exec(c ?? "")?.[1] ?? 0);
  return { viewBox: vb, ancho, alto, transform, trazados, punto: c ? { cx: num("cx"), cy: num("cy"), r: num("r"), fill: /fill="([^"]+)"/.exec(c)?.[1] ?? "#000" } : null };
};

/** Trazados de un ícono de línea (el contenido de su <g>, con sus atributos de trazo). */
export const trazadosIcono = (svg: string): string[] => [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]!);

/** Palabras que llevan a cada ícono del kit (por id; los ids nuevos o extendidos se buscan por su nombre). */
const TEMAS_ICONOS: Record<string, string[]> = {
  parlamento: ["vote", "landmark", "vot", "urna", "parlamento", "diputad", "senad", "legislat", "ley", "proyecto de ley", "votación", "votacion", "camara", "cámara", "bancada", "partido", "elecci", "gobierno", "presiden", "ministr", "intendenc", "balotaje", "plebiscit"],
  economia: ["banknote", "trending", "coins", "wallet", "piggy", "econom", "inflaci", "sueldo", "salario", "dólar", "dolar", "precio", "impuesto", "presupuesto", "deuda", "pbi", "plata", "peso", "afap", "jubilaci", "tarifa", "costo", "inversi"],
  puerto: ["ship", "anchor", "puerto", "contenedor", "barco", "naviera", "terminal", "muelle", "exporta", "importa", "katoen", "tcp"],
  educacion: ["graduation", "school", "book", "educaci", "liceo", "escuela", "docente", "maestr", "estudiant", "universidad", "udelar", "anep", "clase"],
  salud: ["heart", "hospital", "stethoscope", "salud", "hospital", "médic", "medic", "asse", "mutualista", "fonasa", "enfermedad", "vacuna", "msp"],
  seguridad: ["shield", "siren", "seguridad", "delito", "polic", "homicid", "rapiña", "rapina", "crimen", "cárcel", "carcel", "narco", "violencia", "ministerio del interior"],
  trabajo: ["briefcase", "hammer", "trabajo", "empleo", "desempleo", "sindicat", "pit-cnt", "paro", "huelga", "trabajador", "laboral", "consejo de salarios"],
  justicia: ["scale", "gavel", "justicia", "fiscal", "juez", "jueza", "tribunal", "corte", "sentencia", "juicio", "imputad", "denuncia", "constitución", "constitucion"],
  dato: ["chart", "bar-chart", "percent", "dato", "cifra", "porcentaje", "%", "encuesta", "estadística", "estadistica", "número", "numero", "ine", "millones"],
  opinion: ["message", "megaphone", "opini", "creo", "pienso", "postura", "punto de vista"],
  fuente: ["file", "newspaper", "fuente", "documento", "informe", "comunicado", "resolución", "resolucion", "según", "segun"],
  contexto: ["search", "contexto", "historia", "antecedente", "por qué", "porque", "cómo", "como", "qué es", "que es"],
};

/** El ícono del kit que mejor ilustra un texto (o null). `ids` = los íconos que tiene el kit. */
export const iconoPorTema = (texto: string, ids: string[]): string | null => {
  const t = texto.toLowerCase();
  let mejor: { id: string; puntos: number } | null = null;
  for (const id of ids) {
    const claves = TEMAS_ICONOS[id] ?? [id.replaceAll("_", " ")];
    const puntos = claves.reduce((n, c) => n + (t.includes(c) ? (c.length > 5 ? 2 : 1) : 0), 0);
    if (puntos > 0 && (!mejor || puntos > mejor.puntos)) mejor = { id, puntos };
  }
  return mejor?.id ?? null;
};

const MESES_LARGOS = "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre";
const FECHA_AL_FINAL = new RegExp(`\\s*[,·(–-]\\s*(\\d{1,2}\\s+de\\s+(?:${MESES_LARGOS})(?:\\s+(?:de\\s+)?\\d{4})?|\\d{1,2}/\\d{1,2}/\\d{2,4})\\)?\\s*$`, "i");
const NUM_MES: Record<string, number> = { enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11 };

/**
 * Separa una fecha que quedó al final de un título («Votación en Diputados, 18 de agosto de 2026») para
 * mostrarla en la línea de Plex Mono («18 AGO 2026»). Si no hay fecha al final, devuelve el texto igual.
 */
export const separarFecha = (texto: string): { texto: string; fecha: string | null } => {
  const m = FECHA_AL_FINAL.exec(texto);
  if (!m || m.index < 3) return { texto, fecha: null };
  const f = m[1]!.toLowerCase();
  const larga = new RegExp(`(\\d{1,2})\\s+de\\s+(${MESES_LARGOS})(?:\\s+(?:de\\s+)?(\\d{4}))?`).exec(f);
  let fecha: string;
  if (larga) {
    const mes = NUM_MES[larga[2]!]!;
    fecha = `${larga[1]!.padStart(2, "0")} ${fechaMarca(new Date(2000, mes, 1)).split(" ")[1]}${larga[3] ? ` ${larga[3]}` : ""}`;
  } else fecha = f;
  return { texto: texto.slice(0, m.index).trim(), fecha };
};

/** ¿Un texto en pantalla está citando la fuente («Fuente: …»)? Eso va en la línea de fuente, no en un título. */
export const esLineaDeFuente = (texto: string) => /^\s*fuentes?\s*:/i.test(texto);
