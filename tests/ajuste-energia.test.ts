import { describe, expect, it } from "vitest";
import { ajustarConEnergia, sinAlucinaciones, sinMarcas } from "../src/pipeline/crudo/transcripcion";
import type { PalabraCrudo } from "../src/shared/cortes";

/** Envolvente de 10 ms por bloque: -20 dB donde hay voz, -70 dB en silencio. */
const envolvente = (totalMs: number, voz: [number, number][]) => {
  const db = new Float32Array(totalMs / 10).fill(-70);
  for (const [a, b] of voz) for (let ms = a; ms < b; ms += 10) db[ms / 10] = -20;
  return db;
};
const p = (texto: string, inicioMs: number, finMs: number): PalabraCrudo => ({ texto, inicioMs, finMs, prob: 1, sinTranscribir: false });

describe("ajustarConEnergia", () => {
  it("recorta el silencio que whisper metió dentro de una palabra", () => {
    // whisper dice que "mi" va de 1000 a 2800, pero la voz es solo 1000–1300
    const r = ajustarConEnergia([p("mi", 1000, 2800)], envolvente(4000, [[1000, 1300]]), 10, -45);
    expect(r[0]).toMatchObject({ texto: "mi", inicioMs: 1000, finMs: 1300 });
  });

  it("estira la cola de la palabra hasta donde termina la voz", () => {
    const r = ajustarConEnergia([p("hola", 1000, 1300)], envolvente(3000, [[1000, 1450]]), 10, -45);
    expect(r[0]!.finMs).toBe(1450);
  });

  it("marca como [...] un sonido de voz entre palabras sin transcribir", () => {
    const db = envolvente(5000, [
      [0, 400],
      [1200, 1600],
      [2500, 2900],
    ]);
    const r = ajustarConEnergia([p("bueno", 0, 400), p("arranco", 2500, 2900)], db, 10, -45);
    expect(r.map((x) => x.texto)).toEqual(["bueno", "[...]", "arranco"]);
    expect(r[1]).toMatchObject({ inicioMs: 1200, finMs: 1600, sinTranscribir: true });
  });

  it("no inventa sonidos en el silencio ni en ruidos muy cortos", () => {
    const db = envolvente(3000, [
      [0, 400],
      [1000, 1080],
      [2000, 2400],
    ]);
    const r = ajustarConEnergia([p("uno", 0, 400), p("dos", 2000, 2400)], db, 10, -45);
    expect(r).toHaveLength(2);
  });
});

describe("sinMarcas", () => {
  const w = (...t: string[]) => t.map((texto) => ({ texto }));
  it("saca las marcas de whisper aunque vengan partidas en varias palabras", () => {
    expect(sinMarcas(w("Contame", "qué", "pensás.", "[MÚSICA", "DE", "FUNDO]")).map((p) => p.texto)).toEqual(["Contame", "qué", "pensás."]);
    expect(sinMarcas(w("(risas)", "Bueno", "[Música]", "che")).map((p) => p.texto)).toEqual(["Bueno", "che"]);
  });
});

describe("sinAlucinaciones", () => {
  const w = (t: string) => t.split(" ").map((texto) => ({ texto }));
  it("saca 'Subtítulos por la comunidad de Amara.org' (junto o partido)", () => {
    expect(sinAlucinaciones(w("Seguime para más. Subtítulos por la comunidad de Amara.org")).map((p) => p.texto)).toEqual(["Seguime", "para", "más."]);
    expect(sinAlucinaciones(w("hola Subtítulos realizados por la comunidad de Amara .org")).map((p) => p.texto)).toEqual(["hola"]);
  });
  it("'gracias por ver' solo se saca si es lo último", () => {
    expect(sinAlucinaciones(w("gracias por ver el partido conmigo")).length).toBe(6);
    expect(sinAlucinaciones(w("chau, gracias por ver")).map((p) => p.texto)).toEqual(["chau,"]);
  });
});
