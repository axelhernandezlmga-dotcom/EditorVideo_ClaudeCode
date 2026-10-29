import { copyFile, mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { CandidataImagen, OrigenImagen } from "../../shared/material";
import { pedirAClaude } from "../claude";
import { ejecutar } from "../proceso";
import type { Trabajo } from "../trabajo";
import { buscarWikimedia } from "./imagenes";

/** Navegador "normal": varios medios y sitios oficiales no devuelven nada a un User-Agent de script. */
const UA = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36", "Accept-Language": "es-UY,es;q=0.9" };

const pareceImagen = (u: string) => /\.(jpe?g|png|webp|avif|gif)(\?|$)/i.test(u) || /upload\.wikimedia\.org/.test(u);

const decodificar = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

/** Imagen principal de una página (og:image o twitter:image) con el título y la descripción de la página. */
export const datosDePagina = async (pagina: string, signal?: AbortSignal): Promise<{ imagen: string | null; titulo: string | null; descripcion: string | null }> => {
  const vacio = { imagen: null, titulo: null, descripcion: null };
  const r = await fetch(pagina, { headers: UA, signal, redirect: "follow" }).catch(() => null);
  if (!r?.ok || !/html/i.test(r.headers.get("content-type") ?? "")) return vacio;
  const html = (await r.text()).slice(0, 400_000);
  const meta = (prop: string) =>
    new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i").exec(html)?.[1] ??
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, "i").exec(html)?.[1];
  const u = meta("og:image:secure_url") ?? meta("og:image") ?? meta("twitter:image");
  let imagen: string | null = null;
  try {
    imagen = u ? new URL(decodificar(u), pagina).toString() : null;
  } catch {
    imagen = null;
  }
  const titulo = meta("og:title") ?? /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1] ?? null;
  const descripcion = meta("og:description") ?? meta("description") ?? null;
  return { imagen, titulo: titulo ? decodificar(titulo).slice(0, 200) : null, descripcion: descripcion ? decodificar(descripcion).slice(0, 300) : null };
};

/** La imagen principal de una página (og:image o twitter:image), o null. */
export const imagenDePagina = async (pagina: string, signal?: AbortSignal) => (await datosDePagina(pagina, signal)).imagen;

/**
 * Baja una imagen y la deja como JPG (ffmpeg convierte WEBP, AVIF, PNG…). Falla si no es una imagen o es muy chica
 * para verse bien a pantalla completa.
 */
export const bajarImagen = async (url: string, destino: string, signal?: AbortSignal) => {
  const r = await fetch(url, { headers: UA, signal, redirect: "follow" });
  if (!r.ok) throw new Error(`respondió ${r.status}`);
  if (!/^image\//i.test(r.headers.get("content-type") ?? "image/")) throw new Error("no es una imagen");
  const crudo = `${destino}.descarga`;
  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(crudo, Buffer.from(await r.arrayBuffer()));
  try {
    await ejecutar("ffmpeg", ["-v", "error", "-y", "-i", crudo, "-frames:v", "1", "-vf", "scale='min(1600,iw)':-2", "-q:v", "3", destino]);
  } finally {
    await rm(crudo, { force: true });
  }
  const dims = await ejecutar("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", destino]);
  const [ancho = 0, alto = 0] = dims.trim().split(",").map(Number);
  if (ancho < 400 || alto < 300) throw new Error(`es muy chica (${ancho}×${alto})`);
  if ((await stat(destino)).size < 8_000) throw new Error("es casi vacía");
  return { ancho, alto };
};

const VeredictoSchema = z.object({
  muestra: z.enum(["si", "no", "dudoso"]).describe("¿La imagen muestra exactamente lo pedido?"),
  motivo: z.string().max(300).describe("Qué se ve y por qué sí o no"),
});
export type Veredicto = z.infer<typeof VeredictoSchema>;

/**
 * Verificación visual: Claude mira la imagen (solo esa, en una carpeta aparte) y dice si muestra exactamente lo
 * que se nombra. Ante la duda, no.
 */
export const verificarImagen = async (archivo: string, queDebeVerse: string, contexto: string, modelo: string, signal?: AbortSignal, procedencia?: string | null): Promise<Veredicto> => {
  const dir = path.join(path.dirname(archivo), `.verificar-${path.basename(archivo, path.extname(archivo))}`);
  await mkdir(dir, { recursive: true });
  await copyFile(archivo, path.join(dir, "imagen.jpg"));
  try {
    return await pedirAClaude({
      prompt: `Mirá imagen.jpg con la herramienta Read.
Va a aparecer en un video de noticias mientras alguien dice: "${contexto}".
Tiene que mostrar EXACTAMENTE esto: ${queDebeVerse}.
${procedencia ? `\nDe dónde sale la foto: ${procedencia}\n` : ""}
No identifiques a nadie por la cara. Para personas, lo que vale es la procedencia: si la foto es la imagen principal
de una nota o página que trata sobre esa persona (o tiene un epígrafe, cartel o texto que la nombra) y lo que se ve es
coherente (una persona en un retrato, una entrevista o un acto), respondé "si". Para lugares e instituciones, que la
página o algo visible (cartel, fachada conocida, logo en el edificio) confirme que es ese lugar.
Respondé "no" si muestra otra cosa (otra persona o lugar, algo genérico, una foto de stock, un logo o un gráfico en vez
de una foto, un collage, texto ilegible) o si la procedencia no tiene que ver. "dudoso" si no se puede saber.
En "motivo" contá qué se ve y en qué te basás.`,
      schema: VeredictoSchema,
      cwd: dir,
      herramientas: ["Read"],
      model: modelo,
      signal,
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

/** Crédito chiquito en pantalla: "Foto: Presidencia" / "Foto: El País" / "Foto: Wikimedia Commons". */
export const creditoCorto = (c: CandidataImagen) => {
  if (c.credito.trim()) return c.credito.startsWith("Foto") ? c.credito : `Foto: ${c.credito}`;
  try {
    return `Foto: ${new URL(c.pagina ?? c.url).hostname.replace(/^www\./, "")}`;
  } catch {
    return "Foto";
  }
};

export type Intento = CandidataImagen & { imagen: string | null; procedencia: string | null; veredicto: Veredicto | null; error: string | null };

/**
 * Prueba las candidatas en orden (noticia → oficial → Wikimedia → prensa) y se queda con la primera que Claude
 * confirma mirándola. Si ninguna, null (va una tarjeta de texto: nunca una imagen equivocada).
 */
export const elegirImagenReal = async (
  t: Trabajo,
  id: string,
  candidatas: CandidataImagen[],
  queDebeVerse: string,
  contexto: string,
  busquedaWikimedia: string | null,
  modelo: string,
  signal?: AbortSignal,
): Promise<{ elegida: (Intento & { archivo: string }) | null; intentos: Intento[] }> => {
  const lista = [...candidatas];
  // si Claude no trajo nada de Wikimedia, se prueba el artículo de Wikipedia/Commons
  if (busquedaWikimedia && !lista.some((c) => c.origen === "wikimedia")) {
    const w = await buscarWikimedia(busquedaWikimedia, signal).catch(() => null);
    if (w) lista.push({ url: w.url, pagina: w.pagina, origen: "wikimedia", credito: w.credito });
  }
  const orden: OrigenImagen[] = ["noticia", "oficial", "wikimedia", "prensa", "stock", "manual"];
  lista.sort((a, b) => orden.indexOf(a.origen) - orden.indexOf(b.origen));
  const intentos: Intento[] = [];
  for (const [n, c] of lista.slice(0, 5).entries()) {
    if (signal?.aborted) throw new Error("Cancelado");
    const intento: Intento = { ...c, imagen: null, procedencia: null, veredicto: null, error: null };
    intentos.push(intento);
    try {
      let imagen: string | null = c.url;
      if (pareceImagen(c.url)) {
        intento.procedencia = `${c.origen === "wikimedia" ? "Wikimedia Commons, archivo" : "imagen"} "${decodeURIComponent(path.basename(new URL(c.pagina ?? c.url).pathname)).replace(/_/g, " ")}"${c.credito ? ` (${c.credito})` : ""}`;
      } else {
        const d = await datosDePagina(c.url, signal);
        imagen = d.imagen;
        intento.procedencia = `imagen principal de la página "${d.titulo ?? c.url}"${d.descripcion ? ` — ${d.descripcion}` : ""} (${new URL(c.url).hostname})`;
      }
      if (!imagen) throw new Error("la página no tiene una imagen principal");
      intento.imagen = imagen;
      const rel = `material/${id}-${n + 1}.jpg`;
      await bajarImagen(imagen, t.ruta(rel), signal);
      t.actividad(`Mirando si la foto muestra ${queDebeVerse.slice(0, 50)}…`);
      intento.veredicto = await verificarImagen(t.ruta(rel), queDebeVerse, contexto, modelo, signal, intento.procedencia);
      if (intento.veredicto.muestra === "si") return { elegida: { ...intento, archivo: rel }, intentos };
      await rm(t.ruta(rel), { force: true });
    } catch (e) {
      intento.error = (e as Error).message.split("\n")[0]!;
    }
  }
  return { elegida: null, intentos };
};
