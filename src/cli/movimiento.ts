import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ffmpeg } from "../pipeline/proceso";
import { RAIZ } from "../pipeline/rutas";
import { colores as c } from "./comun";
import { leerPngGris } from "./png";

/** Ventana de la regla de oro: nunca más de 0,5 s sin movimiento. */
const VENTANA = 15;
/** % mínimo de píxeles que tienen que cambiar de forma visible en cada ventana. */
const MINIMO = 1;

/**
 * Verifica la regla de oro en un MP4 ya renderizado: compara cada frame con el de 0,5 s después
 * (a 108×192, en grises) y avisa si en alguna ventana cambia menos del 1 % de la imagen.
 * Uso: npm run movimiento -- <id-del-trabajo | ruta/al/video.mp4>
 */
const main = async () => {
  const arg = process.argv[2];
  if (!arg) throw new Error("Uso: npm run movimiento -- <id-del-trabajo | video.mp4>");
  const video = arg.endsWith(".mp4") ? path.resolve(arg) : path.join(RAIZ, "jobs", arg, "video.mp4");
  const tmp = await mkdtemp(path.join(os.tmpdir(), "fabrica-mov-"));
  try {
    console.log(c.gris("Extrayendo fotogramas…"));
    await ffmpeg(["-y", "-i", video, "-vf", "scale=108:192", path.join(tmp, "f%05d.png")]);
    const archivos = (await readdir(tmp)).filter((f) => f.endsWith(".png")).sort();
    const frames = await Promise.all(archivos.map(async (f) => leerPngGris(await readFile(path.join(tmp, f))).gris));
    const quietas: { frame: number; pct: number }[] = [];
    let minimo = { frame: 0, pct: 100 };
    for (let i = 0; i + VENTANA < frames.length; i++) {
      const a = frames[i]!;
      const b = frames[i + VENTANA]!;
      let d = 0;
      for (let k = 0; k < a.length; k++) if (Math.abs(a[k]! - b[k]!) > 24) d++;
      const pct = (100 * d) / a.length;
      if (pct < minimo.pct) minimo = { frame: i, pct };
      if (pct < MINIMO) quietas.push({ frame: i, pct });
    }
    console.log(`${frames.length} frames · cambio mínimo en 0,5 s: ${minimo.pct.toFixed(2)} % (en ${(minimo.frame / 30).toFixed(1)} s)`);
    if (quietas.length) {
      const seg = [...new Set(quietas.map((q) => (q.frame / 30).toFixed(1)))].slice(0, 12).join(", ");
      console.log(c.rojo(`✗ ${quietas.length} ventana(s) de 0,5 s casi sin movimiento, en: ${seg} s`));
      process.exitCode = 1;
    } else console.log(c.verde(`✓ Nunca pasan 0,5 s sin movimiento (siempre cambia más del ${MINIMO} % de la imagen).`));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
};

main().catch((e: Error) => {
  console.error(c.rojo(`✗ ${e.message}`));
  process.exit(1);
});
