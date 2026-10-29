import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

// jobs/ de prueba: nunca se tocan los trabajos reales
const raiz = mkdtempSync(path.join(tmpdir(), "fabrica-borrado-"));
const jobs = path.join(raiz, "jobs");
process.env.FABRICA_JOBS = jobs;
const { borrarTrabajo, carpetaSegura, espacioTrabajo, recuperarTrabajo } = await import("../src/pipeline/borrado");

const crear = (id: string) => {
  const dir = path.join(jobs, id);
  mkdirSync(path.join(dir, "audio"), { recursive: true });
  const estado = { id, tipo: "crudo", idea: id, creado: "2026-10-26T00:00:00Z", actualizado: "2026-10-26T00:00:00Z", estado: "listo", pasos: {}, opciones: {} };
  writeFileSync(path.join(dir, "estado.json"), JSON.stringify(estado));
  writeFileSync(path.join(dir, "video.mp4"), Buffer.alloc(100));
  writeFileSync(path.join(dir, "portada.png"), Buffer.alloc(10));
  writeFileSync(path.join(dir, "proxy.mp4"), Buffer.alloc(1000));
  writeFileSync(path.join(dir, "audio", "limpio.wav"), Buffer.alloc(500));
  return dir;
};

describe("borrar trabajos", () => {
  beforeEach(() => mkdirSync(jobs, { recursive: true }));

  it("nunca sale de jobs/: rechaza .., rutas, la propia carpeta y enlaces", async () => {
    const afuera = path.join(raiz, "clips");
    mkdirSync(afuera, { recursive: true });
    writeFileSync(path.join(afuera, "mio.mp4"), "x");
    symlinkSync(afuera, path.join(jobs, "enlace"));
    for (const id of ["..", ".", "../clips", "/etc", "", ".subidas", "enlace"]) {
      await expect(borrarTrabajo(id, "disco")).rejects.toThrow();
    }
    expect(existsSync(path.join(afuera, "mio.mp4"))).toBe(true);
    await expect(carpetaSegura("no-existe")).rejects.toThrow(/No existe/);
  });

  it("disco: borra la carpeta entera y devuelve lo liberado", async () => {
    const dir = crear("a");
    const esperado = 1610 + readFileSync(path.join(dir, "estado.json")).length;
    expect(await borrarTrabajo("a", "disco")).toBe(esperado);
    expect(existsSync(dir)).toBe(false);
  });

  it("soloFinal: deja video, portada y estado; calcula antes lo que libera", async () => {
    const dir = crear("b");
    const antes = await espacioTrabajo("b");
    expect(antes.liberaSoloFinal).toBe(1500);
    expect(await borrarTrabajo("b", "soloFinal")).toBe(1500);
    expect(existsSync(path.join(dir, "video.mp4"))).toBe(true);
    expect(existsSync(path.join(dir, "portada.png"))).toBe(true);
    expect(existsSync(path.join(dir, "proxy.mp4"))).toBe(false);
    expect(existsSync(path.join(dir, "audio"))).toBe(false);
    expect(JSON.parse(readFileSync(path.join(dir, "estado.json"), "utf8")).soloFinal).toBe(true);
  });

  it("lista: oculta sin borrar archivos y se puede recuperar", async () => {
    const dir = crear("c");
    expect(await borrarTrabajo("c", "lista")).toBe(0);
    expect(existsSync(path.join(dir, "proxy.mp4"))).toBe(true);
    expect(JSON.parse(readFileSync(path.join(dir, "estado.json"), "utf8")).oculto).toBe(true);
    await recuperarTrabajo("c");
    expect(JSON.parse(readFileSync(path.join(dir, "estado.json"), "utf8")).oculto).toBeUndefined();
  });
});
