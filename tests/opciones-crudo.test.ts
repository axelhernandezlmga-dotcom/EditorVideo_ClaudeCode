import { describe, expect, it } from "vitest";
import { buscarRepeticion } from "../src/pipeline/crudo/cortes";
import { detectarMuletillas, type PalabraCrudo } from "../src/shared/cortes";
import { OpcionesCrudoSchema, PedidoCrudoSchema } from "../src/shared/opcionesCrudo";

const palabras = (texto: string, pausaMs = 100): PalabraCrudo[] =>
  texto.split(" ").map((t, i) => ({ texto: t, inicioMs: i * (300 + pausaMs), finMs: i * (300 + pausaMs) + 300, prob: 1, sinTranscribir: false }));

describe("tropiezos", () => {
  it("encuentra la primera vez de un fragmento dicho dos veces seguidas", () => {
    expect(buscarRepeticion("¿Cómo se puede, con la cantidad, con la cantidad de problemas".split(" "), "con la cantidad")).toBe(3);
  });
  it("si no está repetido de verdad, no corta nada", () => {
    expect(buscarRepeticion("con la cantidad de problemas que hay".split(" "), "con la cantidad")).toBeNull();
    expect(buscarRepeticion("hola hola".split(" "), "")).toBeNull();
  });
});

describe("muletillas", () => {
  it("una palabra repetida sin coma es un tropiezo; con coma, énfasis a propósito", () => {
    expect(detectarMuletillas(palabras("el el gobierno")).map((m) => m.i)).toEqual([0]);
    expect(detectarMuletillas(palabras("indignado, indignado."))).toEqual([]);
  });
});

describe("opciones del formulario", () => {
  it("valores por defecto razonables", () => {
    const o = OpcionesCrudoSchema.parse({});
    expect(o).toMatchObject({ paleta: "perfil", imagenes: true, sfx: true, intensidad: "dinamica", cierre: true, duracionMax: 0, subtitulos: null });
    expect(o.musica).toEqual({ activa: true, mood: "auto", volumen: 0.08 });
    expect(o.cortes).toEqual({ silencio: "normal", muletillas: true });
  });
  it("rechaza duraciones que no están en la lista", () => {
    expect(PedidoCrudoSchema.safeParse({ perfil: "mi-canal", crudo: { duracionMax: 45 } }).success).toBe(false);
    expect(PedidoCrudoSchema.safeParse({ perfil: "mi-canal", crudo: { duracionMax: 60 } }).success).toBe(true);
  });
});
