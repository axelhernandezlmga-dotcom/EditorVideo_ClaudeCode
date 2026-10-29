import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ErrorEsquema, esquemaParaClaude, validarEsquemaRaiz } from "../src/pipeline/claude";
import { EscenaSchema, GuionSchema, IdeasSchema, RespuestaEscenaSchema } from "../src/shared/schemas";

// Todos los esquemas que se mandan a `claude -p --json-schema`.
const ESQUEMAS = { guion: GuionSchema, escena: RespuestaEscenaSchema, ideas: IdeasSchema };

describe("esquemas para claude -p", () => {
  for (const [nombre, schema] of Object.entries(ESQUEMAS)) {
    it(`${nombre}: raíz type:object, sin $schema/$ref/$defs`, () => {
      const j = esquemaParaClaude(schema);
      expect(j.type).toBe("object");
      expect(j.properties).toBeTypeOf("object");
      expect(Array.isArray(j.required)).toBe(true);
      for (const k of ["$schema", "$ref", "$defs", "definitions", "oneOf", "anyOf"]) expect(j).not.toHaveProperty(k);
      expect(JSON.stringify(j)).not.toContain('"$ref"');
    });
  }

  it("rechaza una unión en la raíz (el error 400 original)", () => {
    expect(() => esquemaParaClaude(EscenaSchema)).toThrow(ErrorEsquema);
  });

  it("rechaza una lista en la raíz", () => {
    expect(() => esquemaParaClaude(z.array(z.string()))).toThrow(ErrorEsquema);
  });

  it("rechaza $schema y definitions en la raíz", () => {
    expect(() => validarEsquemaRaiz({ $schema: "x", type: "object", properties: {}, required: [] })).toThrow(ErrorEsquema);
    expect(() => validarEsquemaRaiz({ type: "object", properties: {}, required: [], definitions: {} })).toThrow(ErrorEsquema);
  });
});
