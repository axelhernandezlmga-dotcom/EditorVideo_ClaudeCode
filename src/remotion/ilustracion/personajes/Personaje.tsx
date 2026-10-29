import type { Caption } from "@remotion/captions";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { useEscena } from "../../contexto";
import { azar, luminancia, oscurecer } from "../color";
import { useIlu } from "../estilo";
import { APERTURA, visemaEn, type Visema } from "../visemas";
import { poseEnFrame, type Accion, type Expresion, type Mano, type Pose, type TramoAccion } from "./acciones";
import type { Apariencia } from "./apariencia";

/**
 * Personaje con esqueleto. Se dibuja en coordenadas propias: los pies en (0, 0), la cabeza hacia arriba
 * (un adulto mide ~380 unidades). Quien lo usa lo ubica y escala con un <g transform>.
 */

const CADERA_Y = -168;
const HOMBRO_Y = -284;
const MUSLO = 84;
const PANTORRILLA = 78;
const BRAZO = 64;
const ANTEBRAZO = 58;
const R_CABEZA = 46;

export type PersonajeProps = {
  apariencia: Apariencia;
  /** Una sola acción para toda la escena… */
  accion?: Accion;
  /** …o varias, cada una desde un frame (se mezclan al cambiar). */
  acciones?: TramoAccion[];
  /** 1 = mira a la derecha, -1 = a la izquierda. */
  mira?: 1 | -1;
  /** Mueve la boca con la voz de la escena (todo el tiempo o entre dos momentos). */
  habla?: boolean | { desdeMs: number; hastaMs: number };
  /** Cambia el ritmo de los gestos y parpadeos entre personajes. */
  semilla?: number;
  /** Frame a usar en vez del de la secuencia (hojas de prueba). */
  frame?: number;
  /** Tiempos de la voz; si faltan, los de la escena. */
  captions?: Caption[];
  /** Fuerza una expresión por encima de la de la acción. */
  expresion?: Expresion;
};

/** 0 = ojos abiertos, 1 = cerrados. Un parpadeo cada 2,6–4,4 s, distinto para cada semilla. */
const parpadeo = (frame: number, fps: number, s: number) => {
  const periodo = Math.round(fps * (2.6 + azar(s) * 1.8));
  const fase = Math.round(azar(s + 3) * periodo);
  const k = (frame + fase) % periodo;
  return k < 2 ? k / 2 : k < 4 ? 1 - (k - 2) / 2 : 0;
};

const Capsula: React.FC<{ largo: number; ancho: number; fill: string }> = ({ largo, ancho, fill }) => {
  const { linea } = useIlu();
  return <rect x={-ancho / 2} y={-ancho / 2} width={ancho} height={largo + ancho} rx={ancho / 2} fill={fill} {...linea()} />;
};

// ---------- manos ----------

const ManoDibujo: React.FC<{ mano: Mano; piel: string }> = ({ mano, piel }) => {
  const { c, linea } = useIlu();
  const pielC = c(piel);
  const puno = <circle cx={0} cy={0} r={10.5} fill={pielC} {...linea()} />;
  switch (mano) {
    case "abierta":
      return (
        <g>
          <ellipse cx={0} cy={2} rx={10} ry={12.5} fill={pielC} {...linea()} />
          <ellipse cx={8.5} cy={-3} rx={3.6} ry={6.5} transform="rotate(-35 8.5 -3)" fill={pielC} {...linea(0.8)} />
        </g>
      );
    case "puno":
      return (
        <g>
          {puno}
          <path d="M -6 3 Q 0 6 6 3" fill="none" {...linea(0.6)} />
        </g>
      );
    case "dedo":
      return (
        <g>
          <rect x={-3.6} y={0} width={7.2} height={24} rx={3.6} fill={pielC} {...linea(0.8)} />
          {puno}
        </g>
      );
    case "billetes":
      return (
        <g>
          {[0, 1, 2].map((i) => (
            <rect key={i} x={-22 + i * 2} y={-2 - i * 3} width={44} height={22} rx={2} fill={c(i === 2 ? "#8FCB8C" : "billete")} {...linea(0.7)} transform={`rotate(${-8 + i * 6})`} />
          ))}
          <circle cx={0} cy={7} r={5} fill="none" stroke={oscurecer(c("billete"), 0.4)} strokeWidth={1.5} />
          {puno}
        </g>
      );
    case "voto":
      return (
        <g>
          <rect x={-20} y={4} width={40} height={28} rx={2} fill={c("blanco")} {...linea(0.8)} />
          <path d="M -20 6 L 0 20 L 20 6" fill="none" {...linea(0.6)} />
          {puno}
        </g>
      );
    case "microfono":
      return (
        <g>
          <rect x={-4} y={-4} width={8} height={30} rx={3} fill={c("negro")} {...linea(0.7)} transform="rotate(180)" />
          <circle cx={0} cy={-32} r={9} fill={c("grisOscuro")} {...linea(0.8)} />
          {puno}
        </g>
      );
    case "celular":
      return (
        <g>
          <rect x={-11} y={-6} width={22} height={38} rx={4} fill={c("negro")} {...linea(0.8)} />
          <rect x={-8} y={-2} width={16} height={28} rx={2} fill={c("celeste")} />
          {puno}
        </g>
      );
    case "baston":
      return (
        <g>
          <path d="M 0 0 L 0 150 M 0 0 Q 0 -14 -14 -12" fill="none" stroke={c("madera")} strokeWidth={7} strokeLinecap="round" />
          {puno}
        </g>
      );
    case "papel":
      return (
        <g>
          <rect x={-16} y={2} width={34} height={42} rx={2} fill={c("blanco")} {...linea(0.8)} />
          {[12, 20, 28].map((y) => (
            <line key={y} x1={-10} y1={y} x2={12} y2={y} stroke={c("gris")} strokeWidth={2} />
          ))}
          {puno}
        </g>
      );
  }
};

// ---------- cara ----------

const Ojo: React.FC<{ x: number; y: number; R: number; cierre: number; expresion: Expresion; mirada: [number, number]; pestanas?: boolean; pielOscura?: boolean }> = ({ x, y, R, cierre, expresion, mirada, pestanas, pielOscura }) => {
  const { p, c, linea } = useIlu();
  const t = p.tinta;
  const abierto = 1 - cierre;
  const feliz = expresion === "feliz" && cierre < 0.5;
  const grandes = expresion === "sorpresa";
  if (feliz) return <path d={`M ${x - 0.13 * R} ${y + 0.03 * R} Q ${x} ${y - 0.14 * R} ${x + 0.13 * R} ${y + 0.03 * R}`} fill="none" {...linea(1.1)} />;
  if (abierto < 0.2) return <line x1={x - 0.11 * R} y1={y} x2={x + 0.11 * R} y2={y} {...linea(1)} />;
  const mx = mirada[0] * 0.05 * R;
  const my = mirada[1] * 0.05 * R;
  if (p.ojos === "grandes") {
    const rx = (grandes ? 0.21 : 0.17) * R;
    const ry = (grandes ? 0.26 : 0.21) * R * abierto;
    return (
      <g>
        <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={c("#FFFFFF")} {...linea(0.75)} />
        <ellipse cx={x + mx * 1.6} cy={y + my * 1.3} rx={0.085 * R} ry={0.1 * R * Math.min(1, abierto * 1.3)} fill={t} />
        <circle cx={x + mx * 1.6 + 0.03 * R} cy={y + my * 1.3 - 0.04 * R} r={0.025 * R} fill="#FFFFFF" />
        {expresion === "enojo" ? <path d={`M ${x - rx - 2} ${y - ry * 0.9} L ${x + rx + 2} ${y - ry * 0.2} L ${x + rx + 2} ${y - ry - 4} L ${x - rx - 2} ${y - ry - 4} Z`} fill={c("piel2")} /> : null}
      </g>
    );
  }
  const rx = (p.ojos === "parpado" ? 0.065 : 0.085) * R * (grandes ? 1.35 : 1);
  const ry = (p.ojos === "parpado" ? 0.085 : 0.11) * R * (grandes ? 1.35 : 1) * abierto;
  return (
    <g>
      {/* en pieles oscuras el punto solo no se lee: lleva el blanco del ojo */}
      {grandes || pielOscura ? <ellipse cx={x} cy={y} rx={rx * (grandes ? 2 : 1.75)} ry={ry * (grandes ? 1.8 : 1.45)} fill="#FFFFFF" {...(grandes ? linea(0.6) : {})} /> : null}
      <ellipse cx={x + mx} cy={y + my} rx={rx} ry={ry} fill={t} />
      {p.ojos === "parpado" ? <path d={`M ${x - 0.13 * R} ${y - 0.06 * R} Q ${x} ${y - 0.16 * R} ${x + 0.13 * R} ${y - 0.06 * R}`} fill="none" {...linea(0.6)} /> : null}
      {pestanas ? <path d={`M ${x + 0.09 * R} ${y - 0.08 * R} l ${0.07 * R} ${-0.05 * R}`} {...linea(0.7)} /> : null}
    </g>
  );
};

/** Ángulo y altura de las cejas por expresión: [inclinación (grados, + = el lado de adentro más bajo), subida]. */
const CEJAS: Record<Expresion, [number, number]> = {
  neutral: [0, 0],
  feliz: [-4, -0.03],
  sorpresa: [-6, -0.12],
  enojo: [22, 0.04],
  pensativo: [8, 0],
  triste: [-18, -0.02],
  preocupado: [-20, -0.05],
  mueca: [-10, -0.06],
};

const Boca: React.FC<{ x: number; y: number; R: number; visema: Visema | null; expresion: Expresion; pestanas?: boolean }> = ({ x, y, R, visema, expresion, pestanas }) => {
  const { c, linea } = useIlu();
  const interior = c("#6B2A2E");
  const labio = pestanas ? c("#B5525A") : null;
  const abierta = (rx: number, ry: number, dientes = true) => (
    <g>
      <ellipse cx={x} cy={y} rx={rx * R} ry={ry * R} fill={interior} {...linea(0.8)} />
      {dientes && ry > 0.08 ? <rect x={x - rx * R * 0.65} y={y - ry * R + 1} width={rx * R * 1.3} height={ry * R * 0.35} rx={2} fill="#FFFFFF" /> : null}
      {ry > 0.12 ? <ellipse cx={x} cy={y + ry * R * 0.55} rx={rx * R * 0.55} ry={ry * R * 0.3} fill={c("#D9737B")} /> : null}
    </g>
  );
  const curva = (curvatura: number, ancho = 0.22, grosor = 1) => (
    <path d={`M ${x - ancho * R} ${y} Q ${x} ${y + curvatura * R} ${x + ancho * R} ${y}`} fill="none" {...linea(grosor)} stroke={labio ?? undefined} />
  );
  if (visema && visema !== "X") {
    switch (visema) {
      case "A":
        return abierta(0.19, 0.17);
      case "E":
        return abierta(0.21, 0.1);
      case "I":
        return abierta(0.2, 0.06);
      case "O":
        return abierta(0.12, 0.13, false);
      case "U":
        return abierta(0.08, 0.08, false);
      case "M":
        return curva(0, 0.16, 1.4);
      case "F":
        return (
          <g>
            <path d={`M ${x - 0.16 * R} ${y} L ${x + 0.16 * R} ${y}`} {...linea(1.1)} />
            <rect x={x - 0.1 * R} y={y - 0.06 * R} width={0.2 * R} height={0.06 * R} fill="#FFFFFF" {...linea(0.4)} />
          </g>
        );
    }
  }
  switch (expresion) {
    case "feliz":
      return (
        <g>
          <path d={`M ${x - 0.22 * R} ${y - 0.04 * R} Q ${x} ${y + 0.26 * R} ${x + 0.22 * R} ${y - 0.04 * R} Z`} fill={interior} {...linea(0.9)} />
          <path d={`M ${x - 0.15 * R} ${y + 0.0 * R} L ${x + 0.15 * R} ${y + 0.0 * R}`} stroke="#FFFFFF" strokeWidth={0.06 * R} />
        </g>
      );
    case "sorpresa":
      return abierta(0.1, 0.13, false);
    case "enojo":
      return (
        <g>
          <rect x={x - 0.17 * R} y={y - 0.05 * R} width={0.34 * R} height={0.11 * R} rx={0.04 * R} fill="#FFFFFF" {...linea(0.9)} />
          <line x1={x - 0.17 * R} y1={y + 0.005 * R} x2={x + 0.17 * R} y2={y + 0.005 * R} {...linea(0.5)} />
        </g>
      );
    case "triste":
    case "preocupado":
      return curva(-0.12, 0.16);
    case "mueca":
      return <path d={`M ${x - 0.17 * R} ${y + 0.03 * R} Q ${x - 0.05 * R} ${y - 0.04 * R} ${x + 0.05 * R} ${y + 0.02 * R} T ${x + 0.18 * R} ${y - 0.03 * R}`} fill="none" {...linea(1)} />;
    case "pensativo":
      return curva(0.02, 0.12);
    case "neutral":
      return curva(0.07, 0.15);
  }
};

const PeloAtras: React.FC<{ ap: Apariencia; R: number }> = ({ ap, R }) => {
  const { c, linea } = useIlu();
  const col = c(ap.pelo.color);
  switch (ap.pelo.tipo) {
    case "largo":
      return <path d={`M ${-1.0 * R} ${-0.25 * R} Q ${-1.12 * R} ${-1.18 * R} 0 ${-1.14 * R} Q ${1.12 * R} ${-1.18 * R} ${1.0 * R} ${-0.25 * R} L ${0.98 * R} ${1.3 * R} Q 0 ${1.42 * R} ${-0.98 * R} ${1.3 * R} Z`} fill={col} {...linea()} />;
    case "rodete":
      return <circle cx={-0.5 * R} cy={-0.95 * R} r={0.4 * R} fill={col} {...linea()} />;
    case "cola":
      return <path d={`M ${-0.75 * R} ${-0.65 * R} Q ${-1.45 * R} ${-0.3 * R} ${-1.25 * R} ${0.95 * R} Q ${-1.0 * R} ${0.4 * R} ${-0.62 * R} ${-0.2 * R} Z`} fill={col} {...linea()} />;
    case "rulos":
      return (
        <g>
          {Array.from({ length: 11 }, (_, i) => {
            const a = Math.PI * (0.92 + (i / 10) * 1.16);
            return <circle key={i} cx={Math.cos(a) * 0.98 * R} cy={Math.sin(a) * 0.98 * R - 0.12 * R} r={0.3 * R} fill={col} {...linea()} />;
          })}
        </g>
      );
    default:
      return null;
  }
};

const PeloFrente: React.FC<{ ap: Apariencia; R: number }> = ({ ap, R }) => {
  const { c, linea } = useIlu();
  const col = c(ap.pelo.color);
  const casquete = (linea_frente: number) =>
    `M ${-0.95 * R} ${-0.02 * R} Q ${-1.02 * R} ${-1.1 * R} ${0.05 * R} ${-1.08 * R} Q ${1.02 * R} ${-1.06 * R} ${0.95 * R} ${-0.18 * R} Q ${0.62 * R} ${linea_frente * R} ${0.05 * R} ${linea_frente * R} Q ${-0.6 * R} ${linea_frente * R} ${-0.8 * R} ${-0.25 * R} Z`;
  switch (ap.pelo.tipo) {
    case "pelado":
      return (
        <g>
          <path d={`M ${-0.96 * R} ${0.12 * R} Q ${-1.02 * R} ${-0.42 * R} ${-0.66 * R} ${-0.62 * R} Q ${-0.78 * R} ${-0.22 * R} ${-0.72 * R} ${0.18 * R} Z`} fill={col} {...linea()} />
          <path d={`M ${0.96 * R} ${0.08 * R} Q ${1.0 * R} ${-0.4 * R} ${0.72 * R} ${-0.58 * R} Q ${0.84 * R} ${-0.2 * R} ${0.8 * R} ${0.12 * R} Z`} fill={col} {...linea()} />
          <ellipse cx={0.2 * R} cy={-0.72 * R} rx={0.2 * R} ry={0.08 * R} fill="#FFFFFF" fillOpacity={0.35} transform={`rotate(-12 ${0.2 * R} ${-0.72 * R})`} />
        </g>
      );
    case "corto":
      return <path d={casquete(-0.58)} fill={col} {...linea()} />;
    case "peinado":
      return (
        <g>
          <path d={casquete(-0.6)} fill={col} {...linea()} />
          <path d={`M ${-0.3 * R} ${-1.05 * R} Q ${0.25 * R} ${-0.98 * R} ${0.75 * R} ${-0.62 * R}`} fill="none" {...linea(0.7)} />
        </g>
      );
    case "flequillo":
      return <path d={`M ${-0.98 * R} ${0.1 * R} Q ${-1.04 * R} ${-1.12 * R} ${0.05 * R} ${-1.1 * R} Q ${1.04 * R} ${-1.1 * R} ${0.98 * R} ${0.05 * R} L ${0.86 * R} ${-0.36 * R} Q ${0.1 * R} ${-0.26 * R} ${-0.84 * R} ${-0.4 * R} Z`} fill={col} {...linea()} />;
    case "largo":
    case "cola":
    case "rodete":
      return <path d={`M ${-0.98 * R} ${0.2 * R} Q ${-1.04 * R} ${-1.12 * R} ${0.05 * R} ${-1.1 * R} Q ${1.04 * R} ${-1.1 * R} ${0.96 * R} ${-0.05 * R} Q ${0.6 * R} ${-0.72 * R} ${-0.05 * R} ${-0.64 * R} Q ${-0.62 * R} ${-0.5 * R} ${-0.98 * R} ${0.2 * R} Z`} fill={col} {...linea()} />;
    case "rulos":
      return (
        <g>
          {Array.from({ length: 6 }, (_, i) => (
            <circle key={i} cx={(-0.65 + i * 0.26) * R} cy={(-0.78 - Math.sin((i / 5) * Math.PI) * 0.2) * R} r={0.24 * R} fill={col} {...linea()} />
          ))}
        </g>
      );
  }
};

const Sombrero: React.FC<{ ap: Apariencia; R: number }> = ({ ap, R }) => {
  const { c, linea } = useIlu();
  if (!ap.sombrero) return null;
  const col = c(ap.colorSombrero ?? (ap.sombrero === "casco" ? "#F2C230" : ap.sombrero === "gorro_policia" ? "marino" : "acento2"));
  if (ap.sombrero === "gorra")
    return (
      <g>
        <path d={`M ${-0.96 * R} ${-0.42 * R} Q ${-0.95 * R} ${-1.18 * R} ${0.02 * R} ${-1.16 * R} Q ${0.95 * R} ${-1.15 * R} ${0.96 * R} ${-0.42 * R} Z`} fill={col} {...linea()} />
        <path d={`M ${0.5 * R} ${-0.46 * R} Q ${1.2 * R} ${-0.5 * R} ${1.45 * R} ${-0.36 * R} Q ${1.0 * R} ${-0.28 * R} ${0.5 * R} ${-0.36 * R} Z`} fill={oscurecer(col, 0.15)} {...linea()} />
      </g>
    );
  if (ap.sombrero === "casco")
    return (
      <g>
        <path d={`M ${-0.98 * R} ${-0.38 * R} Q ${-0.98 * R} ${-1.25 * R} 0 ${-1.25 * R} Q ${0.98 * R} ${-1.25 * R} ${0.98 * R} ${-0.38 * R} Z`} fill={col} {...linea()} />
        <rect x={-1.15 * R} y={-0.46 * R} width={2.3 * R} height={0.14 * R} rx={0.06 * R} fill={col} {...linea()} />
        <path d={`M 0 ${-1.24 * R} L 0 ${-0.5 * R}`} {...linea(0.8)} />
      </g>
    );
  return (
    <g>
      <path d={`M ${-0.95 * R} ${-0.5 * R} L ${-1.1 * R} ${-1.12 * R} Q 0 ${-1.36 * R} ${1.1 * R} ${-1.12 * R} L ${0.95 * R} ${-0.5 * R} Z`} fill={col} {...linea()} />
      <path d={`M ${-0.1 * R} ${-0.5 * R} Q ${0.7 * R} ${-0.55 * R} ${1.3 * R} ${-0.32 * R} L ${0.95 * R} ${-0.5 * R} Z`} fill={c("negro")} {...linea()} />
      <circle cx={0.15 * R} cy={-0.82 * R} r={0.12 * R} fill={c("oro")} {...linea(0.6)} />
    </g>
  );
};

const Cabeza: React.FC<{ ap: Apariencia; R: number; pose: Pose; visema: Visema | null; cierre: number }> = ({ ap, R, pose, visema, cierre }) => {
  const { c, linea, sombra } = useIlu();
  const piel = c(ap.piel);
  const dx = 0.14 * R;
  const [inc, sube] = CEJAS[pose.expresion];
  const forma =
    ap.cara === "cuadrada" ? (
      <rect x={-0.9 * R} y={-1.0 * R} width={1.8 * R} height={2.0 * R} rx={0.55 * R} fill={piel} {...linea()} />
    ) : (
      <ellipse cx={0} cy={0} rx={(ap.cara === "redonda" ? 0.98 : 0.9) * R} ry={(ap.cara === "redonda" ? 0.96 : 1) * R} fill={piel} {...linea()} />
    );
  const ojosY = -0.05 * R;
  const pielOscura = luminancia(piel) < 0.45;
  const ceja = (x: number, lado: -1 | 1) => {
    // lado -1 = ceja de atrás; la "de adentro" es la más cercana a la nariz
    const a = inc * -lado;
    const y = (-0.31 + sube) * R;
    return <line key={lado} x1={x - 0.13 * R} y1={y} x2={x + 0.13 * R} y2={y} {...linea(1.25)} stroke={c(ap.pelo.tipo === "pelado" ? "grisOscuro" : ap.pelo.color === "canoso" ? "grisOscuro" : ap.pelo.color)} transform={`rotate(${a} ${x} ${y})`} />;
  };
  return (
    <g>
      <PeloAtras ap={ap} R={R} />
      <circle cx={-0.88 * R} cy={0.06 * R} r={0.17 * R} fill={piel} {...linea()} />
      {forma}
      {/* sombra del lado de atrás de la cara */}
      <path d={`M ${-0.55 * R} ${-0.82 * R} Q ${-1.02 * R} ${-0.1 * R} ${-0.5 * R} ${0.86 * R} Q ${-0.86 * R} ${0.05 * R} ${-0.55 * R} ${-0.82 * R} Z`} {...sombra(ap.piel)} />
      {ap.arrugas ? (
        <g>
          <path d={`M ${dx - 0.3 * R} ${-0.55 * R} Q ${dx} ${-0.6 * R} ${dx + 0.3 * R} ${-0.55 * R}`} fill="none" {...linea(0.5)} />
          <path d={`M ${dx + 0.42 * R} ${0.12 * R} q ${0.05 * R} ${0.12 * R} 0 ${0.24 * R}`} fill="none" {...linea(0.5)} />
        </g>
      ) : null}
      {ap.barba ? <path d={`M ${-0.82 * R} ${0.12 * R} Q ${-0.72 * R} ${1.08 * R} ${dx} ${1.08 * R} Q ${0.86 * R} ${1.02 * R} ${0.86 * R} ${0.12 * R} Q ${0.6 * R} ${0.62 * R} ${dx} ${0.66 * R} Q ${-0.5 * R} ${0.62 * R} ${-0.82 * R} ${0.12 * R} Z`} fill={c(ap.pelo.color)} {...linea()} /> : null}
      <path d={`M ${dx + 0.1 * R} ${0.02 * R} Q ${dx + 0.24 * R} ${0.22 * R} ${dx + 0.06 * R} ${0.27 * R}`} fill="none" {...linea(0.85)} />
      <Boca x={dx + 0.02 * R} y={0.5 * R} R={R} visema={visema} expresion={pose.expresion} pestanas={ap.pestanas} />
      {ap.bigote ? <path d={`M ${dx - 0.26 * R} ${0.4 * R} Q ${dx} ${0.24 * R} ${dx + 0.28 * R} ${0.4 * R} Q ${dx} ${0.34 * R} ${dx - 0.26 * R} ${0.4 * R} Z`} fill={c(ap.pelo.color)} {...linea(0.8)} /> : null}
      <Ojo x={dx - 0.33 * R} y={ojosY} R={R} cierre={cierre} expresion={pose.expresion} mirada={pose.mirada} pestanas={ap.pestanas} pielOscura={pielOscura} />
      <Ojo x={dx + 0.33 * R} y={ojosY} R={R} cierre={cierre} expresion={pose.expresion} mirada={pose.mirada} pestanas={ap.pestanas} pielOscura={pielOscura} />
      {ceja(dx - 0.33 * R, -1)}
      {ceja(dx + 0.33 * R, 1)}
      <PeloFrente ap={ap} R={R} />
      {ap.lentes ? (
        <g fill="#FFFFFF" fillOpacity={0.2}>
          <circle cx={dx - 0.33 * R} cy={ojosY} r={0.2 * R} {...linea(0.9)} />
          <circle cx={dx + 0.33 * R} cy={ojosY} r={0.2 * R} {...linea(0.9)} />
          <line x1={dx - 0.13 * R} y1={ojosY} x2={dx + 0.13 * R} y2={ojosY} {...linea(0.9)} />
        </g>
      ) : null}
      <Sombrero ap={ap} R={R} />
    </g>
  );
};

// ---------- cuerpo ----------

const MANGA_LARGA: Record<Apariencia["torso"], boolean> = {
  remera: false,
  camisa: true,
  saco: true,
  guardapolvo: true,
  buzo: true,
  chaleco: true,
  uniforme: false,
  cardigan: true,
};

const Brazo: React.FC<{ ap: Apariencia; lado: -1 | 1; angulos: [number, number]; mano: Mano; x: number; y: number }> = ({ ap, lado, angulos, mano, x, y }) => {
  const { c, linea } = useIlu();
  const piel = c(ap.piel);
  const manga = c(ap.torso === "chaleco" ? (ap.colorInterior ?? "blanco") : ap.colorTorso);
  const larga = MANGA_LARGA[ap.torso];
  // brazo de la izquierda (lado -1): "afuera" = horario; el de la derecha al revés
  const s = lado === -1 ? 1 : -1;
  return (
    <g transform={`translate(${x} ${y}) rotate(${s * angulos[0]})`}>
      <Capsula largo={BRAZO} ancho={23} fill={larga ? manga : piel} />
      {!larga ? <rect x={-13} y={-13} width={26} height={36} rx={11} fill={manga} {...linea()} /> : null}
      <g transform={`translate(0 ${BRAZO}) rotate(${s * angulos[1]})`}>
        <Capsula largo={ANTEBRAZO} ancho={20} fill={larga ? manga : piel} />
        {larga ? <rect x={-11.5} y={ANTEBRAZO - 8} width={23} height={8} rx={3} fill={oscurecer(manga, 0.12)} {...linea(0.7)} /> : null}
        <g transform={`translate(0 ${ANTEBRAZO + 8}) scale(${s === 1 ? 1 : -1} 1)`}>
          <ManoDibujo mano={mano} piel={ap.piel} />
        </g>
      </g>
    </g>
  );
};

const Pierna: React.FC<{ ap: Apariencia; angulos: [number, number]; x: number }> = ({ ap, angulos, x }) => {
  const { c, linea } = useIlu();
  const pantalon = ap.piernas === "pantalon";
  const col = pantalon ? c(ap.colorPiernas) : c(ap.piel);
  const w = pantalon ? 28 : 18;
  return (
    <g transform={`translate(${x} ${CADERA_Y}) rotate(${-angulos[0]})`}>
      <Capsula largo={MUSLO} ancho={w} fill={col} />
      <g transform={`translate(0 ${MUSLO}) rotate(${-angulos[1]})`}>
        <Capsula largo={PANTORRILLA} ancho={w - 4} fill={col} />
        <path d={`M -12 ${PANTORRILLA - 6} Q -15 ${PANTORRILLA + 10} -2 ${PANTORRILLA + 11} L 24 ${PANTORRILLA + 11} Q 29 ${PANTORRILLA + 2} 12 ${PANTORRILLA - 4} Z`} fill={c(ap.zapatos)} {...linea()} />
      </g>
    </g>
  );
};

const Torso: React.FC<{ ap: Apariencia; hombros: number }> = ({ ap, hombros }) => {
  const { c, linea, sombra } = useIlu();
  const a = ap.contextura;
  const S = 37 * a;
  const W = 30 * a;
  const HY = HOMBRO_Y - hombros * 0.6;
  const CY = CADERA_Y + 4;
  const ropa = c(ap.colorTorso);
  const interior = c(ap.colorInterior ?? "blanco");
  const forma = `M ${-S} ${HY + 12} Q ${-S} ${HY - 4} ${-S + 15} ${HY - 6} L ${S - 15} ${HY - 6} Q ${S} ${HY - 4} ${S} ${HY + 12} L ${W} ${CY} L ${-W} ${CY} Z`;
  const largo = ap.torso === "guardapolvo";
  const cinturon = ap.piernas === "pantalon" && !largo && ap.torso !== "buzo";
  return (
    <g>
      {ap.mochila ? <rect x={-S - 16} y={HY + 8} width={30} height={92} rx={12} fill={c(ap.mochila)} {...linea()} /> : null}
      {largo ? <path d={`M ${-W - 2} ${CY - 20} L ${W + 2} ${CY - 20} L ${W + 12} ${CY + 82} L ${-W - 12} ${CY + 82} Z`} fill={ropa} {...linea()} /> : null}
      {largo ? <line x1={2} y1={CY - 10} x2={4} y2={CY + 82} {...linea(0.7)} /> : null}
      {ap.piernas === "pollera" ? <path d={`M ${-W - 3} ${CY - 10} L ${W + 3} ${CY - 10} L ${W + 17} ${CY + 66} Q 0 ${CY + 74} ${-W - 17} ${CY + 66} Z`} fill={c(ap.colorPiernas)} {...linea()} /> : null}
      <path d={forma} fill={ap.torso === "chaleco" ? interior : ropa} {...linea()} />
      {/* sombra del lado de atrás del torso */}
      <path d={`M ${-S + 3} ${HY + 12} L ${-W + 2} ${CY - 2} L ${-W + 22} ${CY - 2} L ${-S + 20} ${HY + 4} Z`} {...sombra(ap.colorTorso)} />
      {ap.torso === "remera" ? <path d={`M -13 ${HY - 6} Q 0 ${HY + 12} 13 ${HY - 6}`} fill={c(ap.piel)} {...linea(0.8)} /> : null}
      {ap.torso === "camisa" || ap.torso === "uniforme" ? (
        <g>
          <path d={`M -14 ${HY - 6} L 0 ${HY + 14} L 14 ${HY - 6} Z`} fill={c(ap.piel)} />
          <path d={`M -15 ${HY - 7} L -3 ${HY + 12} L -16 ${HY + 8} Z M 15 ${HY - 7} L 3 ${HY + 12} L 16 ${HY + 8} Z`} fill={ropa} {...linea(0.8)} />
          <line x1={0} y1={HY + 14} x2={0} y2={CY - 8} {...linea(0.6)} />
          {[30, 58, 86].map((d) => (
            <circle key={d} cx={0} cy={HY + d} r={2} fill={c("blanco")} />
          ))}
        </g>
      ) : null}
      {ap.torso === "uniforme" ? (
        <g>
          <path d={`M ${S - 26} ${HY + 22} l 7 -3 l 7 3 l -1 10 l -6 4 l -6 -4 Z`} fill={c("oro")} {...linea(0.6)} />
          <rect x={-S + 10} y={HY + 22} width={20} height={16} rx={2} fill="none" {...linea(0.6)} />
        </g>
      ) : null}
      {ap.torso === "saco" || ap.torso === "guardapolvo" || ap.torso === "cardigan" ? (
        <g>
          <path d={`M -15 ${HY - 6} L 0 ${HY + (ap.torso === "cardigan" ? 30 : 52)} L 15 ${HY - 6} Z`} fill={interior} {...linea(0.8)} />
          {ap.torso !== "cardigan" ? <path d={`M -16 ${HY - 6} L -2 ${HY + 50} L -22 ${HY + 18} Z M 16 ${HY - 6} L 2 ${HY + 50} L 22 ${HY + 18} Z`} fill={oscurecer(ropa, 0.08)} {...linea(0.8)} /> : null}
          {ap.corbata ? <path d={`M -4 ${HY + 2} L 4 ${HY + 2} L 6 ${HY + 40} L 0 ${HY + 48} L -6 ${HY + 40} Z`} fill={c(ap.corbata)} {...linea(0.7)} /> : null}
          {[64, 84].map((d) => (
            <circle key={d} cx={4} cy={HY + d} r={2.6} fill={oscurecer(ropa, 0.35)} />
          ))}
          {ap.torso === "guardapolvo" ? <rect x={S - 30} y={HY + 30} width={16} height={12} rx={1} fill="none" {...linea(0.6)} /> : null}
        </g>
      ) : null}
      {ap.torso === "buzo" ? (
        <g>
          <path d={`M -24 ${HY - 4} Q 0 ${HY + 22} 24 ${HY - 4} Q 0 ${HY + 6} -24 ${HY - 4} Z`} fill={oscurecer(ropa, 0.15)} {...linea(0.8)} />
          <path d={`M -20 ${CY - 44} L 20 ${CY - 44} L 24 ${CY - 8} L -24 ${CY - 8} Z`} fill="none" {...linea(0.7)} />
          <line x1={-6} y1={HY + 8} x2={-7} y2={HY + 36} {...linea(0.6)} />
          <line x1={6} y1={HY + 8} x2={7} y2={HY + 36} {...linea(0.6)} />
        </g>
      ) : null}
      {ap.torso === "chaleco" ? (
        <g>
          <path d={`M ${-S + 4} ${HY + 4} L -10 ${HY - 4} L -12 ${CY} L ${-W} ${CY} Z M ${S - 4} ${HY + 4} L 10 ${HY - 4} L 12 ${CY} L ${W} ${CY} Z`} fill={ropa} {...linea(0.8)} />
          <rect x={-W - 1} y={HY + 62} width={W * 2 + 2} height={9} fill={c("#E9EEF2")} {...linea(0.5)} />
        </g>
      ) : null}
      {ap.estetoscopio ? <path d={`M -16 ${HY - 4} Q -18 ${HY + 40} 0 ${HY + 46} Q 18 ${HY + 40} 16 ${HY - 4} M 0 ${HY + 46} L 0 ${HY + 58}`} fill="none" stroke={c("grisOscuro")} strokeWidth={4} /> : null}
      {ap.credencial ? (
        <g>
          <path d={`M -12 ${HY - 4} L 8 ${HY + 46} L 16 ${HY - 4}`} fill="none" stroke={c("acento")} strokeWidth={3} />
          <rect x={-2} y={HY + 44} width={20} height={26} rx={2} fill={c("blanco")} {...linea(0.7)} />
          <rect x={2} y={HY + 48} width={12} height={8} fill={c("acento2")} />
        </g>
      ) : null}
      {ap.mochila ? <path d={`M ${-S + 12} ${HY - 4} L ${-S + 6} ${HY + 70}`} stroke={oscurecer(c(ap.mochila), 0.25)} strokeWidth={7} strokeLinecap="round" /> : null}
      {cinturon ? <rect x={-W - 1} y={CY - 12} width={W * 2 + 2} height={10} fill={oscurecer(c(ap.colorPiernas), 0.35)} {...linea(0.7)} /> : null}
    </g>
  );
};

/** Personaje completo con esqueleto, expresiones y boca sincronizada. */
export const Personaje: React.FC<PersonajeProps> = (props) => {
  const frameSeq = useCurrentFrame();
  const { fps } = useVideoConfig();
  const escena = useEscena();
  const { p, c, linea } = useIlu();
  const frame = props.frame ?? frameSeq;
  const s = props.semilla ?? 1;
  const ap = props.apariencia;
  const tramos = props.acciones ?? [{ desde: 0, accion: props.accion ?? "reposo" }];
  const pose = poseEnFrame(tramos, frame, fps, p.exageracion, s);
  if (props.expresion) pose.expresion = props.expresion;
  // la mano de atrás lleva el bastón si no está ocupada
  // (solo con el brazo abajo: si lo levanta, el bastón quedaría flotando)
  if (ap.baston && pose.manoT === "abierta" && Math.abs(pose.bt[0]) < 30 && Math.abs(pose.bt[1]) < 45) pose.manoT = "baston";

  const ms = (frame / fps) * 1000;
  const captions = props.captions ?? escena.captions;
  const habla = props.habla === true || (typeof props.habla === "object" && ms >= props.habla.desdeMs && ms <= props.habla.hastaMs);
  const visema = habla ? visemaEn(captions, ms) : null;
  // al hablar, la cabeza acompaña un poco la apertura de la boca
  const cabeceo = visema ? APERTURA[visema] * 1.6 : 0;
  const cierre = parpadeo(frame, fps, s);

  const R = R_CABEZA * p.cabeza;
  const a = ap.contextura;
  const hombroX = 37 * a - 9;
  const hombroY = HOMBRO_Y + 8 - pose.hombros;
  const cuelloY = HOMBRO_Y - 4 - pose.hombros * 0.8;
  const cabezaY = cuelloY - 10 - R * 0.95;
  const mira = props.mira ?? 1;

  return (
    <g transform={`scale(${mira * ap.altura} ${ap.altura})`}>
      {/* sombra en el piso */}
      <ellipse cx={0} cy={4} rx={46 * a} ry={9} fill="#000000" fillOpacity={0.16} transform={`scale(${1 - Math.min(0.4, -pose.y / 120)} 1)`} />
      <g transform={`translate(${pose.x} ${pose.y}) scale(${1 / Math.sqrt(pose.estira)} ${pose.estira})`}>
        <g transform={`rotate(${pose.torso} 0 ${CADERA_Y})`}>
          <Brazo ap={ap} lado={-1} angulos={pose.bt} mano={pose.manoT} x={-hombroX} y={hombroY} />
        </g>
        <Pierna ap={ap} angulos={pose.pt} x={-13 * a} />
        <Pierna ap={ap} angulos={pose.pd} x={13 * a} />
        <g transform={`rotate(${pose.torso} 0 ${CADERA_Y})`}>
          <Torso ap={ap} hombros={pose.hombros} />
          <rect x={-9} y={cuelloY - 14} width={18} height={24} fill={c(ap.piel)} {...linea()} />
          <g transform={`rotate(${pose.cabeza + cabeceo} 0 ${cuelloY}) translate(0 ${cabezaY})`}>
            <Cabeza ap={ap} R={R} pose={pose} visema={visema} cierre={cierre} />
          </g>
          <Brazo ap={ap} lado={1} angulos={pose.bd} mano={pose.manoD} x={hombroX} y={hombroY} />
        </g>
      </g>
    </g>
  );
};
