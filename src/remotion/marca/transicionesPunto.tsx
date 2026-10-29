import type { TransitionPresentation, TransitionPresentationComponentProps } from "@remotion/transitions";
import { AbsoluteFill, Easing, interpolate } from "remotion";
import { ALTO, ANCHO } from "../../shared/render";
import { CL } from "./base";

/**
 * El punto rojo como transición. Tres variantes:
 *  - crece: el punto crece desde su lugar hasta cubrir la pantalla y se encoge sobre la escena nueva;
 *  - arrastre: el punto cruza la pantalla y "arrastra" la escena;
 *  - patron: el punto se divide en el patrón de puntos, que se apaga dejando ver la escena nueva.
 */
type Props = { color: string; tipo: "crece" | "arrastre" | "patron"; x: number; y: number };

const RADIO_TOTAL = Math.hypot(ANCHO, ALTO);
const easeIn = Easing.bezier(0.5, 0, 0.75, 0);
const easeOut = Easing.bezier(0.25, 1, 0.5, 1);

const PuntoPresentacion: React.FC<TransitionPresentationComponentProps<Props>> = ({ children, presentationDirection, presentationProgress: p, passedProps }) => {
  const { color, tipo, x, y } = passedProps;
  const entra = presentationDirection === "entering";

  if (tipo === "arrastre") {
    const u = interpolate(p, [0, 1], [0, 1], { ...CL, easing: Easing.bezier(0.65, 0, 0.35, 1) });
    return (
      <AbsoluteFill style={{ translate: `${entra ? (1 - u) * ANCHO : -u * ANCHO}px 0` }}>
        {children}
        {/* el punto va justo en el borde entre las dos escenas */}
        {!entra ? <div style={{ position: "absolute", left: ANCHO - 34, top: y - 34, width: 68, height: 68, borderRadius: "50%", background: color }} /> : null}
      </AbsoluteFill>
    );
  }

  if (tipo === "patron") {
    const filas = 14;
    const columnas = 8;
    const crece = interpolate(p, [0, 0.5], [0, 1], { ...CL, easing: easeIn });
    const apaga = interpolate(p, [0.5, 1], [1, 0], { ...CL, easing: easeOut });
    return (
      <AbsoluteFill>
        {entra ? (p >= 0.5 ? children : null) : p < 0.5 ? children : null}
        <AbsoluteFill style={{ pointerEvents: "none" }}>
          {Array.from({ length: filas * columnas }, (_, i) => {
            const c = i % columnas;
            const f = Math.floor(i / columnas);
            const cx = (c + 0.5) * (ANCHO / columnas);
            const cy = (f + 0.5) * (ALTO / filas);
            // cada punto sale del punto de origen hacia su lugar en la grilla
            const dist = Math.hypot(cx - x, cy - y) / RADIO_TOTAL;
            const k = entra ? apaga : Math.min(1, crece * 1.4 - dist * 0.4);
            const r = Math.max(0, k) * (ANCHO / columnas) * 0.72;
            return <div key={i} style={{ position: "absolute", left: cx - r, top: cy - r, width: r * 2, height: r * 2, borderRadius: "50%", background: color }} />;
          })}
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  // crece: sale tapada por el punto que crece; entra destapándose mientras el punto se encoge
  const r = entra ? interpolate(p, [0.5, 1], [RADIO_TOTAL, 0], { ...CL, easing: easeOut }) : interpolate(p, [0, 0.5], [12, RADIO_TOTAL], { ...CL, easing: easeIn });
  const visible = entra ? p >= 0.5 : true;
  return (
    <AbsoluteFill>
      {visible ? children : null}
      {(entra && p >= 0.5) || (!entra && p < 0.5) ? <div style={{ position: "absolute", left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: "50%", background: color }} /> : null}
    </AbsoluteFill>
  );
};

const crear = (props: Props): TransitionPresentation<Props> => ({ component: PuntoPresentacion, props });

/** Transición de marca que entra a la escena `i` (i ≥ 1): crece casi siempre, y cada tanto arrastre o patrón. */
export const transicionPunto = (i: number, color: string): { crear: () => TransitionPresentation<Props>; sonido: "whoosh" | "pop" } => {
  const tipo = i % 5 === 2 ? "arrastre" : i % 5 === 4 ? "patron" : "crece";
  // el punto sale de un lugar distinto cada vez (como si fuera el punto final de la frase)
  const x = [780, 300, 860, 540, 220][i % 5]!;
  const y = [1020, 760, 520, 1180, 900][i % 5]!;
  return { crear: () => crear({ color, tipo, x, y }), sonido: tipo === "arrastre" ? "whoosh" : "pop" };
};
