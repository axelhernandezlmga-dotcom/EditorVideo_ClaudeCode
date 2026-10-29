import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { migrarMarca, validarMarca } from "../src/pipeline/config";
import { RAIZ } from "../src/pipeline/rutas";
import { IDS_PROVEEDORES_VOZ, MarcaSchema, PROVEEDORES_VOZ } from "../src/shared/schemas";

describe("config/marca.json", () => {
  // config/marca.json es tuyo (no va a git): en una copia recién clonada no existe y se usan los valores por defecto
  it("valida con el esquema, sin campos inválidos ni desconocidos", () => {
    const archivo = path.join(RAIZ, "config", "marca.json");
    const datos = (existsSync(archivo) ? JSON.parse(readFileSync(archivo, "utf8")) : MarcaSchema.parse({})) as Record<string, unknown>;
    const r = MarcaSchema.safeParse(migrarMarca(structuredClone(datos)));
    expect(r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)).toEqual([]);
    expect(validarMarca(datos).avisos).toEqual([]);
  });
});

describe("validarMarca (la app no se rompe por un valor raro)", () => {
  it("un proveedor desconocido pasa al valor por defecto y queda el aviso", () => {
    const { marca, avisos } = validarMarca({ usuario: "@yo", proveedorVoz: "elevenlabs" });
    expect(marca.proveedorVoz).toBe("gemini");
    expect(marca.usuario).toBe("@yo");
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ campo: "proveedorVoz", valor: "elevenlabs", usado: "gemini" });
  });

  it("un color mal escrito se reemplaza sin perder los otros colores", () => {
    const { marca, avisos } = validarMarca({ colores: { fondo: "rojo", acento: "#123456" } });
    expect(marca.colores.acento).toBe("#123456");
    expect(marca.colores.fondo).toMatch(/^#[0-9A-F]{6}$/i);
    expect(avisos.map((a) => a.campo)).toEqual(["colores.fondo"]);
  });

  it("varios errores a la vez y campos desconocidos", () => {
    const { marca, avisos } = validarMarca({ velocidad: "rapido", puerto: -3, inventado: 1 });
    expect(marca.velocidad).toBe("+8%");
    expect(marca.puerto).toBe(3000);
    expect(avisos.map((a) => a.campo).sort()).toEqual(["inventado", "puerto", "velocidad"]);
  });

  it("si no es un objeto, usa todo por defecto", () => {
    expect(validarMarca([1, 2]).marca).toEqual(MarcaSchema.parse({}));
  });
});

describe("proveedores de voz", () => {
  it("el esquema y la lista de la UI son la misma", () => {
    expect(IDS_PROVEEDORES_VOZ).toEqual(PROVEEDORES_VOZ.map((p) => p.id));
    for (const id of IDS_PROVEEDORES_VOZ) expect(MarcaSchema.shape.proveedorVoz.safeParse(id).success).toBe(true);
    expect(MarcaSchema.parse({}).proveedorVoz).toBe("gemini");
  });
});
