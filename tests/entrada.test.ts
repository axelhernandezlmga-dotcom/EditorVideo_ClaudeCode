import { describe, expect, it } from "vitest";
import { contarPalabras, esMaterial, etiquetaDe, separarLote } from "../src/shared/entrada";

describe("entrada del usuario", () => {
  it("separa el lote solo con líneas ---, no con saltos de línea", () => {
    const texto = "Idea uno\n---\nUn texto largo\ncon varias líneas\n\ny párrafos\n  ---  \nIdea tres\n---\n";
    expect(separarLote(texto)).toEqual(["Idea uno", "Un texto largo\ncon varias líneas\n\ny párrafos", "Idea tres"]);
  });

  it("no corta en guiones dentro de una línea", () => {
    expect(separarLote("Uruguay --- Argentina\nalgo")).toHaveLength(1);
  });

  it("cuenta palabras y decide si es material", () => {
    expect(contarPalabras("  hola   mundo \n chau ")).toBe(3);
    expect(esMaterial("palabra ".repeat(150))).toBe(false);
    expect(esMaterial("palabra ".repeat(151))).toBe(true);
  });

  it("arma una etiqueta corta con la primera línea", () => {
    expect(etiquetaDe("¿Cómo funciona el balotaje?")).toBe("¿Cómo funciona el balotaje?");
    expect(etiquetaDe("\n# Las AFAP en Uruguay\n\nTexto largo…")).toBe("Las AFAP en Uruguay");
    const larga = etiquetaDe("palabra ".repeat(40));
    expect(larga.length).toBeLessThanOrEqual(101);
    expect(larga.endsWith("…")).toBe(true);
  });
});
