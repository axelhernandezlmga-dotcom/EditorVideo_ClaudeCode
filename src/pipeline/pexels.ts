import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

type VideoPexels = {
  id: number;
  width: number;
  height: number;
  duration: number;
  user?: { name: string };
  url: string;
  video_files: { link: string; width: number | null; height: number | null; file_type: string; quality: string | null }[];
};

export type ClipStock = { url: string; autor: string; pagina: string };

/** Busca un clip vertical en Pexels (gratis, requiere API key) y elige un archivo ~1080 px de ancho. */
export const buscarClip = async (clave: string, consultas: string[], signal?: AbortSignal): Promise<ClipStock | null> => {
  for (const q of consultas.filter(Boolean)) {
    const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&orientation=portrait&size=medium&per_page=10`;
    const r = await fetch(url, { headers: { Authorization: clave }, signal });
    if (r.status === 401) throw new Error("La PEXELS_API_KEY no es válida. Revisala en Configuración.");
    if (!r.ok) continue;
    const { videos } = (await r.json()) as { videos: VideoPexels[] };
    for (const v of videos.filter((v) => v.height > v.width && v.duration >= 4)) {
      const archivos = v.video_files
        .filter((f) => f.file_type === "video/mp4" && f.width && f.height && f.height > f.width)
        .sort((a, b) => Math.abs((a.width ?? 0) - 1080) - Math.abs((b.width ?? 0) - 1080));
      const elegido = archivos[0];
      if (elegido) return { url: elegido.link, autor: v.user?.name ?? "Pexels", pagina: v.url };
    }
  }
  return null;
};

export const descargar = async (url: string, destino: string, signal?: AbortSignal) => {
  const r = await fetch(url, { signal });
  if (!r.ok || !r.body) throw new Error(`No pude descargar ${url} (HTTP ${r.status})`);
  await pipeline(Readable.fromWeb(r.body as import("node:stream/web").ReadableStream), createWriteStream(destino));
};
