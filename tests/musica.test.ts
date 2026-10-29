import { describe, expect, it } from "vitest";
import { clasificarMood, curvaMusica, desfaseAlPulso, elegirPista, moodDeGuion, motivoDescarte, type AnalisisPista, type Pista } from "../src/shared/musica";

const analisis = (x: Partial<AnalisisPista>): AnalisisPista => ({ archivo: "a.ogg", duracion: 60, silencioInicio: 0, arranque: 0, bpm: 110, energiaDb: -17, dinamicaDb: 12, modo: "mayor", tonalidad: "C mayor", confianzaModo: 0.8, brillo: 1400, ...x });
const pista = (archivo: string, mood: Pista["mood"]): Pista => ({ archivo, mood, bpm: 120, energia: 0.5, duracion: 60, tonalidad: "C mayor", zip: "z.zip", original: archivo, licencia: "CC0", autor: "x" });

describe("biblioteca de música", () => {
  it("descarta lo que no sirve de fondo de un reel", () => {
    expect(motivoDescarte(analisis({ duracion: 20 }))).toMatch(/30 s/);
    expect(motivoDescarte(analisis({ silencioInicio: 2.5 }))).toMatch(/silencio/);
    expect(motivoDescarte(analisis({ dinamicaDb: 30 }))).toMatch(/bruscos/);
    expect(motivoDescarte(analisis({}))).toBeNull();
  });

  it("clasifica por sonido: chiptune → cómica, menor y lenta → triste, menor y rápida → tensión", () => {
    expect(clasificarMood(analisis({ bpm: 130, brillo: 2600 }), "music-loop-bundle-chiptune")).toBe("comica");
    expect(clasificarMood(analisis({ modo: "menor", bpm: 80, energiaDb: -22 }), "x")).toBe("triste");
    expect(clasificarMood(analisis({ modo: "menor", bpm: 140, energiaDb: -14, dinamicaDb: 14 }), "x")).toBe("tension");
  });

  it("no repite las pistas usadas hace poco; si todas se usaron, la más vieja", () => {
    const ps = [pista("a", "feliz"), pista("b", "feliz"), pista("c", "triste")];
    expect(elegirPista(ps, "feliz", ["a"], () => 0)?.archivo).toBe("b");
    expect(elegirPista(ps, "feliz", ["b", "a"], () => 0)?.archivo).toBe("a");
    expect(elegirPista([], "feliz", [])).toBeNull();
  });

  it("los moods viejos de los guiones se traducen", () => {
    expect(moodDeGuion("tenso")).toBe("tension");
    expect(moodDeGuion("epica")).toBe("epica");
    expect(moodDeGuion("raro")).toBe("chill");
  });
});

describe("mezcla", () => {
  it("baja mientras se habla (55 %), con fundido de entrada de 0,5 s y de salida", () => {
    const c = curvaMusica([{ desdeMs: 3000, hastaMs: 5000 }], 300, 30, 0.1);
    expect(c[0]).toBe(0);
    expect(c[15]).toBeCloseTo(0.1, 5); // terminó el fundido de entrada
    expect(c[120]).toBeCloseTo(0.055, 5); // hablando: 55 % (≈ -27 dB respecto de la voz)
    expect(c[230]).toBeCloseTo(0.1, 5); // silencio: vuelve a subir
    expect(c[299]).toBe(0);
  });

  it("arranca la pista para que un pulso caiga en el primer golpe", () => {
    // 120 BPM = un pulso cada 500 ms; golpe en 1200 ms → arrancar 300 ms adentro (1200 + 300 = 1500)
    expect(desfaseAlPulso(120, 1200)).toBe(300);
    expect(desfaseAlPulso(120, 1000)).toBe(0);
    expect(desfaseAlPulso(0, 1000)).toBe(0);
    expect(desfaseAlPulso(120, null)).toBe(0);
  });
});

describe("ánimos de música del perfil", () => {
  it("se queda dentro de los que permite el perfil, con el más parecido", async () => {
    const { moodPermitido } = await import("../src/shared/musica");
    const tlhc = ["tension", "chill", "motivacional"];
    expect(moodPermitido("tension", tlhc)).toBe("tension");
    expect(moodPermitido("epica", tlhc)).toBe("motivacional");
    expect(moodPermitido("misterio", tlhc)).toBe("tension");
    expect(moodPermitido("comica", tlhc)).toBe("chill");
    expect(moodPermitido("comica", [])).toBe("comica");
  });
});
