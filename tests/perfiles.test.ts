import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MarcaSchema } from "../src/shared/schemas";
import { PALETAS, paletaDe, slugPerfil } from "../src/shared/perfiles";

// config/perfiles de prueba: nunca se tocan los reales
const dir = mkdtempSync(path.join(tmpdir(), "fabrica-perfiles-"));
process.env.FABRICA_PERFILES = dir;
const { borrarPerfil, extrasDePerfil, guardarFotoPerfil, leerPerfil, listarPerfiles, marcaConPerfil } = await import("../src/pipeline/perfiles");

const marca = MarcaSchema.parse({ usuario: "@mi.canal", colores: { fondo: "#060D32", fondo2: "#E22B28", texto: "#FFFFFF", acento: "#FBC72D", acento2: "#8D1622" } });

describe("perfiles", () => {
  it("el primero sale de marca.json: @mi.canal, no verificado, con sus colores", async () => {
    const [p] = await listarPerfiles(marca);
    expect(p).toMatchObject({ slug: "mi-canal", nombre: "Mi Canal", usuario: "@mi.canal", verificado: false, paleta: "propia" });
    expect(p!.colores.acento).toBe("#FBC72D");
    expect(readdirSync(dir)).toEqual(["mi-canal.json"]);
  });

  it("aplica @, colores y letra a la marca; los subtítulos y el verificado van aparte", async () => {
    const p = (await leerPerfil("mi-canal"))!;
    const m = marcaConPerfil(MarcaSchema.parse({}), { ...p, tipografia: "Oswald" });
    expect(m.usuario).toBe("@mi.canal");
    expect(m.tipografia).toBe("Oswald");
    expect(m.colores).not.toHaveProperty("subtitulos");
    expect(await extrasDePerfil(p, null)).toEqual({ nombre: "Mi Canal", verificado: false, foto: null, subtitulos: { estilo: "contorno", tamano: "normal", fondo: "#000000" } });
  });

  it("la foto tiene que ser una imagen de verdad (PNG, JPG o WEBP)", async () => {
    await expect(guardarFotoPerfil("mi-canal", Buffer.from("no soy una imagen"))).rejects.toThrow(/PNG, JPG o WEBP/);
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
    const p = await guardarFotoPerfil("mi-canal", png);
    expect(p.foto).toBe("mi-canal.png");
    await borrarPerfil("mi-canal");
    expect(existsSync(path.join(dir, "mi-canal.png"))).toBe(false);
  });

  it("slugs y paletas", () => {
    expect(slugPerfil("@La Diaria UY")).toBe("la-diaria-uy");
    expect(paletaDe({ ...PALETAS[3]!.colores })).toBe("celeste");
    expect(paletaDe({ ...PALETAS[3]!.colores, acento: "#000000" })).toBe("propia");
  });

  it("no acepta slugs con rutas", async () => {
    await expect(leerPerfil("../marca")).rejects.toThrow(/inválido/);
  });
});

describe("perfiles que vienen incompletos o con campos nuevos", () => {
  it("se completan con los valores por defecto (no rompen las pantallas)", async () => {
    const { completarPerfil } = await import("../src/shared/perfiles");
    // un perfil de una versión anterior: sin moodsMusica, lineaEditorial ni subtítulos
    const viejo = completarPerfil({ slug: "perfil-viejo", nombre: "Perfil viejo", usuario: "@perfil.viejo", verificado: false, paleta: "propia", colores: { fondo: "#202124", fondo2: "#5F6368", texto: "#F4F2EE", acento: "#D92D38", acento2: "#D92D38", subtitulos: "#000000" }, tipografia: "Montserrat", foto: null })!;
    expect(viejo.moodsMusica).toEqual([]);
    expect(viejo.lineaEditorial).toBe("ninguna");
    expect(viejo.subtitulos).toEqual({ estilo: "contorno", tamano: "normal" });
    // un campo que no conoce (de una versión nueva) se ignora
    expect(completarPerfil({ ...viejo, campoDelFuturo: { x: 1 } })?.slug).toBe("perfil-viejo");
  });
  it("si está muy roto, se rescata lo mínimo o se descarta", async () => {
    const { completarPerfil } = await import("../src/shared/perfiles");
    expect(completarPerfil({ slug: "roto", colores: "rojo", tipografia: "Comic Sans" })).toMatchObject({ slug: "roto", nombre: "roto", usuario: "@perfil" });
    expect(completarPerfil({ nombre: "sin slug" })).toBeNull();
    expect(completarPerfil(null)).toBeNull();
  });
});
