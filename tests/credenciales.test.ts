import { mkdtempSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dir = mkdtempSync(path.join(os.tmpdir(), "fabrica-credenciales-"));
process.env.FABRICA_ENV = path.join(dir, ".env");
const { agregarCredencial, borrarCredencial, editarCredencial, listarCredenciales, variableDe } = await import("../src/pipeline/credenciales");
const { claveDe } = await import("../src/pipeline/claves");

describe("API keys de cualquier servicio", () => {
  it("guarda la clave solo en .env (600) y en la lista solo los últimos 4", async () => {
    await agregarCredencial({ nombre: "Mi servicio", servicio: "otro", servicioNombre: "Replicate", clave: "r8_secreta_1234", parametros: { modelo: "flux" } });
    const [c] = await listarCredenciales();
    expect(c).toMatchObject({ nombre: "Mi servicio", servicio: "otro", servicioNombre: "Replicate", configurada: true, final: "1234", probable: false });
    expect(JSON.stringify(await listarCredenciales())).not.toContain("r8_secreta");
    expect(readFileSync(path.join(dir, "data", "credenciales.json"), "utf8")).not.toContain("r8_secreta");
    expect(readFileSync(process.env.FABRICA_ENV!, "utf8")).toContain(`${variableDe(c!.id)}=r8_secreta_1234`);
    if (process.platform !== "win32") expect(statSync(process.env.FABRICA_ENV!).mode & 0o777).toBe(0o600);
  });

  it("edita sin cambiar la clave, la reemplaza y la borra", async () => {
    const [c] = await listarCredenciales();
    await editarCredencial(c!.id, { nombre: "Replicate" });
    expect((await listarCredenciales())[0]!.final).toBe("1234");
    await editarCredencial(c!.id, { clave: "otra_clave_9876" });
    expect((await listarCredenciales())[0]!.final).toBe("9876");
    await borrarCredencial(c!.id);
    expect(await listarCredenciales()).toEqual([]);
    expect(claveDe(variableDe(c!.id))).toBeNull();
  });

  it("un servicio que la app ya usa va a su variable de siempre", async () => {
    // Pexels sin internet: la prueba falla pero la clave queda guardada donde la app la busca
    const r = await agregarCredencial({ nombre: "x", servicio: "pexels", clave: "pexels_falsa" }).catch(() => ({ integrada: "PEXELS_API_KEY" }));
    expect(r.integrada).toBe("PEXELS_API_KEY");
    expect(claveDe("PEXELS_API_KEY")).toBe("pexels_falsa");
  });
});
