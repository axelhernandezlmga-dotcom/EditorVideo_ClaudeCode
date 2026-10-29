import { describe, expect, it } from "vitest";
import { censurar, censurarProfundo, tienePuteadas } from "../src/shared/censura";

describe("censura de puteadas en pantalla", () => {
  it("tapa la segunda letra y respeta mayúsculas", () => {
    expect(censurar("Escuchame una cosa, pelotudo: vení, guampudo.")).toBe("Escuchame una cosa, p*lotudo: vení, g*ampudo.");
    expect(censurar("¡La concha de la lora!")).toBe("¡La c*ncha de la lora!");
    expect(censurar("PELOTUDOS")).toBe("P*LOTUDOS");
  });

  it("no toca palabras que solo contienen la puteada", () => {
    expect(censurar("Una película de computadoras")).toBe("Una película de computadoras");
    expect(censurar("Disputa en el Parlamento")).toBe("Disputa en el Parlamento");
    expect(tienePuteadas("Las AFAP invierten tus aportes")).toBe(false);
  });

  it("las suaves quedan como están", () => {
    expect(censurar("salame, nabo, bobeta, gil")).toBe("salame, nabo, bobeta, gil");
  });

  it("censura todos los strings de las props, no los números", () => {
    expect(censurarProfundo({ texto: "Ni a palos, boludo", numero: 15, items: [{ texto: "mierda" }] })).toEqual({ texto: "Ni a palos, b*ludo", numero: 15, items: [{ texto: "m*erda" }] });
  });
});
