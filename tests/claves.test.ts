import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

// .env de prueba: nunca se toca el real
const dir = mkdtempSync(path.join(tmpdir(), "fabrica-claves-"));
process.env.FABRICA_ENV = path.join(dir, ".env");
const { claveDe, estadoClaves, guardarClave } = await import("../src/pipeline/claves");

describe("claves en .env", () => {
  beforeEach(() => writeFileSync(process.env.FABRICA_ENV!, "OTRA=cosa\nPIXABAY_API_KEY=vieja1234\n"));

  it("pisa solo la clave indicada y deja el resto", async () => {
    await guardarClave("PIXABAY_API_KEY", "nueva-abcd");
    await guardarClave("GEMINI_API_KEY", "AIzaPrueba9876");
    const env = readFileSync(process.env.FABRICA_ENV!, "utf8");
    expect(env).toContain("OTRA=cosa");
    expect(env).toContain("PIXABAY_API_KEY=nueva-abcd");
    expect(env).not.toContain("vieja1234");
    expect(claveDe("GEMINI_API_KEY")).toBe("AIzaPrueba9876");
  });

  it("borra con null", async () => {
    await guardarClave("PIXABAY_API_KEY", null);
    expect(claveDe("PIXABAY_API_KEY")).toBeNull();
  });

  it("el estado nunca trae la clave entera", async () => {
    await guardarClave("GEMINI_API_KEY", "AIzaSecretoLargo5555");
    const json = JSON.stringify(await estadoClaves());
    expect(json).not.toContain("AIzaSecretoLargo");
    expect(json).toContain('"final":"5555"');
  });

  it("rechaza claves con espacios", async () => {
    await expect(guardarClave("GEMINI_API_KEY", "dos partes")).rejects.toThrow();
  });
});
