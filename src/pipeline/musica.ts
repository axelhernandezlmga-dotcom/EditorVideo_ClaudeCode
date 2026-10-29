import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { CatalogoMusicaSchema, deFuente, elegirPista, esDeBiblioteca, PREFIJO_BIBLIOTECA, type Pista } from "../shared/musica";
import { DIR_MEDIOS, leerBiblioteca, recursosDe } from "./biblioteca";
import { leerMarca } from "./config";
import { IDS_MOODS, type Mood } from "../shared/opcionesCrudo";
import { DIR_ASSETS, RAIZ } from "./rutas";
import { escribirAtomico, type Trabajo } from "./trabajo";

export const DIR_MUSICA = path.join(DIR_ASSETS, "musica");
/** Últimas pistas usadas (más nueva primero), para no repetir en videos seguidos. (data/ no va a git) */
const ARCHIVO_RECIENTES = process.env.FABRICA_MUSICA_RECIENTES ?? path.join(RAIZ, "data", "musica-recientes.json");
const CUANTAS_RECIENTES = 6;

/** Ruta absoluta de una pista (de assets/musica o de la Biblioteca). */
export const rutaPista = (archivo: string) => (esDeBiblioteca(archivo) ? path.join(DIR_MEDIOS, archivo.slice(PREFIJO_BIBLIOTECA.length)) : path.join(DIR_MUSICA, archivo));

/** La música importada a la Biblioteca, como pistas (con el ánimo que le pusiste). */
const pistasDeBiblioteca = async (): Promise<Pista[]> => {
  const categorias = new Map((await leerBiblioteca()).categorias.map((c) => [c.id, c.nombre]));
  return (await recursosDe("musica")).map((r) => ({
    archivo: `${PREFIJO_BIBLIOTECA}${r.archivo}`,
    mood: r.mood ?? "chill",
    bpm: 0,
    energia: 0.5,
    duracion: r.duracion,
    tonalidad: "",
    zip: "Biblioteca",
    original: r.nombre,
    licencia: "importada por vos",
    autor: "",
    categoria: categorias.get(r.categoria),
  }));
};

/** Todas las pistas: las incluidas (assets/musica) y las de la Biblioteca. */
export const leerCatalogoMusica = async (): Promise<Pista[]> => {
  const f = path.join(DIR_MUSICA, "catalogo.json");
  const incluidas = existsSync(f) ? CatalogoMusicaSchema.safeParse(JSON.parse(await readFile(f, "utf8"))) : null;
  return [...(incluidas?.success ? incluidas.data.pistas.filter((p) => existsSync(path.join(DIR_MUSICA, p.archivo))) : []), ...(await pistasDeBiblioteca().catch(() => []))];
};

const leerRecientes = async (): Promise<string[]> => {
  try {
    return z.array(z.string()).parse(JSON.parse(await readFile(ARCHIVO_RECIENTES, "utf8")));
  } catch {
    return [];
  }
};

const anotarReciente = async (archivo: string) => {
  const r = [archivo, ...(await leerRecientes()).filter((x) => x !== archivo)].slice(0, CUANTAS_RECIENTES);
  await mkdir(path.dirname(ARCHIVO_RECIENTES), { recursive: true });
  await escribirAtomico(ARCHIVO_RECIENTES, `${JSON.stringify(r)}\n`);
};

/** musica.json de un trabajo: qué pista suena, por qué, y a qué volumen. */
export const MusicaTrabajoSchema = z.object({
  activa: z.boolean(),
  mood: z.enum(IDS_MOODS),
  /** Por qué ese mood (lo dice Claude, o "elegido a mano"). */
  motivo: z.string(),
  /** Pista del catálogo (relativa a assets/musica) y su copia dentro del trabajo. */
  pista: z.string().nullable(),
  archivo: z.string().nullable(),
  bpm: z.number().default(0),
  volumen: z.number().min(0).max(0.3),
});
export type MusicaTrabajo = z.infer<typeof MusicaTrabajoSchema>;

/**
 * Elige una pista del mood (sin repetir las últimas usadas, o la pedida) y la copia al trabajo como
 * audio/musica.<ext>. Respeta de dónde querés la música (Configuración) y prefiere pistas que duren lo que el
 * video (`duracionS`). Devuelve null si no hay ninguna pista.
 */
export const ponerMusica = async (t: Trabajo, mood: Mood, opciones: { pista?: string; duracionS?: number } = {}): Promise<{ pista: Pista; rel: string } | null> => {
  const catalogo = await leerCatalogoMusica();
  const { fuenteMusica } = await leerMarca();
  const pista =
    (opciones.pista ? catalogo.find((p) => p.archivo === opciones.pista) : null) ?? elegirPista(catalogo.filter((p) => deFuente(p, fuenteMusica)), mood, await leerRecientes(), Math.random, opciones.duracionS ?? 0);
  if (!pista) return null;
  const rel = `audio/musica${path.extname(pista.archivo)}`;
  await mkdir(t.ruta("audio"), { recursive: true });
  await copyFile(rutaPista(pista.archivo), t.ruta(rel));
  await anotarReciente(pista.archivo);
  return { pista, rel };
};
