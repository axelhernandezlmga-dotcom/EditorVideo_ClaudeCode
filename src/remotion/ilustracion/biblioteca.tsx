import { useCurrentFrame, useVideoConfig } from "remotion";
import { ESCENARIOS } from "./escenarios";
import { EFECTOS } from "./efectos";
import { OBJETOS } from "./objetos";
import type { FichaObjeto } from "./objetos/tipos";
import type { IdEstilo } from "./estilo";
import { ACCIONES, type Accion } from "./personajes/acciones";
import type { Apariencia } from "./personajes/apariencia";
import { ELENCO, NARRADOR_POR_DEFECTO, type IdPersonaje } from "./personajes/elenco";
import { Personaje } from "./personajes/Personaje";
import { fichaSvg } from "./svgObjeto";

export type TipoPieza = "personaje" | "objeto" | "escenario" | "efecto";

/** Una celda de una hoja de prueba o de catálogo. */
export type CeldaHoja = { tipo: TipoPieza; id: string; estilo: IdEstilo; frame: number; accion?: string; etiqueta?: string; svg?: string };

/** Acciones genéricas que tiene cualquier objeto (además de las suyas). */
export const ACCIONES_GENERICAS = ["quieto", "entrar", "caer", "flotar", "rebotar", "latir", "volar", "temblar", "girar", "salir"] as const;

const resorte = (t: number, dur = 12) => {
  if (t <= 0) return 0;
  const u = t / dur;
  return u >= 3 ? 1 : 1 - Math.exp(-3.2 * u) * Math.cos(4.2 * u);
};

/**
 * Transformación de una acción genérica a los `t` frames de empezada. Las acciones propias del objeto se
 * mueven solas adentro del dibujo; acá solo se suma un "flotar" mínimo para que nunca quede quieto.
 */
export const transformacionGenerica = (accion: string, t: number, fps: number, semilla: number): string => {
  const seg = t / fps;
  const vivo = Math.sin(seg * 2.2 + semilla) * 4;
  switch (accion) {
    case "entrar": {
      const e = resorte(t);
      return `translate(0 ${vivo * e}) scale(${Math.max(0.001, e)})`;
    }
    case "caer": {
      const caida = Math.min(1, t / (fps * 0.45));
      const y = -900 * (1 - caida * caida);
      const aplasta = t > fps * 0.45 && t < fps * 0.65 ? 1 - Math.sin(((t - fps * 0.45) / (fps * 0.2)) * Math.PI) * 0.18 : 1;
      return `translate(0 ${y}) scale(${1 / aplasta} ${aplasta})`;
    }
    case "flotar":
      return `translate(0 ${Math.sin(seg * 2.4 + semilla) * 16}) rotate(${Math.sin(seg * 1.7 + semilla) * 4})`;
    case "rebotar": {
      const fase = (seg * 1.6 + semilla * 0.1) % 1;
      const y = -Math.abs(Math.sin(fase * Math.PI)) * 70;
      const aplasta = fase < 0.08 || fase > 0.92 ? 0.88 : 1;
      return `translate(0 ${y}) scale(${1 / aplasta} ${aplasta})`;
    }
    case "latir": {
      const l = 1 + Math.max(0, Math.sin(seg * Math.PI * 2.4)) * 0.12;
      return `scale(${l})`;
    }
    case "volar": {
      const x = -700 + ((seg * 420 + semilla * 50) % 1400);
      return `translate(${x} ${Math.sin(seg * 3 + semilla) * 40}) rotate(${Math.sin(seg * 4) * 12})`;
    }
    case "temblar":
      return `translate(${Math.sin(seg * 70) * 5} ${Math.cos(seg * 55) * 3}) rotate(${Math.sin(seg * 40) * 3})`;
    case "girar":
      return `rotate(${seg * 200})`;
    case "salir": {
      const e = 1 - Math.min(1, t / (fps * 0.4));
      return `scale(${Math.max(0.001, e * e)})`;
    }
    default:
      return `translate(0 ${vivo})`;
  }
};

/** Un objeto de la biblioteca haciendo una acción (genérica o propia). */
export const ObjetoAnimado: React.FC<{ id: string; accion?: string; desde?: number; semilla?: number; color?: string; ficha?: FichaObjeto }> = ({ id, accion = "quieto", desde = 0, semilla = 1, color, ficha }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = ficha ?? OBJETOS[id];
  if (!f) return null;
  const t = Math.max(0, frame - desde);
  const generica = (ACCIONES_GENERICAS as readonly string[]).includes(accion);
  const [, alto] = f.tam;
  // las transformaciones se hacen desde la base del objeto, así "caer" y "rebotar" aplastan contra el piso
  return (
    <g transform={`translate(0 ${alto}) ${transformacionGenerica(generica ? accion : "quieto", t, fps, semilla)} translate(0 ${-alto})`}>
      <f.Dibujo accion={generica ? "quieto" : accion} t={generica ? frame : t} fps={fps} semilla={semilla} color={color} />
    </g>
  );
};

/** Apariencia de un personaje del elenco (o el narrador). */
export const aparienciaDe = (id: string, narrador?: Apariencia): Apariencia | null =>
  id === "narrador" ? (narrador ?? NARRADOR_POR_DEFECTO) : ((ELENCO as Record<string, Apariencia>)[id] ?? null);

type Pieza = { caja: (c: CeldaHoja) => string; dibujar: (c: CeldaHoja) => React.ReactNode };

/** Cómo dibujar cualquier pieza en una celda de hoja (con su caja de vista). */
export const piezaPorId = (tipo: TipoPieza, id: string, svg?: string): Pieza | null => {
  if (tipo === "personaje") {
    const ap = aparienciaDe(id as IdPersonaje | "narrador");
    if (!ap) return null;
    return {
      caja: () => "-230 -500 460 530",
      dibujar: (c) => {
        const accion = (ACCIONES as readonly string[]).includes(c.accion ?? "") ? (c.accion as Accion) : "reposo";
        return <Personaje apariencia={ap} acciones={[{ desde: 0, accion }]} habla={accion === "hablar"} semilla={3} />;
      },
    };
  }
  if (tipo === "objeto") {
    const f = OBJETOS[id] ?? (svg ? fichaSvg(id, svg) : undefined);
    if (!f) return null;
    const [w, h] = f.tam;
    const m = Math.max(w, h) * 1.25;
    return { caja: () => `${-m} ${-m} ${m * 2} ${m * 2}`, dibujar: (c) => <ObjetoAnimado id={id} ficha={f} accion={c.accion} semilla={2} /> };
  }
  if (tipo === "escenario") {
    const f = ESCENARIOS[id];
    if (!f) return null;
    return {
      caja: () => "0 0 1080 1920",
      dibujar: (c) => <EscenarioCongelado Dibujo={f.Dibujo} frame={c.frame} camara={c.accion === "paneo" ? -200 + c.frame * 2 : 0} />,
    };
  }
  const f = EFECTOS[id];
  if (!f) return null;
  return { caja: () => "-200 -200 400 400", dibujar: () => <EfectoAnimado id={id} desde={0} /> };
};

const EscenarioCongelado: React.FC<{ Dibujo: (typeof ESCENARIOS)[string]["Dibujo"]; frame: number; camara: number }> = ({ Dibujo, camara }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return <Dibujo t={frame} fps={fps} camara={camara} semilla={1} />;
};

/** Un efecto dibujado que empieza en `desde` y dura lo suyo (o `dur` frames). */
export const EfectoAnimado: React.FC<{ id: string; desde?: number; dur?: number; semilla?: number; color?: string }> = ({ id, desde = 0, dur, semilla = 1, color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = EFECTOS[id];
  if (!f) return null;
  const d = dur ?? Math.round(f.duracion * fps);
  const t = frame - desde;
  if (t < 0 || t > d) return null;
  return <f.Dibujo t={t} fps={fps} dur={d} semilla={semilla} color={color} />;
};
