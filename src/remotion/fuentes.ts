import { useEffect, useState } from "react";
import { continueRender, delayRender } from "remotion";
import { loadFont as cargarMontserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as cargarAnton } from "@remotion/google-fonts/Anton";
import { loadFont as cargarPoppins } from "@remotion/google-fonts/Poppins";
import { loadFont as cargarBebas } from "@remotion/google-fonts/BebasNeue";
import { loadFont as cargarOswald } from "@remotion/google-fonts/Oswald";
import type { KitVisual, TipografiaVisual } from "../shared/render";

const montserrat = cargarMontserrat("normal", { weights: ["600", "800", "900"], subsets: ["latin", "latin-ext"] });
const anton = cargarAnton("normal", { weights: ["400"], subsets: ["latin", "latin-ext"] });
const poppins = cargarPoppins("normal", { weights: ["600", "800", "900"], subsets: ["latin", "latin-ext"] });

const bebas = cargarBebas("normal", { weights: ["400"], subsets: ["latin", "latin-ext"] });
const oswald = cargarOswald("normal", { weights: ["500", "700"], subsets: ["latin", "latin-ext"] });

const FUENTES = { Montserrat: montserrat, Anton: anton, Poppins: poppins, "Bebas Neue": bebas, Oswald: oswald } as const;

/** Familias de las fuentes de un kit de marca (se cargan desde sus archivos, ver marca/fuentesKit.ts). */
export const FAMILIA_KIT_TITULOS = "KitTitulos";
export const FAMILIA_KIT_DATOS = "KitDatos";

export const familia = (t: TipografiaVisual) => (t === "kit" ? `"${FAMILIA_KIT_TITULOS}", system-ui, sans-serif` : FUENTES[t].fontFamily);

/**
 * Peso "grueso" adecuado para cada familia (Anton y Bebas Neue solo tienen 400; Oswald llega a 700). Con kit,
 * el más grueso que permite la marca (Inter SemiBold 600, nunca 900).
 */
export const pesoFuerte = (t: TipografiaVisual) => (t === "kit" ? 600 : t === "Anton" || t === "Bebas Neue" ? 400 : t === "Oswald" ? 700 : 900);
export const pesoMedio = (t: TipografiaVisual) => (t === "kit" ? 500 : t === "Anton" || t === "Bebas Neue" ? 400 : t === "Oswald" ? 500 : 600);

const listas = Promise.all(Object.values(FUENTES).map((f) => f.waitUntilDone()));
let yaListas = false;
void listas.then(() => {
  yaListas = true;
});

// fuentes de los kits de marca: un FontFace por archivo (se cargan una sola vez)
const cargasKit = new Map<string, Promise<void>>();
const cargarFuenteKit = (familiaKit: string, f: { url: string; variable: boolean }) => {
  const clave = `${familiaKit}|${f.url}`;
  let p = cargasKit.get(clave);
  if (!p) {
    const cara = new FontFace(familiaKit, `url("${f.url}")`, { weight: f.variable ? "100 900" : "400", display: "block" });
    p = cara
      .load()
      .then((c) => void document.fonts.add(c))
      .catch((e: Error) => console.error(`No cargó la fuente del kit ${f.url}: ${e.message}`));
    cargasKit.set(clave, p);
  }
  return p;
};
const fuentesDelKit = (kit?: KitVisual | null) =>
  kit
    ? Promise.all([kit.fuentes.titulos ? cargarFuenteKit(FAMILIA_KIT_TITULOS, kit.fuentes.titulos) : null, kit.fuentes.datos ? cargarFuenteKit(FAMILIA_KIT_DATOS, kit.fuentes.datos) : null]).then(() => undefined)
    : Promise.resolve();

/**
 * Bloquea el render hasta que las fuentes cargaron (las de Google y, si hay, las del kit de marca).
 * Hace falta porque medimos texto (fitText) y medir con la fuente de respaldo da tamaños incorrectos.
 */
export const useFuentesListas = (kit?: KitVisual | null): boolean => {
  const [listo, setListo] = useState(yaListas && !kit);
  const [handle] = useState(() => (yaListas && !kit ? null : delayRender("Cargando fuentes")));
  useEffect(() => {
    if (handle === null) return;
    void Promise.all([listas, fuentesDelKit(kit)]).then(() => {
      setListo(true);
      continueRender(handle);
    });
  }, [handle, kit]);
  return listo;
};
