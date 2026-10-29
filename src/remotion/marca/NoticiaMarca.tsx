import { AbsoluteFill, Img, interpolate, useCurrentFrame } from "remotion";
import { ANCHO, ZONA_SEGURA } from "../../shared/render";
import { avance, caidaPunto, CL, EASE, FUENTE_DATOS, FUENTE_TITULOS, useKit } from "./base";

type Props = {
  /** Captura del titular (o null: se muestra el titular como texto). */
  imagen: string | null;
  titular?: string;
  /** Renglones a resaltar en la captura (proporciones 0–1). */
  rects?: { x: number; y: number; w: number; h: number }[];
  proporcion?: number;
  medio: string;
  fecha?: string | null;
  limiteAbajo: number;
  /** Frames de entrada y desde cuándo se cuenta. */
  desde?: number;
  salida?: number;
  /** Velo de tinta detrás (cuando va encima de un video). */
  velo?: boolean;
};

/**
 * Tarjeta de noticia de marca: la captura dentro de una tarjeta papel, con la etiqueta FUENTE en Plex Mono, el
 * punto rojo, el medio y la fecha en gris, y el resaltado en rojo con transparencia (como el Destacado).
 */
export const NoticiaMarca: React.FC<Props> = ({ imagen, titular, rects = [], proporcion = 1.6, medio, fecha, limiteAbajo, desde = 0, salida = 1, velo = true }) => {
  const frame = useCurrentFrame();
  const kit = useKit();
  if (!kit) return null;
  const entra = avance(frame, desde, 14);
  const pad = 40;
  const ancho = ANCHO - 2 * 64;
  const altoMax = limiteAbajo - (ZONA_SEGURA.arriba + 10) - 220;
  const altoImg = Math.min(altoMax, (ancho - pad * 2) / proporcion);
  const anchoImg = imagen ? altoImg * proporcion : ancho - pad * 2;
  const pintado = interpolate(frame, [desde + 16, desde + 34], [0, 1], { ...CL, easing: EASE });
  const punto = caidaPunto(frame, desde + 8);
  return (
    <AbsoluteFill>
      {velo ? <AbsoluteFill style={{ background: kit.colores.texto, opacity: 0.28 * entra * salida }} /> : null}
      <div
        style={{
          position: "absolute",
          left: (ANCHO - (anchoImg + pad * 2)) / 2,
          top: ZONA_SEGURA.arriba + 10,
          width: anchoImg + pad * 2,
          padding: pad,
          borderRadius: 28,
          background: kit.colores.fondo2,
          opacity: entra * salida,
          translate: `0 ${(1 - entra) * 60 + (1 - salida) * -30}px`,
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 26 }}>
          <span style={{ fontFamily: FUENTE_DATOS, fontSize: 30, letterSpacing: "0.06em", color: kit.colores.texto }}>FUENTE</span>
          <span style={{ width: 22, height: 22, borderRadius: "50%", background: kit.colores.acento, scale: String(punto.escala), translate: `0 ${punto.y * 40}px` }} />
        </div>
        <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", background: kit.colores.fondo }}>
          {imagen ? (
            <Img src={imagen} style={{ display: "block", width: anchoImg, height: altoImg, objectFit: "cover", objectPosition: "top" }} />
          ) : (
            <div style={{ padding: "40px 36px", fontFamily: FUENTE_TITULOS, fontWeight: 600, fontSize: 60, lineHeight: 1.12, color: kit.colores.texto, position: "relative" }}>
              <span style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: -6, right: -6, top: "8%", bottom: "4%", background: kit.colores.acento, opacity: 0.22, scale: `${pintado} 1`, transformOrigin: "left", borderRadius: 4 }} />
                {titular}
              </span>
            </div>
          )}
          {rects.map((r, i) => {
            const p = interpolate(pintado * rects.length - i, [0, 1], [0, 1], CL);
            return <div key={i} style={{ position: "absolute", left: `${r.x * 100}%`, top: `${(r.y - r.h * 0.08) * 100}%`, width: `${r.w * 100 * p}%`, height: `${r.h * 116}%`, background: kit.colores.acento, opacity: 0.28, borderRadius: 4 }} />;
          })}
        </div>
        <div style={{ marginTop: 22, fontFamily: FUENTE_DATOS, fontSize: 28, letterSpacing: "0.04em", color: kit.colores.secundario }}>
          {[medio.toUpperCase(), fecha].filter(Boolean).join(" / ")}
        </div>
      </div>
    </AbsoluteFill>
  );
};
