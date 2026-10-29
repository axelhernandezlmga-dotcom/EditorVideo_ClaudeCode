import type React from "react";
import type { z } from "zod";
import { esLineaDeFuente, iconoPorTema } from "../../shared/marca";
import { ANCHO, ZONA_SEGURA } from "../../shared/render";
import type { NombrePlantilla, PropsPorPlantilla } from "../../shared/schemas";
import { useEscena } from "../contexto";
import { useTiempo } from "../plantillas/comun";
import { ajustarTexto } from "../texto";
import { avance, caidaPunto, FUENTE_DATOS, FUENTE_TITULOS, useKit } from "./base";
import { Destacado, FechaFuente, IconoMarca, Marcador, SeparadorAnimado } from "./piezas";
import { TarjetaMarca } from "./TarjetaMarca";

/**
 * Versiones de marca de algunas plantillas: con kit, el titular es una tarjeta del manual, el número un
 * Destacado que cuenta, el ícono uno del kit dibujándose y el cierre un remate con separador. Escala del
 * manual (título 64 / cuerpo 32 / fuente 24 sobre 1080) llevada a reel: 96 / 48 / 36.
 */

const X = 80;
const ANCHO_UTIL = ANCHO - X - ZONA_SEGURA.derecha;
const Y0 = ZONA_SEGURA.arriba + 24;

const MarcaTitular: React.FC<z.infer<typeof PropsPorPlantilla.titular>> = ({ texto, subtitulo }) => {
  const kit = useKit();
  const { indice, etiqueta, captions } = useEscena();
  const tema = indice % 3 === 2 ? "tinta" : "papel";
  const icono = kit ? (iconoPorTema(`${texto} ${subtitulo ?? ""} ${captions.map((c) => c.text).join("")}`, Object.keys(kit.iconos)) ?? undefined) : undefined;
  return <TarjetaMarca tema={tema} etiqueta={etiqueta ?? (indice === 0 ? kit?.fecha : undefined)} icono={icono} titulo={texto} bajada={subtitulo} />;
};

const MarcaDato: React.FC<z.infer<typeof PropsPorPlantilla.dato_numero>> = ({ numero, decimales, prefijo, unidad, contexto }) => {
  const kit = useKit();
  const { indice, etiqueta } = useEscena();
  const { frame } = useTiempo();
  if (!kit) return null;
  const k = avance(frame, 16, 14);
  // la cifra entra siempre en una línea: se achica si es larga ("US$31 millones")
  const final = `${prefijo ?? ""}${numero.toLocaleString("es-UY", { minimumFractionDigits: decimales ?? 0, maximumFractionDigits: decimales ?? 0 })}${unidad ? (unidad.length <= 2 ? unidad : ` ${unidad}`) : ""}`;
  const tam = ajustarTexto({ text: final, ancho: ANCHO_UTIL - 90, alto: 220, fontFamily: FUENTE_TITULOS, fontWeight: 600, maxFont: 150, minFont: 60, maxLineas: 1 }).fontSize;
  const altoDestacado = tam * 1.45;
  return (
    <>
      <Marcador etiqueta={etiqueta ?? "DATO"} x={X} y={Y0} desde={0} />
      <Destacado numero={numero} decimales={decimales} prefijo={prefijo} unidad={unidad} x={X} y={Y0 + 150} ancho={ANCHO_UTIL} tam={tam} desde={4} />
      <div style={{ position: "absolute", left: X, width: ANCHO_UTIL, top: Y0 + 150 + altoDestacado + 44, fontFamily: FUENTE_TITULOS, fontWeight: 500, fontSize: 56, lineHeight: 1.18, color: kit.colores.texto, opacity: k, translate: `0 ${(1 - k) * 20}px` }}>
        {contexto}
      </div>
      <FechaFuente n={indice} x={X} y={Y0 + 720} desde={24} tam={30} />
    </>
  );
};

const MarcaIcono: React.FC<z.infer<typeof PropsPorPlantilla.icono_texto>> = ({ icono, texto, subtitulo }) => {
  const kit = useKit();
  const { etiqueta, captions } = useEscena();
  const { frame } = useTiempo();
  if (!kit) return null;
  const ids = Object.keys(kit.iconos);
  const id = ids.includes(icono) ? icono : (iconoPorTema(`${icono} ${texto} ${subtitulo ?? ""} ${captions.map((c) => c.text).join("")}`, ids) ?? "contexto");
  const t = avance(frame, 14, 14);
  const s = avance(frame, 22, 14);
  return (
    <>
      {etiqueta ? <Marcador etiqueta={etiqueta} x={X} y={Y0} /> : null}
      <IconoMarca id={id} tam={230} x={X - 18} y={Y0 + 100} desde={2} dur={26} />
      {/* título y bajada en columna: un título largo empuja la bajada en vez de pisarla */}
      <div style={{ position: "absolute", left: X, width: ANCHO_UTIL, top: Y0 + 380, display: "flex", flexDirection: "column", gap: 26 }}>
        <div style={{ fontFamily: FUENTE_TITULOS, fontWeight: 500, fontSize: texto.length > 34 ? 76 : 88, lineHeight: 1.06, letterSpacing: "-0.02em", color: kit.colores.texto, opacity: t, translate: `0 ${(1 - t) * 24}px` }}>{texto}</div>
        {subtitulo ? <div style={{ fontFamily: FUENTE_TITULOS, fontSize: 46, lineHeight: 1.3, color: kit.colores.secundario, opacity: s }}>{subtitulo}</div> : null}
      </div>
    </>
  );
};

const MarcaCierre: React.FC<z.infer<typeof PropsPorPlantilla.cierre_cta>> = (props) => {
  const kit = useKit();
  const { frame } = useTiempo();
  if (!kit) return null;
  // «Fuente: …» no es un remate: va en la línea de fuente (Plex Mono) y la pregunta pasa a ser el título
  const fuente = esLineaDeFuente(props.remate) ? props.remate.replace(/^\s*fuentes?\s*:\s*/i, "") : null;
  const remate = fuente ? (props.pregunta ?? "").replace(/\s*@[\w.]+\s*$/, "") || props.remate : props.remate;
  const pregunta = fuente ? undefined : props.pregunta;
  const t = avance(frame, 2, 14);
  const p = avance(frame, 16, 14);
  const punto = caidaPunto(frame, 12);
  return (
    <>
      <div style={{ position: "absolute", left: X, width: ANCHO_UTIL, top: Y0 + 120, fontFamily: FUENTE_TITULOS, fontWeight: 500, fontSize: 96, lineHeight: 1.05, letterSpacing: "-0.025em", color: kit.colores.texto, opacity: t, translate: `0 ${(1 - t) * 28}px` }}>
        {remate.replace(/[.!]+$/, "")}
        {/* el punto rojo cierra la frase, como en el logo */}
        <span style={{ display: "inline-block", width: 24, height: 24, marginLeft: 6, borderRadius: "50%", background: kit.colores.acento, scale: String(punto.escala), translate: `0 ${punto.y * 50}px` }} />
      </div>
      {pregunta ? (
        <div style={{ position: "absolute", left: X, width: ANCHO_UTIL, top: Y0 + 520, fontFamily: FUENTE_TITULOS, fontSize: 50, lineHeight: 1.3, color: kit.colores.secundario, opacity: p }}>
          {pregunta}
        </div>
      ) : null}
      <SeparadorAnimado x={X} y={Y0 + (fuente ? 560 : 760)} ancho={ANCHO_UTIL} desde={22} />
      {fuente ? (
        <div style={{ position: "absolute", left: X, width: ANCHO_UTIL, top: Y0 + 610, fontFamily: FUENTE_DATOS, fontSize: 30, letterSpacing: "0.05em", color: kit.colores.secundario, opacity: avance(frame, 26, 10), textTransform: "uppercase" }}>
          FUENTE / {fuente}
        </div>
      ) : null}
    </>
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PLANTILLAS_MARCA: Partial<Record<NombrePlantilla, React.FC<any>>> = {
  titular: MarcaTitular,
  dato_numero: MarcaDato,
  icono_texto: MarcaIcono,
  cierre_cta: MarcaCierre,
};
