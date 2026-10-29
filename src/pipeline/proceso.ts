import { spawn } from "node:child_process";
import path from "node:path";
import { RAIZ } from "./rutas";

export class ErrorProceso extends Error {
  constructor(
    message: string,
    readonly codigo: number | null,
    readonly stderr: string,
    readonly stdout: string,
  ) {
    super(message);
  }
}

/** Ejecuta un programa sin shell (funciona igual en Windows) y devuelve stdout. */
export const ejecutar = (
  bin: string,
  args: string[],
  opts: {
    cwd?: string;
    stdin?: string;
    signal?: AbortSignal;
    env?: NodeJS.ProcessEnv;
    onStdoutLinea?: (l: string) => void;
    /** Devolver stderr en vez de stdout (ffmpeg escribe ahí sus mediciones, ej. loudnorm). */
    devolverStderr?: boolean;
  } = {},
): Promise<string> =>
  new Promise((resolve, reject) => {
    const hijo = spawn(bin, args, { cwd: opts.cwd, env: opts.env ?? process.env, signal: opts.signal, windowsHide: true });
    let out = "";
    let err = "";
    let resto = "";
    hijo.stdout.setEncoding("utf8").on("data", (d: string) => {
      out += d;
      if (opts.onStdoutLinea) {
        resto += d;
        const lineas = resto.split(/\r?\n/);
        resto = lineas.pop() ?? "";
        for (const l of lineas) if (l.trim()) opts.onStdoutLinea(l);
      }
    });
    hijo.stderr.setEncoding("utf8").on("data", (d: string) => {
      err += d;
    });
    hijo.on("error", (e) => reject(e));
    hijo.on("close", (codigo) => {
      if (resto.trim() && opts.onStdoutLinea) opts.onStdoutLinea(resto);
      if (codigo === 0) resolve(opts.devolverStderr ? err : out);
      else reject(new ErrorProceso(`${bin} terminó con código ${codigo}: ${err.trim().slice(-800)}`, codigo, err, out));
    });
    if (opts.stdin !== undefined) hijo.stdin.end(opts.stdin);
    else hijo.stdin.end();
  });

export const CLI_REMOTION = path.join(RAIZ, "node_modules", "@remotion", "cli", "remotion-cli.js");

/** ffmpeg / ffprobe que trae Remotion (no hace falta instalarlos aparte). */
export const ffmpeg = (args: string[], signal?: AbortSignal) => ejecutar(process.execPath, [CLI_REMOTION, "ffmpeg", "-hide_banner", "-loglevel", "error", ...args], { signal });
export const ffprobe = (args: string[]) => ejecutar(process.execPath, [CLI_REMOTION, "ffprobe", "-v", "error", ...args]);

/** Duración en ms de un archivo de audio/video. */
export const duracionMs = async (archivo: string): Promise<number> => {
  const out = await ffprobe(["-show_entries", "format=duration", "-of", "csv=p=0", archivo]);
  const linea = out.split(/\r?\n/).map((l) => l.trim()).find((l) => /^\d+(\.\d+)?$/.test(l));
  if (!linea) throw new Error(`No pude medir la duración de ${archivo}`);
  return Number(linea) * 1000;
};

export const esperar = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((ok, mal) => {
    const t = setTimeout(ok, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      mal(new Error("Cancelado"));
    });
  });

/** Reintenta `fn` con espera exponencial (1 s, 3 s, 9 s…). */
export const conReintentos = async <T>(
  fn: (intento: number) => Promise<T>,
  opts: {
    intentos?: number;
    signal?: AbortSignal;
    alFallar?: (e: unknown, intento: number) => void;
    /** Errores que no tiene sentido reintentar (ej. una clave inválida). */
    sinReintento?: (e: unknown) => boolean;
    /** Espera pedida por el servicio (ej. el retryDelay de Google), en ms. */
    espera?: (e: unknown) => number | undefined;
  } = {},
): Promise<T> => {
  const intentos = opts.intentos ?? 3;
  let ultimo: unknown;
  for (let i = 1; i <= intentos; i++) {
    try {
      return await fn(i);
    } catch (e) {
      ultimo = e;
      if (opts.signal?.aborted || opts.sinReintento?.(e)) throw e;
      opts.alFallar?.(e, i);
      if (i < intentos) await esperar(opts.espera?.(e) ?? 1000 * 3 ** (i - 1), opts.signal);
    }
  }
  throw ultimo;
};
