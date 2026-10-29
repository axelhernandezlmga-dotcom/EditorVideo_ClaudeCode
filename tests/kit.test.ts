import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { textoResumenKit } from "../src/shared/kit";

process.env.FABRICA_PERFILES = mkdtempSync(path.join(tmpdir(), "fabrica-perfiles-"));
const { coloresDeRecursos, detectarKit, rolPorNombre } = await import("../src/pipeline/kit");
const { KitSchema } = await import("../src/shared/kit");

/** Un kit chiquito con la estructura de un kit real (logo de letras + símbolo). */
const armarKit = () => {
  const raiz = mkdtempSync(path.join(tmpdir(), "kit-"));
  const f = (rel: string, contenido = "<svg/>") => {
    mkdirSync(path.dirname(path.join(raiz, rel)), { recursive: true });
    writeFileSync(path.join(raiz, rel), contenido);
  };
  for (const v of ["principal", "negativo", "monocromo", "sobre_rojo", "fondo_blanco", "horizontal"]) f(`01_Logos/SVG/logo_${v}.svg`), f(`01_Logos/PNG/logo_${v}.png`, "png");
  for (const v of ["principal", "negativo", "monocromo", "sobre_rojo"]) f(`02_Simbolo/SVG/simbolo_${v}.svg`);
  for (const v of ["blanco", "oscuro", "rojo"]) f(`02_Simbolo/PNG/perfil_${v}.png`, "png");
  f("03_Colores/colores.css", ":root{--x-rojo:#D92D38;--x-tinta:#202124;--x-blanco:#FFFFFF;--x-papel:#F4F2EE;--x-gris:#5F6368}");
  f("04_Tipografias/InterVariable.ttf", "x");
  f("04_Tipografias/Inter-OFL.txt", "OFL");
  f("04_Tipografias/IBMPlexMono-Regular.ttf", "x");
  f("04_Tipografias/IBMPlexMono-OFL.txt", "OFL");
  f("05_Recursos/SVG/destacado.svg", '<svg><rect fill="#FCEAEC"/><rect fill="#D92D38"/></svg>');
  f("05_Recursos/SVG/separador.svg", '<svg><path stroke="#D9D9D6"/><circle fill="#D92D38"/></svg>');
  for (const r of ["punto", "marcador", "patron_puntos"]) f(`05_Recursos/SVG/${r}.svg`);
  for (const i of ["economia", "salud", "parlamento"]) f(`06_Iconos/SVG/${i}.svg`);
  f("06_Iconos/iconos_sprite.svg", '<svg><symbol id="economia"/><symbol id="justicia"/></svg>');
  f("Manual.pdf", "%PDF");
  return raiz;
};

describe("kit de marca", () => {
  it("clasifica logos, símbolos, avatares, colores, fuentes, recursos e íconos", async () => {
    const raiz = armarKit();
    const k = KitSchema.parse({ ...(await detectarKit(raiz)), importado: "x" });
    expect(Object.keys(k.logos).sort()).toEqual(["fondo_blanco", "horizontal", "monocromo", "negativo", "principal", "sobre_rojo"]);
    expect(Object.keys(k.simbolos).sort()).toEqual(["monocromo", "negativo", "principal", "sobre_rojo"]);
    expect(k.avatares.map((a) => a.nombre)).toEqual(["perfil_blanco", "perfil_oscuro", "perfil_rojo"]);
    expect(k.colores.map((c) => `${c.nombre}:${c.rol}`)).toEqual(["rojo:acento", "tinta:texto", "blanco:fondo", "papel:fondo2", "gris:secundario"]);
    expect(k.fuentes.map((f) => [f.familia, f.uso, Boolean(f.licencia)])).toEqual([
      ["IBM Plex Mono", "datos", true],
      ["Inter", "titulos", true],
    ]);
    expect(Object.keys(k.recursos).sort()).toEqual(["destacado", "marcador", "patron", "punto", "separador"]);
    expect(Object.keys(k.iconos).sort()).toEqual(["economia", "justicia", "parlamento", "salud"]);
    expect(k.manual).toBe("Manual.pdf");
    expect(textoResumenKit(k)).toBe("6 logos, 4 símbolos, 3 avatares, 5 colores, 2 fuentes, 5 recursos, 4 íconos y el manual");
  });

  it("los colores de apoyo salen de los SVG maestros", async () => {
    const raiz = armarKit();
    const k = KitSchema.parse({ ...(await detectarKit(raiz)), importado: "x" });
    expect(await coloresDeRecursos(raiz, k)).toEqual({ apoyoAcento: "#FCEAEC", linea: "#D9D9D6" });
  });

  it("rol por nombre, y si no por luminancia", () => {
    expect(rolPorNombre("Accent", "#FF0000")).toBe("acento");
    expect(rolPorNombre("x", "#FAFAFA")).toBe("fondo");
    expect(rolPorNombre("x", "#111111")).toBe("texto");
  });
});
