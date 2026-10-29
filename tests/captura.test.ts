import { describe, expect, it } from "vitest";
import { CapturaFallida, conReintento } from "../src/pipeline/crudo/captura";

const fallaLuego = <T>(errores: Error[], valor: T) => {
  let llamadas = 0;
  const fn = async () => {
    llamadas++;
    const e = errores.shift();
    if (e) throw e;
    return valor;
  };
  return { fn, llamadas: () => llamadas };
};

describe("conReintento", () => {
  it("si la página no cargó, reintenta una vez y devuelve la captura", async () => {
    const f = fallaLuego([new CapturaFallida("La página no cargó (Timeout).", true)], "ok");
    await expect(conReintento(f.fn, 0)).resolves.toBe("ok");
    expect(f.llamadas()).toBe(2);
  });

  it("reintenta una sola vez: si vuelve a fallar, queda el error", async () => {
    const f = fallaLuego([new CapturaFallida("no cargó 1", true), new CapturaFallida("no cargó 2", true)], "ok");
    await expect(conReintento(f.fn, 0)).rejects.toThrow("no cargó 2");
    expect(f.llamadas()).toBe(2);
  });

  it("un muro de pago o un anti-bots no se reintenta", async () => {
    const f = fallaLuego([new CapturaFallida("La nota está detrás de un muro de pago.")], "ok");
    await expect(conReintento(f.fn, 0)).rejects.toThrow("muro de pago");
    expect(f.llamadas()).toBe(1);
  });

  it("un error inesperado (no de captura) también se reintenta", async () => {
    const f = fallaLuego([new Error("Target closed")], "ok");
    await expect(conReintento(f.fn, 0)).resolves.toBe("ok");
    expect(f.llamadas()).toBe(2);
  });
});
