import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

// data/ de prueba: nunca se toca el contador real
const dir = mkdtempSync(path.join(tmpdir(), "fabrica-uso-"));
process.env.FABRICA_ENV = path.join(dir, ".env");
process.env.FABRICA_SIN_NOTIFICACIONES = "1";
const { diaGoogle, leerUso, proximoReinicio, registrarAgotado, registrarPedido, segundosWav } = await import("../src/pipeline/usoGemini");

describe("reinicio del cupo (medianoche del Pacífico)", () => {
  it("con horario de verano de EE. UU. es a las 4:00 de Uruguay", () => {
    const r = proximoReinicio(new Date("2026-10-25T18:00:00-03:00"));
    expect(r.toISOString()).toBe("2026-10-26T07:00:00.000Z");
  });
  it("sin horario de verano es a las 5:00 de Uruguay", () => {
    const r = proximoReinicio(new Date("2026-12-10T12:00:00-03:00"));
    expect(r.toISOString()).toBe("2026-12-11T08:00:00.000Z");
  });
  it("el día del cambio de hora cae justo en la medianoche", () => {
    const r = proximoReinicio(new Date("2026-11-01T05:00:00Z")); // 31/10 22:00 PDT; ese domingo dura 25 h
    expect(r.toISOString()).toBe("2026-11-01T07:00:00.000Z");
    expect(proximoReinicio(new Date("2026-11-01T09:00:00Z")).toISOString()).toBe("2026-11-02T08:00:00.000Z");
  });
  it("a las 2:00 de Uruguay todavía es el día anterior para Google", () => {
    expect(diaGoogle(new Date("2026-10-26T02:00:00-03:00"))).toBe("2026-10-25");
  });
});

describe("contador diario", () => {
  it("suma pedidos, caracteres y segundos, y avisa al 80 %", async () => {
    for (let i = 0; i < 8; i++) await registrarPedido(500, 30.4);
    const uso = await leerUso();
    expect(uso).toMatchObject({ pedidos: 8, caracteres: 4000, segundosAudio: 243, limite: 10, limiteObservado: false, nivel: "poco" });
    expect(JSON.parse(readFileSync(path.join(dir, "data", "uso-gemini.json"), "utf8")).pedidos).toBe(8);
  });

  it("el 429 diario marca agotado y guarda el límite real", async () => {
    const uso = await registrarAgotado();
    expect(uso).toMatchObject({ agotado: true, nivel: "agotado", limite: 8, limiteObservado: true });
  });

  it("calcula la duración de un WAV de 24 kHz mono", () => {
    const wav = Buffer.alloc(44 + 48000 * 2);
    wav.write("RIFF", 0, "ascii");
    wav.writeUInt32LE(48000, 28);
    expect(segundosWav(wav)).toBe(2);
  });
});
