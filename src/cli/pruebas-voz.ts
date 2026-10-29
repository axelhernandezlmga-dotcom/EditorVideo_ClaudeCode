import { leerMarca } from "../pipeline/config";
import { generarMuestra, TEXTOS_MUESTRA } from "../pipeline/muestras";
import { colores as c } from "./comun";

/**
 * `npm run pruebas-voz` → un audio por tono en pruebas-voz/, con una voz de Gemini elegida para cada tono
 * y el mismo texto con la voz de respaldo (edge-tts) para comparar.
 * `npm run pruebas-voz -- --voz gemini:Kore` usa la misma voz de Gemini en todos.
 */
const POR_TONO: Record<string, string> = {
  academico: "gemini:Charon",
};

const args = process.argv.slice(2);
const i = args.indexOf("--voz");
const forzada = i >= 0 ? args[i + 1] : undefined;
const rehacer = args.includes("--rehacer");

const marca = await leerMarca();
for (const tono of Object.keys(TEXTOS_MUESTRA)) {
  for (const voz of [forzada ?? POR_TONO[tono]!, marca.vozRespaldo]) {
    try {
      const m = await generarMuestra(marca, tono, voz, { rehacer });
      console.log(c.verde(`✓ ${tono} · ${voz} → pruebas-voz/${m.archivo} (${m.segundos} s)`));
    } catch (e) {
      console.log(c.rojo(`✗ ${tono} · ${voz}: ${(e as Error).message}`));
    }
  }
}
