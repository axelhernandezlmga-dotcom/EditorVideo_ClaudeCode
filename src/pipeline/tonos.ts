import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { migrarTono, TonoSchema, type Marca, type Tono } from "../shared/schemas";
export { aplicarTono, coloresDe, velocidadDe } from "../shared/tonos";
import { DIR_PROMPTS } from "./rutas";
import { escribirAtomico } from "./trabajo";

export const DIR_TONOS = path.join(DIR_PROMPTS, "tonos");

const CAMPOS = ["nombre", "descripcion", "velocidad", "acento", "acento2", "animacion", "estiloVoz", "incluye"] as const;

/**
 * Un tono es un .md con un frontmatter simple (`clave: valor`) y las instrucciones para el guionista:
 *
 *   ---
 *   nombre: Académico
 *   velocidad: +0%
 *   animacion: tranquila
 *   incluye: otro-tono, otro-mas
 *   ---
 *   (instrucciones)
 */
export const parsearTono = (id: string, md: string): Tono => {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(md);
  const datos: Record<string, string> = {};
  for (const linea of (m?.[1] ?? "").split(/\r?\n/)) {
    const i = linea.indexOf(":");
    if (i > 0) datos[linea.slice(0, i).trim()] = linea.slice(i + 1).trim();
  }
  const vacio = (v?: string) => (v ? v : undefined);
  return TonoSchema.parse({
    id,
    nombre: datos.nombre || id,
    descripcion: datos.descripcion ?? "",
    velocidad: vacio(datos.velocidad),
    acento: vacio(datos.acento),
    acento2: vacio(datos.acento2),
    animacion: vacio(datos.animacion),
    estiloVoz: vacio(datos.estiloVoz),
    incluye: (datos.incluye ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    instrucciones: (m ? m[2] : md) ?? "",
  });
};

export const serializarTono = (t: Tono) => {
  const valor = (v: Tono[(typeof CAMPOS)[number]]) => (Array.isArray(v) ? v.join(", ") : String(v ?? "").replace(/\r?\n/g, " "));
  const lineas = CAMPOS.filter((k) => valor(t[k]) !== "").map((k) => `${k}: ${valor(t[k])}`);
  return `---\n${lineas.join("\n")}\n---\n\n${t.instrucciones.trim()}\n`;
};

export const listarTonos = async (): Promise<Tono[]> => {
  if (!existsSync(DIR_TONOS)) return [];
  const archivos = (await readdir(DIR_TONOS)).filter((a) => a.endsWith(".md")).sort();
  const tonos: Tono[] = [];
  for (const a of archivos) {
    try {
      tonos.push(parsearTono(a.slice(0, -3), await readFile(path.join(DIR_TONOS, a), "utf8")));
    } catch {
      // archivo mal formado: no se lista
    }
  }
  return tonos;
};

export const leerTono = async (id: string): Promise<Tono> => {
  const archivo = path.join(DIR_TONOS, `${id}.md`);
  if (!/^[a-z0-9-]+$/.test(id) || !existsSync(archivo)) throw new Error(`No existe el tono "${id}" (prompts/tonos/${id}.md).`);
  return parsearTono(id, await readFile(archivo, "utf8"));
};

export const guardarTono = async (t: Tono): Promise<Tono> => {
  const tono = TonoSchema.parse(t);
  await mkdir(DIR_TONOS, { recursive: true });
  await escribirAtomico(path.join(DIR_TONOS, `${tono.id}.md`), serializarTono(tono));
  return tono;
};

/**
 * Bloque que se suma al prompt del guionista. Las reglas base van acá (no en el archivo del tono)
 * para que un tono editado o nuevo no pueda saltearlas.
 */
export const bloqueTono = (tono: Tono, marca: Marca, incluidos: Tono[] = []) =>
  [
    `## Tono del video: ${tono.nombre}`,
    "",
    "Este tono cambia la FORMA, no el fondo. En todos los tonos se mantiene sin excepción:",
    "- datos verificados con fuentes reales (todas en `fuentes`, con su URL),",
    "- neutralidad política (nada de opiniones propias ni ataques a partidos, políticos o instituciones),",
    "- gancho en los primeros 2 segundos (la primera escena),",
    "- el límite de palabras de narración.",
    ...(marca.publicacionSinPuteadas ? ["- `texto_publicacion` y `titulo_portada` van SIN malas palabras (aunque la narración las tenga)."] : []),
    "Si algo de este tono choca con esas reglas, ganan las reglas.",
    "",
    tono.instrucciones.trim(),
    ...incluidos.flatMap((t) => ["", `## Reglas de "${t.nombre}" (incluidas en este tono)`, "", t.instrucciones.trim()]),
  ].join("\n");

/** Tono de un trabajo: el elegido al crearlo o el de la configuración (si no existe, se avisa y se sigue sin tono). */
export const tonoDelTrabajo = async (marca: Marca, id: string | undefined, onLog?: (l: string) => void): Promise<Tono | null> => {
  const elegido = migrarTono(id ?? marca.tonoPorDefecto) as string;
  try {
    return await leerTono(elegido);
  } catch (e) {
    onLog?.(`${(e as Error).message} Sigo sin tono.`);
    return null;
  }
};

/**
 * Escribe en la carpeta del trabajo el prompt de sistema = prompts/<base> + el bloque del tono, y devuelve su ruta
 * (para `--append-system-prompt-file`). Así queda registrado con qué instrucciones se escribió el guion.
 */
export const promptConTono = async (dir: string, base: string, tono: Tono | null, marca: Marca, extras: string[] = []): Promise<string> => {
  const archivoBase = path.join(DIR_PROMPTS, base);
  const bloques = extras.filter((x) => x.trim());
  if (!tono && !bloques.length) return archivoBase;
  const incluidos: Tono[] = [];
  // un tono que incluía uno que ya no existe sigue andando con el resto
  for (const id of tono?.incluye.filter((i) => i !== tono.id) ?? []) await leerTono(id).then((x) => incluidos.push(x)).catch(() => undefined);
  const salida = path.join(dir, `prompt-${base}`);
  const partes = [(await readFile(archivoBase, "utf8")).trim(), ...(tono ? [bloqueTono(tono, marca, incluidos)] : []), ...bloques.map((b) => b.trim())];
  await writeFile(salida, `${partes.join("\n\n")}\n`, "utf8");
  return salida;
};

/** Instrucciones de un modo de edición (prompts/modos/<id>.md, o <id>.crudo.md para los crudos); "normal" no tiene. */
export const instruccionesModo = async (modo: string | undefined, tipo: "animado" | "crudo" = "animado"): Promise<string> => {
  if (!modo || modo === "normal") return "";
  const archivo = path.join(DIR_PROMPTS, "modos", `${modo}${tipo === "crudo" ? ".crudo" : ""}.md`);
  return existsSync(archivo) ? readFile(archivo, "utf8") : "";
};
