import { existsSync, readFileSync } from "node:fs";
import { chmod, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { RAIZ } from "./rutas";
import { escribirAtomico } from "./trabajo";

/**
 * Claves de servicios externos. Viven solo en `.env` (que está en .gitignore).
 * Nunca se imprimen: en la terminal y en la app se muestran solo los últimos 4 caracteres.
 */
export const NOMBRES_CLAVES = ["GEMINI_API_KEY", "PIXABAY_API_KEY", "PEXELS_API_KEY"] as const;
export type NombreClave = (typeof NOMBRES_CLAVES)[number];

export const INFO_CLAVES: Record<NombreClave, { servicio: string; para: string; dondeSacarla: string }> = {
  GEMINI_API_KEY: { servicio: "Google Gemini", para: "la voz (Gemini TTS)", dondeSacarla: "https://aistudio.google.com/apikey" },
  PIXABAY_API_KEY: { servicio: "Pixabay", para: "clips y fotos de stock", dondeSacarla: "https://pixabay.com/api/docs/ (logueado, arriba de todo)" },
  PEXELS_API_KEY: { servicio: "Pexels", para: "clips de stock (alternativa)", dondeSacarla: "https://www.pexels.com/api/" },
};

/** Modelo de voz de Gemini (se puede cambiar con GEMINI_TTS_MODELO en .env). */
export const modeloGeminiTts = () => process.env.GEMINI_TTS_MODELO?.trim() || "gemini-3.8-flash-tts";

/** Se puede apuntar a otro archivo (lo usan los tests para no tocar el .env real). */
export const archivoEnv = () => process.env.FABRICA_ENV || path.join(RAIZ, ".env");
const ARCHIVO_ESTADO = () => path.join(path.dirname(archivoEnv()), "data", "claves-estado.json");

const parsearEnv = (texto: string): Record<string, string> => {
  const r: Record<string, string> = {};
  for (const linea of texto.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(linea);
    if (m) r[m[1]!] = m[2]!.replace(/^(['"])(.*)\1$/, "$2");
  }
  return r;
};

/** Lee .env en cada llamada: si cambiás una clave con `npm run claves` con la app abierta, se toma sin reiniciar. */
export const claveDe = (nombre: NombreClave | string): string | null => {
  const archivo = archivoEnv();
  const delArchivo = existsSync(archivo) ? parsearEnv(readFileSync(archivo, "utf8"))[nombre] : undefined;
  return (delArchivo ?? process.env[nombre])?.trim() || null;
};

/** Últimos 4 caracteres (lo único que se muestra de una clave). */
export const finalDe = (clave: string) => clave.slice(-4);

/** Guarda (o borra, con null) una clave en .env sin tocar las otras líneas. El archivo queda legible solo por tu usuario. */
export const guardarClave = async (nombre: NombreClave | string, valor: string | null) => {
  if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(nombre)) throw new Error(`Nombre de variable inválido: ${nombre}`);
  const archivo = archivoEnv();
  const limpio = valor?.trim() || null;
  if (limpio && /[\s"'#]/.test(limpio)) throw new Error("La clave tiene espacios o caracteres raros: copiala de nuevo.");
  const lineas = existsSync(archivo) ? (await readFile(archivo, "utf8")).split(/\r?\n/).filter((l) => l && !l.startsWith(`${nombre}=`)) : [];
  if (limpio) lineas.push(`${nombre}=${limpio}`);
  await mkdir(path.dirname(archivo), { recursive: true });
  await escribirAtomico(archivo, `${lineas.join("\n")}\n`);
  if (process.platform !== "win32") await chmod(archivo, 0o600).catch(() => undefined);
  if (limpio) process.env[nombre] = limpio;
  else delete process.env[nombre];
  if ((NOMBRES_CLAVES as readonly string[]).includes(nombre)) await borrarPrueba(nombre as NombreClave);
};

// ---------- validación con un pedido mínimo real ----------

export type ResultadoPrueba = { ok: boolean; motivo: string; final: string; fecha: string };

const conTiempo = (ms: number) => AbortSignal.timeout(ms);

/** Mensaje de error de Google: viene como objeto o como lista de un objeto. */
const errorGoogle = (cuerpo: unknown): { status?: string; reason?: string; message?: string } => {
  const e = (Array.isArray(cuerpo) ? cuerpo[0] : cuerpo) as { error?: { status?: string; message?: string; details?: { reason?: string }[] } } | undefined;
  return { status: e?.error?.status, message: e?.error?.message, reason: e?.error?.details?.find((d) => d.reason)?.reason };
};

const probarGemini = async (clave: string): Promise<{ ok: boolean; motivo: string }> => {
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    // la clave va en el header, nunca en la URL
    headers: { "x-goog-api-key": clave, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modeloGeminiTts(),
      input: [{ type: "user_input", content: [{ type: "text", text: "Hola." }] }],
      response_format: { type: "audio" },
      generation_config: { speech_config: [{ voice: "Puck" }] },
    }),
    signal: conTiempo(60_000),
  });
  const cuerpo = (await r.json().catch(() => null)) as unknown;
  if (r.ok) {
    const pasos = (cuerpo as { steps?: { content?: { type: string; data?: string }[] }[] } | null)?.steps ?? [];
    const audio = pasos.flatMap((p) => p.content ?? []).find((c) => c.type === "audio" && c.data);
    return audio ? { ok: true, motivo: `Funciona: generó audio con ${modeloGeminiTts()}.` } : { ok: false, motivo: "Google respondió, pero sin audio. Avisame para revisar el modelo de voz." };
  }
  const e = errorGoogle(cuerpo);
  if (e.reason === "API_KEY_INVALID") return { ok: false, motivo: "La clave no es válida. Copiala de nuevo desde Google AI Studio." };
  if (r.status === 403) return { ok: false, motivo: "La clave existe pero no tiene permiso para la API de Gemini (revisá el proyecto en AI Studio)." };
  if (r.status === 429 || e.status === "RESOURCE_EXHAUSTED") return { ok: true, motivo: "La clave es válida, pero ya llegaste al límite gratis de hoy (se reinicia a la medianoche del Pacífico)." };
  if (r.status === 404) return { ok: false, motivo: `El modelo ${modeloGeminiTts()} no existe o no está disponible para tu clave.` };
  return { ok: false, motivo: `Google respondió ${r.status}: ${e.message ?? "error desconocido"}` };
};

const probarPixabay = async (clave: string): Promise<{ ok: boolean; motivo: string }> => {
  // Pixabay solo acepta la clave en la URL: la URL no se loguea nunca
  const r = await fetch(`https://pixabay.com/api/?key=${encodeURIComponent(clave)}&q=uruguay&per_page=3`, { signal: conTiempo(20_000) });
  if (r.ok) {
    const datos = (await r.json().catch(() => null)) as { totalHits?: number } | null;
    return typeof datos?.totalHits === "number" ? { ok: true, motivo: `Funciona: la búsqueda de prueba encontró ${datos.totalHits} imágenes.` } : { ok: false, motivo: "Pixabay respondió algo inesperado." };
  }
  if (r.status === 400) return { ok: false, motivo: "La clave no es válida. Copiala de nuevo desde pixabay.com/api/docs." };
  if (r.status === 429) return { ok: true, motivo: "La clave es válida, pero Pixabay pide esperar (demasiados pedidos seguidos)." };
  return { ok: false, motivo: `Pixabay respondió ${r.status}.` };
};

const probarPexels = async (clave: string): Promise<{ ok: boolean; motivo: string }> => {
  const r = await fetch("https://api.pexels.com/videos/search?query=city&per_page=1", { headers: { Authorization: clave }, signal: conTiempo(20_000) });
  if (r.ok) return { ok: true, motivo: "Funciona: la búsqueda de prueba respondió bien." };
  if (r.status === 401 || r.status === 403) return { ok: false, motivo: "La clave no es válida. Copiala de nuevo desde pexels.com/api." };
  return { ok: false, motivo: `Pexels respondió ${r.status}.` };
};

const PROBADORES: Record<NombreClave, (c: string) => Promise<{ ok: boolean; motivo: string }>> = {
  GEMINI_API_KEY: probarGemini,
  PIXABAY_API_KEY: probarPixabay,
  PEXELS_API_KEY: probarPexels,
};

/** Prueba una clave (la guardada, o `valor` antes de guardarla) y recuerda el resultado (sin la clave). */
export const probarClave = async (nombre: NombreClave, valor?: string): Promise<ResultadoPrueba | null> => {
  const clave = valor?.trim() || claveDe(nombre);
  if (!clave) return null;
  let r: { ok: boolean; motivo: string };
  try {
    r = await PROBADORES[nombre](clave);
  } catch (e) {
    const err = e as Error;
    r = { ok: false, motivo: err.name === "TimeoutError" ? "No respondió a tiempo. ¿Hay internet?" : `No me pude conectar (${err.message}). ¿Hay internet?` };
  }
  const resultado: ResultadoPrueba = { ...r, final: finalDe(clave), fecha: new Date().toISOString() };
  if (!valor) await recordarPrueba(nombre, resultado);
  return resultado;
};

// ---------- último resultado (sin la clave: solo ok, motivo y los últimos 4) ----------

type EstadoPruebas = Partial<Record<NombreClave, ResultadoPrueba>>;

const leerPruebas = async (): Promise<EstadoPruebas> => {
  try {
    return JSON.parse(await readFile(ARCHIVO_ESTADO(), "utf8")) as EstadoPruebas;
  } catch {
    return {};
  }
};

export const recordarPrueba = async (nombre: NombreClave, r: ResultadoPrueba) => {
  const todas = await leerPruebas();
  todas[nombre] = r;
  await mkdir(path.dirname(ARCHIVO_ESTADO()), { recursive: true });
  await escribirAtomico(ARCHIVO_ESTADO(), `${JSON.stringify(todas, null, 2)}\n`);
};

const borrarPrueba = async (nombre: NombreClave) => {
  const todas = await leerPruebas();
  if (!(nombre in todas)) return;
  delete todas[nombre];
  await escribirAtomico(ARCHIVO_ESTADO(), `${JSON.stringify(todas, null, 2)}\n`);
};

export type EstadoClave = {
  nombre: NombreClave;
  servicio: string;
  para: string;
  dondeSacarla: string;
  configurada: boolean;
  final?: string;
  /** Resultado de la última prueba, si es de la clave actual. */
  prueba?: Omit<ResultadoPrueba, "final">;
};

export const estadoClaves = async (): Promise<EstadoClave[]> => {
  const pruebas = await leerPruebas();
  return NOMBRES_CLAVES.map((nombre) => {
    const clave = claveDe(nombre);
    const p = pruebas[nombre];
    return {
      nombre,
      ...INFO_CLAVES[nombre],
      configurada: Boolean(clave),
      final: clave ? finalDe(clave) : undefined,
      prueba: clave && p && p.final === finalDe(clave) ? { ok: p.ok, motivo: p.motivo, fecha: p.fecha } : undefined,
    };
  });
};
