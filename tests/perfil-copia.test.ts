import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MarcaSchema } from "../src/shared/schemas";
import { PALETAS } from "../src/shared/perfiles";

// perfiles, trabajos y "último perfil" de prueba: nunca se tocan los reales
process.env.FABRICA_PERFILES = mkdtempSync(path.join(tmpdir(), "fabrica-perfiles-"));
process.env.FABRICA_JOBS = mkdtempSync(path.join(tmpdir(), "fabrica-jobs-"));
process.env.FABRICA_OPCIONES_CRUDO = path.join(mkdtempSync(path.join(tmpdir(), "fabrica-op-")), "opciones.json");
process.env.FABRICA_ULTIMO_PERFIL = path.join(mkdtempSync(path.join(tmpdir(), "fabrica-data-")), "ultimo.json");
const { borrarPerfil, extrasDePerfil, fijarPerfil, guardarFotoPerfil, guardarPerfil, guardarUltimoPerfilAnimados, leerUltimoPerfilAnimados, perfilDeTrabajo } = await import("../src/pipeline/perfiles");
const { Trabajo } = await import("../src/pipeline/trabajo");

const marca = MarcaSchema.parse({ usuario: "@otra.cuenta" });
const perfil = {
  slug: "la-cuenta",
  nombre: "La Cuenta",
  usuario: "@la.cuenta",
  verificado: true,
  paleta: "neon",
  colores: { ...PALETAS.find((p) => p.id === "neon")!.colores },
  tipografia: "Anton" as const,
  foto: null,
  subtitulos: { estilo: "caja" as const, tamano: "grande" as const },
  lineaEditorial: "ninguna" as const,
  moodsMusica: [],
};

describe("perfil copiado en el trabajo", () => {
  it("si se borra el perfil, el trabajo sigue con la copia (y con su foto)", async () => {
    await guardarPerfil(perfil);
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
    await guardarFotoPerfil("la-cuenta", png);
    const t = await Trabajo.crear("prueba de perfil borrado", { perfil: "la-cuenta" });
    await fijarPerfil(t, (await perfilDeTrabajo(t, marca)));
    expect((await t.estado()).perfilCopia).toMatchObject({ slug: "la-cuenta", verificado: true, fotoCopia: "perfil-copia.png" });

    await borrarPerfil("la-cuenta");
    const p = await perfilDeTrabajo(t, marca);
    expect(p).toMatchObject({ usuario: "@la.cuenta", verificado: true, tipografia: "Anton", subtitulos: { estilo: "caja" } });
    expect((await extrasDePerfil(p, t)).foto).toBe("perfil-copia.png");
  });

  it("los cambios al perfil se aplican mientras exista", async () => {
    await guardarPerfil({ ...perfil, slug: "viva", usuario: "@viva" });
    const t = await Trabajo.crear("prueba de perfil vivo", { perfil: "viva" });
    await perfilDeTrabajo(t, marca);
    await guardarPerfil({ ...perfil, slug: "viva", usuario: "@viva.nueva" });
    expect((await perfilDeTrabajo(t, marca)).usuario).toBe("@viva.nueva");
    expect((await t.estado()).perfilCopia?.usuario).toBe("@viva.nueva");
  });

  it("recuerda el último perfil de Videos animados", async () => {
    expect(await leerUltimoPerfilAnimados()).toBeNull();
    await guardarUltimoPerfilAnimados("viva");
    expect(await leerUltimoPerfilAnimados()).toBe("viva");
  });
});

describe("renombrar perfil", () => {
  it("mueve archivo, foto y kit, y actualiza los trabajos", async () => {
    const { renombrarPerfil } = await import("../src/pipeline/renombrarPerfil");
    const { leerPerfil, guardarFotoPerfil, DIR_PERFILES } = await import("../src/pipeline/perfiles");
    const { mkdirSync, writeFileSync, existsSync } = await import("node:fs");
    await guardarPerfil({ ...perfil, slug: "viejo", usuario: "@viejo" });
    await guardarFotoPerfil("viejo", Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]));
    mkdirSync(path.join(DIR_PERFILES, "viejo", "kit"), { recursive: true });
    writeFileSync(path.join(DIR_PERFILES, "viejo", "kit", "kit.json"), "{}");
    const t = await Trabajo.crear("trabajo con el perfil viejo", { perfil: "viejo" });
    await perfilDeTrabajo(t, marca);
    const r = await renombrarPerfil("viejo", "nuevo");
    expect(r.trabajos).toContain(t.id);
    expect(await leerPerfil("viejo")).toBeNull();
    expect(await leerPerfil("nuevo")).toMatchObject({ slug: "nuevo", foto: "nuevo.png", usuario: "@viejo" });
    expect(existsSync(path.join(DIR_PERFILES, "nuevo", "kit", "kit.json"))).toBe(true);
    const e = await t.estado();
    expect(e.opciones.perfil).toBe("nuevo");
    expect(e.perfilCopia?.slug).toBe("nuevo");
  });
});
