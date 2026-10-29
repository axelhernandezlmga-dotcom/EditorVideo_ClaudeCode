import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { Fragment } from "react";
import { Audio } from "@remotion/media";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { duracionTotalFrames, FRAMES_TRANSICION, type VideoProps } from "../shared/render";
import { ETIQUETA_BLOQUE } from "../shared/schemas";
import { MarcaContext } from "./contexto";
import { Escena } from "./Escena";
import { useFuentesListas } from "./fuentes";
import { BarraProgreso } from "./global/BarraProgreso";
import { Fondo } from "./global/Fondo";
import { MarcaAgua } from "./global/MarcaAgua";
import { FRAMES_PLACA_SEGUIR, PlacaSeguir, toqueSeguir } from "./global/PlacaSeguir";
import { Musica, SonidosTransicion } from "./global/Musica";
import { ZonasSeguras } from "./global/ZonasSeguras";
import { transicion } from "./transiciones";
import { AperturaMarca, FRAME_TIC_APERTURA } from "./marca/Apertura";
import { transicionPunto } from "./marca/transicionesPunto";

/** La etiqueta del bloque editorial de la escena `i`, solo en la primera escena de cada bloque. */
const etiquetaDeEscena = (escenas: VideoProps["escenas"], i: number): string | undefined => {
  const b = escenas[i]?.bloque;
  const previo = i > 0 ? escenas[i - 1]?.bloque : undefined;
  return b && b !== previo ? ETIQUETA_BLOQUE[b as keyof typeof ETIQUETA_BLOQUE] : undefined;
};

export const Video: React.FC<VideoProps> = (props) => {
  const { fps } = useVideoConfig();
  const fuentesListas = useFuentesListas(props.marca.kit);
  const kit = props.marca.kit;
  // con kit, el video abre con la apertura de marca y todo lo demás arranca después
  const apertura = kit ? (props.apertura ?? 0) : 0;
  const finEscenas = apertura + duracionTotalFrames(props.escenas.map((e) => e.duracionFrames));
  return (
    <MarcaContext.Provider value={props.cierre ? { ...props.marca, conPlacaSeguir: true } : props.marca}>
      <AbsoluteFill style={{ backgroundColor: props.marca.colores.fondo }}>
        <Fondo />
        {fuentesListas && apertura ? (
          <Sequence name="Apertura de marca" durationInFrames={apertura}>
            <AperturaMarca />
            {props.ticSrc ? (
              <Sequence from={FRAME_TIC_APERTURA} durationInFrames={fps} layout="none">
                <Audio name="Tic" src={props.ticSrc} volume={0.5} />
              </Sequence>
            ) : null}
          </Sequence>
        ) : null}
        {fuentesListas ? (
          <Sequence name="Escenas" from={apertura} layout="none">
            <TransitionSeries name="Escenas">
              {props.escenas.map((e, i) => (
                <Fragment key={i}>
                  {i > 0 ? (
                    <TransitionSeries.Transition
                      presentation={kit ? transicionPunto(i, kit.colores.acento).crear() : transicion(i).crear()}
                      timing={linearTiming({ durationInFrames: FRAMES_TRANSICION })}
                    />
                  ) : null}
                  <TransitionSeries.Sequence name={`Escena ${i + 1} · ${e.plantilla}`} durationInFrames={e.duracionFrames} premountFor={fps}>
                    <Escena escena={e} paginaMs={props.paginaSubtitulosMs} indice={i} etiqueta={etiquetaDeEscena(props.escenas, i)} />
                  </TransitionSeries.Sequence>
                </Fragment>
              ))}
            </TransitionSeries>
          </Sequence>
        ) : null}
        {fuentesListas && props.cierre ? (
          <Sequence name="Placa Seguir" from={finEscenas} durationInFrames={FRAMES_PLACA_SEGUIR}>
            {/* en los animados el "seguime para más" lo dice la narración */}
            <PlacaSeguir texto={null} />
            {props.popSrc ? (
              <Sequence from={toqueSeguir(FRAMES_PLACA_SEGUIR)} durationInFrames={fps} layout="none">
                <Audio name="Pop seguir" src={props.popSrc} volume={0.55} />
              </Sequence>
            ) : null}
          </Sequence>
        ) : null}
        <BarraProgreso />
        {/* la marca de agua no va sobre la placa "Seguir" (ahí el @ ya está grande) */}
        {fuentesListas ? (
          <Sequence name="Marca de agua" from={apertura} durationInFrames={finEscenas - apertura} layout="none">
            <MarcaAgua />
          </Sequence>
        ) : null}
        {props.musicaSrc ? (
          // la música (y su ducking bajo la voz) arranca con las escenas, después de la apertura
          <Sequence name="Música" from={apertura} layout="none">
            <Musica src={props.musicaSrc} volumen={props.volumenMusica} escenas={props.escenas} />
          </Sequence>
        ) : null}
        {props.sfxSrc || props.popSrc ? (
          <Sequence name="Sonidos de transición" from={apertura} layout="none">
            <SonidosTransicion whoosh={props.sfxSrc} pop={props.popSrc ?? null} escenas={props.escenas} />
          </Sequence>
        ) : null}
        {props.mostrarZonas ? <ZonasSeguras /> : null}
      </AbsoluteFill>
    </MarcaContext.Provider>
  );
};
