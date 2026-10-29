import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { archivoEnv } from "./claves";
import { leerMarca } from "./config";
import { bus } from "./eventos";
import { escribirAtomico } from "./trabajo";

/**
 * Contador local del uso diario de Gemini TTS (data/uso-gemini.json).
 * Google no publica el cupo gratis del TTS (se ve en AI Studio → Rate limits) y lo reinicia a la medianoche
 * del Pacífico: 4:00 de Uruguay con horario de verano de EE. UU., 5:00 sin él.
 * Cuando llega un 429 diario se guarda cuántos pedidos se habían hecho: ese es el límite real de ahí en más.
 */
const ZONA_GOOGLE = "America/Los_Angeles";
/** Al 80 % del límite se avisa en amarillo. */
export const UMBRAL_AVISO = 0.8;

const archivo = () => path.join(path.dirname(archivoEnv()), "data", "uso-gemini.json");

type Guardado = {
  /** Día de Google (fecha del Pacífico, AAAA-MM-DD). */
  dia: string;
  pedidos: number;
  caracteres: number;
  segundosAudio: number;
  /** Hora (ISO) en que Google cortó por límite diario; se borra al cambiar el día. */
  agotado?: string;
  /** Pedidos que había al recibir el 429 diario: el límite real observado (vale para los días siguientes). */
  limiteObservado?: number;
};

export type UsoGemini = {
  dia: string;
  pedidos: number;
  caracteres: number;
  segundosAudio: number;
  /** Límite que se usa para el medidor: el observado o, si nunca se llegó, el estimado de Configuración. */
  limite: number;
  limiteObservado: boolean;
  agotado: boolean;
  nivel: "ok" | "poco" | "agotado";
  /** Próximo reinicio del cupo (ISO): la UI lo muestra en hora local. */
  reinicio: string;
};

const partes = (d: Date) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_GOOGLE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  ) as Record<"year" | "month" | "day" | "hour" | "minute" | "second", string>;

export const diaGoogle = (d = new Date()) => {
  const p = partes(d);
  return `${p.year}-${p.month}-${p.day}`;
};

/** Próxima medianoche del Pacífico (contempla los días de cambio de hora). */
export const proximoReinicio = (d = new Date()): Date => {
  const p = partes(d);
  const transcurrido = ((Number(p.hour) * 60 + Number(p.minute)) * 60 + Number(p.second)) * 1000 + d.getMilliseconds();
  const candidato = new Date(d.getTime() - transcurrido + 24 * 3600_000);
  const h = Number(partes(candidato).hour);
  return h === 23 ? new Date(candidato.getTime() + 3600_000) : h === 1 ? new Date(candidato.getTime() - 3600_000) : candidato;
};

const leer = async (ahora = new Date()): Promise<Guardado> => {
  const dia = diaGoogle(ahora);
  let g: Partial<Guardado> = {};
  if (existsSync(archivo())) g = (JSON.parse(await readFile(archivo(), "utf8").catch(() => "{}")) as Partial<Guardado> | null) ?? {};
  const limiteObservado = typeof g.limiteObservado === "number" && g.limiteObservado > 0 ? g.limiteObservado : undefined;
  if (g.dia !== dia) return { dia, pedidos: 0, caracteres: 0, segundosAudio: 0, limiteObservado };
  return { dia, pedidos: g.pedidos ?? 0, caracteres: g.caracteres ?? 0, segundosAudio: g.segundosAudio ?? 0, agotado: g.agotado, limiteObservado };
};

const resumir = async (g: Guardado, ahora = new Date()): Promise<UsoGemini> => {
  const limite = g.limiteObservado ?? (await leerMarca()).limiteDiarioGemini;
  const agotado = Boolean(g.agotado);
  return {
    dia: g.dia,
    pedidos: g.pedidos,
    caracteres: g.caracteres,
    segundosAudio: Math.round(g.segundosAudio),
    limite,
    limiteObservado: g.limiteObservado !== undefined,
    agotado,
    nivel: agotado || g.pedidos >= limite ? "agotado" : g.pedidos >= limite * UMBRAL_AVISO ? "poco" : "ok",
    reinicio: proximoReinicio(ahora).toISOString(),
  };
};

// las escrituras van en fila para que dos pedidos seguidos no se pisen
let fila: Promise<unknown> = Promise.resolve();
const modificar = (fn: (g: Guardado) => void): Promise<UsoGemini> => {
  const tarea = fila.then(async () => {
    const g = await leer();
    fn(g);
    await mkdir(path.dirname(archivo()), { recursive: true });
    await escribirAtomico(archivo(), `${JSON.stringify(g, null, 2)}\n`);
    const uso = await resumir(g);
    bus.emitir({ tipo: "uso-gemini", uso });
    return uso;
  });
  fila = tarea.catch(() => undefined);
  return tarea;
};

export const leerUso = async (): Promise<UsoGemini> => resumir(await leer());

/** ¿Google ya cortó hoy? (así no se gasta un pedido para enterarse otra vez). */
export const geminiAgotadoHoy = async () => Boolean((await leer()).agotado);

export const registrarPedido = (caracteres: number, segundosAudio: number) =>
  modificar((g) => {
    g.pedidos += 1;
    g.caracteres += caracteres;
    g.segundosAudio += segundosAudio;
    // se pasó del límite observado sin que Google corte: ese número quedó viejo (¿cambió el plan?)
    if (g.limiteObservado !== undefined && g.pedidos > g.limiteObservado) g.limiteObservado = undefined;
  });

/** Google respondió 429 por límite diario: queda marcado hasta el reinicio y avisa con una notificación del sistema (una vez por día). */
export const registrarAgotado = async () => {
  const yaEstaba = await geminiAgotadoHoy();
  const uso = await modificar((g) => {
    g.agotado ??= new Date().toISOString();
    if (g.pedidos > 0) g.limiteObservado = g.pedidos;
  });
  if (!yaEstaba) {
    const hora = new Date(uso.reinicio).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    notificar("Fábrica de Videos: se acabó Gemini por hoy", `Llegaste al límite gratis de Google. Se reinicia a las ${hora}. Mientras tanto uso la voz de respaldo (edge-tts).`);
  }
  return uso;
};

/** Duración de un WAV PCM (Gemini devuelve 24 kHz, 16 bits, mono). */
export const segundosWav = (wav: Buffer): number => {
  if (wav.length < 44 || wav.toString("ascii", 0, 4) !== "RIFF") return (wav.length / 48000) || 0;
  const bytesPorSegundo = wav.readUInt32LE(28) || 48000;
  return Math.max(0, wav.length - 44) / bytesPorSegundo;
};

type Notificador = { notify: (o: { title: string; message: string; sound?: boolean; wait?: boolean }, cb?: (err: Error | null) => void) => void };

/** Notificación del sistema (Linux: notify-send; Mac: Centro de notificaciones; Windows: toast). Si falla, no rompe nada. */
export const notificar = (titulo: string, mensaje: string) => {
  if (process.env.FABRICA_SIN_NOTIFICACIONES === "1") return;
  try {
    const n = createRequire(import.meta.url)("node-notifier") as Notificador;
    n.notify({ title: titulo, message: mensaje, sound: true, wait: false }, () => undefined);
  } catch {
    // sin notificaciones del sistema: el cartel rojo de la app alcanza
  }
};
