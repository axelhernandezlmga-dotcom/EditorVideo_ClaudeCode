import { describe, expect, it } from "vitest";
import {
  aEditado,
  aEditadoCercano,
  agruparFrases,
  aOriginal,
  calcularTramos,
  detectarMuletillas,
  duracionTramos,
  resumirCortes,
  type Cortes,
  type PalabraCrudo,
} from "../src/shared/cortes";

/** Palabras a partir de "texto@inicio-fin" (en ms). */
const pal = (...defs: string[]): PalabraCrudo[] =>
  defs.map((d) => {
    const [texto, t] = d.split("@") as [string, string];
    const [a, b] = t.split("-").map(Number) as [number, number];
    return { texto, inicioMs: a, finMs: b, prob: 1, sinTranscribir: texto === "[...]" };
  });

const cortes = (extra: Partial<Cortes> = {}): Cortes => ({
  pausaMaxMs: 350,
  margenMs: 80,
  automatico: true,
  sugeridos: { palabras: [] },
  manual: { quitar: [], conservar: [], pausasConservadas: [], pausasCortadas: [] },
  ...extra,
});

describe("calcularTramos", () => {
  it("sin pausas largas ni cortes queda todo el video", () => {
    const p = pal("hola@100-400", "che@500-800");
    expect(calcularTramos(p, cortes(), 1000)).toEqual([{ inicioMs: 0, finMs: 1000 }]);
  });

  it("corta una pausa larga dejando 80 ms de aire a cada lado", () => {
    const p = pal("hola@0-400", "che@2000-2400");
    expect(calcularTramos(p, cortes(), 2400)).toEqual([
      { inicioMs: 0, finMs: 480 },
      { inicioMs: 1920, finMs: 2400 },
    ]);
  });

  it("corta el silencio del principio y del final si son largos", () => {
    const p = pal("hola@1000-1400");
    expect(calcularTramos(p, cortes(), 3000)).toEqual([{ inicioMs: 920, finMs: 1480 }]);
  });

  it("quita una muletilla sugerida y el aire no invade las palabras vecinas", () => {
    const p = pal("bueno@0-300", "eh@330-500", "arranco@540-900");
    const c = cortes({ sugeridos: { palabras: [{ i: 1, tipo: "muletilla", motivo: '"eh"' }] } });
    expect(calcularTramos(p, c, 900)).toEqual([
      { inicioMs: 0, finMs: 330 },
      { inicioMs: 500, finMs: 900 },
    ]);
  });

  it("una palabra recuperada a mano vuelve", () => {
    const p = pal("bueno@0-300", "eh@330-500", "arranco@540-900");
    const c = cortes({ sugeridos: { palabras: [{ i: 1, tipo: "muletilla", motivo: "" }] }, manual: { quitar: [], conservar: [1], pausasConservadas: [], pausasCortadas: [] } });
    expect(calcularTramos(p, c, 900)).toEqual([{ inicioMs: 0, finMs: 900 }]);
  });

  it("una pausa larga conservada a mano no se corta", () => {
    const p = pal("hola@0-400", "che@2000-2400");
    const c = cortes({ manual: { quitar: [], conservar: [], pausasConservadas: [0], pausasCortadas: [] } });
    expect(calcularTramos(p, c, 2400)).toEqual([{ inicioMs: 0, finMs: 2400 }]);
  });

  it("una pausa corta se puede cortar a mano", () => {
    const p = pal("hola@0-400", "che@600-1000");
    const c = cortes({ manual: { quitar: [], conservar: [], pausasConservadas: [], pausasCortadas: [0] } });
    expect(calcularTramos(p, c, 1000)).toEqual([
      { inicioMs: 0, finMs: 480 },
      { inicioMs: 520, finMs: 1000 },
    ]);
  });

  it("si los márgenes se tocan, los tramos se unen", () => {
    const p = pal("hola@0-400", "che@500-900");
    const c = cortes({ manual: { quitar: [], conservar: [], pausasConservadas: [], pausasCortadas: [0] } });
    expect(calcularTramos(p, c, 900)).toEqual([{ inicioMs: 0, finMs: 900 }]);
  });
});

describe("remapeo de tiempos", () => {
  const tramos = [
    { inicioMs: 0, finMs: 480 },
    { inicioMs: 1920, finMs: 2400 },
  ];
  it("original → editado y vuelta", () => {
    expect(duracionTramos(tramos)).toBe(960);
    expect(aEditado(tramos, 100)).toBe(100);
    expect(aEditado(tramos, 1000)).toBeNull();
    expect(aEditado(tramos, 2000)).toBe(560);
    expect(aOriginal(tramos, 560)).toBe(2000);
    expect(aOriginal(tramos, 100)).toBe(100);
  });
  it("un momento cortado se ancla al tramo siguiente", () => {
    expect(aEditadoCercano(tramos, 1000)).toBe(480);
  });
});

describe("detectarMuletillas", () => {
  const indices = (p: PalabraCrudo[]) => detectarMuletillas(p).map((m) => m.i);

  it('"eh", "mmm" y los sonidos sin transcribir siempre', () => {
    expect(indices(pal("eh@0-200", "bueno@300-500", "mmm@600-900", "[...]@1000-1300", "listo@1400-1600"))).toEqual([0, 2, 3]);
  });

  it('"este" suelto sí, "este gobierno" no', () => {
    expect(indices(pal("este,@0-200", "lo@300-400"))).toEqual([0]);
    expect(indices(pal("este@0-200", "gobierno@220-600"))).toEqual([]);
    expect(indices(pal("y@0-100", "este@150-350", "nada@700-900"))).toEqual([1]);
  });

  it('"o sea" solo cuando se repite', () => {
    expect(indices(pal("o@0-100", "sea@100-300", "bien@400-600"))).toEqual([]);
    expect(indices(pal("o@0-100", "sea,@100-300", "o@400-500", "sea@500-700", "bien@800-1000"))).toEqual([0, 1, 2, 3]);
  });

  it("palabra dicha dos veces seguidas: se quita la primera", () => {
    expect(indices(pal("que@0-200", "que@250-450", "pasó@500-800"))).toEqual([0]);
    expect(indices(pal("2025@0-200", "2025@250-450"))).toEqual([]);
  });
});

describe("resumirCortes y frases", () => {
  it("atribuye cada hueco a su tipo", () => {
    const p = pal("hola@0-400", "eh@450-600", "che@650-900", "listo@2500-2900");
    const c = cortes({ sugeridos: { palabras: [{ i: 1, tipo: "muletilla", motivo: "" }] } });
    const r = resumirCortes(p, c, 2900);
    expect(r.muletilla.cantidad).toBe(1);
    expect(r.pausa.cantidad).toBe(1);
    expect(r.pausa.ms).toBe(2420 - 980);
  });

  it("agrupa frases por pausas y puntos", () => {
    expect(agruparFrases(pal("Hola.@0-300", "Te@400-500", "cuento@550-800", "algo@1600-1900"))).toEqual([
      { desde: 0, hasta: 0 },
      { desde: 1, hasta: 2 },
      { desde: 3, hasta: 3 },
    ]);
  });
});
