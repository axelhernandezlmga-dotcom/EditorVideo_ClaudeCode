import { createContext, useContext } from "react";
import { AbsoluteFill } from "remotion";
import { luminancia, mezclar, oscurecer, saturar } from "./color";

/**
 * Estilos de ilustración de la casa. El mismo dibujo cambia de grosor, proporciones, sombras y color
 * según el estilo (la guía completa está en assets/ilustracion/ESTILO.md).
 */
export const ESTILOS_ILUSTRACION = [
  { id: "plano", nombre: "Plano editorial", detalle: "Formas planas, contorno fino, sombra suave (explicador de noticias)" },
  { id: "cartoon", nombre: "Cartoon", detalle: "Contorno grueso, cabezas grandes, gestos exagerados" },
  { id: "documental", nombre: "Documental", detalle: "Colores apagados, sombras rayadas y grano de papel" },
] as const;
export type IdEstilo = (typeof ESTILOS_ILUSTRACION)[number]["id"];
export const IDS_ESTILOS = ESTILOS_ILUSTRACION.map((e) => e.id) as [IdEstilo, ...IdEstilo[]];

export type ParamsEstilo = {
  /** Grosor del contorno, en unidades del dibujo (un personaje mide ~380). */
  trazo: number;
  /** Color del contorno. */
  tinta: string;
  /** Tamaño de la cabeza respecto del cuerpo. */
  cabeza: number;
  /** Cuánto se exageran los gestos (ángulos, saltos, estirar y aplastar). */
  exageracion: number;
  /** Cómo se dibujan las sombras: velo suave, color más oscuro recortado o rayado. */
  sombra: "suave" | "dura" | "rayado";
  /** Saturación de los colores (1 = la paleta tal cual). */
  saturacion: number;
  /** Cuánto se tiñen los colores hacia el papel (0 = nada). */
  papel: number;
  /** Opacidad del grano de papel encima de la escena. */
  grano: number;
  /** Ojos: puntos (plano), con blanco y pupila (cartoon) o puntos chicos con párpado (documental). */
  ojos: "punto" | "grandes" | "parpado";
};

export const PARAMS_ESTILO: Record<IdEstilo, ParamsEstilo> = {
  plano: { trazo: 3, tinta: "#231F38", cabeza: 1, exageracion: 1, sombra: "suave", saturacion: 1, papel: 0, grano: 0, ojos: "punto" },
  cartoon: { trazo: 7, tinta: "#15111C", cabeza: 1.28, exageracion: 1.5, sombra: "dura", saturacion: 1.15, papel: 0, grano: 0, ojos: "grandes" },
  documental: { trazo: 2.2, tinta: "#3B3029", cabeza: 0.94, exageracion: 0.7, sombra: "rayado", saturacion: 0.6, papel: 0.16, grano: 0.16, ojos: "parpado" },
};

/** Color del papel hacia el que tiñe el estilo documental. */
export const PAPEL = "#EFE4CF";

/** Paleta del perfil (los acentos y fondos de la marca) que usan la ropa, los objetos y los gráficos. */
export type PaletaIlu = { acento: string; acento2: string; fondo: string; fondo2: string; texto: string };

export const PALETA_POR_DEFECTO: PaletaIlu = { fondo: "#0B1020", fondo2: "#1E2A5A", texto: "#FFFFFF", acento: "#FFD23F", acento2: "#FF4D6D" };

/** Colores fijos de la casa (pieles, pelos, ropa neutra, naturaleza). Los nombres se pueden usar como "token" en las props. */
export const CASA = {
  piel1: "#F6D2B0",
  piel2: "#E6B48C",
  piel3: "#C98B5E",
  piel4: "#9B6440",
  piel5: "#64402A",
  canoso: "#DCDCDC",
  negro: "#2A2422",
  castano: "#6B4429",
  rubio: "#E0B65E",
  colorado: "#B4553A",
  azul: "#3E5C8A",
  marino: "#24324F",
  crema: "#EDE6D6",
  blanco: "#F7F5F0",
  gris: "#9AA4B0",
  grisOscuro: "#4C5563",
  verde: "#6E8B4E",
  naranja: "#F08A24",
  bordo: "#7A2433",
  mostaza: "#D9A63C",
  celeste: "#8EC5E8",
  oro: "#F4C543",
  plata: "#C9CDD3",
  billete: "#7FB77E",
  madera: "#A8743F",
  pasto: "#8DBF5A",
  cielo: "#BFE3F4",
  noche: "#1C2645",
  mar: "#3A8DBA",
  arena: "#E8D3A2",
  ladrillo: "#C56B4C",
  hormigon: "#C9CED6",
} as const;
export type TokenCasa = keyof typeof CASA;

/**
 * Recoloreado a la paleta de una marca: cada color va al tono de la marca más cercano por luz (tinta, gris,
 * línea, papel o blanco) y el acento queda solo para lo que es acento.
 */
export type Recolor = { tinta: string; gris: string; linea: string; papel: string; blanco: string; acento: string };

export type EstiloIlu = { id: IdEstilo; p: ParamsEstilo; paleta: PaletaIlu; recolor?: Recolor };

export const EstiloContext = createContext<EstiloIlu>({ id: "plano", p: PARAMS_ESTILO.plano, paleta: PALETA_POR_DEFECTO });

/** Herramientas de dibujo del estilo actual. */
export const useIlu = () => {
  const e = useContext(EstiloContext);
  const { p, paleta } = e;
  /** Color final: acepta #RRGGBB, un token de la casa ("piel2") o de la paleta ("acento"). */
  const c = (color: string): string => {
    const r = e.recolor;
    if (r) {
      if (color === "acento" || color === "acento2") return r.acento;
      const base = color.startsWith("#") ? color : ((paleta as Record<string, string>)[color] ?? (CASA as Record<string, string>)[color] ?? "#888888");
      if (base.toUpperCase() === r.acento.toUpperCase()) return r.acento;
      const l = luminancia(base);
      return l < 0.3 ? r.tinta : l < 0.52 ? r.gris : l < 0.78 ? r.linea : l < 0.93 ? r.papel : r.blanco;
    }
    const base = color.startsWith("#") ? color : ((paleta as Record<string, string>)[color] ?? (CASA as Record<string, string>)[color] ?? "#FF00FF");
    const sat = p.saturacion === 1 ? base : saturar(base, p.saturacion);
    return p.papel ? mezclar(sat, PAPEL, p.papel) : sat;
  };
  /** Props de contorno para un trazo (factor = más fino o más grueso que el normal). */
  const linea = (factor = 1) => ({
    stroke: p.tinta,
    strokeWidth: p.trazo * factor,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
  });
  /** Relleno de una sombra sobre una forma de color `base`. */
  const sombra = (base: string) =>
    p.sombra === "suave"
      ? { fill: "#000000", fillOpacity: 0.14 }
      : p.sombra === "dura"
        ? { fill: oscurecer(c(base), 0.28), fillOpacity: 1 }
        : { fill: `url(#ilu-rayado-${e.id})`, fillOpacity: 1 };
  return { ...e, c, linea, sombra };
};

/** Definiciones SVG que usan los estilos (el rayado del documental). Va una vez dentro de cada <svg>. */
export const DefsEstilo: React.FC = () => {
  const { id, p } = useContext(EstiloContext);
  return (
    <defs>
      <pattern id={`ilu-rayado-${id}`} width={7} height={7} patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
        <line x1={0} y1={0} x2={0} y2={7} stroke={p.tinta} strokeWidth={1.5} strokeOpacity={0.42} />
      </pattern>
    </defs>
  );
};

// grano de papel: el navegador rasteriza el azulejo una vez y lo repite (un filtro en vivo sobre 1080×1920 sería lento)
const AZULEJO_GRANO = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.25  0 0 0 0 0.2  0 0 0 0 0.15  0 0 0 1.6 -0.35"/></filter><rect width="220" height="220" filter="url(#g)"/></svg>',
)}")`;

/** Capa de grano y tinte de papel encima de la escena (solo en los estilos que la usan). */
export const GranoPapel: React.FC<{ desplazamiento?: number }> = ({ desplazamiento = 0 }) => {
  const { p } = useContext(EstiloContext);
  if (!p.grano) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill style={{ backgroundColor: PAPEL, opacity: p.papel * 0.5, mixBlendMode: "multiply" }} />
      {/* el grano "vibra" un poco de cuadro a cuadro, como el papel filmado */}
      <AbsoluteFill style={{ backgroundImage: AZULEJO_GRANO, backgroundPosition: `${(desplazamiento * 37) % 220}px ${(desplazamiento * 53) % 220}px`, opacity: p.grano * 2.2, mixBlendMode: "multiply" }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(60,40,20,0.28) 100%)" }} />
    </AbsoluteFill>
  );
};

/** Proveedor del estilo: elige los parámetros y la paleta del perfil. */
export const ProveedorEstilo: React.FC<{ estilo: IdEstilo; paleta?: Partial<PaletaIlu>; recolor?: Recolor; children: React.ReactNode }> = ({ estilo, paleta, recolor, children }) => (
  <EstiloContext.Provider value={{ id: estilo, p: PARAMS_ESTILO[estilo], paleta: { ...PALETA_POR_DEFECTO, ...paleta }, recolor }}>{children}</EstiloContext.Provider>
);
