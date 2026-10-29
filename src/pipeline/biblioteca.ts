import { createHash, randomBytes } from "node:crypto";
import { constants, existsSync } from "node:fs";
import { copyFile, mkdir, open, readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  VERSION_BIBLIOTECA,
  BibliotecaSchema,
  analisisVacio,
  CATEGORIAS_INICIALES,
  EtiquetasClipSchema,
  etiquetasVacias,
  EXT_AUDIO,
  EXT_VIDEO,
  enCategorias,
  MAX_SEGUNDOS_SFX,
  NombreCategoria,
  orientacionDe,
  slugCategoria,
  type Biblioteca,
  type Categoria,
  type Recurso,
  type TipoRecurso,
} from "../shared/biblioteca";
import { IDS_MOODS, type Mood } from "../shared/opcionesCrudo";
import { leerMarca } from "./config";
import { ejecutar } from "./proceso";
import { RAIZ } from "./rutas";
import { escribirAtomico } from "./trabajo";

/**
 * Biblioteca de clips, música y efectos. Todo lo que se importa se COPIA a biblioteca/medios/ (en btrfs/APFS
 * la copia es instantánea y no ocupa lugar extra): el original nunca se toca, y la biblioteca sigue andando
 * si movés o clonás el proyecto. El índice (biblioteca.json) guarda rutas relativas.
 */
export const DIR_BIBLIOTECA = process.env.FABRICA_BIBLIOTECA ?? path.join(RAIZ, "biblioteca");
const ARCHIVO = path.join(DIR_BIBLIOTECA, "biblioteca.json");
export const DIR_MEDIOS = path.join(DIR_BIBLIOTECA, "medios");
export const DIR_MINIATURAS = path.join(DIR_BIBLIOTECA, "miniaturas");
export const DIR_FOTOGRAMAS = path.join(DIR_BIBLIOTECA, "fotogramas");
export const DIR_TMP = path.join(DIR_BIBLIOTECA, "tmp");

/** Catálogo viejo de "Mis clips" (antes de la biblioteca): se migra a la categoría Colorados la primera vez. */
const DIR_CLIPS_VIEJO = process.env.FABRICA_DATOS_CLIPS ?? path.join(RAIZ, "data", "clips");

export class ErrorBiblioteca extends Error {}

// ---------- índice (una escritura a la vez: la importación en segundo plano y la app escriben juntas) ----------

let cola: Promise<unknown> = Promise.resolve();
const enOrden = <T>(fn: () => Promise<T>): Promise<T> => {
  const p = cola.then(fn, fn);
  cola = p.catch(() => undefined);
  return p;
};

let cache: Biblioteca | null = null;

const guardar = async (b: Biblioteca) => {
  await mkdir(DIR_BIBLIOTECA, { recursive: true });
  await escribirAtomico(ARCHIVO, `${JSON.stringify(b, null, 2)}\n`);
  cache = b;
};

/** Lee el índice; la primera vez crea las categorías iniciales y migra "Mis clips" a Colorados. */
export const leerBiblioteca = async (): Promise<Biblioteca> => {
  if (cache) return cache;
  return enOrden(async () => {
    if (cache) return cache;
    if (existsSync(ARCHIVO)) {
      const r = BibliotecaSchema.safeParse(JSON.parse(await readFile(ARCHIVO, "utf8")));
      if (!r.success) throw new ErrorBiblioteca(`biblioteca/biblioteca.json está dañado: ${r.error.issues[0]?.message ?? ""}`);
      cache = r.data;
      // índice de una versión anterior: los campos nuevos ya vienen con su valor por defecto; se guarda migrado
      if (cache.version < VERSION_BIBLIOTECA) await guardar(migrarBiblioteca(cache));
      return cache;
    }
    const ahora = new Date().toISOString();
    const b: Biblioteca = { version: 1, categorias: CATEGORIAS_INICIALES.map((nombre) => ({ id: slugCategoria(nombre), nombre, creada: ahora })), recursos: [] };
    b.recursos = await migrarMisClips(slugCategoria(CATEGORIAS_INICIALES[0]));
    await guardar(b);
    return b;
  });
};

/** v1 → v2: los clips que ya había descripto Claude conservan su descripción; falta el análisis nuevo (usos, tono…). */
export const migrarBiblioteca = (b: Biblioteca): Biblioteca => ({ ...b, version: VERSION_BIBLIOTECA });

const modificar = <T>(fn: (b: Biblioteca) => T | Promise<T>): Promise<T> =>
  leerBiblioteca().then(() =>
    enOrden(async () => {
      const b = structuredClone(cache!);
      const r = await fn(b);
      await guardar(b);
      return r;
    }),
  );

/** Cambia recursos del índice de a uno por vez (lo usa el análisis, que corre en segundo plano). */
export const actualizarRecursos = (fn: (recursos: Recurso[]) => void) => modificar((b) => fn(b.recursos));

/** Ruta absoluta de un recurso (siempre dentro de biblioteca/medios). */
export const rutaRecurso = (r: Pick<Recurso, "archivo">) => {
  const abs = path.resolve(DIR_MEDIOS, r.archivo);
  if (!abs.startsWith(path.resolve(DIR_MEDIOS) + path.sep)) throw new ErrorBiblioteca(`El archivo ${r.archivo} está fuera de la biblioteca.`);
  return abs;
};

// ---------- categorías ----------

export const crearCategoria = (nombre: string) =>
  modificar((b) => {
    const limpio = NombreCategoria.parse(nombre);
    if (b.categorias.some((c) => c.nombre.toLowerCase() === limpio.toLowerCase())) throw new ErrorBiblioteca(`Ya existe la categoría «${limpio}».`);
    let id = slugCategoria(limpio);
    for (let n = 2; b.categorias.some((c) => c.id === id); n++) id = `${slugCategoria(limpio)}-${n}`;
    const c: Categoria = { id, nombre: limpio, creada: new Date().toISOString() };
    b.categorias.push(c);
    return c;
  });

/** Renombrar no cambia el id: los videos que la eligieron la siguen encontrando. */
export const renombrarCategoria = (id: string, nombre: string) =>
  modificar((b) => {
    const c = b.categorias.find((x) => x.id === id);
    if (!c) throw new ErrorBiblioteca("Esa categoría no existe.");
    const limpio = NombreCategoria.parse(nombre);
    if (b.categorias.some((x) => x.id !== id && x.nombre.toLowerCase() === limpio.toLowerCase())) throw new ErrorBiblioteca(`Ya existe la categoría «${limpio}».`);
    c.nombre = limpio;
    return c;
  });

/** Borra una categoría: sus archivos se mueven a otra (`moverA`) o se borran de la biblioteca. */
export const borrarCategoria = (id: string, moverA: string | null) =>
  modificar(async (b) => {
    if (!b.categorias.some((c) => c.id === id)) throw new ErrorBiblioteca("Esa categoría no existe.");
    if (moverA && (moverA === id || !b.categorias.some((c) => c.id === moverA))) throw new ErrorBiblioteca("Elegí otra categoría existente para mover los archivos.");
    const suyos = b.recursos.filter((r) => r.categoria === id);
    if (moverA) for (const r of suyos) r.categoria = moverA;
    else {
      for (const r of suyos) await borrarArchivos(r);
      b.recursos = b.recursos.filter((r) => r.categoria !== id);
    }
    b.categorias = b.categorias.filter((c) => c.id !== id);
    return { movidos: moverA ? suyos.length : 0, borrados: moverA ? 0 : suyos.length };
  });

// ---------- recursos ----------

const borrarArchivos = async (r: Recurso) => {
  await rm(rutaRecurso(r), { force: true });
  await rm(path.join(DIR_MINIATURAS, `${r.id}.jpg`), { force: true });
  await rm(path.join(DIR_FOTOGRAMAS, `${r.id}.jpg`), { force: true });
};

export const CambioRecursoSchema = z
  .object({
    nombre: z.string().trim().min(1).max(160),
    categoria: z.string(),
    descripcion: z.string().max(600),
    etiquetas: EtiquetasClipSchema,
    usos: z.array(z.string().trim().min(1).max(160)).max(8),
    semantica: z.array(z.string().trim().min(1).max(40)).max(12),
    tono: z.string().max(80),
    transcripcion: z.string().max(1000).nullable(),
    mood: z.enum(IDS_MOODS).nullable(),
    tipo: z.enum(["musica", "sfx"]),
  })
  .partial();

/** Renombrar, mover de categoría, editar la descripción o las etiquetas (a mano: no se pisan después). */
export const editarRecurso = (id: string, cambio: z.infer<typeof CambioRecursoSchema>) =>
  modificar((b) => {
    const r = b.recursos.find((x) => x.id === id);
    if (!r) throw new ErrorBiblioteca("Ese archivo ya no está en la biblioteca.");
    if (cambio.categoria !== undefined && !b.categorias.some((c) => c.id === cambio.categoria)) throw new ErrorBiblioteca("Esa categoría no existe.");
    if (cambio.tipo && r.tipo === "video") throw new ErrorBiblioteca("Un clip de video no puede pasar a ser audio.");
    const { descripcion, etiquetas, usos, semantica, tono, transcripcion, ...resto } = cambio;
    Object.assign(r, resto);
    // lo que corregís a mano queda marcado: el análisis con Claude ya no lo pisa
    const manual = { descripcion, etiquetas, usos, semantica, tono, transcripcion };
    const cambiados = Object.fromEntries(Object.entries(manual).filter(([, v]) => v !== undefined));
    if (Object.keys(cambiados).length) Object.assign(r, cambiados, { descripcionPor: "manual" as const });
    return r;
  });

/** Mueve varios recursos a otra categoría de una vez. */
export const moverRecursos = (ids: string[], categoria: string) =>
  modificar((b) => {
    if (!b.categorias.some((c) => c.id === categoria)) throw new ErrorBiblioteca("Esa categoría no existe.");
    let n = 0;
    for (const r of b.recursos) if (ids.includes(r.id)) (r.categoria = categoria), n++;
    return n;
  });

/** Borra recursos de la biblioteca (la copia de biblioteca/medios; el original de donde se importó no se toca). */
export const borrarRecursos = (ids: string[]) =>
  modificar(async (b) => {
    const borrar = b.recursos.filter((r) => ids.includes(r.id));
    for (const r of borrar) await borrarArchivos(r);
    b.recursos = b.recursos.filter((r) => !ids.includes(r.id));
    return borrar.length;
  });

/** Recursos de un tipo, solo de las categorías elegidas (vacía = todas). */
export const recursosDe = async (tipo: TipoRecurso, categorias: string[] = []) => {
  const b = await leerBiblioteca();
  const existentes = new Set(b.categorias.map((c) => c.id));
  return b.recursos.filter((r) => r.tipo === tipo && existentes.has(r.categoria) && enCategorias(r, categorias) && r.duracion >= (tipo === "video" ? 1 : 0.1));
};

/**
 * Efectos de sonido de la Biblioteca con su nombre: si uno se llama "whoosh", "golpe", "ding", "riser", "pop" o
 * "tic", reemplaza al sintetizado en los videos.
 */
export const efectosDeBiblioteca = async () => (await recursosDe("sfx")).map((r) => ({ ruta: rutaRecurso(r), nombre: r.nombre }));

// ---------- análisis de un archivo ----------

/** Huella del contenido (primer MB + tamaño): el mismo archivo con otro nombre o en otra carpeta es un duplicado. */
export const huellaDe = async (archivo: string, bytes: number) => {
  const f = await open(archivo, "r");
  try {
    const buf = Buffer.alloc(Math.min(bytes, 1024 * 1024));
    await f.read(buf, 0, buf.length, 0);
    return createHash("sha1").update(buf).update(String(bytes)).digest("hex").slice(0, 16);
  } finally {
    await f.close();
  }
};

const sondear = async (archivo: string) => {
  const out = await ejecutar("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height:stream_side_data=rotation:format=duration", "-of", "json", archivo]);
  const j = JSON.parse(out) as { streams: { codec_type: string; width?: number; height?: number; side_data_list?: { rotation?: number }[] }[]; format: { duration?: string } };
  // una portada de álbum (mp3 con imagen) cuenta como video "attached_pic": se ignora si no hay duración de video
  const v = j.streams.find((s) => s.codec_type === "video");
  const girado = Math.abs(v?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? 0) === 90;
  return {
    duracion: Number(j.format.duration ?? 0),
    ancho: (girado ? v?.height : v?.width) ?? 0,
    alto: (girado ? v?.width : v?.height) ?? 0,
    audio: j.streams.some((s) => s.codec_type === "audio"),
  };
};

/** Miniatura (mitad del clip). */
const miniatura = async (archivo: string, id: string, duracion: number) => {
  await mkdir(DIR_MINIATURAS, { recursive: true });
  await ejecutar("ffmpeg", ["-v", "error", "-y", "-ss", Math.max(0, duracion * 0.5).toFixed(2), "-i", archivo, "-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "4", path.join(DIR_MINIATURAS, `${id}.jpg`)]);
};

/** "ElChinoRB2/no contaban con mi astucia.mp4" → nombre y etiquetas que ya sirven para buscar y elegir. */
const datosDelNombre = (nombreArchivo: string, carpetas: string[]) => {
  const nombre = path.basename(nombreArchivo).replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim() || "sin nombre";
  const etiquetas = etiquetasVacias();
  etiquetas.objetos = carpetas.filter(Boolean).slice(-3).map((c) => c.toLowerCase().slice(0, 60));
  return { nombre, etiquetas };
};

/** Ánimo de una pista a partir de su nombre, su carpeta o la categoría (si alguno lo dice); si no, null. */
const PALABRAS_MOOD: Record<Mood, RegExp> = {
  feliz: /feliz|happy|alegre|upbeat/i,
  triste: /triste|sad|melanc/i,
  epica: /[eé]pic|epic|cinemat|heroic/i,
  tension: /tensi[oó]n|tense|suspens|thriller|dark/i,
  misterio: /misterio|myster|curios/i,
  motivacional: /motiva|inspira/i,
  chill: /chill|lofi|lo-fi|relax|calm|ambient/i,
  comica: /c[oó]mic|funny|comedy|chiptune|8.?bit/i,
};
const moodDelTexto = (texto: string): Mood | null => (IDS_MOODS.find((m) => PALABRAS_MOOD[m].test(texto)) ?? null);

// ---------- importar ----------

export type ResultadoImportar = { estado: "importado" | "duplicado" | "no_compatible" | "error"; archivo: string; recurso?: Recurso; duplicadoDe?: string; error?: string };

export type OpcionesImportar = {
  categoria: string;
  /** Para audio: "auto" = efecto si dura menos de 20 s, música si no. */
  tipoAudio?: "auto" | "musica" | "sfx";
  /** Nombre a mostrar (si no, el del archivo) y carpetas de donde vino (se usan como etiquetas). */
  nombre?: string;
  carpetas?: string[];
  origen?: string;
};

/** Copia sin ocupar lugar extra cuando el disco lo permite (btrfs, APFS, XFS); si no, copia normal. */
const copiar = async (desde: string, hasta: string) => {
  await mkdir(path.dirname(hasta), { recursive: true });
  await copyFile(desde, hasta, constants.COPYFILE_FICLONE);
};

/** Importa un archivo a una categoría. Si ya está (misma huella), no lo duplica. */
export const importarArchivo = async (archivo: string, op: OpcionesImportar): Promise<ResultadoImportar> => {
  const base = path.basename(op.nombre ?? archivo);
  const esVideo = EXT_VIDEO.test(archivo);
  if (!esVideo && !EXT_AUDIO.test(archivo)) return { estado: "no_compatible", archivo: base };
  const b = await leerBiblioteca();
  if (!b.categorias.some((c) => c.id === op.categoria)) throw new ErrorBiblioteca("Esa categoría no existe.");
  try {
    const st = await stat(archivo);
    const huella = await huellaDe(archivo, st.size);
    const gemelo = b.recursos.find((r) => r.huella === huella);
    if (gemelo) return { estado: "duplicado", archivo: base, duplicadoDe: gemelo.nombre };
    const s = await sondear(archivo);
    if (!s.duracion) return { estado: "error", archivo: base, error: "no se pudo leer la duración (¿archivo dañado?)" };
    if (esVideo && !s.ancho) return { estado: "error", archivo: base, error: "no tiene imagen de video" };
    const tipo: TipoRecurso = esVideo ? "video" : op.tipoAudio === "musica" || op.tipoAudio === "sfx" ? op.tipoAudio : s.duracion < MAX_SEGUNDOS_SFX ? "sfx" : "musica";
    const id = randomBytes(6).toString("hex");
    const rel = `${tipo}/${id}${path.extname(archivo).toLowerCase()}`;
    const destino = path.join(DIR_MEDIOS, rel);
    await copiar(archivo, destino);
    const { nombre, etiquetas } = datosDelNombre(base, op.carpetas ?? []);
    const nombreCategoria = b.categorias.find((c) => c.id === op.categoria)!.nombre;
    const r: Recurso = {
      id,
      tipo,
      categoria: op.categoria,
      nombre,
      archivo: rel,
      origen: op.origen ?? base,
      duracion: s.duracion,
      ancho: s.ancho,
      alto: s.alto,
      orientacion: esVideo ? orientacionDe(s.ancho, s.alto) : null,
      audio: s.audio,
      transcripcion: null,
      descripcion: "",
      etiquetas,
      descripcionPor: "nombre",
      ...analisisVacio(),
      mood: tipo === "musica" ? (moodDelTexto(`${base} ${(op.carpetas ?? []).join(" ")} ${nombreCategoria}`) ?? "chill") : null,
      bytes: st.size,
      huella,
      importado: new Date().toISOString(),
    };
    try {
      if (esVideo) await miniatura(destino, id, s.duracion);
    } catch {
      // sin miniatura el clip igual sirve
    }
    // otra importación pudo agregar el mismo archivo mientras tanto
    const agregado = await modificar((bb) => {
      const otro = bb.recursos.find((x) => x.huella === huella);
      if (otro) return otro;
      bb.recursos.push(r);
      return null;
    });
    if (agregado) {
      await borrarArchivos(r);
      return { estado: "duplicado", archivo: base, duplicadoDe: agregado.nombre };
    }
    return { estado: "importado", archivo: base, recurso: r };
  } catch (e) {
    return { estado: "error", archivo: base, error: (e as Error).message.split("\n")[0] };
  }
};

/** Archivos compatibles de una carpeta (recursivo, sin ocultos), con sus subcarpetas relativas. */
export const listarCompatibles = async (carpeta: string, rel = ""): Promise<string[]> => {
  const out: string[] = [];
  let entradas;
  try {
    entradas = await readdir(path.join(carpeta, rel), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entradas.sort((a, b) => a.name.localeCompare(b.name, "es"))) {
    if (e.name.startsWith(".") || /^(node_modules|__pycache__|\.?venv)$/.test(e.name)) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await listarCompatibles(carpeta, r)));
    else if (e.isFile() && (EXT_VIDEO.test(e.name) || EXT_AUDIO.test(e.name))) out.push(r);
  }
  return out;
};

export type EstadoImportacion = {
  activa: boolean;
  carpeta: string | null;
  categoria: string | null;
  hechos: number;
  total: number;
  importados: number;
  duplicados: number;
  errores: { archivo: string; error: string }[];
  actual: string | null;
  cancelar: boolean;
};
export const importacion: EstadoImportacion = { activa: false, carpeta: null, categoria: null, hechos: 0, total: 0, importados: 0, duplicados: 0, errores: [], actual: null, cancelar: false };

/** Importa una carpeta entera en segundo plano (se sigue el progreso con `importacion`). */
export const importarCarpeta = async (carpeta: string, op: Omit<OpcionesImportar, "nombre" | "carpetas" | "origen">) => {
  if (importacion.activa) throw new ErrorBiblioteca("Ya estoy importando otra carpeta: esperá a que termine.");
  const abs = path.resolve(carpeta.replace(/^~(?=$|\/)/, process.env.HOME ?? "~"));
  if (!existsSync(abs) || !(await stat(abs)).isDirectory()) throw new ErrorBiblioteca(`No encuentro la carpeta ${abs}.`);
  if (abs.startsWith(path.resolve(DIR_BIBLIOTECA))) throw new ErrorBiblioteca("Esa carpeta es la biblioteca misma.");
  const b = await leerBiblioteca();
  if (!b.categorias.some((c) => c.id === op.categoria)) throw new ErrorBiblioteca("Esa categoría no existe.");
  const archivos = await listarCompatibles(abs);
  if (!archivos.length) throw new ErrorBiblioteca("Esa carpeta no tiene videos ni audios compatibles.");
  Object.assign(importacion, { activa: true, carpeta: abs, categoria: op.categoria, hechos: 0, total: archivos.length, importados: 0, duplicados: 0, errores: [], actual: null, cancelar: false });
  const correr = async () => {
    try {
      for (const rel of archivos) {
        if (importacion.cancelar) break;
        importacion.actual = rel;
        const r = await importarArchivo(path.join(abs, rel), { ...op, carpetas: [path.basename(abs), ...rel.split("/").slice(0, -1)], origen: `${path.basename(abs)}/${rel}` });
        if (r.estado === "importado") importacion.importados++;
        else if (r.estado === "duplicado") importacion.duplicados++;
        else if (r.estado === "error") importacion.errores.push({ archivo: rel, error: r.error ?? "error" });
        importacion.hechos++;
      }
    } finally {
      importacion.activa = false;
      importacion.actual = null;
    }
  };
  void correr();
  return importacion;
};

/** Guarda un archivo subido desde el navegador (ya escrito en un temporal) y lo importa. */
export const importarSubida = async (tmp: string, nombre: string, op: OpcionesImportar) => {
  try {
    return await importarArchivo(tmp, { ...op, nombre, origen: nombre });
  } finally {
    await rm(tmp, { force: true });
  }
};
export const temporalSubida = async (nombre: string) => {
  await mkdir(DIR_TMP, { recursive: true });
  return path.join(DIR_TMP, `${randomBytes(6).toString("hex")}${path.extname(nombre).toLowerCase()}`);
};

// ---------- migración de "Mis clips" (v5–v7) ----------

const CatalogoViejoSchema = z.object({
  carpeta: z.string(),
  clips: z.array(
    z
      .object({
        id: z.string(),
        ruta: z.string(),
        nombre: z.string(),
        duracion: z.number(),
        ancho: z.number(),
        alto: z.number(),
        audio: z.boolean(),
        transcripcion: z.string().nullable().default(null),
        descripcion: z.string().default(""),
        etiquetas: EtiquetasClipSchema.prefault({}),
        descripcionPor: z.enum(["claude", "manual", "ninguna"]).default("ninguna"),
        duplicadoDe: z.string().nullable().default(null),
        bytes: z.number(),
        huella: z.string(),
      })
      .passthrough(),
  ),
});

/**
 * Los clips que ya estaban catalogados en "Mis clips" pasan a la biblioteca con el MISMO id (los trabajos viejos
 * los siguen encontrando) y con sus descripciones. Se copian (la carpeta original no se toca).
 */
const migrarMisClips = async (categoria: string): Promise<Recurso[]> => {
  const archivo = path.join(DIR_CLIPS_VIEJO, "catalogo.json");
  if (!existsSync(archivo)) return [];
  const r = CatalogoViejoSchema.safeParse(JSON.parse(await readFile(archivo, "utf8")));
  if (!r.success) return [];
  const out: Recurso[] = [];
  for (const c of r.data.clips) {
    if (c.duplicadoDe || out.some((x) => x.huella === c.huella)) continue;
    const origen = path.join(r.data.carpeta, c.ruta);
    if (!existsSync(origen)) continue;
    const rel = `video/${c.id}${path.extname(c.ruta).toLowerCase()}`;
    try {
      await copiar(origen, path.join(DIR_MEDIOS, rel));
      const mini = path.join(DIR_CLIPS_VIEJO, "miniaturas", `${c.id}.jpg`);
      await mkdir(DIR_MINIATURAS, { recursive: true });
      if (existsSync(mini)) await copyFile(mini, path.join(DIR_MINIATURAS, `${c.id}.jpg`));
      else await miniatura(path.join(DIR_MEDIOS, rel), c.id, c.duracion);
    } catch {
      continue;
    }
    out.push({
      id: c.id,
      tipo: "video",
      categoria,
      nombre: c.nombre,
      archivo: rel,
      origen: c.ruta,
      duracion: c.duracion,
      ancho: c.ancho,
      alto: c.alto,
      orientacion: orientacionDe(c.ancho, c.alto),
      audio: c.audio,
      transcripcion: c.transcripcion,
      descripcion: c.descripcion,
      etiquetas: c.etiquetas,
      descripcionPor: c.descripcionPor === "ninguna" ? "nombre" : c.descripcionPor,
      ...analisisVacio(),
      mood: null,
      bytes: c.bytes,
      huella: c.huella,
      importado: new Date().toISOString(),
    });
  }
  return out;
};

/** Para los tests: olvida el índice en memoria. */
export const _reiniciarCache = () => {
  cache = null;
};
