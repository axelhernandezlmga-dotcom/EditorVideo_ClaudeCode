import { randomBytes } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { archivoEnv, claveDe, finalDe, guardarClave, probarClave, type NombreClave, type ResultadoPrueba } from "./claves";
import { escribirAtomico } from "./trabajo";

/**
 * API keys de cualquier servicio (Configuración → API Keys). La clave vive SOLO en .env (fuera de git, permisos
 * 600), en una variable propia; lo que no es secreto (nombre, servicio, URL base, parámetros) va en
 * data/credenciales.json. Guardar la clave de un servicio nuevo NO hace que la app lo use: para eso hace falta
 * una integración en el código. Las que la app ya usa son las de INTEGRACIONES.
 */

/** Servicios conocidos: con integración (la app los usa) o solo con prueba de conexión. */
export const SERVICIOS = [
  { id: "gemini", nombre: "Google Gemini", integrada: "GEMINI_API_KEY", uso: "Voz principal (Gemini TTS)" },
  { id: "pixabay", nombre: "Pixabay", integrada: "PIXABAY_API_KEY", uso: "Fotos de stock para conceptos" },
  { id: "pexels", nombre: "Pexels", integrada: "PEXELS_API_KEY", uso: "Clips de stock" },
  { id: "openai", nombre: "OpenAI", integrada: null, uso: null },
  { id: "anthropic", nombre: "Anthropic (API)", integrada: null, uso: null },
  { id: "elevenlabs", nombre: "ElevenLabs", integrada: null, uso: null },
  { id: "openai-compatible", nombre: "Compatible con OpenAI (URL base propia)", integrada: null, uso: null },
  { id: "otro", nombre: "Otro servicio", integrada: null, uso: null },
] as const satisfies readonly { id: string; nombre: string; integrada: NombreClave | null; uso: string | null }[];
export type IdServicio = (typeof SERVICIOS)[number]["id"];
const IDS_SERVICIOS = SERVICIOS.map((s) => s.id) as [IdServicio, ...IdServicio[]];

export const CredencialSchema = z.object({
  id: z.string().regex(/^[a-z0-9]{8}$/),
  nombre: z.string().trim().min(1, "Poné un nombre").max(60),
  servicio: z.enum(IDS_SERVICIOS),
  /** Para "otro": cómo se llama el servicio. */
  servicioNombre: z.string().trim().max(60).default(""),
  baseUrl: z.string().trim().url("La URL base no es válida").or(z.literal("")).default(""),
  /** Parámetros extra que no son secretos (modelo, región…). */
  parametros: z.record(z.string().regex(/^[\w.-]{1,40}$/), z.string().max(200)).default({}),
  creada: z.string(),
});
export type Credencial = z.infer<typeof CredencialSchema>;

const ARCHIVO = () => path.join(path.dirname(archivoEnv()), "data", "credenciales.json");
/** Variable de .env donde vive la clave de una credencial propia. */
export const variableDe = (id: string) => `CREDENCIAL_${id.toUpperCase()}`;

const leer = async (): Promise<Credencial[]> => {
  try {
    return z.array(CredencialSchema).parse(JSON.parse(await readFile(ARCHIVO(), "utf8")));
  } catch {
    return [];
  }
};
const guardar = async (lista: Credencial[]) => {
  await mkdir(path.dirname(ARCHIVO()), { recursive: true });
  await escribirAtomico(ARCHIVO(), `${JSON.stringify(lista, null, 2)}\n`);
};

const escribirEnv = guardarClave;

// ---------- pruebas de conexión (sin gastar: solo listan modelos o la cuenta) ----------

const conTiempo = () => AbortSignal.timeout(20_000);
const responder = (r: Response, servicio: string) =>
  r.ok ? { ok: true, motivo: `Funciona: ${servicio} respondió bien.` } : r.status === 401 || r.status === 403 ? { ok: false, motivo: `${servicio} rechazó la clave (${r.status}).` } : { ok: false, motivo: `${servicio} respondió ${r.status}.` };

const PROBADORES: Partial<Record<IdServicio, (clave: string, c: Credencial) => Promise<{ ok: boolean; motivo: string }>>> = {
  openai: async (clave, c) => responder(await fetch(`${(c.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "")}/models`, { headers: { Authorization: `Bearer ${clave}` }, signal: conTiempo() }), "OpenAI"),
  "openai-compatible": async (clave, c) => {
    if (!c.baseUrl) return { ok: false, motivo: "Falta la URL base (ej. https://mi-servidor/v1)." };
    return responder(await fetch(`${c.baseUrl.replace(/\/$/, "")}/models`, { headers: { Authorization: `Bearer ${clave}` }, signal: conTiempo() }), "El servicio");
  },
  anthropic: async (clave) => responder(await fetch("https://api.anthropic.com/v1/models", { headers: { "x-api-key": clave, "anthropic-version": "2023-06-01" }, signal: conTiempo() }), "Anthropic"),
  elevenlabs: async (clave) => responder(await fetch("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": clave }, signal: conTiempo() }), "ElevenLabs"),
};

export const tienePrueba = (s: IdServicio) => Boolean(PROBADORES[s]);

// ---------- estado para la pantalla (nunca la clave entera: solo los últimos 4) ----------

export type EstadoCredencial = Credencial & { configurada: boolean; final?: string; probable: boolean; prueba?: Omit<ResultadoPrueba, "final"> };

const pruebas = new Map<string, ResultadoPrueba>();

export const listarCredenciales = async (): Promise<EstadoCredencial[]> =>
  (await leer()).map((c) => {
    const clave = claveDe(variableDe(c.id));
    const p = pruebas.get(c.id);
    return { ...c, configurada: Boolean(clave), final: clave ? finalDe(clave) : undefined, probable: tienePrueba(c.servicio), prueba: clave && p && p.final === finalDe(clave) ? { ok: p.ok, motivo: p.motivo, fecha: p.fecha } : undefined };
  });

const PedidoSchema = z.object({
  nombre: z.string(),
  servicio: z.enum(IDS_SERVICIOS),
  servicioNombre: z.string().optional(),
  clave: z.string().trim().max(500).optional(),
  baseUrl: z.string().optional(),
  parametros: z.record(z.string(), z.string()).optional(),
});
export type PedidoCredencial = z.infer<typeof PedidoSchema>;

/**
 * Agrega una credencial. Si el servicio ya tiene integración en la app (Gemini, Pixabay, Pexels), la clave va a
 * su variable de siempre y la usa la app; si no, queda guardada para cuando haya una integración.
 */
export const agregarCredencial = async (pedido: unknown): Promise<{ integrada: NombreClave | null }> => {
  const p = PedidoSchema.parse(pedido);
  if (!p.clave) throw new Error("Pegá la clave.");
  const integrada = SERVICIOS.find((s) => s.id === p.servicio)?.integrada ?? null;
  if (integrada) {
    await escribirEnv(integrada, p.clave);
    await probarClave(integrada);
    return { integrada };
  }
  const c = CredencialSchema.parse({ ...p, id: randomBytes(4).toString("hex"), creada: new Date().toISOString() });
  await escribirEnv(variableDe(c.id), p.clave);
  await guardar([...(await leer()), c]);
  if (tienePrueba(c.servicio)) await probarCredencial(c.id);
  return { integrada: null };
};

/** Editar nombre, URL base o parámetros, o reemplazar la clave (si viene). */
export const editarCredencial = async (id: string, pedido: unknown) => {
  const lista = await leer();
  const i = lista.findIndex((c) => c.id === id);
  if (i < 0) throw new Error("Esa credencial no existe.");
  const p = PedidoSchema.partial().parse(pedido);
  const { clave, ...resto } = p;
  lista[i] = CredencialSchema.parse({ ...lista[i], ...Object.fromEntries(Object.entries(resto).filter(([, v]) => v !== undefined)) });
  await guardar(lista);
  if (clave) {
    await escribirEnv(variableDe(id), clave);
    pruebas.delete(id);
    if (tienePrueba(lista[i]!.servicio)) await probarCredencial(id);
  }
};

export const borrarCredencial = async (id: string) => {
  const lista = await leer();
  if (!lista.some((c) => c.id === id)) throw new Error("Esa credencial no existe.");
  await escribirEnv(variableDe(id), null);
  pruebas.delete(id);
  await guardar(lista.filter((c) => c.id !== id));
};

export const probarCredencial = async (id: string): Promise<ResultadoPrueba> => {
  const c = (await leer()).find((x) => x.id === id);
  if (!c) throw new Error("Esa credencial no existe.");
  const clave = claveDe(variableDe(id));
  if (!clave) throw new Error("Esa credencial no tiene clave guardada.");
  const probar = PROBADORES[c.servicio];
  let r: { ok: boolean; motivo: string };
  if (!probar) r = { ok: false, motivo: "La app todavía no sabe probar este servicio: la clave queda guardada." };
  else {
    try {
      r = await probar(clave, c);
    } catch (e) {
      const err = e as Error;
      r = { ok: false, motivo: err.name === "TimeoutError" ? "No respondió a tiempo. ¿Hay internet?" : `No me pude conectar (${err.message}).` };
    }
  }
  const resultado = { ...r, final: finalDe(clave), fecha: new Date().toISOString() };
  pruebas.set(id, resultado);
  return resultado;
};

/** Para el código que quiera usar una credencial propia (por servicio): la clave y su configuración. */
export const credencialDe = async (servicio: IdServicio) => {
  const c = (await leer()).find((x) => x.servicio === servicio);
  const clave = c ? claveDe(variableDe(c.id)) : null;
  return c && clave ? { ...c, clave } : null;
};
