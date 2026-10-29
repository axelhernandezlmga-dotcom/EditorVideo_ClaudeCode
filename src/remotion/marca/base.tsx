import { Easing, interpolate } from "remotion";
import type { KitVisual } from "../../shared/render";
import { elegirLogo, type EleccionLogo } from "../../shared/marca";
import { useMarca } from "../contexto";
import { FAMILIA_KIT_DATOS, FAMILIA_KIT_TITULOS } from "../fuentes";

/** Movimiento de la marca: limpio y preciso, sin rebotes (salvo el del punto). */
export const EASE = Easing.bezier(0.2, 0, 0, 1);
export const CL = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const FUENTE_TITULOS = `"${FAMILIA_KIT_TITULOS}", system-ui, sans-serif`;
export const FUENTE_DATOS = `"${FAMILIA_KIT_DATOS}", ui-monospace, monospace`;

/** El kit de la marca actual (o null si el perfil no tiene). */
export const useKit = (): KitVisual | null => useMarca().kit ?? null;

/** 0 → 1 entre dos frames con el easing de la marca. */
export const avance = (frame: number, desde: number, dur: number) => interpolate(frame, [desde, desde + dur], [0, 1], { ...CL, easing: EASE });

/** El punto "cae" a su lugar: baja y hace un rebote chico (la única animación con rebote de la marca). */
export const caidaPunto = (frame: number, desde: number) => {
  const t = (frame - desde) / 30;
  if (t <= 0) return { y: -1, escala: 0 };
  // cae en ~0,2 s y rebota dos veces, cada vez más bajo
  const y = t < 0.2 ? -1 + (t / 0.2) ** 2 : -Math.abs(Math.sin(((t - 0.2) / 0.28) * Math.PI)) * 0.22 * Math.exp(-(t - 0.2) * 7);
  return { y, escala: Math.min(1, t / 0.06) };
};

/** SVG del kit en texto, sin sus medidas fijas (se adapta al ancho del contenedor). */
export const SvgKit: React.FC<{ svg: string; ancho: number; color?: string; style?: React.CSSProperties }> = ({ svg, ancho, color, style }) => {
  let s = svg.replace(/<title>[^<]*<\/title>/, "").replace(/\s(width|height)="[^"]*"/g, "");
  if (color) s = s.replace(/fill="#[0-9a-fA-F]{6}"/g, `fill="${color}"`);
  return <div style={{ width: ancho, lineHeight: 0, ...style }} dangerouslySetInnerHTML={{ __html: s.replace("<svg", '<svg width="100%"') }} />;
};

/** La pieza de marca que corresponde (logo en su variante o «C.») según el fondo y el ancho, por las reglas del kit. */
export const usePiezaMarca = (fondo: string, ancho: number, horizontal = false): { eleccion: EleccionLogo; svg: string | null } => {
  const kit = useKit();
  if (!kit) return { eleccion: { pieza: "simbolo", variante: "principal" }, svg: null };
  const eleccion = elegirLogo(fondo, ancho, kit.reglas, kit.colores.acento, { horizontal });
  const svg = eleccion.pieza === "logo" ? (kit.logos[eleccion.variante] ?? kit.logos.principal ?? null) : (kit.simbolos[eleccion.variante] ?? kit.simbolos.principal ?? null);
  return { eleccion, svg };
};

/** Logo (o «C.» si no entra) elegido por las reglas: nunca la variante equivocada para el fondo. */
export const PiezaMarca: React.FC<{ fondo: string; ancho: number; horizontal?: boolean; style?: React.CSSProperties }> = ({ fondo, ancho, horizontal, style }) => {
  const { eleccion, svg } = usePiezaMarca(fondo, ancho, horizontal);
  if (!svg) return null;
  // la «C.» se dibuja más chica que el logo que reemplaza (es cuadrada)
  return <SvgKit svg={svg} ancho={eleccion.pieza === "simbolo" ? Math.min(ancho, 160) : ancho} style={style} />;
};
