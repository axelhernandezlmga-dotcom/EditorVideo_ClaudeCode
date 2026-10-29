import { mkdir } from "node:fs/promises";
import path from "node:path";
import { openBrowser, renderStill, selectComposition } from "@remotion/renderer";
import { obtenerBundle } from "../pipeline/renderizador";
import { RAIZ } from "../pipeline/rutas";
import { celdasCatalogo, celdasPrueba, escribirCatalogo } from "../pipeline/ilustracion/catalogo";
import type { HojaProps } from "../remotion/ilustracion/Hoja";
import type { TipoPieza } from "../remotion/ilustracion/biblioteca";
import { IDS_ESTILOS, type IdEstilo } from "../remotion/ilustracion/estilo";
import { colores as c, parsearArgs } from "./comun";

const DIR = path.join(RAIZ, "assets", "ilustracion");

/**
 * Biblioteca de ilustración: hojas de prueba (cada pieza en varias poses o frames) y hoja de catálogo.
 * Uso: npm run ilustracion -- --prueba personaje:jubilado,objeto:alcancia [--estilo cartoon]
 *      npm run ilustracion -- --prueba todo
 *      npm run ilustracion -- --catalogo        (assets/ilustracion/catalogo.json + catalogo.png)
 */
const main = async () => {
  const { flags } = parsearArgs(process.argv.slice(2));
  const estilo = (typeof flags.estilo === "string" && (IDS_ESTILOS as string[]).includes(flags.estilo) ? flags.estilo : "plano") as IdEstilo;
  const hojas: [string, HojaProps][] = [];
  if (typeof flags.prueba === "string") {
    for (const [tipo, id] of celdasPrueba.listar(flags.prueba)) {
      hojas.push([path.join(DIR, "pruebas", `${tipo}-${id}${estilo === "plano" ? "" : `-${estilo}`}.png`), celdasPrueba.hoja(tipo as TipoPieza, id, estilo)]);
    }
  }
  if (flags.catalogo) {
    await escribirCatalogo(path.join(DIR, "catalogo.json"));
    console.log(c.verde(`✓ ${path.relative(RAIZ, path.join(DIR, "catalogo.json"))}`));
    hojas.push([path.join(DIR, "catalogo.png"), celdasCatalogo()]);
  }
  if (!hojas.length) throw new Error("Decí qué hacer: --prueba <tipo:id,…|todo> o --catalogo");
  await mkdir(path.join(DIR, "pruebas"), { recursive: true });
  console.log(c.gris("Empaquetando Remotion…"));
  const serveUrl = await obtenerBundle();
  const navegador = await openBrowser("chrome");
  try {
    for (const [salida, props] of hojas) {
      const inputProps = props as unknown as Record<string, unknown>;
      const composition = await selectComposition({ serveUrl, id: "HojaIlustracion", inputProps, puppeteerInstance: navegador });
      await renderStill({ serveUrl, composition, inputProps, frame: composition.durationInFrames - 1, output: salida, imageFormat: "png", puppeteerInstance: navegador });
      console.log(`${c.verde("✓")} ${path.relative(RAIZ, salida)}`);
    }
  } finally {
    await navegador.close({ silent: true });
  }
};

main().catch((e: Error) => {
  console.error(c.rojo(`✗ ${e.message}`));
  process.exit(1);
});
