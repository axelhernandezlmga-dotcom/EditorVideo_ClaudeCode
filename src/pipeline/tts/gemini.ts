import { writeFile } from "node:fs/promises";
import { claveDe, modeloGeminiTts } from "../claves";
import { conReintentos } from "../proceso";
import { registrarAgotado, registrarPedido, segundosWav } from "../usoGemini";

/** Voces prediseñadas de Gemini TTS (ai.google.dev/gemini-api/docs/speech-generation). Hablan cualquier idioma: el acento lo da el estilo. */
export const VOCES_GEMINI: { nombre: string; descripcion: string; genero: "Male" | "Female" }[] = [
  { nombre: "Puck", descripcion: "animado", genero: "Male" },
  { nombre: "Fenrir", descripcion: "excitable", genero: "Male" },
  { nombre: "Charon", descripcion: "informativo", genero: "Male" },
  { nombre: "Orus", descripcion: "firme", genero: "Male" },
  { nombre: "Algenib", descripcion: "rasposo", genero: "Male" },
  { nombre: "Iapetus", descripcion: "claro", genero: "Male" },
  { nombre: "Sadaltager", descripcion: "sabio", genero: "Male" },
  { nombre: "Zubenelgenubi", descripcion: "casual", genero: "Male" },
  { nombre: "Kore", descripcion: "firme", genero: "Female" },
  { nombre: "Zephyr", descripcion: "brillante", genero: "Female" },
  { nombre: "Leda", descripcion: "juvenil", genero: "Female" },
  { nombre: "Aoede", descripcion: "fresca", genero: "Female" },
  { nombre: "Sulafat", descripcion: "cálida", genero: "Female" },
  { nombre: "Laomedeia", descripcion: "animada", genero: "Female" },
];

export const PREFIJO_GEMINI = "gemini:";
export const esVozGemini = (voz: string) => voz.startsWith(PREFIJO_GEMINI);
export const nombreVozGemini = (voz: string) => voz.slice(PREFIJO_GEMINI.length);

/** Error de Google con lo necesario para decidir qué hacer (reintentar, cambiar de voz o avisar). */
export class ErrorGemini extends Error {
  constructor(
    message: string,
    readonly http: number,
    readonly status?: string,
    /** "diario" = se acabó el plan gratis de hoy; "minuto" = muchos pedidos seguidos (se reintenta). */
    readonly limite?: "diario" | "minuto",
    readonly reintentarEnMs?: number,
  ) {
    super(message);
  }
}

type CuerpoError = {
  error?: {
    status?: string;
    message?: string;
    details?: { "@type"?: string; reason?: string; retryDelay?: string; violations?: { quotaId?: string; quotaMetric?: string }[] }[];
  };
};

/** Lee un 429: si alguna cuota violada es "PerDay" es el límite diario; si no, es por minuto. */
export const clasificar429 = (cuerpo: unknown): { limite: "diario" | "minuto"; reintentarEnMs?: number } => {
  const e = (Array.isArray(cuerpo) ? cuerpo[0] : cuerpo) as CuerpoError | null;
  const detalles = e?.error?.details ?? [];
  const cuotas = detalles.flatMap((d) => d.violations ?? []).map((v) => `${v.quotaId ?? ""} ${v.quotaMetric ?? ""}`);
  const espera = detalles.find((d) => d.retryDelay)?.retryDelay;
  const reintentarEnMs = espera ? Math.round(parseFloat(espera) * 1000) : undefined;
  const diario = cuotas.some((c) => /per ?day|PerDay|requests_per_day/i.test(c)) || /per day|daily/i.test(e?.error?.message ?? "");
  return { limite: diario ? "diario" : "minuto", reintentarEnMs };
};

export type PedidoGemini = { texto: string; voz: string; estilo?: string; salida: string; signal?: AbortSignal; alFallar?: (e: unknown, intento: number) => void };

/** Una llamada a Gemini TTS → un .wav (24 kHz, mono). Gemini no da tiempos por palabra: se sacan con whisper.cpp. */
export const sintetizarGemini = async (p: PedidoGemini): Promise<{ archivo: string; caracteres: number }> => {
  const clave = claveDe("GEMINI_API_KEY");
  if (!clave) throw new ErrorGemini("Falta GEMINI_API_KEY. Corré `npm run claves`.", 0);
  // pruebas: simula el 429 diario de Google sin gastar cupo
  if (process.env.FABRICA_FORZAR_LIMITE_GEMINI === "1") {
    await registrarAgotado();
    throw Object.assign(new ErrorGemini("Llegaste al límite gratis de Google por hoy.", 429, "RESOURCE_EXHAUSTED", "diario"), { sinReintento: true });
  }
  const nombre = esVozGemini(p.voz) ? nombreVozGemini(p.voz) : p.voz;
  const pedir = async () => {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "x-goog-api-key": clave, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modeloGeminiTts(),
        input: [
          {
            type: "user_input",
            content: [{ type: "text", text: p.texto, ...(p.estilo ? { annotations: [{ type: "speech_metadata", style: p.estilo }] } : {}) }],
          },
        ],
        response_format: { type: "audio" },
        generation_config: { speech_config: [{ voice: nombre }] },
      }),
      signal: p.signal ? AbortSignal.any([p.signal, AbortSignal.timeout(180_000)]) : AbortSignal.timeout(180_000),
    });
    const cuerpo = (await r.json().catch(() => null)) as unknown;
    if (!r.ok) {
      const e = (Array.isArray(cuerpo) ? cuerpo[0] : cuerpo) as CuerpoError | null;
      const msg = e?.error?.message ?? "error desconocido";
      if (r.status === 429) {
        const { limite, reintentarEnMs } = clasificar429(cuerpo);
        if (limite === "diario") await registrarAgotado();
        throw new ErrorGemini(
          limite === "diario" ? "Llegaste al límite gratis de Google por hoy." : "Google pide esperar: demasiados pedidos por minuto.",
          429,
          e?.error?.status,
          limite,
          reintentarEnMs,
        );
      }
      throw new ErrorGemini(`Gemini TTS respondió ${r.status}: ${msg}`, r.status, e?.error?.status);
    }
    const pasos = (cuerpo as { steps?: { content?: { type: string; data?: string }[] }[] } | null)?.steps ?? [];
    const audio = pasos.flatMap((s) => s.content ?? []).find((c) => c.type === "audio" && c.data);
    if (!audio?.data) throw new ErrorGemini("Gemini respondió sin audio.", 200);
    const bytes = Buffer.from(audio.data, "base64");
    await registrarPedido(p.texto.length, segundosWav(bytes));
    return bytes;
  };
  const bytes = await conReintentos(
    async () => {
      try {
        return await pedir();
      } catch (e) {
        // el límite diario no se arregla reintentando, ni una clave mala
        if (e instanceof ErrorGemini && ((e.http === 429 && e.limite === "diario") || [0, 400, 401, 403, 404].includes(e.http))) throw Object.assign(e, { sinReintento: true });
        throw e;
      }
    },
    {
      intentos: 4,
      signal: p.signal,
      sinReintento: (e) => Boolean((e as { sinReintento?: boolean }).sinReintento),
      espera: (e) => (e instanceof ErrorGemini && e.reintentarEnMs ? e.reintentarEnMs + 500 : undefined),
      alFallar: p.alFallar,
    },
  );
  await writeFile(p.salida, bytes);
  return { archivo: p.salida, caracteres: p.texto.length };
};
