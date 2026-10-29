import { existsSync } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { Marca } from "../shared/schemas";
import { estiloGemini } from "./pasos/voz";
import { duracionMs } from "./proceso";
import { RAIZ } from "./rutas";
import { leerTono, listarTonos } from "./tonos";
import { proveedor, proveedorDeVoz } from "./tts";
import { sintetizarGemini } from "./tts/gemini";

export const DIR_PRUEBAS_VOZ = path.join(RAIZ, "pruebas-voz");

/** Un párrafo de prueba por tono, para comparar voces con el texto que de verdad van a leer (los tonos nuevos usan el de académico). */
export const TEXTOS_MUESTRA: Record<string, string> = {
  academico:
    "¿Sabés quién administra tu jubilación? En Uruguay, una parte de lo que aportás va a una AFAP. Es una cuenta a tu nombre que invierte ese dinero durante toda tu vida laboral. Cuando te jubilás, lo ahorrado se suma a lo que paga el BPS.",
};

export type Muestra = { archivo: string; url: string; voz: string; tono: string; segundos: number; fecha: string };

const nombreArchivo = (tono: string, voz: string) => `${tono}-${voz.replace(/[^\w-]+/g, "-")}`;

/** Genera (o reutiliza) la muestra de una voz leyendo el texto de un tono, con las notas de dirección de ese tono. */
export const generarMuestra = async (marca: Marca, tonoId: string, voz: string, opciones: { texto?: string; rehacer?: boolean } = {}): Promise<Muestra> => {
  const tono = await leerTono(tonoId);
  const texto = opciones.texto?.trim() || TEXTOS_MUESTRA[tonoId] || TEXTOS_MUESTRA.academico!;
  const velocidad = tono.velocidad ?? marca.velocidad;
  await mkdir(DIR_PRUEBAS_VOZ, { recursive: true });
  const prov = proveedorDeVoz(voz);
  const base = path.join(DIR_PRUEBAS_VOZ, nombreArchivo(tonoId, voz));
  const ext = prov === "edge" ? ".mp3" : ".wav";
  // con texto propio no se reutiliza: el archivo se pisa
  if (opciones.rehacer || opciones.texto || !existsSync(base + ext)) {
    if (prov === "gemini") await sintetizarGemini({ texto, voz, estilo: estiloGemini(tono, velocidad), salida: base + ext });
    else await proveedor(prov).sintetizar({ texto, voz, velocidad, tono: marca.tono, salidaSinExt: base, sinTiempos: true });
  }
  return describir(base + ext);
};

const describir = async (archivo: string): Promise<Muestra> => {
  const nombre = path.basename(archivo);
  const [tono = "", ...resto] = nombre.replace(/\.\w+$/, "").split(/-(?=gemini-|es-|e[fm]_)/);
  return {
    archivo: nombre,
    url: `/api/pruebas-voz/${encodeURIComponent(nombre)}`,
    voz: resto.join("-").replace(/^gemini-/, "gemini:"),
    tono,
    segundos: Math.round((await duracionMs(archivo)) / 100) / 10,
    fecha: (await stat(archivo)).mtime.toISOString(),
  };
};

export const listarMuestras = async (): Promise<Muestra[]> => {
  if (!existsSync(DIR_PRUEBAS_VOZ)) return [];
  const archivos = (await readdir(DIR_PRUEBAS_VOZ)).filter((a) => /\.(wav|mp3)$/.test(a) && !a.startsWith("prueba-"));
  const muestras = await Promise.all(archivos.map((a) => describir(path.join(DIR_PRUEBAS_VOZ, a)).catch(() => null)));
  // las de tonos que ya no existen (ej. los retirados en v8) no se muestran; los archivos quedan
  const tonos = new Set((await listarTonos()).map((t) => t.id));
  return muestras.filter((m): m is Muestra => m !== null && tonos.has(m.tono)).sort((a, b) => a.tono.localeCompare(b.tono) || a.voz.localeCompare(b.voz));
};
