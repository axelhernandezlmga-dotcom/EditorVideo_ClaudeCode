import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { tieneAudioUtil, type Recurso } from "../shared/biblioteca";
import { candidatosParaVideo, enTramos } from "../shared/busqueda";
import { FRECUENCIAS_CLIPS, type UsoBiblioteca } from "../shared/opcionesCrudo";
import { leerBiblioteca, recursosDe } from "./biblioteca";
import { RAIZ } from "./rutas";
import { escribirAtomico } from "./trabajo";

/**
 * Lo que comparten los crudos y los animados para elegir clips de la Biblioteca: candidatos por contexto (búsqueda
 * semántica local, solo de las categorías elegidas y sin repetir los de videos recientes), las reglas para Claude
 * y la decisión final de si el clip suena con su audio original.
 */

const ARCHIVO_RECIENTES = () => process.env.FABRICA_CLIPS_RECIENTES ?? path.join(RAIZ, "data", "clips-recientes.json");
const CUANTOS_RECIENTES = 40;

export const leerRecientes = async (): Promise<string[]> => {
  try {
    return z.array(z.string()).parse(JSON.parse(await readFile(ARCHIVO_RECIENTES(), "utf8")));
  } catch {
    return [];
  }
};

/** Anota los clips usados en un video (para no repetir los mismos memes en los videos siguientes). */
export const anotarRecientes = async (ids: string[]) => {
  if (!ids.length) return;
  const todos = [...ids, ...(await leerRecientes()).filter((x) => !ids.includes(x))].slice(0, CUANTOS_RECIENTES);
  await mkdir(path.dirname(ARCHIVO_RECIENTES()), { recursive: true });
  await escribirAtomico(ARCHIVO_RECIENTES(), `${JSON.stringify(todos)}\n`);
};

/** Candidatos para un video: los elegidos a mano, o los que mejor encajan con cada tramo de lo que se dice. */
export const candidatosDelVideo = async (uso: UsoBiblioteca, texto: string, max = 60): Promise<Recurso[]> => {
  if (uso.modo === "no") return [];
  const todos = await recursosDe("video", uso.modo === "manual" ? [] : uso.categorias);
  if (uso.modo === "manual") return todos.filter((c) => uso.elegidos.includes(c.id));
  return candidatosParaVideo(todos, enTramos(texto), { max, recientes: await leerRecientes() });
};

/** Una ficha por clip para el prompt: lo que es, para qué sirve, qué dice y si tiene audio que valga la pena. */
export const fichaClip = (c: Recurso, categorias: Map<string, string>) =>
  [
    `- id ${c.id} · ${c.duracion.toFixed(1)} s · [${categorias.get(c.categoria) ?? c.categoria}] ${c.nombre}`,
    c.descripcion ? `  qué pasa: ${c.descripcion}` : "",
    c.usos.length ? `  sirve para: ${c.usos.join("; ")}` : "",
    c.tono || c.humor ? `  tono: ${[c.tono, c.humor].filter(Boolean).join(" — ")}` : "",
    Object.values(c.etiquetas).flat().length || c.semantica.length ? `  etiquetas: ${[...c.semantica, ...Object.values(c.etiquetas).flat()].join(", ")}` : "",
    c.transcripcion ? `  dice: "${c.transcripcion.slice(0, 200)}"` : "",
    `  audio: ${tieneAudioUtil(c) ? (c.audioClave ? "sí, y es parte de la gracia" : "sí") : "no"}`,
  ]
    .filter(Boolean)
    .join("\n");

export const fichasClips = async (clips: Recurso[]) => {
  const nombres = new Map((await leerBiblioteca()).categorias.map((c) => [c.id, c.nombre]));
  return clips.map((c) => fichaClip(c, nombres)).join("\n");
};

/** Reglas comunes de selección (contexto, humor, frecuencia y audio) para el prompt. */
export const reglasClips = (uso: UsoBiblioteca, maximo: number) =>
  [
    "Cómo elegir:",
    "- Por el SIGNIFICADO, no por palabras sueltas: el clip tiene que encajar con lo que se dice en ese momento (el tema, la situación, la emoción o el remate). Usá «sirve para», «qué pasa» y «dice».",
    "- Un meme o reacción solo cuando remata con gracia algo que se acaba de decir y el tono del video lo permite; nunca en un momento serio (una tragedia, una víctima, un dato delicado).",
    `- Frecuencia ${FRECUENCIAS_CLIPS[uso.frecuencia].nombre.toLowerCase()}: como mucho ${maximo} clip(s) en todo el video, bien repartidos. No hay mínimo: si ninguno encaja de verdad, no pongas ninguno.`,
    "- Nunca el mismo clip dos veces; no pongas dos clips seguidos.",
    uso.audio === "no"
      ? "- Audio: los clips van SIN su audio (con_audio = false)."
      : uso.audio === "si"
        ? "- Audio: los clips que tienen audio van CON su audio original (con_audio = true)."
        : "- Audio (con_audio): true cuando el sonido del clip es parte de lo que lo hace funcionar (una frase, un grito, un efecto, sobre todo si dice «es parte de la gracia») y entra en una pausa o un remate; false si el clip solo ilustra y taparía algo importante de lo que se dice.",
  ].join("\n");

/** ¿Este clip suena con su audio? Respeta la opción del video y que el clip tenga audio que valga la pena. */
export const decidirAudio = (uso: Pick<UsoBiblioteca, "audio">, c: Recurso, pedidoPorClaude: boolean) => (uso.audio === "no" || !tieneAudioUtil(c) ? false : uso.audio === "si" ? true : pedidoPorClaude);
