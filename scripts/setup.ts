/**
 * npm run setup              → .venv con edge-tts + whisper.cpp
 * npm run setup -- --kokoro  → además Kokoro (voz offline): dependencias, modelos y una frase de prueba
 */
import { instalarKokoro, instalarVenv, instalarWhisper } from "../src/pipeline/instalar";

const log = (l: string) => console.log(l);
const conKokoro = process.argv.includes("--kokoro");

try {
  await instalarVenv(log);
  await instalarWhisper(log);
  if (conKokoro) await instalarKokoro(log);
  console.log(`\nListo.${conKokoro ? "" : " Para la voz offline: npm run setup -- --kokoro"}`);
} catch (e) {
  console.error(`\nNo se pudo terminar la instalación: ${(e as Error).message}`);
  process.exit(1);
}
