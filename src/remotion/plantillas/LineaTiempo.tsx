import { useMarca } from "../contexto";
import { FAMILIA_KIT_DATOS } from "../fuentes";
import { Easing, interpolate } from "remotion";
import type { z } from "zod";
import { CAJA_CONTENIDO } from "../../shared/render";
import type { PropsPorPlantilla } from "../../shared/schemas";
import { momentosItems, useEscena } from "../contexto";
import { ajustarTexto } from "../texto";
import { CLAMP, creciente, TituloPildora, useTiempo, useTipo, useResorte } from "./comun";

const X_LINEA = 70;

/**
 * Línea de tiempo vertical: la línea se dibuja de arriba hacia abajo y cada fecha se "enciende"
 * (punto que explota en un halo + tarjeta que entra) cuando la voz la menciona. La actual queda resaltada.
 */
export const LineaTiempo: React.FC<z.infer<typeof PropsPorPlantilla.linea_tiempo>> = ({ titulo, eventos }) => {
  const spring = useResorte();
  const { frame, fps, dur } = useTiempo();
  const { captions } = useEscena();
  const t = useTipo();
  const { kit } = useMarca();
  const momentos = momentosItems(
    captions,
    eventos.map((e) => `${e.texto}`),
    (dur / fps) * 1000,
  ).map((ms) => (ms / 1000) * fps);

  const altoTitulo = titulo ? 110 : 0;
  const disponible = CAJA_CONTENIDO.alto - altoTitulo - 20;
  const paso = disponible / eventos.length;
  const yEvento = (i: number) => altoTitulo + 20 + paso * i + paso / 2;
  const activo = momentos.reduce((a, m, i) => (frame >= m ? i : a), -1);

  // la línea llega a cada punto justo cuando se enciende
  const puntosLinea = creciente([0, ...momentos]);
  const ysLinea = [altoTitulo + 10, ...eventos.map((_, i) => yEvento(i))];
  const finLinea = interpolate(frame, puntosLinea, ysLinea, CLAMP);
  const anchoTexto = CAJA_CONTENIDO.ancho - X_LINEA - 80;
  const fsFecha = Math.min(...eventos.map((e) => ajustarTexto({ text: e.fecha, ancho: anchoTexto, alto: paso * 0.42, fontFamily: t.fuente, fontWeight: t.fuerte, maxFont: 64, maxLineas: 1 }).fontSize));
  const fsTexto = Math.min(...eventos.map((e) => ajustarTexto({ text: e.texto, ancho: anchoTexto, alto: paso * 0.5, fontFamily: t.fuente, fontWeight: t.medio, maxFont: 44, maxLineas: 2 }).fontSize));

  return (
    <div style={{ position: "absolute", left: CAJA_CONTENIDO.x, top: CAJA_CONTENIDO.y, width: CAJA_CONTENIDO.ancho, height: CAJA_CONTENIDO.alto }}>
      <div style={{ position: "absolute", top: 0, width: "100%", display: "flex", justifyContent: "center" }}>
        <TituloPildora texto={titulo} />
      </div>
      {/* riel y línea dibujada */}
      <div style={{ position: "absolute", left: X_LINEA - 4, top: altoTitulo + 10, width: 8, height: disponible, borderRadius: 4, backgroundColor: `${t.colores.texto}1A` }} />
      <div
        style={{
          position: "absolute",
          left: X_LINEA - 5,
          top: altoTitulo + 10,
          width: 10,
          height: Math.max(0, finLinea - altoTitulo - 10),
          borderRadius: 5,
          background: `linear-gradient(180deg, ${t.colores.acento2}, ${t.colores.acento})`,
          boxShadow: `0 0 18px ${t.colores.acento}88`,
        }}
      />
      {/* luz que recorre el riel todavía vacío, de la línea dibujada hacia abajo */}
      {activo < eventos.length - 1 ? (
        <div
          style={{
            position: "absolute",
            left: X_LINEA - 14,
            top: finLinea + (((frame * 9) % Math.max(1, altoTitulo + 10 + disponible - finLinea)) || 0) - 14,
            width: 28,
            height: 28,
            borderRadius: 14,
            background: `radial-gradient(circle, ${t.colores.acento}, transparent 70%)`,
          }}
        />
      ) : null}
      {eventos.map((e, i) => {
        const m = momentos[i] ?? 0;
        const enc = spring({ frame: frame - m, fps, config: { damping: 9, stiffness: 200 } });
        const encendido = frame >= m;
        const esActivo = i === activo;
        const halo = interpolate(frame, [m, m + 18], [0, 1], { ...CLAMP, easing: Easing.out(Easing.cubic) });
        const pasado = activo > i;
        return (
          <div key={i}>
            {/* punto */}
            <div
              style={{
                position: "absolute",
                left: X_LINEA - 24,
                top: yEvento(i) - 24,
                width: 48,
                height: 48,
                borderRadius: "50%",
                border: `6px solid ${encendido ? t.colores.acento : `${t.colores.texto}55`}`,
                backgroundColor: encendido ? t.colores.acento : t.colores.fondo,
                scale: encendido ? 1 + 0.35 * (1 - enc) + (esActivo ? 0.12 * Math.sin((frame - m) / 4) : 0) : 0.7,
                boxShadow: encendido ? `0 0 ${esActivo ? 40 : 14}px ${t.colores.acento}` : "none",
                boxSizing: "border-box",
              }}
            />
            {/* el próximo punto a encenderse "llama" con ondas mientras espera */}
            {i === activo + 1
              ? [0, 1].map((k) => {
                  const onda = ((frame + k * 10) % 20) / 20;
                  return (
                    <div
                      key={`o${k}`}
                      style={{
                        position: "absolute",
                        left: X_LINEA - 24 - 55 * onda,
                        top: yEvento(i) - 24 - 55 * onda,
                        width: 48 + 110 * onda,
                        height: 48 + 110 * onda,
                        borderRadius: "50%",
                        border: `6px solid ${t.colores.acento}`,
                        opacity: 0.9 * (1 - onda),
                      }}
                    />
                  );
                })
              : null}
            {halo > 0 && halo < 1 ? (
              <div
                style={{
                  position: "absolute",
                  left: X_LINEA - 24 - 50 * halo,
                  top: yEvento(i) - 24 - 50 * halo,
                  width: 48 + 100 * halo,
                  height: 48 + 100 * halo,
                  borderRadius: "50%",
                  border: `4px solid ${t.colores.acento}`,
                  opacity: 1 - halo,
                }}
              />
            ) : null}
            {/* tarjeta fantasma mientras la fecha no se nombró: brillo que barre */}
            {frame < m + 6 ? (
              <div
                style={{
                  position: "absolute",
                  left: X_LINEA + 50,
                  top: yEvento(i) - paso / 2 + 14,
                  width: anchoTexto + 10,
                  height: paso - 28,
                  borderRadius: 24,
                  border: `3px dashed ${t.colores.texto}${i === activo + 1 ? "66" : "2E"}`,
                  background: `linear-gradient(100deg, transparent ${((frame * 2.4 + i * 50) % 160) - 50}%, ${t.colores.texto}38 ${((frame * 2.4 + i * 50) % 160) - 30}%, transparent ${((frame * 2.4 + i * 50) % 160) - 10}%)`,
                  opacity: interpolate(frame, [m - 2, m + 6], [1, 0], CLAMP) * interpolate(frame, [i * 3, i * 3 + 8], [0, 1], CLAMP),
                }}
              />
            ) : null}
            {/* tarjeta */}
            <div
              style={{
                position: "absolute",
                left: X_LINEA + 60,
                top: yEvento(i) - paso / 2 + 8,
                width: anchoTexto,
                height: paso - 16,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                opacity: interpolate(enc, [0, 0.5], [0, 1], CLAMP) * (pasado ? 0.5 : 1),
                translate: `${interpolate(enc, [0, 1], [160, 0])}px 0`,
                textAlign: "left",
              }}
            >
              {/* con kit de marca las fechas van en Plex Mono (en mayúsculas, como «26 OCT 2026») */}
              <div style={{ fontFamily: kit ? `"${FAMILIA_KIT_DATOS}", ui-monospace, monospace` : t.fuente, fontWeight: kit ? 400 : t.fuerte, fontSize: kit ? fsFecha * 0.78 : fsFecha, letterSpacing: kit ? "0.04em" : undefined, textTransform: kit ? "uppercase" : undefined, lineHeight: 1.05, color: esActivo ? t.colores.acento : t.colores.texto, scale: esActivo ? 1 + 0.04 * enc : 1, transformOrigin: "left center" }}>
                {e.fecha}
              </div>
              <div style={{ fontFamily: t.fuente, fontWeight: t.medio, fontSize: fsTexto, lineHeight: 1.15, color: `${t.colores.texto}DD`, marginTop: 6 }}>{e.texto}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
