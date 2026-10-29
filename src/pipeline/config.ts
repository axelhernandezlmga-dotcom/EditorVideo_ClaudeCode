import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { MarcaSchema, migrarTono, type Marca } from "../shared/schemas";
import { claveDe } from "./claves";
import { escribirAtomico } from "./trabajo";
import { ARCHIVO_MARCA, RAIZ } from "./rutas";

const ARCHIVO_ENV = path.join(RAIZ, ".env");

export const cargarEnv = () => {
  if (existsSync(ARCHIVO_ENV)) {
    try {
      process.loadEnvFile(ARCHIVO_ENV);
    } catch {
      // .env mal formado: se ignora
    }
  }
};
cargarEnv();

export type AvisoConfig = { campo: string; problema: string; valor: unknown; usado: unknown };

const leerCampo = (o: unknown, ruta: PropertyKey[]): unknown => ruta.reduce<unknown>((x, k) => (x && typeof x === "object" ? (x as Record<PropertyKey, unknown>)[k] : undefined), o);

const borrarCampo = (o: unknown, ruta: PropertyKey[]) => {
  const padre = leerCampo(o, ruta.slice(0, -1));
  if (padre && typeof padre === "object") delete (padre as Record<PropertyKey, unknown>)[ruta.at(-1)!];
};

/** Campos de versiones anteriores que ya no se usan: se quitan sin avisar. */
const CAMPOS_RETIRADOS = ["carpetaClips"];
/** Lleva una configuración vieja a la actual sin perder nada más. */
export const migrarMarca = (datos: Record<string, unknown>) => {
  for (const k of CAMPOS_RETIRADOS) delete datos[k];
  datos.tonoPorDefecto = migrarTono(datos.tonoPorDefecto);
  return datos;
};

/**
 * Valida la configuración sin romper la app: cada campo inválido o desconocido se cambia por su valor
 * por defecto y queda como aviso (se muestra en Configuración; al guardar desde la app se corrige el archivo).
 */
export const validarMarca = (datos: unknown): { marca: Marca; avisos: AvisoConfig[] } => {
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
    return { marca: MarcaSchema.parse({}), avisos: [{ campo: "(todo)", problema: "no es un objeto JSON", valor: datos, usado: "valores por defecto" }] };
  }
  datos = migrarMarca(structuredClone(datos) as Record<string, unknown>);
  const copia = structuredClone(datos) as Record<string, unknown>;
  const problemas: { ruta: PropertyKey[]; problema: string; valor: unknown }[] = [];
  for (let vuelta = 0; vuelta < 50; vuelta++) {
    const r = MarcaSchema.safeParse(copia);
    if (r.success) {
      const avisos: AvisoConfig[] = problemas.map((p) => ({ campo: p.ruta.join("."), problema: p.problema, valor: p.valor, usado: leerCampo(r.data, p.ruta) }));
      for (const k of Object.keys(datos as object).filter((k) => !(k in MarcaSchema.shape))) {
        avisos.push({ campo: k, problema: "campo desconocido (se ignora)", valor: (datos as Record<string, unknown>)[k], usado: null });
      }
      return { marca: r.data, avisos };
    }
    for (const i of r.error.issues) {
      // un campo raíz sin ruta no se puede sacar: se arranca de cero
      if (i.path.length === 0) return { marca: MarcaSchema.parse({}), avisos: [{ campo: "(todo)", problema: i.message, valor: datos, usado: "valores por defecto" }] };
      problemas.push({ ruta: i.path, problema: i.message, valor: leerCampo(copia, i.path) });
      // un ítem malo dentro de un campo (ej. un color) se borra; zod pone su valor por defecto
      borrarCampo(copia, i.path);
    }
  }
  return { marca: MarcaSchema.parse({}), avisos: [{ campo: "(todo)", problema: "no se pudo corregir", valor: datos, usado: "valores por defecto" }] };
};

let avisados = "";

export const leerMarcaConAvisos = async (): Promise<{ marca: Marca; avisos: AvisoConfig[] }> => {
  if (!existsSync(ARCHIVO_MARCA)) return { marca: MarcaSchema.parse({}), avisos: [] };
  let datos: unknown;
  try {
    datos = JSON.parse(await readFile(ARCHIVO_MARCA, "utf8"));
  } catch (e) {
    return { marca: MarcaSchema.parse({}), avisos: [{ campo: "(todo)", problema: `config/marca.json no es JSON válido (${(e as Error).message})`, valor: null, usado: "valores por defecto" }] };
  }
  const r = validarMarca(datos);
  const clave = JSON.stringify(r.avisos);
  if (r.avisos.length && clave !== avisados) {
    avisados = clave;
    for (const a of r.avisos) console.warn(`⚠ config/marca.json → ${a.campo}: ${a.problema}. Uso ${JSON.stringify(a.usado)}.`);
  }
  return r;
};

export const leerMarca = async (): Promise<Marca> => (await leerMarcaConAvisos()).marca;

export const guardarMarca = async (m: unknown): Promise<Marca> => {
  const marca = MarcaSchema.parse(m);
  await escribirAtomico(ARCHIVO_MARCA, `${JSON.stringify(marca, null, 2)}\n`);
  return marca;
};

export const pexelsKey = () => claveDe("PEXELS_API_KEY");
