import { describe, expect, it } from "vitest";
import type { Cortes, PalabraCrudo } from "../src/shared/cortes";
import { calcularTramos } from "../src/shared/cortes";
import { captionsEditadas, DURACION_RISER_MS, encuadre, posicionSubtitulos, sfxEnPantalla, type Caras } from "../src/shared/crudo";
import { ALTO, SUBTITULOS_Y } from "../src/shared/render";

const caras = (cara: [number, number, number, number] | null, n = 10): Caras => ({ ancho: 720, alto: 1280, muestras: Array.from({ length: n }, (_, t) => ({ t, cara })) });

describe("encuadre", () => {
  it("un video vertical llena el cuadro", () => {
    expect(encuadre(720, 1280)).toEqual({ modo: "llenar", rect: { x: 0, y: 0, w: 1080, h: 1920 } });
  });
  it("uno horizontal va entero al medio", () => {
    const { modo, rect } = encuadre(1920, 1080);
    expect(modo).toBe("ajustar");
    expect(rect.w).toBe(1080);
    expect(rect.h).toBeCloseTo(607.5);
    expect(rect.y).toBeCloseTo((ALTO - 607.5) / 2);
  });
});

describe("posicionSubtitulos", () => {
  it("sin cara, la posición de siempre", () => {
    expect(posicionSubtitulos(null, { ancho: 720, alto: 1280 })).toBe(SUBTITULOS_Y);
    expect(posicionSubtitulos(caras(null), { ancho: 720, alto: 1280 })).toBe(SUBTITULOS_Y);
  });
  it("cara arriba (primer plano típico): la posición de siempre no la pisa", () => {
    expect(posicionSubtitulos(caras([0.2, 0.1, 0.6, 0.35]), { ancho: 720, alto: 1280 })).toBe(SUBTITULOS_Y);
  });
  it("cara a la altura de los subtítulos: se mueven a otra franja libre", () => {
    const y = posicionSubtitulos(caras([0.3, 0.55, 0.4, 0.12]), { ancho: 720, alto: 1280 });
    expect(y).not.toBe(SUBTITULOS_Y);
    expect(y < 0.55 * ALTO - 100 || y > 0.67 * ALTO + 100).toBe(true);
  });
  it("video horizontal: debajo del video", () => {
    const y = posicionSubtitulos(null, { ancho: 1920, alto: 1080 });
    expect(y).toBeGreaterThan((ALTO + 607.5) / 2);
  });
});

describe("captionsEditadas", () => {
  it("salta las palabras cortadas y corre los tiempos", () => {
    const palabras: PalabraCrudo[] = [
      { texto: "Hola", inicioMs: 0, finMs: 400, prob: 1, sinTranscribir: false },
      { texto: "eh", inicioMs: 500, finMs: 700, prob: 1, sinTranscribir: false },
      { texto: "che", inicioMs: 2000, finMs: 2400, prob: 1, sinTranscribir: false },
    ];
    const cortes: Cortes = {
      pausaMaxMs: 350,
      margenMs: 80,
      automatico: true,
      sugeridos: { palabras: [{ i: 1, tipo: "muletilla", motivo: "" }] },
      manual: { quitar: [], conservar: [], pausasConservadas: [], pausasCortadas: [] },
    };
    const tramos = calcularTramos(palabras, cortes, 2400);
    const caps = captionsEditadas(palabras, cortes, tramos);
    expect(caps.map((c) => c.text)).toEqual(["Hola", " che"]);
    expect(caps[1]!.startMs).toBe(480 + 80);
  });
});

describe("sfxEnPantalla", () => {
  const tramos = [
    { inicioMs: 0, finMs: 5000 },
    { inicioMs: 6000, finMs: 12_000 },
  ];
  const src = (n: string) => `/sfx/${n}.wav`;

  it("golpe en la palabra, riser termina en el remate, efectos de palabras cortadas no van", () => {
    const r = sfxEnPantalla(
      [
        { tipo: "golpe", origenMs: 2000 },
        { tipo: "riser", origenMs: 9000 },
        { tipo: "ding", origenMs: 5500 }, // cae en un corte
      ],
      [],
      tramos,
      src,
    );
    expect(r.map((x) => [x.src, x.enMs])).toEqual([
      ["/sfx/golpe.wav", 1970],
      ["/sfx/riser.wav", 8000 - DURACION_RISER_MS],
    ]);
  });

  it("whoosh al entrar una captura o foto y pop en un dato", () => {
    const r = sfxEnPantalla(
      [],
      [
        { tipo: "noticia", desdeMs: 1000, hastaMs: 4000, imagen: "", medio: "", fecha: null, titulo: "", resaltado: null, rects: [], proporcion: null },
        { tipo: "plantilla", desdeMs: 6000, hastaMs: 9000, plantilla: "dato_numero", props: {} },
      ],
      tramos,
      src,
    );
    expect(r.map((x) => [x.src, x.enMs])).toEqual([
      ["/sfx/whoosh.wav", 850],
      ["/sfx/pop.wav", 6200],
    ]);
  });
});
