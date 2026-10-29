import { Easing, interpolate } from "remotion";
import type { z } from "zod";
import { CAJA_CONTENIDO } from "../../shared/render";
import type { PropsPorPlantilla } from "../../shared/schemas";
import { Icono } from "../iconos/Icono";
import { useMarca } from "../contexto";
import { CLAMP, Destello, TextoCinetico, useTiempo, useTipo, useResorte } from "./comun";

/**
 * Cierre: el remate entra palabra por palabra; después aparece la pregunta en un globo de comentario
 * (precedido por "escribiendo…") y al final un cursor toca "Seguir" y el botón pasa a "Siguiendo ✓".
 */
export const CierreCta: React.FC<z.infer<typeof PropsPorPlantilla.cierre_cta>> = ({ remate, pregunta }) => {
  const spring = useResorte();
  const { frame, fps, dur, frameDe } = useTiempo();
  const t = useTipo();
  const conPlaca = Boolean(useMarca().conPlacaSeguir);
  const altoRemate = 300;

  const primeraPregunta = pregunta?.split(/\s+/).find((p) => p.replace(/[^\p{L}]/gu, "").length > 3);
  const inicioGlobo = Math.min(dur * 0.42, Math.max(dur * 0.22, primeraPregunta ? frameDe(primeraPregunta, dur * 0.3) - 10 : dur * 0.3));
  const escribiendo = frame >= inicioGlobo && frame < inicioGlobo + 12;
  const globo = spring({ frame: frame - inicioGlobo - 12, fps, config: { damping: 11 } });

  const inicioBoton = dur * 0.55;
  const boton = spring({ frame: frame - inicioBoton, fps, config: { damping: 12 } });
  const toque = inicioBoton + Math.round(fps * 0.75);
  // el cursor llega desde abajo a la derecha y toca el botón
  const cursorIn = interpolate(frame, [inicioBoton + 4, toque], [0, 1], { ...CLAMP, easing: Easing.out(Easing.cubic) });
  const presion = interpolate(frame, [toque, toque + 3, toque + 8], [1, 0.9, 1], CLAMP);
  const siguiendo = frame >= toque + 3;
  const cambio = spring({ frame: frame - toque - 3, fps, config: { damping: 10 } });

  const yGlobo = altoRemate + 20;
  const yBoton = yGlobo + 250;

  return (
    <div style={{ position: "absolute", left: CAJA_CONTENIDO.x, top: CAJA_CONTENIDO.y, width: CAJA_CONTENIDO.ancho, height: CAJA_CONTENIDO.alto }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: "100%", height: altoRemate, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <TextoCinetico texto={remate} alto={altoRemate} maxFont={96} maxLineas={3} mayusculas hasta={Math.max(10, inicioGlobo)} />
      </div>

      {pregunta ? (
        <div style={{ position: "absolute", left: 0, top: yGlobo, width: "100%", display: "flex", justifyContent: "center" }}>
          {escribiendo ? (
            <div style={{ display: "flex", gap: 14, padding: "26px 40px", borderRadius: 40, backgroundColor: t.colores.texto }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: t.colores.fondo, translate: `0 ${-10 * Math.max(0, Math.sin((frame - inicioGlobo) / 2 - i))}px` }} />
              ))}
            </div>
          ) : frame >= inicioGlobo + 12 ? (
            <div
              style={{
                position: "relative",
                maxWidth: CAJA_CONTENIDO.ancho - 40,
                display: "flex",
                alignItems: "center",
                gap: 20,
                padding: "26px 34px",
                borderRadius: "40px 40px 40px 10px",
                backgroundColor: t.colores.texto,
                color: t.colores.fondo,
                fontFamily: t.fuente,
                fontWeight: t.fuerte,
                fontSize: pregunta.length > 60 ? 38 : 46,
                lineHeight: 1.15,
                textAlign: "left",
                scale: globo,
                transformOrigin: "10% 100%",
                rotate: `${interpolate(globo, [0, 1], [-8, 0]) + 1.5 * Math.sin(frame / 9)}deg`,
                boxShadow: "0 14px 40px rgba(0,0,0,0.4)",
              }}
            >
              <div style={{ flexShrink: 0, translate: `0 ${-6 * Math.abs(Math.sin(frame / 6))}px` }}>
                <Icono nombre="message-circle" tam={64} color={t.colores.acento2} grosor={2.6} dibujo={interpolate(frame, [inicioGlobo + 12, inicioGlobo + 26], [0, 1], CLAMP)} />
              </div>
              {pregunta}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* botón seguir + cursor (si después viene la placa "Seguir", no: si no, habría dos botones) */}
      {conPlaca ? null : (
      <>
      <div style={{ position: "absolute", left: 0, top: yBoton, width: "100%", display: "flex", justifyContent: "center", opacity: boton, translate: `0 ${interpolate(boton, [0, 1], [80, 0])}px` }}>
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: 18,
            padding: "22px 46px",
            borderRadius: 60,
            backgroundColor: siguiendo ? t.colores.texto : t.colores.acento2,
            color: siguiendo ? t.colores.fondo : t.colores.texto,
            fontFamily: t.fuente,
            fontWeight: t.fuerte,
            fontSize: 50,
            scale: presion * (siguiendo ? 1 + 0.06 * (1 - cambio) : 1 + 0.03 * Math.sin(frame / 5)),
            boxShadow: `0 0 ${siguiendo ? 20 : 40}px ${t.colores.acento2}AA`,
            whiteSpace: "nowrap",
          }}
        >
          <Icono nombre={siguiendo ? "check" : "user-plus"} tam={52} color={siguiendo ? t.colores.fondo : t.colores.texto} grosor={3} dibujo={siguiendo ? cambio * 1.5 : 1} />
          {siguiendo ? "Siguiendo" : "Seguime para más"}
          <Destello en={toque + 3} radio={200} color={t.colores.acento} cantidad={16} />
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, top: yBoton + 120, width: "100%", textAlign: "center", fontFamily: t.fuente, fontWeight: t.fuerte, fontSize: 40, color: t.colores.acento, opacity: boton, letterSpacing: "0.02em" }}>
        {t.usuario}
      </div>
      {cursorIn > 0 ? (
        <div
          style={{
            position: "absolute",
            left: interpolate(cursorIn, [0, 1], [CAJA_CONTENIDO.ancho + 60, CAJA_CONTENIDO.ancho / 2 + 120]),
            top: interpolate(cursorIn, [0, 1], [yBoton + 220, yBoton + 40]),
            scale: frame >= toque && frame < toque + 8 ? 0.85 : 1,
            filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.5))",
          }}
        >
          <Icono nombre="pointer" tam={110} color={t.colores.texto} relleno={t.colores.fondo} grosor={1.8} />
        </div>
      ) : null}
      </>
      )}
    </div>
  );
};
