import { createContext, useContext } from "react";
import type { Caption } from "@remotion/captions";
import type { MarcaVisual } from "../shared/render";

export const MarcaContext = createContext<MarcaVisual | null>(null);

export const useMarca = (): MarcaVisual => {
  const m = useContext(MarcaContext);
  if (!m) throw new Error("Falta <MarcaContext.Provider>");
  return m;
};

export type DatosEscena = {
  captions: Caption[];
  enfasis: string[];
  duracionFrames: number;
  /** Posición de la escena en el video (para variar fondos y animaciones). */
  indice: number;
  /** `emoji_o_icono` del guion, si lo hay. */
  icono?: string;
  /** Etiqueta del bloque editorial que empieza en esta escena (CONTEXTO, DATO, OPINIÓN, FUENTE), si la hay. */
  etiqueta?: string;
};

export const EscenaContext = createContext<DatosEscena>({ captions: [], enfasis: [], duracionFrames: 90, indice: 0 });
export const useEscena = () => useContext(EscenaContext);

export const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");

/** Momento (ms, relativo a la escena) en que la voz dice `palabra`, o null si no la encuentra. */
export const momentoPalabra = (captions: Caption[], palabra: string, desdeMs = 0): number | null => {
  const objetivo = normalizar(palabra.split(/\s+/)[0] ?? "");
  if (!objetivo) return null;
  const c = captions.find((c) => c.startMs >= desdeMs && normalizar(c.text) === objetivo);
  return c ? c.startMs : null;
};

/** Reparte N apariciones a lo largo de la narración: usa la palabra clave si se encuentra, si no reparte parejo. */
export const momentosItems = (captions: Caption[], items: string[], duracionMs: number, inicioMs = 250): number[] => {
  const fin = Math.max(inicioMs + 1, duracionMs * 0.85);
  let ultimo = 0;
  return items.map((item, i) => {
    const parejo = inicioMs + ((fin - inicioMs) * i) / Math.max(1, items.length);
    let t = parejo;
    const palabras = item.split(/\s+/).filter((p) => normalizar(p).length > 3);
    for (const p of palabras) {
      const m = momentoPalabra(captions, p, ultimo);
      if (m !== null) {
        t = Math.max(0, m - 150);
        break;
      }
    }
    ultimo = Math.max(ultimo, t);
    return ultimo;
  });
};
