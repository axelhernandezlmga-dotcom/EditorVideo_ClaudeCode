import { describe, expect, it } from "vitest";
import { alinear } from "../src/pipeline/alinear";
import { cortesPorEscena } from "../src/pipeline/pasos/voz";

const palabras = (texto: string, desde = 0, paso = 300) =>
  texto.split(" ").map((t, i) => ({ texto: t, inicioMs: desde + i * paso, finMs: desde + i * paso + 250 }));

describe("alinear", () => {
  it("una palabra mal reconocida no desfasa el resto", () => {
    // whisper escribe "4" en vez de "cuatro" y "FAP" en vez de "AFAP"
    const caps = alinear("tu AFAP, bo. Hay cuatro AFAP: República", palabras("tu FAP bo Hay 4 afap República"), 5000);
    expect(caps.map((c) => c.startMs)).toEqual([0, 300, 600, 900, 1200, 1500, 1800]);
  });

  it("palabras que whisper no oyó se interpolan entre sus vecinas", () => {
    const caps = alinear("uno dos tres cuatro", [
      { texto: "uno", inicioMs: 0, finMs: 200 },
      { texto: "cuatro", inicioMs: 900, finMs: 1100 },
    ], 1200);
    expect(caps[1]!.startMs).toBeGreaterThanOrEqual(200);
    expect(caps[2]!.endMs).toBeLessThanOrEqual(900);
  });

  it("sin palabras reconocidas reparte el tiempo y no se pasa de la duración", () => {
    const caps = alinear("a b c d", [], 1000);
    expect(caps.at(-1)!.endMs).toBeLessThanOrEqual(1000);
    expect(caps[0]!.startMs).toBe(0);
  });
});

describe("cortesPorEscena", () => {
  it("corta en el silencio entre escenas, con aire a los costados", () => {
    const caps = alinear("hola che. chau che.", [...palabras("hola che", 0), ...palabras("chau che", 1500)], 2500);
    const [a, b] = cortesPorEscena(caps, [2, 2], 2500);
    expect(a!.ini).toBe(0);
    expect(a!.fin).toBeGreaterThan(550);
    expect(a!.fin).toBeLessThanOrEqual(b!.ini);
    expect(b!.ini).toBeLessThan(1500);
    expect(b!.fin).toBeLessThanOrEqual(2500);
  });
});
