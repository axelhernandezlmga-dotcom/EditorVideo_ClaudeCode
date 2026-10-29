import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ReglasMarcaSchema } from "../src/shared/kit";
import { contraste, elegirLogo, fechaMarca, parrafoEnMayusculas, piezasSvg, tipoDeFondo } from "../src/shared/marca";

const reglas = ReglasMarcaSchema.parse({});
const ROJO = "#D92D38";

describe("reglas de marca", () => {
  it("logo según el fondo: claro → principal, oscuro → negativo, rojo → sobre rojo", () => {
    expect(elegirLogo("#F4F2EE", 600, reglas, ROJO)).toEqual({ pieza: "logo", variante: "principal" });
    expect(elegirLogo("#202124", 600, reglas, ROJO)).toEqual({ pieza: "logo", variante: "negativo" });
    expect(elegirLogo(ROJO, 600, reglas, ROJO)).toEqual({ pieza: "logo", variante: "sobre_rojo" });
  });

  it("por debajo de 180 px (o 280 el horizontal) va la «C.»", () => {
    expect(elegirLogo("#FFFFFF", 150, reglas, ROJO)).toEqual({ pieza: "simbolo", variante: "principal" });
    expect(elegirLogo("#202124", 150, reglas, ROJO)).toEqual({ pieza: "simbolo", variante: "negativo" });
    expect(elegirLogo("#FFFFFF", 300, reglas, ROJO, { horizontal: true })).toEqual({ pieza: "logo", variante: "horizontal" });
    expect(elegirLogo("#FFFFFF", 250, reglas, ROJO, { horizontal: true }).pieza).toBe("simbolo");
  });

  it("contraste: tinta/blanco ≈ 16:1 (como dice el manual), rojo/blanco ≈ 4,8:1", () => {
    expect(contraste("#202124", "#FFFFFF")).toBeCloseTo(16.1, 0);
    expect(contraste("#D92D38", "#FFFFFF")).toBeCloseTo(4.79, 1);
    expect(tipoDeFondo("#5F6368", ROJO)).toBe("oscuro");
  });

  it("párrafos en mayúsculas sí; etiquetas cortas no", () => {
    expect(parrafoEnMayusculas("CONTEXTO")).toBe(false);
    expect(parrafoEnMayusculas("26 OCT 2026 / FUENTE 01")).toBe(false);
    expect(parrafoEnMayusculas("EL GOBIERNO ANUNCIÓ UN NUEVO PLAN DE OBRAS")).toBe(true);
    expect(parrafoEnMayusculas("El gobierno anunció un plan")).toBe(false);
  });

  it("fecha en el formato del manual", () => {
    expect(fechaMarca(new Date(2026, 9, 26))).toBe("26 OCT 2026");
  });

  it("separa las letras y el punto del logo", () => {
    const svg = '<svg viewBox="0 0 100 50"><g transform="translate(4 3)"><path fill="#202124" d="M0 0H1Z"/><path fill="#202124" d="M2 0H3Z"/><circle cx="90" cy="40" r="4" fill="#D92D38"/></g></svg>';
    const p = piezasSvg(svg)!;
    expect(p.trazados).toHaveLength(2);
    expect(p.punto).toEqual({ cx: 90, cy: 40, r: 4, fill: "#D92D38" });
    expect(p.transform).toBe("translate(4 3)");
  });
});

describe("tema → ícono", () => {
  const ids = ["parlamento", "economia", "puerto", "educacion", "salud", "seguridad", "trabajo", "justicia", "dato", "opinion", "fuente", "contexto"];
  it("elige el ícono del tema", async () => {
    const { iconoPorTema } = await import("../src/shared/marca");
    expect(iconoPorTema("La inflación y los salarios", ids)).toBe("economia");
    expect(iconoPorTema("Diputados votan el proyecto de ley", ids)).toBe("parlamento");
    expect(iconoPorTema("Aumentan las rapiñas y los homicidios", ids)).toBe("seguridad");
    expect(iconoPorTema("El clima de mañana", ids)).toBeNull();
  });
});

describe("fechas y fuentes fuera de los títulos", () => {
  it("separa la fecha del final de un título", async () => {
    const { separarFecha, esLineaDeFuente } = await import("../src/shared/marca");
    expect(separarFecha("Votación en Diputados, 18 de agosto de 2026")).toEqual({ texto: "Votación en Diputados", fecha: "18 AGO 2026" });
    expect(separarFecha("Sesión del Senado (23/09/2026)")).toEqual({ texto: "Sesión del Senado", fecha: "23/09/2026" });
    expect(separarFecha("Camino de la ley")).toEqual({ texto: "Camino de la ley", fecha: null });
    expect(esLineaDeFuente("Fuente: Infobae y Prensa Latina, 2026")).toBe(true);
    expect(esLineaDeFuente("¿Conocías este mecanismo?")).toBe(false);
  });
});
