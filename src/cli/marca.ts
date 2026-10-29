import { mkdir } from "node:fs/promises";
import path from "node:path";
import { leerMarca } from "../pipeline/config";
import { dirKit } from "../pipeline/kit";
import { coloresMarcaConKit, kitVisualDe } from "../pipeline/marca/kitVisual";
import { leerPerfil } from "../pipeline/perfiles";
import { ejecutar } from "../pipeline/proceso";
import { renderizarVideo, servirCarpeta } from "../pipeline/renderizador";
import { RAIZ } from "../pipeline/rutas";
import type { MarcaVisual } from "../shared/render";
import { colores as c, parsearArgs } from "./comun";

/**
 * Hoja de marca en movimiento de un perfil con kit: un video de ~22 s con todas las piezas animadas, más una
 * tira de 12 fotogramas. Uso: npm run marca -- --hoja <slug-del-perfil>
 */
const main = async () => {
  const { flags } = parsearArgs(process.argv.slice(2));
  const slug = typeof flags.hoja === "string" ? flags.hoja : null;
  if (!slug) throw new Error("Uso: npm run marca -- --hoja <slug-del-perfil>");
  const perfil = await leerPerfil(slug);
  if (!perfil) throw new Error(`No existe el perfil ${slug}`);
  const servidor = await servirCarpeta(dirKit(slug));
  try {
    const kit = await kitVisualDe(slug, null, { urlArchivo: (rel) => `${servidor.url}/${rel.split("/").map(encodeURIComponent).join("/")}`, fuentes: [{ titulo: "Parlamento del Uruguay", url: "https://parlamento.gub.uy" }] });
    if (!kit) throw new Error(`El perfil ${slug} no tiene kit de marca: importalo en Perfiles.`);
    const m = await leerMarca();
    const marca: MarcaVisual = { usuario: perfil.usuario, nombre: perfil.nombre, verificado: perfil.verificado, colores: coloresMarcaConKit(kit), tipografia: "kit", kit, subtitulos: { ...perfil.subtitulos, fondo: kit.colores.fondo } };
    const dir = path.join(RAIZ, "out", "marca");
    await mkdir(dir, { recursive: true });
    const salida = path.join(dir, `hoja-${slug}.mp4`);
    console.log(c.gris(`Renderizando la hoja de marca de ${perfil.nombre} (${m.usuario === perfil.usuario ? "perfil por defecto" : perfil.usuario})…`));
    let ultimo = -1;
    await renderizarVideo({
      props: { marca },
      salida,
      composicion: "HojaMarca",
      onProgreso: (p) => {
        const pct = Math.floor(p * 10) * 10;
        if (pct !== ultimo) console.log(c.gris(`  · ${(ultimo = pct)} %`));
      },
    });
    const tira = path.join(dir, `hoja-${slug}-tira.png`);
    const dur = Number((await ejecutar("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", salida])).trim());
    await ejecutar("ffmpeg", ["-loglevel", "error", "-y", "-i", salida, "-vf", `fps=12/${dur.toFixed(2)},scale=270:-1,tile=6x2`, "-frames:v", "1", tira]);
    console.log(`${c.verde("✓")} ${path.relative(RAIZ, salida)} (${dur.toFixed(1)} s)\n${c.verde("✓")} ${path.relative(RAIZ, tira)}`);
  } finally {
    await servidor.cerrar();
  }
};

main().catch((e: Error) => {
  console.error(c.rojo(`✗ ${e.message}`));
  process.exit(1);
});
