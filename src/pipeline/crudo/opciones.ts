import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PedidoCrudoSchema, type PedidoCrudo } from "../../shared/opcionesCrudo";
import { RAIZ } from "../rutas";
import { escribirAtomico } from "../trabajo";

/** Últimas opciones usadas al subir un crudo: el formulario arranca con estas. (data/ no va a git) */
const ARCHIVO = process.env.FABRICA_OPCIONES_CRUDO ?? path.join(RAIZ, "data", "opciones-crudo.json");

export const leerUltimasOpciones = async (perfilPorDefecto: string): Promise<PedidoCrudo> => {
  try {
    if (existsSync(ARCHIVO)) return PedidoCrudoSchema.parse(JSON.parse(await readFile(ARCHIVO, "utf8")));
  } catch {
    // archivo viejo o roto: se arranca con los valores por defecto
  }
  return PedidoCrudoSchema.parse({ perfil: perfilPorDefecto || "perfil", crudo: {} });
};

export const guardarUltimasOpciones = async (p: PedidoCrudo) => {
  await mkdir(path.dirname(ARCHIVO), { recursive: true });
  await escribirAtomico(ARCHIVO, `${JSON.stringify(p, null, 2)}\n`);
};
