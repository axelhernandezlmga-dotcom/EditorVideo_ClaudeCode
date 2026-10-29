import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { openBrowser, renderStill, selectComposition } from "@remotion/renderer";
import { ANCHO, type EscenaRender, type VideoProps } from "../shared/render";
import { leerJson, obtenerBundle, servirCarpeta } from "../pipeline/renderizador";
import { RAIZ } from "../pipeline/rutas";
import { aRender, escenasDemo, marcaEjemplo } from "../remotion/ejemplo";
import { TIRA_ESCALA, TIRA_SEPARACION, type TiraProps } from "../remotion/Tira";
import { colores as c, parsearArgs } from "./comun";
import { dirKit } from "../pipeline/kit";
import { coloresMarcaConKit, kitVisualDe } from "../pipeline/marca/kitVisual";
import { leerPerfil } from "../pipeline/perfiles";
import { leerPngGris } from "./png";

const PUNTOS = [0.1, 0.4, 0.7, 0.95];
/** Si entre dos cuadros seguidos cambia menos de este % de píxeles, la plantilla se considera quieta. */
const UMBRAL_QUIETA = 3;

/** % de píxeles que cambian de forma visible (más de 24 niveles de gris) entre el cuadro i y el i+1 de la tira. */
const cambiosEntreCuadros = (png: Buffer, n: number): number[] => {
  const { ancho, alto, gris } = leerPngGris(png);
  const w = Math.round(ANCHO * TIRA_ESCALA);
  const out: number[] = [];
  for (let k = 0; k < n - 1; k++) {
    const x0 = k * (w + TIRA_SEPARACION);
    const x1 = (k + 1) * (w + TIRA_SEPARACION);
    let distintos = 0;
    for (let y = 0; y < alto; y++) {
      for (let x = 0; x < w; x++) {
        if (Math.abs(gris[y * ancho + x0 + x]! - gris[y * ancho + x1 + x]!) > 24) distintos++;
      }
    }
    out.push((100 * distintos) / (w * alto));
  }
  return out;
};

/**
 * Verificación de movimiento: por cada plantilla renderiza la escena congelada al 10/40/70/95 % en una
 * tira de 4 imágenes (out/plantillas/<nombre>.png) y mide qué % de píxeles cambia entre cuadros seguidos.
 * Uso: npm run plantillas [-- --zonas] [-- --solo mapa,lista]
 *      npm run plantillas -- --trabajo <id>     (las escenas de un video ya hecho → out/plantillas/<id>/escena-N.png)
 */
const main = async () => {
  const { flags } = parsearArgs(process.argv.slice(2));
  const solo = typeof flags.solo === "string" ? flags.solo.split(",") : null;
  const trabajo = typeof flags.trabajo === "string" ? flags.trabajo : null;
  const dir = path.join(RAIZ, "out", "plantillas", trabajo ?? (typeof flags.perfil === "string" ? `perfil-${flags.perfil}` : ""));
  await mkdir(dir, { recursive: true });
  // escenas a verificar: las de muestra, o las de un trabajo (con sus captions reales)
  let servidor: Awaited<ReturnType<typeof servirCarpeta>> | null = null;
  let escenas: [string, EscenaRender][];
  let marca = marcaEjemplo;
  if (trabajo) {
    const dirTrabajo = path.join(RAIZ, "jobs", trabajo);
    servidor = await servirCarpeta(dirTrabajo);
    const base = await leerJson<VideoProps>(path.join(dirTrabajo, "render-props.json"));
    const conUrl = JSON.parse(JSON.stringify(base).replaceAll('"./', `"${servidor.url}/`)) as VideoProps;
    marca = conUrl.marca;
    escenas = conUrl.escenas.map((e, i) => [`escena-${i + 1}-${e.plantilla}`, e]);
  } else escenas = Object.entries(escenasDemo).map(([n, e]) => [n, aRender(e)]);
  // --perfil <slug>: las plantillas con la marca de ese perfil (si tiene kit, con sus fuentes, colores y piezas)
  let servidorKit: Awaited<ReturnType<typeof servirCarpeta>> | null = null;
  if (typeof flags.perfil === "string") {
    const p = await leerPerfil(flags.perfil);
    if (!p) throw new Error(`No existe el perfil ${flags.perfil}`);
    servidorKit = await servirCarpeta(dirKit(p.slug));
    const base = servidorKit.url;
    const kit = await kitVisualDe(p.slug, null, { urlArchivo: (rel) => `${base}/${rel.split("/").map(encodeURIComponent).join("/")}`, fuentes: [{ titulo: "Parlamento", url: "https://parlamento.gub.uy" }] });
    marca = kit
      ? { usuario: p.usuario, nombre: p.nombre, verificado: p.verificado, colores: coloresMarcaConKit(kit), tipografia: "kit", kit, subtitulos: { ...p.subtitulos, fondo: kit.colores.fondo } }
      : { usuario: p.usuario, colores: { fondo: p.colores.fondo, fondo2: p.colores.fondo2, texto: p.colores.texto, acento: p.colores.acento, acento2: p.colores.acento2 }, tipografia: p.tipografia };
  }
  console.log(c.gris("Empaquetando Remotion…"));
  const serveUrl = await obtenerBundle();
  const navegador = await openBrowser("chrome");
  const quietas: string[] = [];
  try {
    for (const [nombre, render] of escenas) {
      if (solo && !solo.includes(nombre)) continue;
      const video: VideoProps = {
        marca,
        escenas: [render],
        musicaSrc: null,
        volumenMusica: 0,
        sfxSrc: null,
        paginaSubtitulosMs: 1200,
        mostrarZonas: flags.zonas === true,
      };
      const props: TiraProps = { video, frames: PUNTOS.map((p) => Math.min(render.duracionFrames - 1, Math.round(render.duracionFrames * p))) };
      const inputProps = props as unknown as Record<string, unknown>;
      const composition = await selectComposition({ serveUrl, id: "Tira", inputProps, puppeteerInstance: navegador });
      const tira = path.join(dir, `${nombre}.png`);
      await renderStill({ serveUrl, composition, inputProps, frame: 0, output: tira, imageFormat: "png", puppeteerInstance: navegador });
      const cambios = cambiosEntreCuadros(await readFile(tira), PUNTOS.length);
      const quieta = cambios.some((x) => x < UMBRAL_QUIETA);
      if (quieta) quietas.push(nombre);
      const detalle = cambios.map((x) => `${x.toFixed(1).padStart(4)} %`).join(" · ");
      console.log(`${quieta ? c.rojo("✗ QUIETA  ") : c.verde("✓ se mueve")}  ${nombre.padEnd(18)} cambio 10→40 · 40→70 · 70→95: ${detalle}  ${c.gris(path.relative(RAIZ, tira))}`);
    }
  } finally {
    await navegador.close({ silent: true });
    await servidor?.cerrar();
    await servidorKit?.cerrar();
  }
  console.log(
    quietas.length
      ? c.rojo(`\n${quietas.length} plantilla(s) con cuadros casi iguales: ${quietas.join(", ")}`)
      : c.verde("\nTodas las plantillas cambian entre el 10, 40, 70 y 95 % de la escena."),
  );
  if (quietas.length) process.exitCode = 1;
};

main().catch((e: Error) => {
  console.error(c.rojo(`✗ ${e.message}`));
  process.exit(1);
});
