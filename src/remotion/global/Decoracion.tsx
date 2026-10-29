import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { ANCHO } from "../../shared/render";
import { useEscena, useMarca } from "../contexto";

/**
 * Capa de fondo propia de cada escena (por encima del fondo global): formas que se mueven solas,
 * distintas según la posición de la escena para que el video no se vea repetido.
 */
export const Decoracion: React.FC = () => {
  const frame = useCurrentFrame();
  const { indice, duracionFrames } = useEscena();
  const { colores } = useMarca();
  const entrada = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const t = frame / 30;
  const variante = indice % 4;

  if (variante === 0) {
    // aros concéntricos punteados que giran en sentidos opuestos y "respiran"
    return (
      <AbsoluteFill style={{ opacity: 0.16 * entrada, overflow: "hidden" }}>
        {[420, 620, 820].map((r, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: ANCHO / 2 - r,
              top: 700 - r,
              width: r * 2,
              height: r * 2,
              borderRadius: "50%",
              border: `${6 - i * 1.5}px dashed ${i === 1 ? colores.acento : colores.texto}`,
              rotate: `${(i % 2 ? -1 : 1) * t * (14 - i * 3)}deg`,
              scale: 1 + 0.04 * Math.sin(t * 1.4 + i),
            }}
          />
        ))}
      </AbsoluteFill>
    );
  }
  if (variante === 1) {
    // rayos de luz que giran detrás del contenido
    return (
      <AbsoluteFill style={{ opacity: 0.13 * entrada, overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            left: ANCHO / 2 - 1300,
            top: 700 - 1300,
            width: 2600,
            height: 2600,
            rotate: `${t * 9}deg`,
            background: `repeating-conic-gradient(${colores.acento} 0deg 7deg, transparent 7deg 22deg)`,
            maskImage: "radial-gradient(circle, black 0%, transparent 55%)",
          }}
        />
      </AbsoluteFill>
    );
  }
  if (variante === 2) {
    // grilla de puntos que se desplaza en diagonal
    return (
      <AbsoluteFill
        style={{
          opacity: 0.22 * entrada,
          backgroundImage: `radial-gradient(${colores.texto} 2.5px, transparent 3px)`,
          backgroundSize: "60px 60px",
          backgroundPosition: `${t * 22}px ${t * 34}px`,
          maskImage: "radial-gradient(ellipse at 50% 40%, black 0%, transparent 70%)",
        }}
      />
    );
  }
  // ondas que se desplazan horizontalmente
  const desplazamiento = interpolate(frame, [0, duracionFrames], [0, -360]);
  return (
    <AbsoluteFill style={{ opacity: 0.2 * entrada, overflow: "hidden" }}>
      <svg width={ANCHO + 720} height={1920} style={{ position: "absolute", left: desplazamiento, top: 0 }}>
        {[0, 1, 2, 3, 4].map((i) => {
          const y0 = 380 + i * 170;
          const amp = 40 + 12 * Math.sin(t + i);
          const d = Array.from({ length: 40 }, (_, k) => {
            const x = k * 46;
            return `${k === 0 ? "M" : "L"}${x},${y0 + Math.sin(k * 0.5 + i) * amp}`;
          }).join(" ");
          return <path key={i} d={d} fill="none" stroke={i % 2 ? colores.acento : colores.texto} strokeWidth={4} strokeLinecap="round" />;
        })}
      </svg>
    </AbsoluteFill>
  );
};
