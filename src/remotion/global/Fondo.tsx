import { AbsoluteFill, interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";
import { useMarca } from "../contexto";
import { PatronPuntos } from "../marca/piezas";

const PARTICULAS = Array.from({ length: 26 }, (_, i) => ({
  x: random(`x${i}`) * 100,
  y: random(`y${i}`) * 100,
  r: 2 + random(`r${i}`) * 5,
  vel: 0.15 + random(`v${i}`) * 0.5,
  fase: random(`f${i}`) * Math.PI * 2,
}));

/** Fondo con degradé que gira despacio, dos manchas de luz y partículas flotando. */
export const Fondo: React.FC = () => {
  const { kit } = useMarca();
  return kit ? <FondoMarca /> : <FondoGenerico />;
};

/** Con kit: papel liso y el patrón de puntos solo en las franjas sin texto (arriba de todo y debajo de los subtítulos). */
const FondoMarca: React.FC = () => {
  const { kit } = useMarca();
  if (!kit) return null;
  return (
    <AbsoluteFill style={{ background: kit.colores.fondo2 }}>
      {/* las dos franjas sin texto: arriba de todo y entre los subtítulos y la zona de botones (sin tocar la «C.») */}
      <PatronPuntos
        zonas={[
          { x: 40, y: 64, ancho: 1000, alto: 196 },
          { x: 200, y: 1356, ancho: 760, alto: 176 },
        ]}
        paso={52}
        opacidad={0.36}
        amplitud={6.5}
        deriva={52}
      />
    </AbsoluteFill>
  );
};

const FondoGenerico: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const { colores } = useMarca();
  const t = frame / 30;

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(${interpolate(frame, [0, durationInFrames], [160, 220])}deg, ${colores.fondo} 0%, ${colores.fondo2} 55%, ${colores.fondo} 100%)`,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 1100,
          height: 1100,
          borderRadius: "50%",
          left: -300 + Math.sin(t * 0.35) * 120,
          top: 200 + Math.cos(t * 0.27) * 160,
          background: `radial-gradient(circle, ${colores.acento}2E 0%, transparent 65%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 1000,
          height: 1000,
          borderRadius: "50%",
          right: -350 + Math.cos(t * 0.3) * 140,
          bottom: -100 + Math.sin(t * 0.22) * 180,
          background: `radial-gradient(circle, ${colores.acento2}29 0%, transparent 65%)`,
        }}
      />
      {PARTICULAS.map((p, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${p.x}%`,
            top: `${(((p.y - t * p.vel * 4) % 100) + 100) % 100}%`,
            width: p.r * 2,
            height: p.r * 2,
            borderRadius: "50%",
            backgroundColor: colores.texto,
            opacity: 0.08 + 0.12 * (0.5 + 0.5 * Math.sin(t * 1.3 + p.fase)),
          }}
        />
      ))}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.45) 100%)" }} />
    </AbsoluteFill>
  );
};
