import type { PedidoCrudo } from "../../shared/opcionesCrudo";
import type { IdModeloTranscripcion } from "../../shared/transcripcion";
import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { z } from "zod";
import { DIR_JOBS } from "../rutas";
import { fijarPerfil, leerPerfil } from "../perfiles";
import { Trabajo } from "../trabajo";

/** Tamaño de cada parte: chico para que un corte de Wi-Fi solo obligue a reenviar 8 MB. */
export const TAM_PARTE = 8 * 1024 * 1024;
export const MAX_BYTES = 8 * 1024 ** 3;
export const EXTENSIONES = [".mp4", ".mov", ".m4v"] as const;

const DIR_SUBIDAS = path.join(DIR_JOBS, ".subidas");

const MetaSchema = z.object({ nombre: z.string(), bytes: z.number().int().positive(), partes: z.number().int().positive(), creado: z.string() });

export class ErrorSubida extends Error {}

const dirSubida = (id: string) => {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new ErrorSubida("Subida inválida.");
  return path.join(DIR_SUBIDAS, id);
};

const leerMeta = async (id: string) => {
  const archivo = path.join(dirSubida(id), "meta.json");
  if (!existsSync(archivo)) throw new ErrorSubida("Esa subida no existe o ya terminó.");
  return MetaSchema.parse(JSON.parse(await readFile(archivo, "utf8")));
};

const nombreParte = (n: number) => `parte-${String(n).padStart(5, "0")}`;

/** Arranca una subida: valida nombre y tamaño y devuelve cuántas partes hay que mandar. */
export const iniciarSubida = async (nombre: string, bytes: number) => {
  const ext = path.extname(nombre).toLowerCase();
  if (!(EXTENSIONES as readonly string[]).includes(ext)) throw new ErrorSubida("Subí un video MP4 o MOV.");
  if (bytes > MAX_BYTES) throw new ErrorSubida("El video pesa más de 8 GB.");
  const id = randomUUID();
  await mkdir(dirSubida(id), { recursive: true });
  const partes = Math.ceil(bytes / TAM_PARTE);
  await writeFile(path.join(dirSubida(id), "meta.json"), JSON.stringify({ nombre, bytes, partes, creado: new Date().toISOString() }));
  return { id, partes, tamParte: TAM_PARTE };
};

/** Guarda una parte (si llega dos veces, la reemplaza: el navegador reintenta las que fallan). */
export const guardarParte = async (id: string, n: number, datos: Readable) => {
  const meta = await leerMeta(id);
  if (!Number.isInteger(n) || n < 0 || n >= meta.partes) throw new ErrorSubida(`Parte ${n} fuera de rango.`);
  const esperado = n === meta.partes - 1 ? meta.bytes - TAM_PARTE * (meta.partes - 1) : TAM_PARTE;
  const destino = path.join(dirSubida(id), nombreParte(n));
  const tmp = `${destino}.tmp`;
  await pipeline(datos, createWriteStream(tmp));
  const { size } = await stat(tmp);
  if (size !== esperado) {
    await rm(tmp, { force: true });
    throw new ErrorSubida(`La parte ${n} llegó incompleta (${size} de ${esperado} bytes). Reintentá.`);
  }
  await rm(destino, { force: true });
  await rename(tmp, destino);
  return { recibida: n };
};

/** Une las partes en `original.<ext>` dentro de un trabajo nuevo de tipo crudo y borra la subida. */
export const completarSubida = async (id: string, pedido?: PedidoCrudo): Promise<Trabajo> => {
  const meta = await leerMeta(id);
  const dir = dirSubida(id);
  const presentes = new Set(await readdir(dir));
  const faltan = Array.from({ length: meta.partes }, (_, n) => n).filter((n) => !presentes.has(nombreParte(n)));
  if (faltan.length) throw new ErrorSubida(`Faltan ${faltan.length} parte(s): ${faltan.slice(0, 5).join(", ")}…`);

  const titulo = path.basename(meta.nombre, path.extname(meta.nombre));
  const t = await Trabajo.crearCrudo(titulo, { archivo: meta.nombre, ...(pedido ? { perfil: pedido.perfil, auto: pedido.auto, crudo: pedido.crudo } : {}) });
  // copia del perfil en el trabajo: si después se borra, el video no se rompe
  const perfil = pedido ? await leerPerfil(pedido.perfil) : null;
  if (perfil) await fijarPerfil(t, perfil);
  const salida = t.ruta(`original${path.extname(meta.nombre).toLowerCase()}`);
  const escritor = createWriteStream(salida);
  for (let n = 0; n < meta.partes; n++) {
    await pipeline(createReadStream(path.join(dir, nombreParte(n))), escritor, { end: false });
  }
  await new Promise<void>((ok, mal) => escritor.end((e?: Error | null) => (e ? mal(e) : ok())));
  const { size } = await stat(salida);
  if (size !== meta.bytes) throw new ErrorSubida(`El archivo armado pesa ${size} bytes y debería pesar ${meta.bytes}.`);
  await rm(dir, { recursive: true, force: true });
  await t.log(`Original guardado (${(size / 1024 ** 2).toFixed(1)} MB).`);
  return t;
};

/** Crea un trabajo de crudo a partir de un archivo que ya está en el disco (CLI y pruebas). */
export const importarArchivo = async (archivo: string, opciones: { modeloWhisper?: IdModeloTranscripcion } = {}): Promise<Trabajo> => {
  const ext = path.extname(archivo).toLowerCase();
  if (!(EXTENSIONES as readonly string[]).includes(ext)) throw new ErrorSubida("El archivo tiene que ser MP4 o MOV.");
  const t = await Trabajo.crearCrudo(path.basename(archivo, ext), { archivo: path.basename(archivo), ...opciones });
  await pipeline(createReadStream(archivo), createWriteStream(t.ruta(`original${ext}`)));
  return t;
};

/** Borra subidas abandonadas hace más de un día. */
export const limpiarSubidasViejas = async () => {
  if (!existsSync(DIR_SUBIDAS)) return;
  for (const id of await readdir(DIR_SUBIDAS)) {
    try {
      const meta = await leerMeta(id);
      if (Date.now() - Date.parse(meta.creado) > 86_400_000) await rm(dirSubida(id), { recursive: true, force: true });
    } catch {
      // carpeta rara: se deja
    }
  }
};
