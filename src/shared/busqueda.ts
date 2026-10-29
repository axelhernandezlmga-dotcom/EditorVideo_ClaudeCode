import type { Recurso } from "./biblioteca";

/**
 * Búsqueda contextual de clips, local y sin servicios externos: un índice BM25 sobre lo que se sabe de cada clip
 * (sobre todo sus "usos", que el análisis escribe como situaciones: "cuando alguien gasta mucha plata"), con
 * raíces y sinónimos en español rioplatense. Sirve para preseleccionar, por cada tramo de lo que se dice, los
 * clips con más sentido; la decisión final (si de verdad encaja y si suma) la toma Claude mirando esos candidatos.
 */

const PARADAS = new Set(
  "a al algo algun alguna algunas alguno algunos ante antes aqui asi aun bien cada como con contra cual cuando de del desde donde dos el ella ellas ello ellos en entre era eran es esa esas ese eso esos esta estaba estan estar estas este esto estos fue fueron ha habia han hasta hay la las le les lo los mas me mi mis mucho muy nada ni no nos o otra otro para pero poco por porque que se ser si sin sobre son su sus tambien tan te tiene tienen todo todos tu un una uno unos y ya yo vos ta bo che the and of to is it you i".split(" "),
);

/** Grupos de palabras que significan lo mismo en un video (se indexan con la primera). */
const SINONIMOS: string[][] = [
  ["dinero", "plata", "guita", "billete", "billetes", "pesos", "dolares", "money", "efectivo", "fortuna", "riqueza", "rico", "millonario", "cash"],
  ["gastar", "gasto", "gastos", "derroche", "derrochar", "despilfarro", "comprar", "compras", "pagar", "pago"],
  ["ganar", "gano", "ganamos", "victoria", "triunfo", "festejo", "festejar", "celebrar", "celebracion", "campeon", "exito", "win", "winner"],
  ["perder", "perdio", "derrota", "fracaso", "fracasar", "lose", "loser"],
  ["error", "errores", "equivocar", "equivoco", "equivocacion", "falla", "fallo", "metida", "macana", "pifia", "mistake", "fail"],
  ["confundido", "confusion", "confundir", "duda", "dudas", "perplejo", "entender", "confused"],
  ["absurdo", "ridiculo", "disparate", "locura", "insolito", "increible", "incredulidad", "inaudito", "wtf"],
  ["enojo", "enojado", "bronca", "furia", "furioso", "rabia", "indignacion", "indignado", "angry"],
  ["risa", "reir", "carcajada", "gracioso", "chiste", "jaja", "laugh", "funny"],
  ["triste", "tristeza", "llorar", "llanto", "pena", "drama", "sad", "cry"],
  ["sorpresa", "sorprendido", "shock", "impacto", "asombro", "wow", "omg"],
  ["miedo", "susto", "panico", "terror", "asustado", "scared"],
  ["mentira", "mentir", "miente", "falso", "verso", "chamuyo", "trucho", "lie", "liar"],
  ["robo", "robar", "ladron", "ladrones", "corrupcion", "corrupto", "estafa", "chorro", "chorros"],
  ["politico", "politicos", "gobierno", "diputado", "senador", "presidente", "ministro", "parlamento", "eleccion", "elecciones", "votar", "voto"],
  ["trabajo", "laburo", "laburar", "trabajar", "empleo", "oficina", "jefe"],
  ["inflacion", "precios", "caro", "aumento", "aumentos", "suba", "carestia"],
  ["impuesto", "impuestos", "tributo", "tasas", "dgi", "iva"],
  ["aplauso", "aplausos", "bravo", "felicitaciones", "clap"],
  ["silencio", "callate", "callado", "shh", "incomodo", "awkward"],
  ["fiesta", "baile", "bailar", "party", "dance"],
  ["pensar", "pensando", "idea", "plan", "inteligente", "genio", "astucia", "think", "smart"],
  ["esperar", "espera", "tarde", "demora", "paciencia", "wait"],
  ["no", "nunca", "jamas", "negacion", "nope"],
];
const CANON = new Map<string, string>();
for (const g of SINONIMOS) for (const w of g) CANON.set(w, g[0]!);

const sinTildes = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Raíz aproximada (sufijos frecuentes del español): "gastando", "gastos" y "gastó" quedan parecidos. */
export const raiz = (w: string) => {
  if (CANON.has(w)) return CANON.get(w)!;
  for (const suf of ["amientos", "imientos", "aciones", "amiento", "imiento", "acion", "mente", "ando", "iendo", "ados", "idos", "adas", "idas", "ado", "ido", "ada", "ida", "aron", "ieron", "aba", "ian", "es", "s", "ar", "er", "ir", "o", "a"]) {
    if (w.length - suf.length >= 4 && w.endsWith(suf)) {
      const r = w.slice(0, -suf.length);
      return CANON.get(r) ?? CANON.get(`${r}ar`) ?? r;
    }
  }
  return w;
};

export const tokens = (texto: string) =>
  sinTildes(texto)
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length > 1 && !PARADAS.has(w))
    .map(raiz);

/** Peso de cada parte del clip en el índice: lo que dice para qué sirve pesa más que el nombre del archivo. */
const campos = (r: Recurso): [string, number][] => [
  [r.usos.join(". "), 3],
  [r.semantica.join(" "), 3],
  [r.descripcion, 2],
  [r.humor, 1.5],
  [r.tono, 1.5],
  [r.transcripcion ?? "", 2],
  [Object.values(r.etiquetas).flat().join(" "), 1.5],
  [r.nombre, 1],
];

export type IndiceClips = { docs: { r: Recurso; tf: Map<string, number>; largo: number }[]; df: Map<string, number>; largoMedio: number };

export const indexarClips = (clips: Recurso[]): IndiceClips => {
  const df = new Map<string, number>();
  const docs = clips.map((r) => {
    const tf = new Map<string, number>();
    let largo = 0;
    for (const [texto, peso] of campos(r)) {
      for (const t of tokens(texto)) {
        tf.set(t, (tf.get(t) ?? 0) + peso);
        largo += peso;
      }
    }
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    return { r, tf, largo };
  });
  return { docs, df, largoMedio: docs.reduce((n, d) => n + d.largo, 0) / Math.max(1, docs.length) };
};

/** Los clips más relacionados con un texto, con su puntaje (BM25, k1 = 1,2, b = 0,75). */
export const buscarClips = (indice: IndiceClips, texto: string, max = 10): { r: Recurso; puntaje: number }[] => {
  const q = [...new Set(tokens(texto))];
  const n = indice.docs.length;
  const out: { r: Recurso; puntaje: number }[] = [];
  for (const d of indice.docs) {
    let p = 0;
    for (const t of q) {
      const f = d.tf.get(t);
      if (!f) continue;
      const idf = Math.log(1 + (n - (indice.df.get(t) ?? 0) + 0.5) / ((indice.df.get(t) ?? 0) + 0.5));
      p += idf * ((f * 2.2) / (f + 1.2 * (0.25 + (0.75 * d.largo) / (indice.largoMedio || 1))));
    }
    if (p > 0) out.push({ r: d.r, puntaje: p });
  }
  return out.sort((a, b) => b.puntaje - a.puntaje).slice(0, max);
};

/**
 * Candidatos para un video: por cada tramo de lo que se dice, los mejores clips; se juntan sin repetir y se
 * castigan los que se usaron en videos recientes. Si la biblioteca es chica, van todos.
 */
export const candidatosParaVideo = (clips: Recurso[], tramos: string[], opciones: { max?: number; porTramo?: number; recientes?: string[] } = {}): Recurso[] => {
  const max = opciones.max ?? 60;
  if (clips.length <= max) return clips;
  const indice = indexarClips(clips);
  const recientes = new Set(opciones.recientes ?? []);
  const puntos = new Map<string, { r: Recurso; p: number }>();
  for (const tramo of tramos) {
    for (const { r, puntaje } of buscarClips(indice, tramo, opciones.porTramo ?? 6)) {
      const p = puntaje * (recientes.has(r.id) ? 0.4 : 1);
      const previo = puntos.get(r.id);
      if (!previo || previo.p < p) puntos.set(r.id, { r, p });
    }
  }
  return [...puntos.values()]
    .sort((a, b) => b.p - a.p)
    .slice(0, max)
    .map((x) => x.r);
};

/** Parte un texto largo en tramos de unas `palabras` palabras (para buscar clips por momento del video). */
export const enTramos = (texto: string, palabras = 18) => {
  const w = texto.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < w.length; i += Math.round(palabras * 0.7)) out.push(w.slice(i, i + palabras).join(" "));
  return out;
};
