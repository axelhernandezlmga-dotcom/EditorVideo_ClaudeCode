import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { Fragment } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { ALTO, ANCHO, FRAMES_TRANSICION, ZONA_SEGURA, type MarcaVisual } from "../../shared/render";
import { MarcaContext } from "../contexto";
import { aRender, escenasDemo } from "../ejemplo";
import { Escena } from "../Escena";
import { useFuentesListas } from "../fuentes";
import { Fondo } from "../global/Fondo";
import { MarcaAgua } from "../global/MarcaAgua";
import { AperturaMarca } from "./Apertura";
import { FUENTE_DATOS, FUENTE_TITULOS, avance, useKit } from "./base";
import { NoticiaMarca } from "./NoticiaMarca";
import { FechaFuente, IconoMarca, Marcador, SeparadorAnimado } from "./piezas";
import { CierreMarca, TarjetaMarca } from "./TarjetaMarca";
import { transicionPunto } from "./transicionesPunto";

/** Hoja de marca en movimiento (~22 s): apertura, punto, separador, marcador, destacado, noticia, íconos, subtítulos y cierre. */
export type HojaMarcaProps = { marca: MarcaVisual };

const Rotulo: React.FC<{ texto: string }> = ({ texto }) => {
  const kit = useKit();
  return <div style={{ position: "absolute", left: 80, top: 150, fontFamily: FUENTE_DATOS, fontSize: 26, letterSpacing: "0.08em", color: kit?.colores.secundario }}>{texto}</div>;
};

const Separador: React.FC = () => {
  const frame = useCurrentFrame();
  const kit = useKit();
  if (!kit) return null;
  const t = avance(frame, 12, 14);
  return (
    <AbsoluteFill>
      <Fondo />
      <Rotulo texto="02 / SEPARADOR · MARCADOR · FECHA" />
      <Marcador etiqueta="CONTEXTO" x={80} y={ZONA_SEGURA.arriba + 30} />
      <div style={{ position: "absolute", left: 80, right: 130, top: 470, fontFamily: FUENTE_TITULOS, fontWeight: 500, fontSize: 96, lineHeight: 1.05, letterSpacing: "-0.02em", color: kit.colores.texto, opacity: t, translate: `0 ${(1 - t) * 24}px` }}>
        ¿Qué pasó? ¿Por qué importa?
      </div>
      <div style={{ position: "absolute", left: 80, right: 130, top: 720, fontFamily: FUENTE_TITULOS, fontSize: 48, lineHeight: 1.3, color: kit.colores.secundario, opacity: avance(frame, 22, 14) }}>
        Primero, los hechos. Después, el contexto.
      </div>
      <SeparadorAnimado x={80} y={930} ancho={ANCHO - 210} desde={30} />
      <FechaFuente n={0} x={80} y={990} desde={44} tam={30} />
    </AbsoluteFill>
  );
};

const Iconos: React.FC = () => {
  const kit = useKit();
  if (!kit) return null;
  const ids = Object.keys(kit.iconos).slice(0, 12);
  return (
    <AbsoluteFill>
      <Fondo />
      <Rotulo texto="05 / ICONOGRAFÍA" />
      {ids.map((id, i) => {
        const c = i % 3;
        const f = Math.floor(i / 3);
        const x = 110 + c * 300;
        const y = 300 + f * 250;
        return (
          <Fragment key={id}>
            <IconoMarca id={id} tam={120} x={x} y={y} desde={i * 4} dur={20} color={i === 4 ? kit.colores.acento : kit.colores.texto} />
            <div style={{ position: "absolute", left: x - 30, width: 180, top: y + 136, textAlign: "center", fontFamily: FUENTE_DATOS, fontSize: 24, color: kit.colores.secundario, letterSpacing: "0.04em" }}>{id.toUpperCase()}</div>
          </Fragment>
        );
      })}
    </AbsoluteFill>
  );
};

const Escenas = {
  apertura: () => <AperturaMarca />,
  separador: () => <Separador />,
  destacado: () => (
    <AbsoluteFill>
      <Fondo />
      <Escena escena={{ ...aRender(escenasDemo.dato_numero!), duracionFrames: 96 }} paginaMs={1200} indice={1} etiqueta="DATO" />
    </AbsoluteFill>
  ),
  noticia: () => (
    // la tarjeta es papel: sobre blanco se distingue (en los crudos va encima del video)
    <AbsoluteFill style={{ background: "#FFFFFF" }}>
      <NoticiaMarca imagen={null} titular="Ejemplo de diseño: un titular de prensa con la frase clave resaltada" medio="Medio de ejemplo" fecha="26 OCT 2026" limiteAbajo={1150} desde={2} velo={false} />
    </AbsoluteFill>
  ),
  iconos: () => <Iconos />,
  tarjeta: () => (
    <AbsoluteFill>
      <Fondo />
      <TarjetaMarca tema="tinta" etiqueta="OPINIÓN" titulo="Mi punto de vista." bajada="Una postura clara. Argumentos que se pueden revisar." />
    </AbsoluteFill>
  ),
  subtitulos: () => (
    <AbsoluteFill>
      <Fondo />
      <Escena escena={{ ...aRender(escenasDemo.icono_texto!), duracionFrames: 100 }} paginaMs={1200} indice={4} />
    </AbsoluteFill>
  ),
  cierre: () => <CierreMarca toque={36} />,
};

const DURACIONES: [keyof typeof Escenas, number][] = [
  ["apertura", 44],
  ["separador", 96],
  ["destacado", 96],
  ["noticia", 90],
  ["iconos", 100],
  ["tarjeta", 90],
  ["subtitulos", 100],
  ["cierre", 76],
];
export const FRAMES_HOJA_MARCA = DURACIONES.reduce((n, [, d]) => n + d, 0) - FRAMES_TRANSICION * (DURACIONES.length - 1);

export const HojaMarca: React.FC<HojaMarcaProps> = ({ marca }) => {
  const listas = useFuentesListas(marca.kit);
  return (
    <MarcaContext.Provider value={{ ...marca, conPlacaSeguir: true }}>
      <AbsoluteFill style={{ background: marca.kit?.colores.fondo2 ?? "#fff", width: ANCHO, height: ALTO }}>
        {listas ? (
          <TransitionSeries>
            {DURACIONES.map(([nombre, d], i) => {
              const Comp = Escenas[nombre];
              return (
                <Fragment key={nombre}>
                  {i > 0 && marca.kit ? <TransitionSeries.Transition presentation={transicionPunto(i, marca.kit.colores.acento).crear()} timing={linearTiming({ durationInFrames: FRAMES_TRANSICION })} /> : null}
                  <TransitionSeries.Sequence durationInFrames={d}>
                    <Comp />
                    {nombre !== "apertura" && nombre !== "cierre" ? <MarcaAgua /> : null}
                  </TransitionSeries.Sequence>
                </Fragment>
              );
            })}
          </TransitionSeries>
        ) : null}
      </AbsoluteFill>
    </MarcaContext.Provider>
  );
};
