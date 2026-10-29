import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { piezasSvg } from "../../shared/marca";
import { avance, caidaPunto, CL, useKit } from "./base";

/** Frames de la apertura de marca (1,2 s). */
export const FRAMES_APERTURA = 36;
/** Frame en que el punto toca su lugar (ahí va el "tic"). */
export const FRAME_TIC_APERTURA = 27;

/**
 * Apertura de marca: las piezas del logo aparecen una por una, las últimas (la palabra de abajo) suben desde una
 * máscara y el punto (si el logo tiene uno) cae al final con un rebote chico. Principal sobre papel, o negativo sobre tinta.
 */
export const AperturaMarca: React.FC<{ fondo?: "papel" | "tinta" }> = ({ fondo = "papel" }) => {
  const frame = useCurrentFrame();
  const kit = useKit();
  if (!kit) return null;
  const color = fondo === "tinta" ? kit.colores.texto : kit.colores.fondo2;
  const svg = fondo === "tinta" ? (kit.logos.negativo ?? kit.logos.principal) : kit.logos.principal;
  const p = svg ? piezasSvg(svg) : null;
  const salida = interpolate(frame, [FRAMES_APERTURA - 5, FRAMES_APERTURA], [1, 0], CL);
  if (!p) return <AbsoluteFill style={{ background: color }} />;
  const n = p.trazados.length;
  // las primeras piezas son la línea de arriba del logo; las últimas 5, la palabra de abajo
  const corte = Math.max(0, n - 5);
  const ancho = 820;
  const escala = ancho / p.ancho;
  const caida = caidaPunto(frame, 21);
  return (
    <AbsoluteFill style={{ background: color, alignItems: "center", justifyContent: "center" }}>
      <svg width={ancho} height={p.alto * escala} viewBox={p.viewBox} style={{ overflow: "visible", opacity: salida, translate: `0 ${(1 - salida) * -20}px` }}>
        <defs>
          <clipPath id="ap-mascara">
            <rect x={-100} y={-200} width={p.ancho + 200} height={200 + p.alto - 30} />
          </clipPath>
        </defs>
        <g transform={p.transform}>
          {p.trazados.map((t, i) => {
            if (i < corte) {
              const k = avance(frame, 1 + i * 1.3, 7);
              return <path key={i} d={t.d} fill={t.fill} opacity={k} transform={`translate(0 ${(1 - k) * 12})`} />;
            }
            const k = avance(frame, 9 + (i - corte) * 2, 9);
            return (
              <g key={i} clipPath="url(#ap-mascara)">
                <path d={t.d} fill={t.fill} transform={`translate(0 ${(1 - k) * 110})`} />
              </g>
            );
          })}
          {p.punto ? <circle cx={p.punto.cx} cy={p.punto.cy + caida.y * 160} r={p.punto.r * caida.escala} fill={p.punto.fill} /> : null}
        </g>
      </svg>
    </AbsoluteFill>
  );
};
