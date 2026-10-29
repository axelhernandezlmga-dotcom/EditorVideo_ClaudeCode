import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analisisVacio, coincideBusqueda, enCategorias, orientacionDe, slugCategoria, type Recurso } from "../src/shared/biblioteca";

const dir = mkdtempSync(path.join(os.tmpdir(), "fabrica-biblioteca-"));
process.env.FABRICA_BIBLIOTECA = path.join(dir, "biblioteca");
process.env.FABRICA_DATOS_CLIPS = path.join(dir, "clips-viejos");
const b = await import("../src/pipeline/biblioteca");

const origen = path.join(dir, "origen");
/** Un clip de video de 2 s y un audio corto, hechos con ffmpeg. */
const fabricar = () => {
  mkdirSync(path.join(origen, "Reacciones"), { recursive: true });
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=10:duration=2", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", path.join(origen, "Reacciones", "no contaban con mi astucia.mp4")]);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=880:duration=1", path.join(origen, "ding.wav")]);
  writeFileSync(path.join(origen, "notas.txt"), "no es un medio");
};

const recurso = (x: Partial<Recurso>): Recurso => ({
  id: "abc123",
  tipo: "video",
  categoria: "memes-varios",
  nombre: "x",
  archivo: "video/abc123.mp4",
  origen: "",
  duracion: 3,
  ancho: 1920,
  alto: 1080,
  orientacion: "horizontal",
  audio: true,
  transcripcion: null,
  descripcion: "",
  etiquetas: { lugar: [], personas: [], objetos: [], accion: [], mood: [] },
  descripcionPor: "nombre",
  ...analisisVacio(),
  mood: null,
  bytes: 1,
  huella: "h",
  importado: "2026-10-29T00:00:00.000Z",
  ...x,
});

beforeAll(fabricar);
afterAll(() => b._reiniciarCache());

describe("biblioteca (funciones puras)", () => {
  it("busca sin tildes por nombre, descripción, etiquetas y transcripción", () => {
    const c = recurso({ nombre: "Batlle polémico", descripcion: "en un estudio de TV", transcripcion: "son una manga de ladrones" });
    expect(coincideBusqueda(c, "batlle polemico")).toBe(true);
    expect(coincideBusqueda(c, "manga ladrones")).toBe(true);
    expect(coincideBusqueda(c, "rambla")).toBe(false);
  });

  it("slug, orientación y filtro de categorías (vacío = todas)", () => {
    expect(slugCategoria("Memes varios")).toBe("memes-varios");
    expect(slugCategoria("Frente Amplio")).toBe("frente-amplio");
    expect(orientacionDe(1080, 1920)).toBe("vertical");
    expect(enCategorias(recurso({ categoria: "colorados" }), [])).toBe(true);
    expect(enCategorias(recurso({ categoria: "frente-amplio" }), ["colorados", "memes-varios"])).toBe(false);
  });

});

describe("biblioteca (archivos)", () => {
  it("arranca con Colorados y Memes varios", async () => {
    const bib = await b.leerBiblioteca();
    expect(bib.categorias.map((c) => c.nombre)).toEqual(["Colorados", "Memes varios"]);
  });

  it("crea, renombra (mismo id) y no repite nombres", async () => {
    const c = await b.crearCategoria("Frente Amplio");
    expect(c.id).toBe("frente-amplio");
    await expect(b.crearCategoria("frente amplio")).rejects.toThrow(/Ya existe/);
    const r = await b.renombrarCategoria(c.id, "FA");
    expect(r.id).toBe("frente-amplio");
    expect(r.nombre).toBe("FA");
  });

  it("importa una carpeta: video con miniatura, audio corto como efecto, ignora lo que no es medio y detecta duplicados", async () => {
    await b.importarCarpeta(origen, { categoria: "memes-varios" });
    for (let i = 0; i < 200 && b.importacion.activa; i++) await new Promise((ok) => setTimeout(ok, 100));
    expect(b.importacion.importados).toBe(2);
    const bib = await b.leerBiblioteca();
    const video = bib.recursos.find((r) => r.tipo === "video")!;
    expect(video.nombre).toBe("no contaban con mi astucia");
    expect(video.etiquetas.objetos).toContain("reacciones");
    expect(existsSync(b.rutaRecurso(video))).toBe(true);
    expect(existsSync(path.join(process.env.FABRICA_BIBLIOTECA!, "miniaturas", `${video.id}.jpg`))).toBe(true);
    expect(bib.recursos.find((r) => r.nombre === "ding")?.tipo).toBe("sfx");
    // la misma carpeta otra vez: todo duplicado
    await b.importarCarpeta(origen, { categoria: "colorados" });
    for (let i = 0; i < 200 && b.importacion.activa; i++) await new Promise((ok) => setTimeout(ok, 100));
    expect(b.importacion.importados).toBe(0);
    expect(b.importacion.duplicados).toBe(2);
    // el original no se toca
    expect(existsSync(path.join(origen, "Reacciones", "no contaban con mi astucia.mp4"))).toBe(true);
  });

  it("mueve, renombra, filtra por categoría y borra", async () => {
    const video = (await b.recursosDe("video"))[0]!;
    await b.moverRecursos([video.id], "frente-amplio");
    expect(await b.recursosDe("video", ["colorados", "memes-varios"])).toHaveLength(0);
    expect(await b.recursosDe("video", ["frente-amplio"])).toHaveLength(1);
    const r = await b.editarRecurso(video.id, { nombre: "astucia" });
    expect(r.nombre).toBe("astucia");
    // borrar la categoría moviendo sus archivos a otra
    await b.borrarCategoria("frente-amplio", "memes-varios");
    expect((await b.recursosDe("video", ["memes-varios"]))[0]?.id).toBe(video.id);
    expect(await b.borrarRecursos([video.id])).toBe(1);
    expect(existsSync(b.rutaRecurso(video))).toBe(false);
  });

  it("nunca resuelve fuera de biblioteca/medios", () => {
    expect(() => b.rutaRecurso({ archivo: "../../etc/passwd" })).toThrow(/fuera/);
  });
});
