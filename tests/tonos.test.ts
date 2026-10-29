import { describe, expect, it } from "vitest";
import { EstadoSchema, MarcaSchema } from "../src/shared/schemas";
import { bloqueTono, leerTono, listarTonos, parsearTono, serializarTono, tonoDelTrabajo } from "../src/pipeline/tonos";
import { validarMarca } from "../src/pipeline/config";
import { aplicarTono } from "../src/shared/tonos";

const marca = MarcaSchema.parse({ velocidad: "+8%" });

describe("tonos", () => {
  it("solo queda Académico (Puteador y Rancho random se sacaron)", async () => {
    expect((await listarTonos()).map((t) => t.id)).toEqual(["academico"]);
  });

  it("ida y vuelta del archivo .md", async () => {
    const t = await leerTono("academico");
    expect(parsearTono(t.id, serializarTono(t))).toEqual(t);
  });

  it("académico: voz más lenta, animación tranquila y sus acentos", async () => {
    const aca = await leerTono("academico");
    expect(aplicarTono(marca, aca).velocidad).toBe("+0%");
    expect(aca.animacion).toBe("tranquila");
    expect(aplicarTono(marca, aca).colores.acento).toBe(aca.acento);
  });

  it("el bloque del tono siempre trae las reglas base, aunque el tono no las nombre", () => {
    const t = parsearTono("raro", "---\nnombre: Raro\n---\nHablá como pirata.");
    const b = bloqueTono(t, marca);
    for (const regla of ["datos verificados", "neutralidad política", "primeros 2 segundos", "límite de palabras", "SIN malas palabras"]) expect(b).toContain(regla);
    expect(b).toContain("Hablá como pirata.");
  });

  it("migra lo que tenía un tono retirado a Académico, sin tocar lo demás", async () => {
    const { marca: m, avisos } = validarMarca({ usuario: "@yo", tonoPorDefecto: "puteador", velocidad: "+12%" });
    expect(m.tonoPorDefecto).toBe("academico");
    expect(m.velocidad).toBe("+12%");
    expect(avisos).toEqual([]);
    expect((await tonoDelTrabajo(marca, "random-puteador"))?.id).toBe("academico");
    const e = EstadoSchema.parse({ id: "x", idea: "x", creado: "", actualizado: "", estado: "listo", pasos: {}, opciones: { tono: "gancho-random", voz: "es-UY-MateoNeural" } });
    expect(e.opciones.tono).toBe("academico");
    expect(e.opciones.voz).toBe("es-UY-MateoNeural");
  });
});
