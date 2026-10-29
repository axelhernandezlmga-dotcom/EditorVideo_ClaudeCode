import { existsSync } from "node:fs";
import path from "node:path";
import type { PalabraTiempo } from "../alinear";
import { conReintentos, ejecutar } from "../proceso";
import { PYTHON_VENV, RAIZ } from "../rutas";
import type { IdProveedorVoz } from "../../shared/schemas";
import { esVozGemini, PREFIJO_GEMINI, VOCES_GEMINI } from "./gemini";

export type PedidoVoz = {
  texto: string;
  voz: string;
  velocidad: string;
  tono: string;
  /** Ruta sin extensión: cada proveedor agrega la suya. */
  salidaSinExt: string;
  sinTiempos?: boolean;
  signal?: AbortSignal;
};
export type ResultadoVoz = { archivo: string; palabras: PalabraTiempo[] };

export interface ProveedorVoz {
  id: "edge" | "kokoro";
  sintetizar(p: PedidoVoz): Promise<ResultadoVoz>;
}

const SCRIPTS = path.join(RAIZ, "src", "pipeline", "tts");

const verificarVenv = () => {
  if (!existsSync(PYTHON_VENV)) {
    throw new Error("Falta el entorno de Python del proyecto (.venv). Corré `npm run setup`.");
  }
};

type SalidaPython = { palabras: { texto: string; inicioMs: number; duracionMs: number }[] };

export const edge: ProveedorVoz = {
  id: "edge",
  async sintetizar(p) {
    verificarVenv();
    const archivo = `${p.salidaSinExt}.mp3`;
    const out = await conReintentos(
      () =>
        ejecutar(PYTHON_VENV, [path.join(SCRIPTS, "tts.py"), "sintetizar"], {
          stdin: JSON.stringify({ texto: p.texto, voz: p.voz, velocidad: p.velocidad, tono: p.tono, salida: archivo, sin_tiempos: p.sinTiempos }),
          signal: p.signal,
        }),
      { intentos: 4, signal: p.signal },
    ).catch((e: Error) => {
      const red = /ClientConnector|Cannot connect|getaddrinfo|Timeout|WSServerHandshake|NoAudioReceived|Network|SSL/i.test(e.message);
      throw new Error(`edge-tts no pudo generar la voz${red ? " (¿hay internet? Es un servicio online)" : ""}. Detalle: ${e.message}`);
    });
    const res = JSON.parse(out) as SalidaPython;
    return { archivo, palabras: res.palabras.map((w) => ({ texto: w.texto, inicioMs: w.inicioMs, finMs: w.inicioMs + w.duracionMs })) };
  },
};

export const kokoro: ProveedorVoz = {
  id: "kokoro",
  async sintetizar(p) {
    verificarVenv();
    const archivo = `${p.salidaSinExt}.wav`;
    await ejecutar(PYTHON_VENV, [path.join(SCRIPTS, "kokoro_tts.py")], {
      stdin: JSON.stringify({ texto: p.texto, voz: p.voz, velocidad: p.velocidad, salida: archivo }),
      signal: p.signal,
    }).catch((e: Error) => {
      throw new Error(`Kokoro no está disponible. Instalalo con \`npm run setup -- --kokoro\`. Detalle: ${e.message}`);
    });
    // Kokoro no da tiempos por palabra: el paso de voz cae a whisper.cpp.
    return { archivo, palabras: [] };
  },
};

export const proveedor = (id: ProveedorVoz["id"]): ProveedorVoz => (id === "kokoro" ? kokoro : edge);

export type IdProveedor = IdProveedorVoz;
/** El proveedor sale del nombre de la voz: "gemini:Puck", "es-UY-MateoNeural" (edge) o "ef_dora" (Kokoro). */
export const proveedorDeVoz = (voz: string): IdProveedor => (esVozGemini(voz) ? "gemini" : voz.includes("Neural") ? "edge" : "kokoro");

export type VozDisponible = { id: string; genero: string; locale: string; proveedor: IdProveedor; descripcion?: string };

export const VOCES_GEMINI_DISPONIBLES: VozDisponible[] = VOCES_GEMINI.map((v) => ({
  id: `${PREFIJO_GEMINI}${v.nombre}`,
  genero: v.genero,
  locale: "gemini",
  proveedor: "gemini",
  descripcion: v.descripcion,
}));

export const VOCES_KOKORO: VozDisponible[] = [
  { id: "ef_dora", genero: "Female", locale: "es-ES", proveedor: "kokoro" },
  { id: "em_alex", genero: "Male", locale: "es-ES", proveedor: "kokoro" },
  { id: "em_santa", genero: "Male", locale: "es-ES", proveedor: "kokoro" },
];

export const listarVoces = async (): Promise<VozDisponible[]> => {
  verificarVenv();
  const out = await ejecutar(PYTHON_VENV, [path.join(SCRIPTS, "tts.py"), "voces"]);
  const { voces } = JSON.parse(out) as { voces: Omit<VozDisponible, "proveedor">[] };
  return voces.map((v) => ({ ...v, proveedor: "edge" as const }));
};
