import { describe, expect, it } from "vitest";
import { ReglasMarcaSchema } from "../src/shared/kit";
import type { KitVisual, VideoProps } from "../src/shared/render";
import { chequeosLogo, chequeosTexto, medirCuadro } from "../src/pipeline/marca/verificador";

const LOGO = '<svg viewBox="0 0 533.79 224"><g transform="translate(40 30)"><path fill="#202124" d="M0 0H1Z"/><circle cx="437" cy="140" r="9" fill="#D92D38"/></g></svg>';
const kit: KitVisual = {
  colores: { acento: "#D92D38", texto: "#202124", fondo: "#FFFFFF", fondo2: "#F4F2EE", secundario: "#5F6368", apoyo: "#FCEAEC", linea: "#D9D9D6" },
  fuentes: { titulos: null, datos: null },
  logos: { principal: LOGO, negativo: LOGO, horizontal: LOGO, sobre_rojo: LOGO },
  simbolos: { principal: LOGO, monocromo: LOGO, negativo: LOGO },
  iconos: {},
  reglas: ReglasMarcaSchema.parse({}),
  fecha: "26 OCT 2026",
  fuentesGuion: [],
};
const PALETA = Object.values(kit.colores);

const cuadro = (pintar: (i: number) => [number, number, number], n = 1000) => {
  const b = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) b.set(pintar(i), i * 3);
  return b;
};

describe("verificador de marca: píxeles", () => {
  it("papel liso: todo en la paleta, sin rojo", () => {
    expect(medirCuadro(cuadro(() => [244, 242, 238]), PALETA, kit.colores.acento)).toEqual({ rojoPct: 0, fueraPct: 0 });
  });
  it("el borde suavizado entre tinta y papel cuenta como paleta", () => {
    expect(medirCuadro(cuadro(() => [138, 137, 137]), PALETA, kit.colores.acento).fueraPct).toBe(0);
  });
  it("mide el rojo y lo que está fuera de la paleta", () => {
    const r = medirCuadro(cuadro((i) => (i < 300 ? [217, 45, 56] : i < 400 ? [40, 200, 90] : [255, 255, 255])), PALETA, kit.colores.acento);
    expect(r.rojoPct).toBeCloseTo(30, 0);
    expect(r.fueraPct).toBeCloseTo(10, 0);
  });
});

describe("verificador de marca: logo y textos", () => {
  it("logo según el fondo, mínimos y margen", () => {
    const c = chequeosLogo(kit);
    expect(c.find((x) => x.regla === "Logo según el fondo")?.detalle).toMatch(/cierre: logo principal.*firma de las tarjetas \(tinta\): logo horizontal/);
    expect(c.every((x) => x.estado !== "aviso")).toBe(true);
  });
  it("avisa párrafos en mayúsculas y fechas fuera de Plex Mono", () => {
    const props = {
      marca: { usuario: "@x", colores: kit.colores, tipografia: "kit", kit },
      escenas: [
        { plantilla: "titular", props: { texto: "EL PARLAMENTO APROBÓ LA LEY DE MEDIOS" }, duracionFrames: 90 },
        { plantilla: "titular", props: { texto: "Se votó el 26 de octubre de 2026" }, duracionFrames: 90 },
      ],
    } as unknown as VideoProps;
    const c = chequeosTexto(kit, props);
    expect(c.find((x) => x.regla === "Nada de párrafos en mayúsculas")?.estado).toBe("aviso");
    expect(c.find((x) => x.regla === "Fechas y fuentes en Plex Mono")?.estado).toBe("aviso");
    expect(c.find((x) => x.regla === "Contraste del texto")?.estado).toBe("ok");
  });
});
