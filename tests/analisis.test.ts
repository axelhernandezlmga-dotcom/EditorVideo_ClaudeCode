import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dir = mkdtempSync(path.join(os.tmpdir(), "fabrica-analisis-"));
const bib = path.join(dir, "biblioteca");
process.env.FABRICA_BIBLIOTECA = bib;
process.env.FABRICA_DATOS_CLIPS = path.join(dir, "nada");
process.env.FABRICA_SIN_WHISPER = "1";
process.env.FABRICA_CLIPS_RECIENTES = path.join(dir, "recientes.json");

// un índice de la versión 1 (v1.0), con un clip ya descripto: se tiene que migrar sin perder nada
mkdirSync(path.join(bib, "medios", "video"), { recursive: true });
const viejo = path.join(bib, "medios", "video", "aaaaaa111111.mp4");
execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=10:duration=3", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", viejo]);
writeFileSync(
  path.join(bib, "biblioteca.json"),
  JSON.stringify({
    version: 1,
    categorias: [
      { id: "colorados", nombre: "Colorados", creada: "" },
      { id: "memes-varios", nombre: "Memes varios", creada: "" },
    ],
    recursos: [
      { id: "aaaaaa111111", tipo: "video", categoria: "memes-varios", nombre: "contando billetes", archivo: "video/aaaaaa111111.mp4", origen: "", duracion: 3, ancho: 320, alto: 240, orientacion: "horizontal", audio: true, transcripcion: null, descripcion: "Un hombre cuenta billetes", etiquetas: {}, descripcionPor: "claude", mood: null, bytes: 1, huella: "h1", importado: "" },
    ],
  }),
);

const b = await import("../src/pipeline/biblioteca");
const a = await import("../src/pipeline/analisis");
const sel = await import("../src/pipeline/seleccionClips");

const esperar = async () => {
  for (let i = 0; i < 300 && a.analisis.activa; i++) await new Promise((ok) => setTimeout(ok, 100));
};

describe("análisis de la biblioteca", () => {
  it("migra el índice v1 a v2 conservando descripciones (y queda guardado)", async () => {
    const x = await b.leerBiblioteca();
    expect(x.version).toBe(2);
    expect(x.recursos[0]).toMatchObject({ descripcion: "Un hombre cuenta billetes", usos: [], analisis: { local: null, claude: null } });
    expect(JSON.parse(readFileSync(path.join(bib, "biblioteca.json"), "utf8")).version).toBe(2);
  });

  it("muestra cuántos clips faltan y cuántos pedidos a Claude haría", async () => {
    const p = (await a.pendientesAnalisis())["memes-varios"]!;
    expect(p).toEqual({ clips: 1, local: 1, claude: 1, pedidos: 1 });
  });

  it("la fase local mide el volumen, arma la hoja de fotogramas, persiste y no repite", async () => {
    await a.analizarClips({ fase: "local", categoria: "memes-varios" });
    await esperar();
    expect(a.analisis.errores).toEqual([]);
    const r = (await b.leerBiblioteca()).recursos[0]!;
    expect(r.analisis.local).not.toBeNull();
    expect(r.volumenDb).toBeLessThan(0);
    expect(existsSync(path.join(bib, "fotogramas", `${r.id}.jpg`))).toBe(true);
    // otra corrida: nada pendiente (se reanuda sin repetir)
    await a.analizarClips({ fase: "local", categoria: "memes-varios" });
    await esperar();
    expect(a.analisis.total).toBe(0);
  });

  it("lo que corregís a mano no lo pisa el análisis con Claude", async () => {
    const [r] = (await b.leerBiblioteca()).recursos;
    await b.editarRecurso(r!.id, { usos: ["cuando alguien gasta mucha plata"], semantica: ["dinero"], tono: "eufórico" });
    const x = (await b.leerBiblioteca()).recursos[0]!;
    expect(x).toMatchObject({ descripcionPor: "manual", usos: ["cuando alguien gasta mucha plata"] });
    expect(a.faltaClaude(x)).toBe(false);
    expect((await a.pendientesAnalisis())["memes-varios"]!.claude).toBe(0);
  });

  it("los candidatos respetan las categorías elegidas y usan lo analizado", async () => {
    const uso = { modo: "auto" as const, categorias: ["colorados"], elegidos: [], audio: "auto" as const, frecuencia: "media" as const };
    expect(await sel.candidatosDelVideo(uso, "se gastó toda la plata")).toEqual([]);
    const c = await sel.candidatosDelVideo({ ...uso, categorias: ["memes-varios"] }, "se gastó toda la plata");
    expect(c.map((x) => x.id)).toEqual(["aaaaaa111111"]);
    expect(await sel.fichasClips(c)).toMatch(/sirve para: cuando alguien gasta mucha plata[\s\S]*audio: sí/);
  });

  it("anota los clips usados para no repetirlos en los videos siguientes", async () => {
    await sel.anotarRecientes(["aaaaaa111111"]);
    expect(await sel.leerRecientes()).toEqual(["aaaaaa111111"]);
  });
});
