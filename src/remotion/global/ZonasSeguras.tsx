import { AbsoluteFill } from "remotion";
import { ALTO, ANCHO, CAJA_CONTENIDO, SUBTITULOS_Y, ZONA_SEGURA } from "../../shared/render";

const rojo = "rgba(255,0,0,0.28)";

/** Superposición de depuración: en rojo lo que tapan los botones de Instagram/TikTok. */
export const ZonasSeguras: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    <div style={{ position: "absolute", left: 0, top: 0, width: ANCHO, height: ZONA_SEGURA.arriba, background: rojo }} />
    <div style={{ position: "absolute", left: 0, bottom: 0, width: ANCHO, height: ZONA_SEGURA.abajo, background: rojo }} />
    <div
      style={{
        position: "absolute",
        right: 0,
        top: ZONA_SEGURA.arriba,
        width: ZONA_SEGURA.derecha,
        height: ALTO - ZONA_SEGURA.arriba - ZONA_SEGURA.abajo,
        background: rojo,
      }}
    />
    <div
      style={{
        position: "absolute",
        left: CAJA_CONTENIDO.x,
        top: CAJA_CONTENIDO.y,
        width: CAJA_CONTENIDO.ancho,
        height: CAJA_CONTENIDO.alto,
        outline: "4px dashed rgba(0,255,120,0.8)",
      }}
    />
    <div style={{ position: "absolute", left: 0, top: SUBTITULOS_Y, width: ANCHO, height: 3, background: "rgba(0,200,255,0.9)" }} />
  </AbsoluteFill>
);
