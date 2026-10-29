import { readFile } from "node:fs/promises";
import { leerMarca } from "../pipeline/config";
import { confirmarKit, previsualizarKit, rutaEnKit } from "../pipeline/kit";
import { coloresMarcaConKit, kitVisualDe } from "../pipeline/marca/kitVisual";
import { guardarFotoPerfil, guardarPerfil, leerPerfil } from "../pipeline/perfiles";
import { paletaDe, PALETAS, PerfilSchema, slugPerfil, type Perfil } from "../shared/perfiles";
import { colores as c, parsearArgs } from "./comun";

const AYUDA = `Uso:
  npm run perfil -- crear --carpeta <carpeta de la marca> --nombre "Mi Marca" --usuario @mimarca [--slug mi-marca] [--verificado]

Crea un perfil NUEVO (nunca pisa uno existente: si el nombre está usado, le agrega -2, -3…), importa la carpeta
como kit de marca (logos, símbolo, avatares, colores, tipografías, íconos y manual en PDF, que Claude lee para
sacar las reglas) y deja la paleta del perfil con los colores de la marca. Después revisalo en la app (Perfiles)
o con: npm run marca -- --hoja <slug>`;

/** Un slug libre a partir del pedido (no pisa perfiles existentes). */
const slugLibre = async (base: string) => {
  let slug = slugPerfil(base);
  for (let n = 2; await leerPerfil(slug); n++) slug = `${slugPerfil(base).slice(0, 44)}-${n}`;
  return slug;
};

const main = async () => {
  const { flags, posicionales } = parsearArgs(process.argv.slice(2));
  if (posicionales[0] !== "crear" || typeof flags.carpeta !== "string" || typeof flags.nombre !== "string") return console.log(AYUDA);
  const usuario = typeof flags.usuario === "string" ? (flags.usuario.startsWith("@") ? flags.usuario : `@${flags.usuario}`) : `@${slugPerfil(flags.nombre).replace(/-/g, ".")}`;
  const slug = await slugLibre(typeof flags.slug === "string" ? flags.slug : flags.nombre);

  // 1. el perfil (con una paleta provisoria) para que el kit tenga dónde vivir
  const base: Perfil = PerfilSchema.parse({ slug, nombre: flags.nombre, usuario, verificado: flags.verificado === true, paleta: "propia", colores: PALETAS[0]!.colores });
  await guardarPerfil(base);
  console.log(c.gris(`  · Perfil ${slug} creado. Importando la carpeta como kit de marca…`));

  // 2. el kit: se copia y se clasifica; si hay manual en PDF, Claude lo lee para las reglas
  const previa = await previsualizarKit(slug, { carpeta: flags.carpeta });
  console.log(c.gris(`  · Encontré ${Object.keys(previa.logos).length} logo(s), ${Object.keys(previa.simbolos).length} símbolo(s), ${previa.colores.length} color(es), ${previa.fuentes.length} tipografía(s), ${Object.keys(previa.iconos).length} ícono(s)${previa.manual ? " y un manual" : ""}.`));
  const { kit, desdeManual } = await confirmarKit(slug, (await leerMarca()).modeloClaude, (l) => console.log(c.gris(`  · ${l}`)));

  // 3. la paleta del perfil sale de los colores de la marca (por rol); la foto, del primer avatar
  const visual = await kitVisualDe(slug, null, { urlArchivo: (rel) => rel, fuentes: [] });
  let perfil = base;
  if (visual) {
    const m = coloresMarcaConKit(visual);
    const colores = { ...m, subtitulos: visual.colores.texto };
    perfil = await guardarPerfil({ ...perfil, colores, paleta: paletaDe(colores) });
  }
  const avatar = kit.avatares.find((a) => a.png);
  if (avatar?.png) perfil = await guardarFotoPerfil(slug, await readFile(rutaEnKit(slug, avatar.png)));

  console.log(c.verde(`✓ Perfil «${perfil.nombre}» (${perfil.usuario}) listo: config/perfiles/${slug}.json`));
  console.log(`  Colores: ${Object.entries(perfil.colores).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  console.log(`  Reglas de marca ${desdeManual ? "leídas del manual" : "por defecto (no había manual en PDF)"}: config/perfiles/${slug}/kit/marca.md`);
  console.log(`  Revisalo: npm run marca -- --hoja ${slug}`);
};

main().catch((e: Error) => {
  console.error(c.rojo(`✗ ${e.message}`));
  process.exit(1);
});
