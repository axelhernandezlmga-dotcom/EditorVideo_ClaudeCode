import type { TransitionPresentation, TransitionPresentationComponentProps } from "@remotion/transitions";
import { clockWipe } from "@remotion/transitions/clock-wipe";
import { iris } from "@remotion/transitions/iris";
import { pushCut } from "@remotion/transitions/push-cut";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { AbsoluteFill, interpolate } from "remotion";
import { ALTO, ANCHO } from "../shared/render";

type SinProps = Record<string, never>;

/** Zoom: la escena que sale se agranda y se desvanece; la que entra llega desde chica. */
const ZoomPresentacion: React.FC<TransitionPresentationComponentProps<SinProps>> = ({ children, presentationDirection, presentationProgress: p }) => {
  const entra = presentationDirection === "entering";
  return (
    <AbsoluteFill
      style={{
        scale: entra ? interpolate(p, [0, 1], [0.6, 1]) : interpolate(p, [0, 1], [1, 1.6]),
        opacity: entra ? interpolate(p, [0, 0.6], [0, 1], { extrapolateRight: "clamp" }) : interpolate(p, [0.3, 1], [1, 0], { extrapolateLeft: "clamp" }),
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
const zoom = (): TransitionPresentation<SinProps> => ({ component: ZoomPresentacion, props: {} });

export type SonidoTransicion = "whoosh" | "pop";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TRANSICIONES: { crear: () => TransitionPresentation<any>; sonido: SonidoTransicion }[] = [
  { crear: () => slide({ direction: "from-bottom" }), sonido: "whoosh" },
  { crear: zoom, sonido: "pop" },
  { crear: () => wipe({ direction: "from-top-left" }), sonido: "whoosh" },
  { crear: () => pushCut({ flashOpacity: 0.35 }), sonido: "pop" },
  { crear: () => slide({ direction: "from-right" }), sonido: "whoosh" },
  { crear: () => clockWipe({ width: ANCHO, height: ALTO }), sonido: "whoosh" },
  { crear: () => iris({ width: ANCHO, height: ALTO }), sonido: "pop" },
];

/** Transición que entra a la escena `i` (i ≥ 1): va rotando para que no se repita. */
export const transicion = (i: number) => TRANSICIONES[(i - 1) % TRANSICIONES.length]!;
