import { describe, expect, it } from "vitest";
import { cantidadIlustracionDeModo, faltaDelModo, IDS_MODOS_EDICION } from "../src/shared/modos";
import { instruccionesModo } from "../src/pipeline/tonos";
import { instruccionesIlustracion } from "../src/pipeline/ilustracion/preparar";
import { OpcionesCrudoSchema } from "../src/shared/opcionesCrudo";

const escenas = (...p: string[]) => [...p.map((plantilla) => ({ plantilla })), { plantilla: "cierre_cta" }];

describe("modos de edición", () => {
  it("son cuatro y el normal no agrega instrucciones (se conserva el comportamiento de siempre)", async () => {
    expect(IDS_MODOS_EDICION).toEqual(["normal", "graficos", "situacional", "imagenes"]);
    expect(await instruccionesModo("normal")).toBe("");
    expect(await instruccionesModo(undefined)).toBe("");
  });

  it("cada modo tiene instrucciones distintas para animados y para crudos", async () => {
    for (const m of ["graficos", "situacional", "imagenes"]) {
      const a = await instruccionesModo(m);
      const c = await instruccionesModo(m, "crudo");
      expect(a.length).toBeGreaterThan(200);
      expect(c.length).toBeGreaterThan(200);
      expect(a).not.toBe(c);
    }
    expect(await instruccionesModo("situacional")).toMatch(/personajes que\s+actúan/i);
    expect(await instruccionesModo("graficos")).toMatch(/nunca completes una\s+serie/i);
    expect(await instruccionesModo("imagenes")).toMatch(/marco/);
  });

  it("el modo cambia cuánta ilustración pide el guionista", () => {
    expect(cantidadIlustracionDeModo("normal", "media")).toBe("media");
    expect(cantidadIlustracionDeModo("graficos", "mucha")).toBe("ninguna");
    expect(cantidadIlustracionDeModo("situacional", "poca")).toBe("mucha");
    expect(instruccionesIlustracion("plano", "ninguna")).toMatch(/No uses la plantilla `escena_ilustrada`/);
  });

  it("detecta un guion que no respeta el modo", () => {
    expect(faltaDelModo("normal", escenas("titular", "lista"))).toBeNull();
    expect(faltaDelModo("graficos", escenas("dato_numero", "escena_ilustrada", "grafico"))).toMatch(/no van escenas ilustradas/);
    expect(faltaDelModo("graficos", escenas("dato_numero", "grafico", "lista"))).toBeNull();
    expect(faltaDelModo("situacional", escenas("escena_ilustrada", "titular", "lista"))).toMatch(/60 %/);
    expect(faltaDelModo("situacional", escenas("escena_ilustrada", "escena_ilustrada", "dato_numero"))).toBeNull();
    expect(faltaDelModo("imagenes", escenas("foto_real", "titular", "lista"))).toMatch(/40 %/);
    expect(faltaDelModo("imagenes", escenas("foto_real", "foto_real", "lista"))).toBeNull();
  });

  it("los crudos guardan el modo con sus opciones (normal si no se eligió)", () => {
    expect(OpcionesCrudoSchema.parse({}).modo).toBe("normal");
    expect(OpcionesCrudoSchema.parse({ modo: "imagenes" }).modo).toBe("imagenes");
    expect(OpcionesCrudoSchema.parse({ clips: { modo: "auto", categorias: ["colorados", "memes-varios"] } }).clips.categorias).toEqual(["colorados", "memes-varios"]);
  });
});
