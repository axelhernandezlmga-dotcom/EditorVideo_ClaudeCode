import { describe, expect, it } from "vitest";
import { instruccionesLineaEditorial, sinOpinionDeLaIa } from "../src/pipeline/pasos/guion";
import type { Guion } from "../src/shared/schemas";

const escena = (bloque: string | undefined, plantilla = "titular") => ({ plantilla, props: { texto: "x", remate: "x" }, narracion: "x", palabras_clave_stock: [], palabras_enfasis: [], bloque });
const guion = (bloques: (string | undefined)[]) =>
  ({ titulo: "t", gancho: "g", mood: "chill", escenas: bloques.map((b, i) => escena(b, i === bloques.length - 1 ? "cierre_cta" : "titular")), texto_publicacion: "x", titulo_portada: "x", fuentes: [] }) as unknown as Guion;

describe("línea editorial Hechos → Contexto → Opinión", () => {
  it("sin la opinión del creador no queda ningún bloque OPINIÓN", () => {
    const g = sinOpinionDeLaIa(guion(["dato", "fuente", "contexto", "opinion", undefined]), "");
    expect(g.escenas.map((e) => e.bloque)).toEqual(["dato", "fuente", "contexto", undefined]);
  });
  it("con opinión del creador, el bloque queda", () => {
    const g = sinOpinionDeLaIa(guion(["dato", "contexto", "opinion", undefined]), "Creo que llega tarde.");
    expect(g.escenas.some((e) => e.bloque === "opinion")).toBe(true);
  });
  it("el prompt pide la opinión literal del creador, o ninguna", () => {
    expect(instruccionesLineaEditorial("Creo que llega tarde.")).toMatch(/«Creo que llega tarde\.»/);
    expect(instruccionesLineaEditorial()).toMatch(/NO hay bloque de opinión/);
  });
});
