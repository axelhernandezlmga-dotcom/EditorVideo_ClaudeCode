import { readFile } from "node:fs/promises";
import path from "node:path";
import { descargar } from "../pexels";

/** Foto encontrada, con todo lo necesario para dar crédito. */
export type Foto = { url: string; credito: string; licencia: string; pagina: string; proveedor: "wikimedia" | "pixabay" };

// Wikimedia pide identificarse con un User-Agent que diga quién hace los pedidos
const UA = { "User-Agent": "FabricaDeVideos/0.1 (herramienta local de edición de video; https://github.com/)" };

/** Licencias que permiten usar la foto en un video (con crédito). */
const LICENCIA_LIBRE = /^(cc0|cc by(-sa)?( \d\.\d)?|public domain|dominio público|pd|attribution|cc-by(-sa)?-\d\.\d)/i;

const sinHtml = (s: string | undefined) => (s ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

type InfoImagen = { url?: string; thumburl?: string; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> };

/** Datos de licencia de un archivo de Commons; null si no es libre. */
const infoCommons = async (archivo: string, signal?: AbortSignal): Promise<Foto | null> => {
  const u = new URL("https://commons.wikimedia.org/w/api.php");
  u.search = new URLSearchParams({ action: "query", format: "json", titles: archivo.startsWith("File:") ? archivo : `File:${archivo}`, prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "1600", origin: "*" }).toString();
  const r = await fetch(u, { headers: UA, signal });
  if (!r.ok) return null;
  const datos = (await r.json()) as { query?: { pages?: Record<string, { imageinfo?: InfoImagen[] }> } };
  const info = Object.values(datos.query?.pages ?? {})[0]?.imageinfo?.[0];
  const meta = info?.extmetadata ?? {};
  const licencia = sinHtml(meta.LicenseShortName?.value);
  if (!info || !licencia || !LICENCIA_LIBRE.test(licencia)) return null;
  const autor = sinHtml(meta.Artist?.value) || "Autor desconocido";
  return { url: info.thumburl ?? info.url ?? "", credito: `${autor} · ${licencia} · Wikimedia Commons`, licencia, pagina: info.descriptionurl ?? "", proveedor: "wikimedia" };
};

/**
 * Foto de una persona o un lugar: la imagen principal de su artículo en Wikipedia (español y si no inglés),
 * y si no hay, una búsqueda en Commons. Solo licencias libres; sin clave.
 */
export const buscarWikimedia = async (busqueda: string, signal?: AbortSignal): Promise<Foto | null> => {
  for (const idioma of ["es", "en"]) {
    const u = new URL(`https://${idioma}.wikipedia.org/w/api.php`);
    u.search = new URLSearchParams({ action: "query", format: "json", generator: "search", gsrsearch: busqueda, gsrlimit: "1", prop: "pageimages", piprop: "name", origin: "*" }).toString();
    const r = await fetch(u, { headers: UA, signal }).catch(() => null);
    if (!r?.ok) continue;
    const datos = (await r.json()) as { query?: { pages?: Record<string, { pageimage?: string }> } };
    const nombre = Object.values(datos.query?.pages ?? {})[0]?.pageimage;
    if (nombre && !/\.svg$/i.test(nombre)) {
      const foto = await infoCommons(nombre, signal);
      if (foto?.url) return foto;
    }
  }
  const u = new URL("https://commons.wikimedia.org/w/api.php");
  u.search = new URLSearchParams({ action: "query", format: "json", list: "search", srsearch: `${busqueda} filetype:bitmap`, srnamespace: "6", srlimit: "5", origin: "*" }).toString();
  const r = await fetch(u, { headers: UA, signal }).catch(() => null);
  if (!r?.ok) return null;
  const datos = (await r.json()) as { query?: { search?: { title: string }[] } };
  for (const { title } of datos.query?.search ?? []) {
    const foto = await infoCommons(title, signal);
    if (foto?.url) return foto;
  }
  return null;
};

/** Foto para un concepto en Pixabay (licencia de Pixabay: uso libre sin atribución; igual se anota el crédito). */
export const buscarPixabay = async (clave: string, busqueda: string, signal?: AbortSignal): Promise<Foto | null> => (await buscarPixabayVarias(clave, busqueda, signal))[0] ?? null;

/** Varias fotos de Pixabay para un concepto (las primeras de la búsqueda), para elegir la que pase la verificación. */
export const buscarPixabayVarias = async (clave: string, busqueda: string, signal?: AbortSignal): Promise<Foto[]> => {
  const u = new URL("https://pixabay.com/api/");
  u.search = new URLSearchParams({ key: clave, q: busqueda.slice(0, 100), image_type: "photo", safesearch: "true", per_page: "10", orientation: "vertical" }).toString();
  let r = await fetch(u, { signal });
  if (r.status === 400) throw new Error("La PIXABAY_API_KEY no es válida. Revisala en Configuración.");
  let datos = r.ok ? ((await r.json()) as { hits: { largeImageURL: string; pageURL: string; user: string }[] }) : { hits: [] };
  if (!datos.hits.length) {
    // sin fotos verticales: probar con cualquier orientación (se recorta al encuadrar)
    u.searchParams.delete("orientation");
    r = await fetch(u, { signal });
    datos = r.ok ? ((await r.json()) as typeof datos) : { hits: [] };
  }
  return datos.hits.map((h) => ({ url: h.largeImageURL, credito: `${h.user} · Licencia de Pixabay`, licencia: "Pixabay Content License", pagina: h.pageURL, proveedor: "pixabay" as const }));
};

/** Baja la foto a la carpeta del trabajo y devuelve la ruta relativa. */
export const bajarFoto = async (foto: Foto, dirTrabajo: string, nombre: string, signal?: AbortSignal) => {
  const ext = path.extname(new URL(foto.url).pathname).toLowerCase().match(/^\.(jpe?g|png|webp)$/) ? path.extname(new URL(foto.url).pathname).toLowerCase() : ".jpg";
  const rel = `material/${nombre}${ext === ".jpeg" ? ".jpg" : ext}`;
  await descargar(foto.url, path.join(dirTrabajo, rel), signal);
  return rel;
};

/** Medidas y extensión de una imagen PNG o JPG, leyendo su cabecera. */
export const medidasImagen = async (archivo: string): Promise<{ ancho: number; alto: number; ext: ".png" | ".jpg" }> => {
  const b = await readFile(archivo);
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20), ext: ".png" };
  if (b[0] === 0xff && b[1] === 0xd8) {
    // JPEG: recorrer los bloques hasta el SOF, que tiene alto y ancho
    let i = 2;
    while (i + 9 < b.length && b[i] === 0xff) {
      const tipo = b[i + 1]!;
      if (tipo >= 0xc0 && tipo <= 0xcf && tipo !== 0xc4 && tipo !== 0xc8 && tipo !== 0xcc) return { alto: b.readUInt16BE(i + 5), ancho: b.readUInt16BE(i + 7), ext: ".jpg" };
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  throw new Error("La captura tiene que ser PNG o JPG.");
};
