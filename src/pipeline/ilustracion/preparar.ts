import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { openBrowser, renderStill, selectComposition } from "@remotion/renderer";
import { z } from "zod";
import type { Escena, Guion, Marca } from "../../shared/schemas";
import { sanearSvg } from "../../shared/svg";
import { pedirAClaude } from "../claude";
import { obtenerBundle } from "../renderizador";
import { DIR_ASSETS } from "../rutas";
import type { Trabajo } from "../trabajo";
import { escribirCatalogo, fichasCatalogo, type FichaCatalogo } from "./catalogo";

/**
 * Las escenas ilustradas en el pipeline: el resumen del catálogo para el guionista, el arreglo de ids que no
 * existen (se usa el más parecido) y los objetos nuevos que la app dibuja y verifica mirándolos.
 */

export const DIR_ILUSTRACION = path.join(DIR_ASSETS, "ilustracion");
export const DIR_GENERADOS = path.join(DIR_ILUSTRACION, "generados");
const ARCHIVO_FALTANTES = path.join(DIR_ILUSTRACION, "faltantes.json");
/** Objetos nuevos que se dibujan como máximo por video (cada uno son hasta 3 pedidos a Claude). */
const MAX_NUEVOS_POR_VIDEO = 3;

export const GeneradoSchema = z.object({ id: z.string(), nombre: z.string(), etiquetas: z.array(z.string()), svg: z.string(), creado: z.string(), video: z.string() });
export type Generado = z.infer<typeof GeneradoSchema>;

/** Objetos que dibujó la app en videos anteriores (quedan para siempre en la biblioteca). */
export const leerGenerados = (): Generado[] => {
  if (!existsSync(DIR_GENERADOS)) return [];
  return readdirSync(DIR_GENERADOS)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => {
      const r = GeneradoSchema.safeParse(JSON.parse(readFileSync(path.join(DIR_GENERADOS, f), "utf8")));
      return r.success ? [r.data] : [];
    });
};

/** Cuánto de un video va dibujado, como instrucción para el guionista. */
const CANTIDAD: Record<"poca" | "media" | "mucha", string> = {
  poca: "POCA: 1 o 2 escenas `escena_ilustrada` en todo el video (en los momentos más visuales).",
  media: "MEDIA: más o menos la MITAD de las escenas (sin contar el cierre) son `escena_ilustrada`.",
  mucha: "MUCHA: casi todo dibujado: al menos el 75 % de las escenas (sin contar el cierre) son `escena_ilustrada`; los datos duros pueden ir en `dato_numero`, `grafico` o `comparacion`.",
};

/** Lista compacta del catálogo para el prompt del guionista. */
export const resumenCatalogo = (fichas: FichaCatalogo[] = fichasCatalogo()) => {
  const linea = (f: FichaCatalogo, conAcciones: boolean) => `- \`${f.id}\` (${f.nombre}; ${f.etiquetas.slice(0, 4).join(", ")})${conAcciones && f.acciones.length ? ` — acciones propias: ${f.acciones.filter((a) => !["quieto", "entrar", "caer", "flotar", "rebotar", "latir", "volar", "temblar", "girar", "salir"].includes(a)).join(", ") || "solo genéricas"}` : ""}`;
  const de = (tipo: FichaCatalogo["tipo"]) => fichas.filter((f) => f.tipo === tipo);
  return [
    "Personajes (genéricos, ninguno es una persona real):",
    ...de("personaje").map((f) => linea(f, false)),
    "",
    "Escenarios:",
    ...de("escenario").map((f) => linea(f, false)),
    "",
    "Objetos:",
    ...de("objeto").map((f) => linea(f, true)),
    "",
    "Efectos:",
    ...de("efecto").map((f) => linea(f, false)),
  ].join("\n");
};

/** Bloque del prompt del guion con el estilo, la cantidad y el catálogo. */
export const instruccionesIlustracion = (estilo: string, cantidad: "ninguna" | "poca" | "media" | "mucha") =>
  cantidad === "ninguna"
    ? "Ilustración del video: NINGUNA. No uses la plantilla `escena_ilustrada`."
    : [
    `Ilustración del video: estilo «${estilo}». Cantidad: ${CANTIDAD[cantidad]}`,
    "Catálogo de ilustración disponible (usá estos ids; si necesitás un OBJETO que no está, poné un id nuevo en snake_case que diga qué es, ej. `semaforo`, y la app lo dibuja):",
    resumenCatalogo(),
  ].join("\n");

const palabras = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);

/** El id del catálogo (de ese tipo) que más se parece por nombre y etiquetas, o null. */
export const masParecido = (id: string, tipo: FichaCatalogo["tipo"], fichas: FichaCatalogo[] = fichasCatalogo()): string | null => {
  const buscadas = new Set(palabras(id.replaceAll("_", " ")));
  let mejor: { id: string; puntos: number } | null = null;
  for (const f of fichas.filter((x) => x.tipo === tipo)) {
    const suyas = new Set(palabras(`${f.id.replaceAll("_", " ")} ${f.nombre} ${f.etiquetas.join(" ")}`));
    let puntos = 0;
    for (const w of buscadas) for (const s of suyas) if (w === s) puntos += 2;
    else if (w.length >= 5 && s.length >= 5 && (w.startsWith(s.slice(0, 5)) || s.startsWith(w.slice(0, 5)))) puntos += 1;
    if (puntos > 0 && (!mejor || puntos > mejor.puntos)) mejor = { id: f.id, puntos };
  }
  return mejor?.id ?? null;
};

type Faltante = { tipo: FichaCatalogo["tipo"]; id: string; reemplazo: string | null; video: string };

/**
 * Deja cada escena ilustrada con ids que existen: lo desconocido va al más parecido del catálogo (o se saca).
 * Los objetos con SVG dibujado para este video se respetan. Devuelve también lo que faltó (para dibujarlo después).
 */
export const normalizarIlustradas = (guion: Guion, svgs: Record<string, string>, fichas: FichaCatalogo[] = fichasCatalogo(), video = ""): { guion: Guion; faltantes: Faltante[] } => {
  const existe = (tipo: FichaCatalogo["tipo"], id: string) => fichas.some((f) => f.tipo === tipo && f.id === id);
  const faltantes: Faltante[] = [];
  const resolver = (tipo: FichaCatalogo["tipo"], id: string, porDefecto: string | null) => {
    if (existe(tipo, id) || (tipo === "objeto" && svgs[id])) return id;
    const r = masParecido(id, tipo, fichas) ?? porDefecto;
    faltantes.push({ tipo, id, reemplazo: r, video });
    return r;
  };
  const escenas = guion.escenas.map((e): Escena => {
    if (e.plantilla !== "escena_ilustrada") return e;
    const p = e.props;
    const escenario = resolver("escenario", p.escenario, "ciudad_dia")!;
    const personajes = p.personajes.flatMap((x) => {
      const id = x.id === "narrador" ? "narrador" : resolver("personaje", x.id, null);
      return id ? [{ ...x, id }] : [];
    });
    const objetos = p.objetos.flatMap((x) => {
      const id = resolver("objeto", x.id, null);
      return id ? [{ ...x, id }] : [];
    });
    const beats = p.beats.map((b) => {
      const efecto = b.efecto ? resolver("efecto", b.efecto, null) : undefined;
      return {
        ...b,
        efecto: efecto ?? undefined,
        personaje: b.personaje !== undefined && b.personaje < personajes.length ? b.personaje : undefined,
        objeto: b.objeto !== undefined && b.objeto < objetos.length ? b.objeto : undefined,
      };
    });
    return { ...e, props: { ...p, escenario, personajes, objetos, beats } };
  });
  return { guion: { ...guion, escenas }, faltantes };
};

/** Anota lo que faltó en assets/ilustracion/faltantes.json (para dibujarlo bien en una sesión). */
export const anotarFaltantes = async (faltantes: Faltante[]) => {
  if (!faltantes.length) return;
  const previos: Faltante[] = existsSync(ARCHIVO_FALTANTES) ? JSON.parse(readFileSync(ARCHIVO_FALTANTES, "utf8")) : [];
  const todos = [...previos, ...faltantes].filter((f, i, a) => a.findIndex((g) => g.tipo === f.tipo && g.id === f.id) === i);
  await writeFile(ARCHIVO_FALTANTES, `${JSON.stringify(todos, null, 2)}\n`);
};

// ---------- objetos nuevos: dibujar, mirar, corregir ----------

const SvgSchema = z.object({
  svg: z.string().min(40).max(60_000).describe("El SVG completo, con viewBox=\"-100 -100 200 200\""),
  nombre: z.string().min(2).max(40),
  etiquetas: z.array(z.string().min(2).max(30)).min(2).max(8),
});
const VeredictoSchema = z.object({ ok: z.boolean(), motivo: z.string().max(400), corregir: z.string().max(400).default("") });

const promptDibujo = (id: string, contexto: string, marca: Marca, correccion?: string) => `Dibujá en SVG un objeto para un video explicativo animado (estilo "plano editorial" de la casa).
Objeto: «${id.replaceAll("_", " ")}». Aparece en una escena donde la voz dice: "${contexto}".

Reglas del estilo (obligatorias):
- viewBox="-100 -100 200 200". El objeto centrado, apoyado en y=100 (su base toca y=100), de ~150 a 190 de alto o de ancho.
- Formas planas: path, rect, circle, ellipse, polygon, polyline, line y g. Sin degradés, sin filtros, sin imágenes, sin <use>.
- Contorno de todas las formas principales: stroke="#231F38" stroke-width="3" stroke-linejoin="round" stroke-linecap="round".
- Colores: los de la paleta (acento ${marca.colores.acento}, acento 2 ${marca.colores.acento2}) y neutros (#F7F5F0, #EDE6D6, #9AA4B0, #4C5563, #3E5C8A, #6E8B4E, #A8743F, #F4C543).
- Una sombra simple del lado derecho o de abajo: la misma forma recortada con fill="#000000" fill-opacity="0.14".
- Tiene que reconocerse al toque, de una mirada, aunque sea chico. Detalles justos, nada de texto largo (a lo sumo 1–3 caracteres).
- Diseño propio y genérico: nada de logos, marcas ni símbolos reales.${correccion ? `\n\nEl intento anterior no quedó bien. Corregí esto: ${correccion}` : ""}

Devolvé el SVG, un nombre corto en español y 2 a 6 etiquetas en español.`;

/** Hoja de prueba de un SVG (4 momentos con acciones genéricas) a un PNG, para mirarla. */
const hojaDeSvg = async (svg: string, id: string, salida: string) => {
  const props = {
    secciones: [
      {
        titulo: id,
        columnas: 4,
        ancho: 300,
        alto: 300,
        celdas: [
          { tipo: "objeto", id, estilo: "plano", frame: 0, accion: "quieto", etiqueta: "quieto", svg },
          { tipo: "objeto", id, estilo: "plano", frame: 5, accion: "entrar", etiqueta: "entrar", svg },
          { tipo: "objeto", id, estilo: "plano", frame: 14, accion: "rebotar", etiqueta: "rebotar", svg },
          { tipo: "objeto", id, estilo: "cartoon", frame: 20, accion: "flotar", etiqueta: "cartoon", svg },
        ],
      },
    ],
  };
  const serveUrl = await obtenerBundle();
  const navegador = await openBrowser("chrome");
  try {
    const composition = await selectComposition({ serveUrl, id: "HojaIlustracion", inputProps: props, puppeteerInstance: navegador });
    await renderStill({ serveUrl, composition, inputProps: props, frame: composition.durationInFrames - 1, output: salida, imageFormat: "png", puppeteerInstance: navegador });
  } finally {
    await navegador.close({ silent: true });
  }
};

/**
 * Dibuja un objeto nuevo y lo verifica mirándolo (hasta 3 intentos). Si queda bien, entra a la biblioteca
 * para siempre (assets/ilustracion/generados/ + catalogo.json + su hoja de prueba). Si no, devuelve null.
 */
export const dibujarObjeto = async (t: Trabajo, id: string, contexto: string, marca: Marca, signal?: AbortSignal): Promise<Generado | null> => {
  const dir = t.ruta("ilustracion", id);
  await mkdir(dir, { recursive: true });
  let correccion: string | undefined;
  try {
    for (let intento = 1; intento <= 3; intento++) {
      t.actividad(`Dibujando «${id.replaceAll("_", " ")}» (intento ${intento} de 3)…`);
      const r = await pedirAClaude({ prompt: promptDibujo(id, contexto, marca, correccion), schema: SvgSchema, cwd: dir, herramientas: [], model: marca.modeloClaude, signal, onLog: (l) => void t.log(l) });
      const limpio = sanearSvg(r.svg);
      if (!limpio) {
        correccion = "el SVG no tenía formas válidas (usá path, rect, circle, ellipse, polygon).";
        continue;
      }
      await hojaDeSvg(limpio, id, path.join(dir, "hoja.png"));
      const v = await pedirAClaude({
        prompt: `Mirá hoja.png con la herramienta Read. Es un objeto dibujado para un video explicativo: tiene que ser «${id.replaceAll("_", " ")}».
Aparece en 4 momentos de su animación. ¿Se entiende al toque qué es? ¿Está completo (no cortado por los bordes), sin formas
deformes ni sueltas, y prolijo? Respondé ok=true solo si las tres cosas se cumplen. Si no, en "corregir" decí qué cambiar.`,
        schema: VeredictoSchema,
        cwd: dir,
        herramientas: ["Read"],
        model: marca.modeloClaude,
        signal,
      });
      await t.log(`Objeto nuevo «${id}», intento ${intento}: ${v.ok ? "aprobado" : "no"} — ${v.motivo}`);
      if (!v.ok) {
        correccion = v.corregir || v.motivo;
        continue;
      }
      const g: Generado = { id, nombre: r.nombre, etiquetas: r.etiquetas, svg: limpio, creado: new Date().toISOString(), video: t.id };
      await mkdir(DIR_GENERADOS, { recursive: true });
      await writeFile(path.join(DIR_GENERADOS, `${id}.json`), `${JSON.stringify(g, null, 2)}\n`);
      await mkdir(path.join(DIR_ILUSTRACION, "pruebas"), { recursive: true });
      await writeFile(path.join(DIR_ILUSTRACION, "pruebas", `objeto-${id}.png`), readFileSync(path.join(dir, "hoja.png")));
      await escribirCatalogo(path.join(DIR_ILUSTRACION, "catalogo.json"));
      return g;
    }
    await t.log(`No pude dibujar «${id}» bien en 3 intentos: va el objeto más parecido del catálogo (queda anotado en faltantes.json).`, "error");
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

/**
 * Parte "ilustración" del paso de visuales: dibuja los objetos que el guion pidió y no existen (hasta 3 por
 * video) y devuelve los SVG que usa este video (los nuevos y los que ya se habían dibujado antes).
 */
export const prepararIlustracion = async (t: Trabajo, guion: Guion, marca: Marca, signal?: AbortSignal): Promise<Record<string, string>> => {
  const generados = new Map(leerGenerados().map((g) => [g.id, g]));
  const fichas = fichasCatalogo();
  const pedidos = guion.escenas.flatMap((e) => (e.plantilla === "escena_ilustrada" ? e.props.objetos.map((o) => ({ id: o.id, contexto: e.narracion })) : []));
  const nuevos = pedidos.filter((p, i) => pedidos.findIndex((q) => q.id === p.id) === i && !fichas.some((f) => f.tipo === "objeto" && f.id === p.id) && !generados.has(p.id) && /^[a-z][a-z0-9_]{2,39}$/.test(p.id));
  for (const p of nuevos.slice(0, MAX_NUEVOS_POR_VIDEO)) {
    const g = await dibujarObjeto(t, p.id, p.contexto, marca, signal).catch(async (e: Error) => {
      if (signal?.aborted) throw e;
      await t.log(`No pude dibujar «${p.id}»: ${e.message}`, "error");
      return null;
    });
    if (g) generados.set(g.id, g);
  }
  const usados = new Set(pedidos.map((p) => p.id));
  return Object.fromEntries([...generados.values()].filter((g) => usados.has(g.id)).map((g) => [g.id, g.svg]));
};
