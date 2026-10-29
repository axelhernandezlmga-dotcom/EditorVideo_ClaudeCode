import { AbsoluteFill, Easing, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { FRAMES_PLACA } from "../../shared/crudo";
import { ANCHO } from "../../shared/render";
import { useMarca } from "../contexto";
import { CierreMarca } from "../marca/TarjetaMarca";
import { familia, pesoFuerte, pesoMedio } from "../fuentes";
import { Icono } from "../iconos/Icono";
import { CLAMP, Destello } from "../plantillas/comun";

/** Duración de la placa final (2,5 s a 30 fps) y de la tarjeta flotante cuando la persona dice "seguime". */
export const FRAMES_PLACA_SEGUIR = FRAMES_PLACA;
export const FRAMES_TARJETA_SEGUIR = 66;
/** Frame (relativo a la placa) en que el dedo toca "Seguir": ahí va el "pop". */
export const toqueSeguir = (duracion: number) => Math.round(duracion * 0.48);

/** Insignia de verificado genérica (círculo con tilde). Solo se dibuja si el perfil está marcado como verificado. */
const Verificado: React.FC<{ tam: number; color: string; tilde: string; p: number }> = ({ tam, color, tilde, p }) => (
  <div style={{ width: tam, height: tam, borderRadius: "50%", backgroundColor: color, display: "flex", alignItems: "center", justifyContent: "center", scale: String(p), flexShrink: 0, boxShadow: "0 4px 12px rgba(0,0,0,0.35)" }}>
    <Icono nombre="check" tam={tam * 0.62} color={tilde} grosor={3.4} dibujo={p} />
  </div>
);

const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

/** Foto o logo del perfil en un círculo; sin foto, las iniciales. */
const Avatar: React.FC<{ tam: number; anillo: number }> = ({ tam, anillo }) => {
  const { foto, nombre, usuario, colores, tipografia } = useMarca();
  return (
    <div style={{ width: tam, height: tam, borderRadius: "50%", padding: anillo, background: `conic-gradient(${colores.acento}, ${colores.acento2}, ${colores.acento})`, flexShrink: 0 }}>
      <div style={{ width: "100%", height: "100%", borderRadius: "50%", overflow: "hidden", border: `${Math.max(3, anillo * 0.6)}px solid ${colores.fondo}`, backgroundColor: colores.fondo2, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {foto ? (
          <Img src={foto} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ fontFamily: familia(tipografia), fontWeight: pesoFuerte(tipografia), fontSize: tam * 0.36, color: colores.texto }}>{iniciales(nombre ?? usuario.replace("@", ""))}</span>
        )}
      </div>
    </div>
  );
};

/**
 * Botón "Seguir": entra con resorte, un dedo llega y lo toca en `toque`, pasa a "Siguiendo ✓" con un destello
 * de partículas. Diseño propio (no imita la interfaz de ninguna red).
 */
const BotonSeguir: React.FC<{ escala: number; entra: number; toque: number }> = ({ escala, entra, toque }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { colores, tipografia } = useMarca();
  const boton = spring({ frame: frame - entra, fps, config: { damping: 12 } });
  const siguiendo = frame >= toque;
  const cambio = spring({ frame: frame - toque, fps, config: { damping: 10 } });
  const presion = interpolate(frame, [toque - 3, toque, toque + 5], [1, 0.9, 1], CLAMP);
  const dedo = interpolate(frame, [entra + 4, toque - 2], [0, 1], { ...CLAMP, easing: Easing.out(Easing.cubic) });
  const dedoSale = interpolate(frame, [toque + 4, toque + 11], [0, 1], CLAMP);
  return (
    <div style={{ position: "relative", display: "flex", justifyContent: "center", opacity: boton, translate: `0 ${(1 - boton) * 60 * escala}px` }}>
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 16 * escala,
          padding: `${20 * escala}px ${58 * escala}px`,
          borderRadius: 999,
          backgroundColor: siguiendo ? colores.fondo2 : colores.acento,
          color: siguiendo ? colores.texto : colores.fondo,
          border: `${4 * escala}px solid ${siguiendo ? colores.texto : colores.acento}`,
          fontFamily: familia(tipografia),
          fontWeight: pesoFuerte(tipografia),
          fontSize: 54 * escala,
          whiteSpace: "nowrap",
          scale: String(presion * (siguiendo ? 1 + 0.08 * (1 - cambio) : 1 + 0.025 * Math.sin(frame / 4))),
          boxShadow: `0 0 ${36 * escala}px ${colores.acento}88`,
        }}
      >
        <Icono nombre={siguiendo ? "check" : "user-plus"} tam={54 * escala} color={siguiendo ? colores.texto : colores.fondo} grosor={3} dibujo={siguiendo ? cambio * 1.5 : 1} />
        {siguiendo ? "Siguiendo" : "Seguir"}
        <Destello en={toque} radio={210 * escala} color={colores.acento} cantidad={18} />
        <Destello en={toque + 3} radio={150 * escala} color={colores.acento2} cantidad={10} />
      </div>
      {dedo > 0 && dedoSale < 1 ? (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            translate: `${interpolate(dedo, [0, 1], [380, 70]) * escala + dedoSale * 340 * escala}px ${interpolate(dedo, [0, 1], [320, 10]) * escala - dedoSale * 30 * escala}px`,
            scale: frame >= toque - 2 && frame < toque + 5 ? "0.86" : "1",
            opacity: 1 - dedoSale,
            filter: "drop-shadow(0 8px 14px rgba(0,0,0,0.5))",
          }}
        >
          <Icono nombre="pointer" tam={120 * escala} color={colores.texto} relleno={colores.fondo} grosor={1.8} />
        </div>
      ) : null}
    </div>
  );
};

/** Placa final de 2,5 s: avatar, @ grande (+ insignia si es verificado), "Seguir" animado y "Seguime para más". */
export const PlacaSeguir: React.FC<{ texto?: string | null }> = ({ texto = "Seguime para más" }) => {
  const { kit } = useMarca();
  const { durationInFrames } = useVideoConfig();
  if (kit) return <CierreMarca toque={toqueSeguir(durationInFrames)} />;
  return <PlacaSeguirGenerica texto={texto} />;
};

const PlacaSeguirGenerica: React.FC<{ texto?: string | null }> = ({ texto = "Seguime para más" }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { usuario, nombre, verificado, colores, tipografia } = useMarca();
  const entrada = spring({ frame, fps, config: { damping: 14 } });
  const salida = interpolate(frame, [durationInFrames - 6, durationInFrames], [1, 0], CLAMP);
  const toque = toqueSeguir(durationInFrames);
  const tamUsuario = Math.min(96, Math.round((ANCHO - 260) / Math.max(6, usuario.length) / 0.58));
  return (
    <AbsoluteFill style={{ opacity: salida }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 38%, ${colores.fondo2} 0%, ${colores.fondo} 62%)`, opacity: entrada }} />
      {/* aros que se expanden detrás del avatar */}
      {[0, 1, 2].map((i) => {
        const p = ((frame + i * 14) % 42) / 42;
        return <div key={i} style={{ position: "absolute", left: ANCHO / 2, top: 700, width: 0, height: 0 }}><div style={{ position: "absolute", width: 320 + p * 420, height: 320 + p * 420, left: -(160 + p * 210), top: -(160 + p * 210), borderRadius: "50%", border: `6px solid ${colores.acento}`, opacity: (1 - p) * 0.6 * entrada }} /></div>;
      })}
      {/* después del toque la placa se sigue acercando despacio (y flota): nunca queda quieta */}
      <AbsoluteFill
        style={{
          alignItems: "center",
          paddingTop: 540,
          gap: 34,
          scale: String((0.85 + 0.15 * entrada) * (1 + 0.12 * interpolate(frame, [toque, durationInFrames], [0, 1], CLAMP))),
          translate: `0 ${Math.sin(frame / 7) * 10}px`,
        }}
      >
        <Avatar tam={320} anillo={10} />
        <div style={{ display: "flex", alignItems: "center", gap: 18, maxWidth: ANCHO - 160 }}>
          <span style={{ fontFamily: familia(tipografia), fontWeight: pesoFuerte(tipografia), fontSize: tamUsuario, color: colores.texto, textShadow: "0 4px 16px rgba(0,0,0,0.5)", whiteSpace: "nowrap" }}>{usuario}</span>
          {verificado ? <Verificado tam={tamUsuario * 0.72} color={colores.acento} tilde={colores.fondo} p={spring({ frame: frame - 8, fps, config: { damping: 9 } })} /> : null}
        </div>
        {nombre ? <div style={{ marginTop: -18, fontFamily: familia(tipografia), fontWeight: pesoMedio(tipografia), fontSize: 40, color: colores.texto, opacity: 0.75 }}>{nombre}</div> : null}
        <div style={{ marginTop: 20 }}>
          <BotonSeguir escala={1} entra={10} toque={toque} />
        </div>
        {texto ? (
          <div
            style={{
              marginTop: 14,
              fontFamily: familia(tipografia),
              fontWeight: pesoFuerte(tipografia),
              fontSize: 52,
              color: colores.acento,
              opacity: interpolate(frame, [toque + 4, toque + 12], [0, 1], CLAMP),
              translate: `0 ${interpolate(frame, [toque + 4, toque + 14], [24, 0], CLAMP)}px`,
              textShadow: "0 4px 14px rgba(0,0,0,0.5)",
            }}
          >
            {texto}
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/**
 * Tarjeta flotante para cuando la persona dice "seguime": avatar chico, @ y el mismo botón, en una franja
 * que no tapa la cara (`y` = borde de arriba en px).
 */
export const TarjetaSeguir: React.FC<{ y: number }> = ({ y }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { usuario, verificado, colores, tipografia } = useMarca();
  const entrada = spring({ frame, fps, config: { damping: 13 } });
  const salida = interpolate(frame, [durationInFrames - 8, durationInFrames], [1, 0], CLAMP);
  const toque = toqueSeguir(durationInFrames);
  return (
    <div
      style={{
        position: "absolute",
        left: 90,
        width: ANCHO - 180,
        top: y,
        opacity: salida,
        translate: `0 ${(1 - entrada) * 120 - (1 - salida) * 40}px`,
        scale: String(0.9 + 0.1 * entrada),
        display: "flex",
        alignItems: "center",
        gap: 24,
        padding: "22px 28px",
        borderRadius: 36,
        backgroundColor: `${colores.fondo}EE`,
        border: `3px solid ${colores.acento}66`,
        boxShadow: "0 18px 50px rgba(0,0,0,0.5)",
      }}
    >
      <Avatar tam={124} anillo={6} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: familia(tipografia), fontWeight: pesoFuerte(tipografia), fontSize: 44, color: colores.texto, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{usuario}</span>
          {verificado ? <Verificado tam={36} color={colores.acento} tilde={colores.fondo} p={spring({ frame: frame - 6, fps, config: { damping: 9 } })} /> : null}
        </div>
        <div style={{ alignSelf: "flex-start" }}>
          <BotonSeguir escala={0.62} entra={6} toque={toque} />
        </div>
      </div>
    </div>
  );
};
