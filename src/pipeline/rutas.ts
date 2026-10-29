import path from "node:path";
import { fileURLToPath } from "node:url";

/** Carpeta raíz del proyecto (funciona igual en Mac, Windows y Linux). */
export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
/** FABRICA_JOBS solo para pruebas: así los tests nunca tocan los trabajos reales. */
export const DIR_JOBS = process.env.FABRICA_JOBS ?? path.join(RAIZ, "jobs");
export const DIR_CONFIG = path.join(RAIZ, "config");
export const DIR_PROMPTS = path.join(RAIZ, "prompts");
export const DIR_ASSETS = path.join(RAIZ, "assets");
export const ARCHIVO_MARCA = path.join(DIR_CONFIG, "marca.json");

const enWindows = process.platform === "win32";
export const PYTHON_VENV = enWindows
  ? path.join(RAIZ, ".venv", "Scripts", "python.exe")
  : path.join(RAIZ, ".venv", "bin", "python");
