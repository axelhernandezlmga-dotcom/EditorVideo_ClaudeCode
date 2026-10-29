import { describe, expect, it } from "vitest";
import { framesCrudo, momentosSeguir, posicionTarjetaSeguir, type Caras } from "../src/shared/crudo";

const cap = (text: string, startMs: number) => ({ text, startMs, endMs: startMs + 300, timestampMs: null, confidence: 1 });

describe("cierre Seguir", () => {
  it("detecta seguime, seguinos, sígueme, síganme y suscribite (sin repetir dentro de 10 s)", () => {
    const c = [cap("Hola", 0), cap(" seguime", 2000), cap(" ¡Seguinos!", 5000), cap(" Sígueme", 20000), cap(" síganme", 40000), cap(" suscribite.", 55000), cap(" seguro", 70000)];
    expect(momentosSeguir(c)).toEqual([2000, 20000, 40000, 55000]);
  });

  it("la tarjeta va arriba si la cara está abajo, y abajo si la cara está arriba", () => {
    const video = { ancho: 1080, alto: 1920 };
    const caraAbajo: Caras = { ancho: 1080, alto: 1920, muestras: Array.from({ length: 10 }, (_, t) => ({ t, cara: [0.3, 0.45, 0.4, 0.25] as [number, number, number, number] })) };
    const caraArriba: Caras = { ancho: 1080, alto: 1920, muestras: Array.from({ length: 10 }, (_, t) => ({ t, cara: [0.3, 0.12, 0.4, 0.25] as [number, number, number, number] })) };
    expect(posicionTarjetaSeguir(caraAbajo, video, 1230)).toBeLessThan(0.45 * 1920 - 190);
    expect(posicionTarjetaSeguir(caraArriba, video, 1230)).toBeGreaterThan(0.37 * 1920);
  });

  it("la placa suma 2,5 s al final", () => {
    expect(framesCrudo([{ inicioMs: 0, finMs: 10_000 }], 30, true) - framesCrudo([{ inicioMs: 0, finMs: 10_000 }], 30)).toBe(75);
  });
});
