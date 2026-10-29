import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { ANCHO, ZONA_SEGURA } from "../../shared/render";
import { useMarca } from "../contexto";
import { avance, caidaPunto, CL, FUENTE_DATOS, FUENTE_TITULOS, PiezaMarca, useKit } from "./base";
import { IconoMarca, SeparadorAnimado } from "./piezas";

/**
 * Tarjeta de aplicación del manual (papel o tinta), animada en secuencia: etiqueta en Plex Mono arriba a la
 * izquierda, el punto arriba a la derecha, ícono, título grande en Inter, bajada en gris, separador y la firma
 * horizontal (el logo del kit) abajo.
 */
export const TarjetaMarca: React.FC<{ tema?: "papel" | "tinta"; etiqueta?: string; icono?: string; titulo: string; bajada?: string; desde?: number; y?: number; alto?: number }> = ({
  tema = "papel",
  etiqueta,
  icono,
  titulo,
  bajada,
  desde = 0,
  y = ZONA_SEGURA.arriba + 10,
  alto = 820,
}) => {
  const frame = useCurrentFrame();
  const kit = useKit();
  if (!kit) return null;
  const x = 64;
  const ancho = ANCHO - x * 2;
  const fondo = tema === "tinta" ? kit.colores.texto : kit.colores.fondo2;
  const tinta = tema === "tinta" ? kit.colores.fondo : kit.colores.texto;
  const gris = tema === "tinta" ? "rgba(255,255,255,0.72)" : kit.colores.secundario;
  const entra = avance(frame, desde, 12);
  const pad = 56;
  const punto = caidaPunto(frame, desde + 6);
  const t = (k: number, d = 10) => avance(frame, desde + k, d);
  // el título se achica si es largo (nada de párrafos en mayúsculas: se respeta como viene)
  const tamTitulo = titulo.length > 60 ? 70 : titulo.length > 36 ? 84 : 100;
  return (
    <div style={{ position: "absolute", left: x, top: y + (1 - entra) * 40, width: ancho, height: alto, borderRadius: 28, background: fondo, opacity: entra, overflow: "hidden", boxShadow: tema === "papel" ? "0 1px 0 rgba(0,0,0,0.04)" : undefined }}>
      {etiqueta ? <div style={{ position: "absolute", left: pad, top: pad, fontFamily: FUENTE_DATOS, fontSize: 28, letterSpacing: "0.06em", color: tinta, opacity: t(4) }}>{etiqueta}</div> : null}
      <div style={{ position: "absolute", right: pad, top: pad + 4 + punto.y * 40, width: 24, height: 24, borderRadius: "50%", background: kit.colores.acento, scale: String(punto.escala) }} />
      {icono ? <IconoMarca id={icono} tam={96} x={pad} y={pad + 90} desde={desde + 8} color={tinta} /> : null}
      <div
        style={{
          position: "absolute",
          left: pad,
          right: pad,
          top: icono ? pad + 230 : pad + 120,
          fontFamily: FUENTE_TITULOS,
          fontWeight: 500,
          fontSize: tamTitulo,
          lineHeight: 1.08,
          letterSpacing: "-0.02em",
          color: tinta,
          opacity: t(10, 12),
          translate: `0 ${(1 - t(10, 12)) * 24}px`,
        }}
      >
        {titulo}
      </div>
      {bajada ? (
        <div style={{ position: "absolute", left: pad, right: pad, bottom: 200, fontFamily: FUENTE_TITULOS, fontWeight: 400, fontSize: 40, lineHeight: 1.3, color: gris, opacity: t(18, 12), translate: `0 ${(1 - t(18, 12)) * 16}px` }}>
          {bajada}
        </div>
      ) : null}
      <div style={{ position: "absolute", left: pad, bottom: 150, width: ancho - pad * 2, height: 2, background: tema === "tinta" ? "rgba(255,255,255,0.25)" : kit.colores.linea, scale: `${t(22, 14)} 1`, transformOrigin: "left" }} />
      <div style={{ position: "absolute", left: pad, bottom: 46, opacity: t(26, 10) }}>
        <PiezaMarca fondo={fondo} ancho={360} horizontal />
      </div>
    </div>
  );
};

/**
 * Cierre de marca: el logo completo (variante según el fondo), el @ en Plex Mono y el botón «Seguir»
 * minimalista que, al tocarlo, pasa a «Siguiendo» con el punto rojo como tilde. Insignia solo si es verificado.
 */
export const CierreMarca: React.FC<{ toque: number; tema?: "papel" | "tinta" }> = ({ toque, tema = "papel" }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const kit = useKit();
  const { usuario, verificado } = useMarca();
  if (!kit) return null;
  const fondo = tema === "tinta" ? kit.colores.texto : kit.colores.fondo2;
  const tinta = tema === "tinta" ? kit.colores.fondo : kit.colores.texto;
  const entra = avance(frame, 0, 14);
  const sigue = frame >= toque;
  const pulsa = spring({ frame: frame - toque, fps, config: { damping: 14, mass: 0.6 } });
  const tilde = caidaPunto(frame, toque + 2);
  const salida = interpolate(frame, [durationInFrames - 6, durationInFrames], [1, 0], CL);
  // acercamiento lento todo el tiempo: la placa nunca queda quieta
  const zoom = 1 + 0.06 * (frame / durationInFrames);
  return (
    <div style={{ position: "absolute", inset: 0, background: fondo, opacity: salida, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 560, gap: 46, scale: String(zoom) }}>
      <div style={{ opacity: entra, translate: `0 ${(1 - entra) * 30}px` }}>
        <PiezaMarca fondo={fondo} ancho={640} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: FUENTE_DATOS, fontSize: 40, letterSpacing: "0.04em", color: tinta, opacity: avance(frame, 6, 12) }}>
        {usuario}
        {verificado ? (
          <svg width={36} height={36} viewBox="0 0 24 24">
            <circle cx={12} cy={12} r={11} fill={kit.colores.acento} />
            <path d="M7 12.5 10.5 16 17 9" fill="none" stroke="#FFFFFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </div>
      <div
        style={{
          marginTop: 10,
          display: "flex",
          alignItems: "center",
          gap: 18,
          padding: "22px 54px",
          borderRadius: 999,
          fontFamily: FUENTE_TITULOS,
          fontWeight: 600,
          fontSize: 46,
          background: sigue ? "transparent" : tinta,
          color: sigue ? tinta : fondo,
          border: `3px solid ${tinta}`,
          opacity: avance(frame, 12, 10),
          scale: String(sigue ? 1 + 0.06 * Math.sin(Math.min(1, pulsa) * Math.PI) : 1),
        }}
      >
        {sigue ? <span style={{ width: 22, height: 22, borderRadius: "50%", background: kit.colores.acento, scale: String(tilde.escala), translate: `0 ${tilde.y * 30}px` }} /> : null}
        {sigue ? "Siguiendo" : "Seguir"}
      </div>
    </div>
  );
};
