import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { makeCancelSignal, renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import type { CrudoProps } from "../shared/crudo";
import { FRAME_PORTADA, type PortadaProps, type VideoProps } from "../shared/render";
import { RAIZ } from "./rutas";

const DIR_CACHE = path.join(RAIZ, ".cache");
const ENTRADA = path.join(RAIZ, "src", "remotion", "index.ts");

const listarArchivos = async (dir: string): Promise<string[]> => {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listarArchivos(p)));
    else out.push(p);
  }
  return out;
};

/** Hash de los archivos que afectan el bundle: si cambian, se vuelve a empaquetar. */
const hashFuentes = async () => {
  const h = createHash("sha1");
  const archivos = [
    ...(await listarArchivos(path.join(RAIZ, "src", "remotion"))),
    ...(await listarArchivos(path.join(RAIZ, "src", "shared"))),
  ].sort();
  for (const a of archivos) h.update(a).update(String((await stat(a)).mtimeMs));
  return h.digest("hex").slice(0, 12);
};

let bundleEnCurso: Promise<string> | null = null;

/** Empaqueta el proyecto Remotion una vez y lo reutiliza mientras no cambie el código. */
export const obtenerBundle = (onProgreso?: (p: number) => void): Promise<string> => {
  bundleEnCurso ??= (async () => {
    const hash = await hashFuentes();
    const destino = path.join(DIR_CACHE, `bundle-${hash}`);
    if (existsSync(path.join(destino, "index.html"))) return destino;
    await mkdir(DIR_CACHE, { recursive: true });
    for (const viejo of await readdir(DIR_CACHE)) {
      if (viejo.startsWith("bundle-")) await rm(path.join(DIR_CACHE, viejo), { recursive: true, force: true });
    }
    const vacio = path.join(DIR_CACHE, "public-vacio");
    await mkdir(vacio, { recursive: true });
    return bundle({ entryPoint: ENTRADA, outDir: destino, publicDir: vacio, onProgress: (p) => onProgreso?.(p / 100) });
  })().finally(() => {
    bundleEnCurso = null;
  });
  return bundleEnCurso;
};

const TIPOS: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".json": "application/json",
};

/**
 * Servidor HTTP mínimo que sirve una carpeta (con soporte de Range, que el navegador de Remotion usa para audio/video).
 * Así los assets del trabajo no tienen que copiarse a public/.
 */
export const servirCarpeta = async (dir: string): Promise<{ url: string; cerrar: () => Promise<void> }> => {
  const raiz = path.resolve(dir);
  const server: Server = createServer((req, res) => {
    const rel = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
    const archivo = path.resolve(raiz, `.${rel}`);
    if (!archivo.startsWith(raiz + path.sep) || !existsSync(archivo)) {
      res.writeHead(404).end();
      return;
    }
    void stat(archivo).then((st) => {
      const tipo = TIPOS[path.extname(archivo).toLowerCase()] ?? "application/octet-stream";
      const cabeceras = { "Content-Type": tipo, "Accept-Ranges": "bytes", "Access-Control-Allow-Origin": "*" };
      const rango = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
      if (rango) {
        const ini = rango[1] ? Number(rango[1]) : 0;
        const fin = rango[2] ? Number(rango[2]) : st.size - 1;
        res.writeHead(206, { ...cabeceras, "Content-Range": `bytes ${ini}-${fin}/${st.size}`, "Content-Length": fin - ini + 1 });
        createReadStream(archivo, { start: ini, end: fin }).pipe(res);
      } else {
        res.writeHead(200, { ...cabeceras, "Content-Length": st.size });
        createReadStream(archivo).pipe(res);
      }
    });
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    cerrar: () => new Promise<void>((ok) => server.close(() => ok())),
  };
};

/** Espera para que cargue cada fotograma (las fuentes se bajan de Google): con internet lento 30 s no alcanzan. */
const TIEMPO_CARGA_MS = 120_000;

const concurrencia = () => Math.max(1, Math.floor(os.cpus().length / 2));

export const renderizarVideo = async (opts: {
  props: VideoProps | CrudoProps | Record<string, unknown>;
  salida: string;
  onProgreso?: (p: number) => void;
  signal?: AbortSignal;
  /** "Crudo" = video grabado y editado; "HojaMarca" = hoja de marca en movimiento; por defecto, el video armado desde una idea. */
  composicion?: "Video" | "Crudo" | "HojaMarca";
}) => {
  const serveUrl = await obtenerBundle();
  const inputProps = opts.props as unknown as Record<string, unknown>;
  const composition = await selectComposition({ serveUrl, id: opts.composicion ?? "Video", inputProps, timeoutInMilliseconds: TIEMPO_CARGA_MS });
  const { cancelSignal, cancel } = makeCancelSignal();
  const alAbortar = () => cancel();
  opts.signal?.addEventListener("abort", alAbortar);
  try {
    await renderMedia({
      serveUrl,
      composition,
      inputProps,
      codec: "h264",
      crf: 18,
      pixelFormat: "yuv420p",
      audioCodec: "aac",
      audioBitrate: "192k",
      x264Preset: "medium",
      concurrency: concurrencia(),
      outputLocation: opts.salida,
      cancelSignal,
      onProgress: ({ progress }) => opts.onProgreso?.(progress),
      chromiumOptions: { gl: "angle" },
      timeoutInMilliseconds: TIEMPO_CARGA_MS,
    });
  } finally {
    opts.signal?.removeEventListener("abort", alAbortar);
  }
};

export const renderizarPortada = async (opts: { props: PortadaProps; salida: string }) => {
  const serveUrl = await obtenerBundle();
  const inputProps = opts.props as unknown as Record<string, unknown>;
  const composition = await selectComposition({ serveUrl, id: "Portada", inputProps });
  await renderStill({ serveUrl, composition, inputProps, frame: FRAME_PORTADA, output: opts.salida, imageFormat: "png", timeoutInMilliseconds: TIEMPO_CARGA_MS });
};

/** Renderiza frames sueltos del video como PNG (para revisar plantillas). */
export const renderizarFotograma = async (opts: { props: VideoProps | CrudoProps; frame: number; salida: string; composicion?: "Video" | "Crudo" }) => {
  const serveUrl = await obtenerBundle();
  const inputProps = opts.props as unknown as Record<string, unknown>;
  const composition = await selectComposition({ serveUrl, id: opts.composicion ?? "Video", inputProps, timeoutInMilliseconds: TIEMPO_CARGA_MS });
  await renderStill({ serveUrl, composition, inputProps, frame: opts.frame, output: opts.salida, imageFormat: "png", timeoutInMilliseconds: TIEMPO_CARGA_MS });
};

export const leerJson = async <T>(p: string): Promise<T> => JSON.parse(await readFile(p, "utf8")) as T;
export const escribirJson = (p: string, data: unknown) => writeFile(p, `${JSON.stringify(data, null, 2)}\n`, "utf8");
