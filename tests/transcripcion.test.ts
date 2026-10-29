import { describe, expect, it } from "vitest";
import { umbralVoz } from "../src/pipeline/crudo/audio";
import { tiempoEstimado, unirPalabrasFw } from "../src/shared/transcripcion";

/** Envolvente sintética: `voz` bloques de voz a `dbVoz` y el resto a `dbRuido`. */
const envolvente = (dbRuido: number, dbVoz: number, fraccionVoz = 0.6) => {
  const db = new Float32Array(1000);
  for (let i = 0; i < db.length; i++) db[i] = i < db.length * fraccionVoz ? dbVoz + (i % 7) : dbRuido + (i % 3);
  return db;
};

describe("umbralVoz", () => {
  it("con ruido de fondo (celular en la calle) queda ENTRE el ruido y la voz, no debajo del ruido", () => {
    const u = umbralVoz(envolvente(-36, -20));
    expect(u).toBeGreaterThan(-34); // el ruido no cuenta como voz
    expect(u).toBeLessThan(-20); // la voz sí
  });

  it("con audio limpio deja un margen de 14 dB sobre el silencio", () => {
    expect(umbralVoz(envolvente(-62, -18))).toBeCloseTo(-48, 0);
  });

  it("nunca queda por encima de -18 dB ni por debajo de -60 dB", () => {
    expect(umbralVoz(envolvente(-10, -5))).toBe(-18);
    expect(umbralVoz(envolvente(-90, -80))).toBe(-60);
    expect(umbralVoz(new Float32Array(0))).toBe(-45);
  });
});

describe("unirPalabrasFw", () => {
  it("pega lo que no empieza con espacio a la palabra anterior (3 .000 → 3.000)", () => {
    const r = unirPalabrasFw([
      { t: " los", i: 1, f: 1.2, p: 0.9 },
      { t: " 3", i: 1.2, f: 1.4, p: 0.8 },
      { t: ".000", i: 1.4, f: 1.7, p: 0.6 },
      { t: " niños", i: 1.7, f: 2, p: 0.95 },
    ]);
    expect(r.map((w) => w.texto)).toEqual(["los", "3.000", "niños"]);
    expect(r[1]).toEqual({ texto: "3.000", inicioMs: 1200, finMs: 1700, prob: 0.6 });
  });

  it("ignora palabras vacías", () => {
    expect(unirPalabrasFw([{ t: " ", i: 0, f: 0.1, p: 1 }, { t: " hola", i: 0.1, f: 0.4, p: 1 }]).map((w) => w.texto)).toEqual(["hola"]);
  });
});

describe("tiempoEstimado", () => {
  it("medium tarda ~1 min para 2 min de video; large-v3 casi el doble", () => {
    expect(tiempoEstimado("medium", 120)).toBe("~1 min");
    expect(tiempoEstimado("large-v3", 120)).toBe("~2 min");
    expect(tiempoEstimado("base", 120)).toBe("~17 s");
  });
});
