import { z } from "zod";

/**
 * Modos de edición. Cada uno cambia de verdad cómo se arma el video: las instrucciones que recibe Claude
 * (prompts/modos/<id>.md para los animados y <id>.crudo.md para los crudos), qué plantillas puede usar, cuánto
 * material va en pantalla y cómo se componen las fotos. "normal" es el comportamiento de siempre.
 */
export const MODOS_EDICION = [
  { id: "normal", nombre: "Normal", descripcion: "Edición equilibrada que combina animaciones, imágenes, textos y gráficos según el contenido." },
  { id: "graficos", nombre: "Gráficos y datos", descripcion: "Edición centrada en cifras, estadísticas, gráficos, mapas y visualizaciones de información." },
  { id: "situacional", nombre: "Animación situacional", descripcion: "Transforma el contenido en escenas animadas con personajes, objetos, escenarios e interacciones." },
  { id: "imagenes", nombre: "Normal con imágenes", descripcion: "Combina la edición tradicional con una presencia intensiva de fotografías e imágenes reales investigadas automáticamente." },
] as const;
export type ModoEdicion = (typeof MODOS_EDICION)[number]["id"];
export const IDS_MODOS_EDICION = MODOS_EDICION.map((m) => m.id) as [ModoEdicion, ...ModoEdicion[]];
export const ModoEdicionSchema = z.enum(IDS_MODOS_EDICION);

/** Cuánta ilustración lleva un video animado según el modo (en "normal" manda lo que elijas en el formulario). */
export const cantidadIlustracionDeModo = (modo: ModoEdicion, elegida: "poca" | "media" | "mucha"): "ninguna" | "poca" | "media" | "mucha" =>
  modo === "graficos" ? "ninguna" : modo === "situacional" ? "mucha" : modo === "imagenes" ? "poca" : elegida;

/** En los crudos: multiplica la separación mínima entre materiales (menos = más material en pantalla). */
export const DENSIDAD_CRUDO: Record<ModoEdicion, number> = { normal: 1, graficos: 0.8, situacional: 0.9, imagenes: 0.5 };

type Escenas = { plantilla: string }[];

/**
 * ¿El guion cumple lo que pide el modo? Devuelve qué falta (para pedirle a Claude que lo corrija una vez) o null.
 * No se exige perfección: solo que el modo se note.
 */
export const faltaDelModo = (modo: ModoEdicion, escenas: Escenas): string | null => {
  const cuerpo = escenas.slice(0, -1); // sin el cierre
  const n = (p: string | string[]) => cuerpo.filter((e) => (Array.isArray(p) ? p : [p]).includes(e.plantilla)).length;
  const total = Math.max(1, cuerpo.length);
  if (modo === "graficos") {
    if (n("escena_ilustrada")) return "en el modo «Gráficos y datos» no van escenas ilustradas con personajes: cambialas por visualizaciones de datos";
    if (n(["dato_numero", "grafico", "comparacion", "linea_tiempo", "mapa"]) / total < 0.5) return "en el modo «Gráficos y datos» al menos la mitad de las escenas tienen que ser visualizaciones (dato_numero, grafico, comparacion, linea_tiempo o mapa) con datos verificados";
  }
  if (modo === "situacional" && n("escena_ilustrada") / total < 0.6) return "en el modo «Animación situacional» al menos el 60 % de las escenas tienen que ser escena_ilustrada (personajes que actúan la situación), no textos ni gráficos";
  if (modo === "imagenes" && n(["foto_real", "clip_biblioteca"]) / total < 0.4) return "en el modo «Normal con imágenes» al menos el 40 % de las escenas tienen que ser foto_real (con imágenes reales investigadas) y con composiciones variadas";
  return null;
};
