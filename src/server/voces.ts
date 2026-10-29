import { kokoroInstalado } from "../pipeline/instalar";
import { listarVoces as listarEdge, VOCES_KOKORO, type VozDisponible } from "../pipeline/tts";

export { proveedor, type VozDisponible } from "../pipeline/tts";

/** Variantes que van primero en el selector (rioplatense y España, después el resto). */
const ORDEN = ["es-UY", "es-AR", "es-ES", "es-MX"];

export const listarVoces = async (): Promise<VozDisponible[]> => {
  const voces = await listarEdge();
  const rango = (l: string) => (ORDEN.includes(l) ? ORDEN.indexOf(l) : ORDEN.length);
  return voces.sort((a, b) => rango(a.locale) - rango(b.locale) || a.locale.localeCompare(b.locale) || a.id.localeCompare(b.id));
};

/** Las voces de Kokoro solo se ofrecen si está instalado (dependencias en .venv y modelos en .cache/kokoro). */
export const vocesKokoro = async (): Promise<VozDisponible[]> => ((await kokoroInstalado()) ? VOCES_KOKORO : []);
