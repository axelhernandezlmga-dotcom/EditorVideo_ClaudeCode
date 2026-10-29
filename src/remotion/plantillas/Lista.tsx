import { interpolate } from "remotion";
import type { z } from "zod";
import { CAJA_CONTENIDO } from "../../shared/render";
import type { PropsPorPlantilla } from "../../shared/schemas";
import { momentosItems, useEscena } from "../contexto";
import { Icono } from "../iconos/Icono";
import { ajustarTexto } from "../texto";
import { CLAMP, TituloPildora, useTiempo, useTipo, useResorte } from "./comun";

type Item = z.infer<typeof PropsPorPlantilla.lista>["items"][number];
const textoItem = (it: Item) => (typeof it === "string" ? it : it.texto);
const iconoItem = (it: Item) => (typeof it === "string" ? undefined : it.icono);

/**
 * Lista: cada ítem entra deslizando justo cuando la voz lo nombra, con su ícono que se dibuja.
 * El último nombrado queda resaltado y los anteriores se atenúan; una línea conecta los íconos.
 */
export const Lista: React.FC<z.infer<typeof PropsPorPlantilla.lista>> = ({ titulo, items }) => {
  const spring = useResorte();
  const { frame, fps, dur } = useTiempo();
  const { captions } = useEscena();
  const t = useTipo();
  const textos = items.map(textoItem);
  const momentos = momentosItems(captions, textos, (dur / fps) * 1000).map((ms) => (ms / 1000) * fps);

  const altoTitulo = titulo ? 110 : 0;
  const altoDisponible = CAJA_CONTENIDO.alto - altoTitulo;
  const gap = 20;
  const altoItem = Math.min(190, (altoDisponible - gap * (items.length - 1)) / items.length);
  const tamIcono = Math.min(86, altoItem - 36);
  const anchoTexto = CAJA_CONTENIDO.ancho - tamIcono - 100;
  const fontSize = Math.min(
    ...textos.map((it) => ajustarTexto({ text: it, ancho: anchoTexto, alto: altoItem - 30, fontFamily: t.fuente, fontWeight: t.fuerte, maxFont: 60, maxLineas: 2 }).fontSize),
  );
  const yInicio = altoTitulo + (altoDisponible - (altoItem * items.length + gap * (items.length - 1))) / 2;
  const activo = momentos.reduce((a, m, i) => (frame >= m ? i : a), -1);
  // la línea conectora crece hasta el ícono del ítem activo
  const centroIcono = (i: number) => yInicio + i * (altoItem + gap) + altoItem / 2;
  const lineaHasta = activo < 0 ? centroIcono(0) : centroIcono(activo);
  const lineaAnim = interpolate(frame, [momentos[Math.max(0, activo)] ?? 0, (momentos[Math.max(0, activo)] ?? 0) + 8], [activo > 0 ? centroIcono(activo - 1) : centroIcono(0), lineaHasta], CLAMP);

  return (
    <div style={{ position: "absolute", left: CAJA_CONTENIDO.x, top: CAJA_CONTENIDO.y, width: CAJA_CONTENIDO.ancho, height: CAJA_CONTENIDO.alto }}>
      <div style={{ position: "absolute", top: 0, width: "100%", display: "flex", justifyContent: "center" }}>
        <TituloPildora texto={titulo} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 24 + tamIcono / 2 + 22 - 4,
          top: centroIcono(0),
          width: 8,
          height: Math.max(0, lineaAnim - centroIcono(0)),
          borderRadius: 4,
          backgroundColor: t.colores.acento,
          opacity: 0.5,
        }}
      />
      {/* casilleros "fantasma" de los ítems que todavía no se nombraron: brillo que barre y el próximo late */}
      {items.map((_, i) => {
        const inicio = momentos[i] ?? 0;
        const visible = interpolate(frame, [inicio - 2, inicio + 6], [1, 0], CLAMP) * interpolate(frame, [i * 3, i * 3 + 8], [0, 1], CLAMP);
        if (visible <= 0) return null;
        const proximo = i === activo + 1;
        const barrido = ((frame * 2.2 + i * 40) % 160) - 30;
        return (
          <div
            key={`f${i}`}
            style={{
              position: "absolute",
              left: 0,
              top: yInicio + i * (altoItem + gap),
              width: CAJA_CONTENIDO.ancho,
              height: altoItem,
              borderRadius: 28,
              border: `3px dashed ${t.colores.texto}${proximo ? "66" : "2E"}`,
              background: `linear-gradient(100deg, transparent ${barrido - 20}%, ${t.colores.texto}38 ${barrido}%, transparent ${barrido + 20}%)`,
              opacity: visible,
              scale: proximo ? 1 + 0.035 * Math.sin(frame / 4) : 1,
              display: "flex",
              alignItems: "center",
              paddingLeft: 22,
              boxSizing: "border-box",
            }}
          >
            <div style={{ width: tamIcono + 22, height: tamIcono + 22, borderRadius: "50%", border: `4px dashed ${t.colores.acento}`, rotate: `${frame * 4}deg` }} />
          </div>
        );
      })}
      {items.map((item, i) => {
        const inicio = momentos[i] ?? 0;
        const p = spring({ frame: frame - inicio, fps, config: { damping: 12, mass: 0.6 } });
        const esActivo = i === activo;
        const resalte = spring({ frame: frame - inicio - 4, fps, config: { damping: 20 } });
        const atenuado = activo > i ? interpolate(frame, [momentos[i + 1] ?? 0, (momentos[i + 1] ?? 0) + 8], [1, 0.55], CLAMP) : 1;
        const icono = iconoItem(item);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 0,
              top: yInicio + i * (altoItem + gap),
              width: CAJA_CONTENIDO.ancho,
              height: altoItem,
              display: "flex",
              alignItems: "center",
              gap: 26,
              padding: "0 24px 0 22px",
              boxSizing: "border-box",
              borderRadius: 28,
              backgroundColor: esActivo ? `${t.colores.acento}26` : "rgba(255,255,255,0.07)",
              border: `3px solid ${esActivo ? t.colores.acento : `${t.colores.texto}1F`}`,
              boxShadow: esActivo ? `0 0 ${30 * resalte}px ${t.colores.acento}55` : "none",
              opacity: interpolate(p, [0, 0.5], [0, 1], CLAMP) * atenuado,
              translate: `${interpolate(p, [0, 1], [-CAJA_CONTENIDO.ancho * 0.7, 0])}px 0`,
              scale: esActivo ? 1 + 0.03 * resalte : 1,
            }}
          >
            <div
              style={{
                flexShrink: 0,
                width: tamIcono + 22,
                height: tamIcono + 22,
                borderRadius: "50%",
                backgroundColor: t.colores.acento,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                rotate: `${interpolate(p, [0, 1], [-180, 0])}deg`,
                scale: esActivo ? 1 + 0.08 * Math.sin((frame - inicio) / 5) : 1,
              }}
            >
              {icono ? (
                <Icono nombre={icono} tam={tamIcono * 0.72} color={t.colores.fondo} grosor={2.6} dibujo={interpolate(frame, [inicio + 2, inicio + 16], [0, 1], CLAMP)} />
              ) : (
                <span style={{ fontFamily: t.fuente, fontWeight: t.fuerte, fontSize: tamIcono * 0.55, color: t.colores.fondo }}>{i + 1}</span>
              )}
            </div>
            <div style={{ fontFamily: t.fuente, fontWeight: t.fuerte, fontSize, lineHeight: 1.1, color: t.colores.texto, textAlign: "left", width: anchoTexto }}>
              {textoItem(item)}
            </div>
          </div>
        );
      })}
    </div>
  );
};
