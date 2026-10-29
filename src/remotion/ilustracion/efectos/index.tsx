import { interpolate } from "remotion";
import { azar } from "../color";
import { useIlu } from "../estilo";
import type { FichaEfecto, PropsEfecto } from "./tipos";

const CL = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Entra con un salto, se mantiene y se va (escala 0 → 1 → 0). */
const vida = (t: number, dur: number, entra = 6, sale = 6) => {
  const e = interpolate(t, [0, entra * 0.6, entra], [0, 1.18, 1], CL);
  const s = interpolate(t, [dur - sale, dur], [1, 0], CL);
  return Math.min(e, s);
};

const LineasVelocidad: React.FC<PropsEfecto> = ({ t, dur, semilla }) => {
  const { p } = useIlu();
  return (
    <g>
      {Array.from({ length: 7 }, (_, i) => {
        const y = -150 + i * 50 + azar(semilla + i) * 20;
        const k = ((t / 8 + azar(i + semilla) * 1.5) % 1.2) - 0.1;
        const largo = 80 + azar(i + 3) * 90;
        const x = 160 - k * 360;
        return <line key={i} x1={x} y1={y} x2={x + largo} y2={y} stroke={p.tinta} strokeWidth={p.trazo * 1.6} strokeLinecap="round" opacity={vida(t, dur) * 0.8} />;
      })}
    </g>
  );
};

const Humo: React.FC<PropsEfecto> = ({ t, fps, dur, semilla }) => {
  const { c, linea } = useIlu();
  return (
    <g>
      {Array.from({ length: 6 }, (_, i) => {
        const k = ((t / fps) * 0.8 + i / 6) % 1;
        const x = Math.sin(i * 2 + semilla) * 40 + Math.sin(k * 6 + i) * 20;
        return <circle key={i} cx={x} cy={120 - k * 260} r={26 + k * 46} fill={c("#D8D8D8")} fillOpacity={(1 - k) * 0.8 * vida(t, dur, 4, 10)} {...linea(0.6)} strokeOpacity={(1 - k) * 0.5} />;
      })}
    </g>
  );
};

const Chispas: React.FC<PropsEfecto> = ({ t, dur, semilla, color }) => {
  const { c } = useIlu();
  const u = t / dur;
  return (
    <g>
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2 + azar(i + semilla) * 0.4;
        const r1 = 30 + u * 140;
        const r2 = r1 + 30 * (1 - u);
        return <line key={i} x1={Math.cos(a) * r1} y1={Math.sin(a) * r1} x2={Math.cos(a) * r2} y2={Math.sin(a) * r2} stroke={c(color ?? (i % 2 ? "acento" : "naranja"))} strokeWidth={8 * (1 - u) + 2} strokeLinecap="round" />;
      })}
    </g>
  );
};

/** Explosión de historieta: estrella de puntas con "¡PUM!". */
const Explosion: React.FC<PropsEfecto> = ({ t, dur, color }) => {
  const { c, linea } = useIlu();
  const v = vida(t, dur, 5, 8);
  const pts = (r1: number, r2: number) =>
    Array.from({ length: 24 }, (_, i) => {
      const a = (i / 24) * Math.PI * 2;
      const r = i % 2 ? r1 : r2 * (0.85 + azar(i) * 0.3);
      return `${Math.cos(a) * r} ${Math.sin(a) * r}`;
    }).join(" L ");
  return (
    <g transform={`scale(${v}) rotate(${t * 0.8})`}>
      <path d={`M ${pts(110, 170)} Z`} fill={c(color ?? "acento2")} {...linea(1.3)} />
      <path d={`M ${pts(70, 110)} Z`} fill={c("acento")} {...linea(1)} />
      <text y={16} textAnchor="middle" fontSize={50} fontWeight={900} fill={c("#231F38")} fontFamily="sans-serif" transform={`rotate(${-t * 0.8})`}>
        ¡PUM!
      </text>
    </g>
  );
};

const Signo: React.FC<PropsEfecto & { signo: "?" | "!" }> = ({ t, fps, dur, signo, color }) => {
  const { c, linea } = useIlu();
  const v = vida(t, dur);
  const bamb = Math.sin((t / fps) * 7) * 10;
  const col = c(color ?? (signo === "?" ? "acento" : "acento2"));
  return (
    <g transform={`translate(0 ${Math.sin((t / fps) * 4) * 8}) rotate(${bamb}) scale(${v})`}>
      {signo === "?" ? (
        <g>
          <path d="M -44 -60 Q -44 -120 4 -120 Q 52 -120 52 -76 Q 52 -44 18 -30 Q 2 -22 2 4 L 2 20" fill="none" stroke={c("#231F38")} strokeWidth={46} strokeLinecap="round" strokeLinejoin="round" />
          <path d="M -44 -60 Q -44 -120 4 -120 Q 52 -120 52 -76 Q 52 -44 18 -30 Q 2 -22 2 4 L 2 20" fill="none" stroke={col} strokeWidth={30} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={2} cy={80} r={22} fill={col} {...linea(1.6)} />
        </g>
      ) : (
        <g>
          <path d="M -22 -130 L 22 -130 L 12 30 L -12 30 Z" fill={col} {...linea(1.6)} />
          <circle cx={0} cy={82} r={22} fill={col} {...linea(1.6)} />
        </g>
      )}
    </g>
  );
};

const Pregunta: React.FC<PropsEfecto> = (p) => <Signo {...p} signo="?" />;
const Exclamacion: React.FC<PropsEfecto> = (p) => <Signo {...p} signo="!" />;

const Sudor: React.FC<PropsEfecto> = ({ t, fps, dur }) => {
  const { c, linea } = useIlu();
  return (
    <g>
      {[0, 1, 2].map((i) => {
        const k = ((t / fps) * 1.3 + i / 3) % 1;
        const gota = "M 0 -30 Q 22 0 18 14 Q 14 30 0 30 Q -14 30 -18 14 Q -22 0 0 -30 Z";
        return (
          <g key={i} transform={`translate(${-60 + i * 60} ${-60 + k * 140}) scale(${0.7 + i * 0.15})`} opacity={(1 - k) * vida(t, dur, 4, 6)}>
            <path d={gota} fill={c("#8FD3F4")} {...linea()} />
            <ellipse cx={-6} cy={6} rx={4} ry={8} fill="#FFFFFF" fillOpacity={0.7} />
          </g>
        );
      })}
    </g>
  );
};

const Corazones: React.FC<PropsEfecto> = ({ t, fps, dur, color }) => {
  const { c, linea } = useIlu();
  const corazon = "M 0 30 Q -50 -6 -40 -34 Q -28 -58 0 -36 Q 28 -58 40 -34 Q 50 -6 0 30 Z";
  return (
    <g>
      {[0, 1, 2, 3].map((i) => {
        const k = ((t / fps) * 0.9 + i / 4) % 1;
        return (
          <g key={i} transform={`translate(${Math.sin(k * 8 + i * 2) * 50 + (i - 1.5) * 50} ${120 - k * 260}) scale(${0.6 + k * 0.5})`} opacity={(1 - k) * vida(t, dur, 4, 8)}>
            <path d={corazon} fill={c(color ?? "acento2")} {...linea()} />
          </g>
        );
      })}
    </g>
  );
};

/** Rayitos de enojo (la cruz de venitas) que laten. */
const RayosEnojo: React.FC<PropsEfecto> = ({ t, fps, dur, color }) => {
  const { c } = useIlu();
  const l = 1 + Math.max(0, Math.sin((t / fps) * Math.PI * 4)) * 0.25;
  const col = c(color ?? "acento2");
  const brazo = "M -10 -70 Q -14 -30 -50 -24";
  return (
    <g transform={`scale(${l * vida(t, dur, 4, 6)})`}>
      {[0, 90, 180, 270].map((a) => (
        <path key={a} d={brazo} fill="none" stroke={col} strokeWidth={22} strokeLinecap="round" transform={`rotate(${a})`} />
      ))}
    </g>
  );
};

/** Flecha que se dibuja (de abajo a la izquierda hacia arriba a la derecha) y termina con la punta. */
const Flecha: React.FC<PropsEfecto> = ({ t, dur, color }) => {
  const { c, p } = useIlu();
  const col = c(color ?? "acento");
  const largo = 420;
  const k = interpolate(t, [0, dur * 0.45], [0, 1], CL);
  const sale = interpolate(t, [dur - 6, dur], [1, 0], CL);
  return (
    <g opacity={sale}>
      <path d="M -150 120 Q -40 -60 140 -110" fill="none" stroke={p.tinta} strokeWidth={30} strokeLinecap="round" strokeDasharray={largo} strokeDashoffset={largo * (1 - k)} />
      <path d="M -150 120 Q -40 -60 140 -110" fill="none" stroke={col} strokeWidth={18} strokeLinecap="round" strokeDasharray={largo} strokeDashoffset={largo * (1 - k)} />
      {k > 0.97 ? <path d="M 96 -146 L 156 -114 L 110 -66" fill="none" stroke={col} strokeWidth={18} strokeLinecap="round" strokeLinejoin="round" /> : null}
    </g>
  );
};

export const EFECTOS: Record<string, FichaEfecto> = {
  lineas_velocidad: { nombre: "Líneas de velocidad", etiquetas: ["rápido", "velocidad", "corre", "apuro"], duracion: 1.2, Dibujo: LineasVelocidad },
  humo: { nombre: "Humo", etiquetas: ["humo", "se esfumó", "desaparece", "quemado", "fuego"], duracion: 1.8, Dibujo: Humo },
  chispas: { nombre: "Chispas", etiquetas: ["chispas", "idea", "brillo", "logro", "impacto"], duracion: 0.7, Dibujo: Chispas },
  explosion: { nombre: "Explosión cómica", etiquetas: ["explosión", "pum", "escándalo", "bomba", "estalla"], duracion: 1.1, Dibujo: Explosion },
  pregunta: { nombre: "Signo de pregunta", etiquetas: ["duda", "pregunta", "confusión", "no entiende"], duracion: 1.5, Dibujo: Pregunta },
  exclamacion: { nombre: "Signo de exclamación", etiquetas: ["sorpresa", "atención", "alerta", "importante"], duracion: 1.2, Dibujo: Exclamacion },
  sudor: { nombre: "Gotas de sudor", etiquetas: ["nervios", "sudor", "presión", "calor", "apuro"], duracion: 1.6, Dibujo: Sudor },
  corazones: { nombre: "Corazones", etiquetas: ["amor", "me gusta", "corazón", "feliz"], duracion: 1.8, Dibujo: Corazones },
  rayos_enojo: { nombre: "Rayos de enojo", etiquetas: ["enojo", "bronca", "furia", "calentura"], duracion: 1.4, Dibujo: RayosEnojo },
  flecha: { nombre: "Flecha que se dibuja", etiquetas: ["flecha", "señalar", "mirá", "sube", "crece"], duracion: 1.6, Dibujo: Flecha },
};
