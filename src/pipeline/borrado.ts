import { existsSync } from "node:fs";
import { lstat, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { DIR_JOBS } from "./rutas";
import { Trabajo } from "./trabajo";

/**
 * Cómo se borra un trabajo:
 * - "lista": se oculta de la lista; los archivos quedan y se puede recuperar.
 * - "disco": se borra la carpeta entera de jobs/.
 * - "soloFinal": quedan el video, la portada y las fuentes; se borran proxy, audios y temporales.
 */
export type ModoBorrado = "lista" | "disco" | "soloFinal";

/** Lo que queda con "soloFinal" (estado.json y log.txt para que siga apareciendo en la galería). */
export const ARCHIVOS_FINALES = new Set(["video.mp4", "portada.png", "fuentes.md", "publicacion.txt", "guion.json", "estado.json", "log.txt"]);

/**
 * Carpeta de un trabajo, verificando que esté DENTRO de jobs/: nunca se borra nada fuera de ahí
 * (ni clips, ni música, ni Descargas), aunque el id venga con "..", sea un enlace o la propia carpeta jobs/.
 */
export const carpetaSegura = async (id: string, dirJobs = DIR_JOBS): Promise<string> => {
  if (!/^[\w.-]+$/.test(id) || id === "." || id === ".." || id.startsWith(".")) throw new Error(`Id de trabajo inválido: ${id}`);
  const raiz = path.resolve(dirJobs);
  const dir = path.resolve(raiz, id);
  if (path.dirname(dir) !== raiz) throw new Error(`"${id}" no está dentro de jobs/.`);
  if (!existsSync(dir)) throw new Error(`No existe el trabajo ${id}`);
  // un enlace simbólico podría apuntar afuera de jobs/: no se sigue
  if ((await lstat(dir)).isSymbolicLink()) throw new Error(`"${id}" es un enlace: no lo borro.`);
  return dir;
};

/** Bytes que ocupa una carpeta (sin seguir enlaces). */
export const tamano = async (dir: string): Promise<number> => {
  let total = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) total += await tamano(ruta);
    else if (e.isFile()) total += (await lstat(ruta)).size;
  }
  return total;
};

/** Cuánto ocupa un trabajo y cuánto se liberaría con cada modo de borrado. */
export const espacioTrabajo = async (id: string, dirJobs = DIR_JOBS) => {
  const dir = await carpetaSegura(id, dirJobs);
  const total = await tamano(dir);
  let finales = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isFile() && ARCHIVOS_FINALES.has(e.name)) finales += (await lstat(path.join(dir, e.name))).size;
  }
  return { total, liberaDisco: total, liberaSoloFinal: total - finales };
};

/** Espacio total de jobs/ (incluye subidas a medias). */
export const espacioJobs = async (dirJobs = DIR_JOBS) => (existsSync(dirJobs) ? tamano(dirJobs) : 0);

/** Borra (o vacía) un trabajo según el modo. Devuelve los bytes liberados. */
export const borrarTrabajo = async (id: string, modo: ModoBorrado, dirJobs = DIR_JOBS): Promise<number> => {
  const dir = await carpetaSegura(id, dirJobs);
  if (modo === "disco") {
    const bytes = await tamano(dir);
    await rm(dir, { recursive: true, force: true });
    return bytes;
  }
  const t = await Trabajo.abrir(id);
  if (modo === "lista") {
    await t.actualizar((e) => {
      e.oculto = true;
    });
    return 0;
  }
  let bytes = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (ARCHIVOS_FINALES.has(e.name) && e.isFile()) continue;
    const ruta = path.join(dir, e.name);
    bytes += e.isDirectory() ? await tamano(ruta) : (await lstat(ruta)).size;
    await rm(ruta, { recursive: true, force: true });
  }
  await t.actualizar((e) => {
    e.soloFinal = true;
  });
  await t.log("Se borraron los temporales: quedan el video final, la portada y las fuentes.");
  return bytes;
};

/** Vuelve a mostrar trabajos ocultos con "Quitar de la lista". */
export const recuperarTrabajo = async (id: string) => {
  const t = await Trabajo.abrir(id);
  await t.actualizar((e) => {
    e.oculto = undefined;
  });
};
