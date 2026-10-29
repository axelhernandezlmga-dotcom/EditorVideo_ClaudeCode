import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analisisVacio, type Recurso } from "../src/shared/biblioteca";
import type { Trabajo } from "../src/pipeline/trabajo";

const dir = mkdtempSync(path.join(os.tmpdir(), "fabrica-corte-"));
process.env.FABRICA_BIBLIOTECA = path.join(dir, "biblioteca");
const { cortarClip } = await import("../src/pipeline/crudo/clipsCrudo");

const medir = (archivo: string) => {
  return spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", archivo, "-af", "ebur128=peak=true", "-f", "null", "-"]).stderr.toString();
};
const corre = (a: string) => execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", a]).toString();

describe("cortar un clip de la biblioteca", () => {
  mkdirSync(path.join(dir, "biblioteca", "medios", "video"), { recursive: true });
  const fuente = path.join(dir, "biblioteca", "medios", "video", "meme.mp4");
  // un meme con el audio MUY fuerte (saturado): el corte lo tiene que dejar parejo y sin picos
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=30:duration=5", "-f", "lavfi", "-i", "sine=frequency=500:duration=5,volume=6", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", fuente]);
  const c = { id: "meme01", tipo: "video", categoria: "x", nombre: "meme", archivo: "video/meme.mp4", origen: "", duracion: 5, ancho: 320, alto: 240, orientacion: "horizontal", audio: true, transcripcion: null, descripcion: "", etiquetas: { lugar: [], personas: [], objetos: [], accion: [], mood: [] }, descripcionPor: "nombre", ...analisisVacio(), mood: null, bytes: 1, huella: "h", importado: "" } as Recurso;
  const t = { ruta: (r: string) => path.join(dir, "trabajo", r) } as unknown as Trabajo;

  it("con audio: lo conserva sincronizado, nivelado a ~-16 LUFS y con picos por debajo de 0 dB", async () => {
    const r = await cortarClip(t, c, 1, 3, "clips/con.mp4", { conAudio: true });
    expect(r.conAudio).toBe(true);
    const archivo = t.ruta("clips/con.mp4");
    expect(corre(archivo)).toMatch(/video[\s\S]*audio|audio[\s\S]*video/);
    const m = medir(archivo);
    const lufs = Number(/I:\s+(-?[\d.]+) LUFS/.exec(m.slice(m.lastIndexOf("Summary")))![1]);
    const pico = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(m.slice(m.lastIndexOf("Summary")))![1]);
    expect(lufs).toBeGreaterThan(-19);
    expect(lufs).toBeLessThan(-13);
    expect(pico).toBeLessThan(0);
  });

  it("sin audio: el clip queda mudo (como antes)", async () => {
    const r = await cortarClip(t, c, 1, 3, "clips/sin.mp4", { conAudio: false });
    expect(r.conAudio).toBe(false);
    expect(corre(t.ruta("clips/sin.mp4")).trim()).toBe("video");
  });

  it("con audio deja durar hasta 8 s (la frase completa); sin audio, 5", async () => {
    const largo = { ...c, duracion: 5 };
    expect((await cortarClip(t, largo, 0, 7, "clips/l1.mp4", { conAudio: true })).dur).toBeCloseTo(5, 1);
    expect((await cortarClip(t, largo, 0, 7, "clips/l2.mp4")).dur).toBe(5);
  });
});
