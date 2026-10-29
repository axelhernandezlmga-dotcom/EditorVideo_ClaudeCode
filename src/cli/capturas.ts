import { existsSync } from "node:fs";
import { copyFile, mkdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { MaterialSchema } from "../shared/material";
import { medidasImagen } from "../pipeline/crudo/imagenes";
import { usarCapturaPropia } from "../pipeline/crudo/material";
import { Trabajo } from "../pipeline/trabajo";
import { colores as c, parsearArgs } from "./comun";

const AYUDA = `
Noticias que quedaron PENDIENTES en los crudos (las usa la skill /capturar-noticias):
  npm run capturas -- pendientes                       (JSON con las noticias por capturar)
  npm run capturas -- listo <trabajo> <id> <imagen> ['<rects JSON>']
                                                       (guarda la captura y marca la noticia como lista)

<imagen> puede ser una ruta, o solo el nombre de un archivo en tu carpeta de Descargas.
<rects> (opcional): dónde está la frase a resaltar, [{"x":0.1,"y":0.2,"w":0.5,"h":0.08}] relativo a la imagen.
`;

/** Carpeta de descargas del sistema (en español o en inglés). */
const descargas = () => [path.join(os.homedir(), "Descargas"), path.join(os.homedir(), "Downloads")].find(existsSync) ?? path.join(os.homedir(), "Downloads");

const main = async () => {
  const { posicionales } = parsearArgs(process.argv.slice(2));
  const [accion, ...resto] = posicionales;
  if (accion === "pendientes") {
    const out = [];
    for (const e of await Trabajo.listar()) {
      if (e.tipo !== "crudo") continue;
      const t = await Trabajo.abrir(e.id);
      const m = await t.leer("material.json", MaterialSchema);
      for (const it of m?.items ?? []) {
        if (it.tipo !== "noticia" || it.estado !== "pendiente" || !it.noticia) continue;
        out.push({ trabajo: e.id, id: it.id, url: it.noticia.url, titulo: it.noticia.titulo, medio: it.noticia.medio, resaltado: it.noticia.resaltado, pedidaConChrome: it.noticia.pedirChrome, motivo: it.motivo ?? null, nombreSugerido: `captura-${e.id}-${it.id}.png` });
      }
    }
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  if (accion === "listo" && (resto.length === 3 || resto.length === 4)) {
    const [id, mid, imagen, rectsJson] = resto as [string, string, string, string | undefined];
    const rects = rectsJson ? z.array(z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })).parse(JSON.parse(rectsJson)) : [];
    const origen = existsSync(imagen) ? imagen : path.join(descargas(), imagen);
    if (!existsSync(origen)) throw new Error(`No encuentro la imagen: ${imagen} (busqué también en ${descargas()}).`);
    if ((await stat(origen)).size < 2000) throw new Error("La imagen está vacía o es demasiado chica.");
    const t = await Trabajo.abrir(id);
    const { ancho, alto, ext } = await medidasImagen(origen);
    await mkdir(t.ruta("capturas"), { recursive: true });
    const rel = `capturas/${mid}-chrome${ext}`;
    await copyFile(origen, t.ruta(rel));
    await usarCapturaPropia(t, mid, rel, ancho, alto, "chrome", rects);
    if (!existsSync(imagen)) await rm(origen, { force: true });
    await t.log(`Noticia ${mid} capturada con Chrome (${ancho}×${alto}).`);
    console.log(c.verde(`✓ ${id} · ${mid}: lista (${rel})`));
    return;
  }
  console.log(AYUDA);
  process.exit(1);
};

main().catch((e: Error) => {
  console.error(c.rojo(`✗ ${e.message}`));
  process.exit(1);
});
