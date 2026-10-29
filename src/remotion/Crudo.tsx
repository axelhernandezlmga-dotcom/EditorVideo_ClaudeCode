import { Audio, Video } from "@remotion/media";
import { useMemo } from "react";
import { AbsoluteFill, interpolate, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { encuadre, framesCrudo, type CrudoProps } from "../shared/crudo";
import { curvaMusica } from "../shared/musica";
import { SUBTITULOS } from "../shared/render";
import { EscenaContext, MarcaContext, useMarca } from "./contexto";
import { Marcador } from "./marca/piezas";
import { useFuentesListas } from "./fuentes";
import { MarcaAgua } from "./global/MarcaAgua";
import { FRAMES_PLACA_SEGUIR, FRAMES_TARJETA_SEGUIR, PlacaSeguir, TarjetaSeguir, toqueSeguir } from "./global/PlacaSeguir";
import { Subtitulos } from "./global/Subtitulos";
import { MaterialCrudo, SonidosCrudo } from "./MaterialCrudo";

/** Cada tramo conservado del original, ubicado en frames del video cortado. */
export const tramosEnFrames = (tramos: CrudoProps["tramos"], fps: number) => {
  let acumulado = 0;
  return tramos.map((t, i) => {
    const desde = Math.round((acumulado / 1000) * fps);
    acumulado += t.finMs - t.inicioMs;
    const hasta = Math.round((acumulado / 1000) * fps);
    return { i, desde, duracion: Math.max(1, hasta - desde), trimBefore: Math.round((t.inicioMs / 1000) * fps) };
  });
};

/**
 * Video "crudo" editado: los tramos que quedaron, uno detrás del otro, con zoom alternado (100 % / 110 %)
 * para disimular cada salto. Encima: noticias, datos y fotos, subtítulos (sin tapar la cara), marca de agua y efectos.
 */
export const Crudo: React.FC<CrudoProps> = (props) => {
  const { fps, durationInFrames } = useVideoConfig();
  const fuentesListas = useFuentesListas(props.marca.kit);
  const { modo, rect } = encuadre(props.video.ancho, props.video.alto);
  const tramos = useMemo(() => tramosEnFrames(props.tramos, fps), [props.tramos, fps]);
  const escena = useMemo(() => ({ captions: props.captions, enfasis: props.enfasis, duracionFrames: durationInFrames, indice: 0 }), [props.captions, props.enfasis, durationInFrames]);

  return (
    <MarcaContext.Provider value={props.marca}>
      <EscenaContext.Provider value={escena}>
        <AbsoluteFill style={{ backgroundColor: props.marca.colores.fondo }}>
          {props.video.src && tramos.map((t) => (
            <Sequence key={t.i} name={`Tramo ${t.i + 1}`} from={t.desde} durationInFrames={t.duracion} premountFor={fps}>
              <AbsoluteFill style={{ overflow: "hidden" }}>
                {modo === "ajustar" ? (
                  // fondo: el mismo video, ampliado y desenfocado
                  <Video
                    src={props.video.src}
                    trimBefore={t.trimBefore}
                    muted
                    objectFit="cover"
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", filter: "blur(38px) brightness(0.55)", scale: "1.15" }}
                  />
                ) : null}
                <div
                  style={{
                    position: "absolute",
                    left: rect.x,
                    top: rect.y,
                    width: rect.w,
                    height: rect.h,
                    // el zoom se centra un poco arriba (donde suele estar la cara)
                    scale: t.i % 2 === 1 ? String(props.zoom) : "1",
                    transformOrigin: "50% 38%",
                  }}
                >
                  <Video src={props.video.src} trimBefore={t.trimBefore} muted objectFit="fill" style={{ width: "100%", height: "100%" }} />
                </div>
              </AbsoluteFill>
              {props.audioSrc ? <Audio name="Voz" src={props.audioSrc} trimBefore={t.trimBefore} /> : null}
            </Sequence>
          ))}
          {fuentesListas ? <MaterialCrudo material={props.material} limiteAbajo={props.subtitulosY - SUBTITULOS.alto / 2 - 20} /> : null}
          {fuentesListas ? <Subtitulos paginaMs={props.paginaSubtitulosMs} y={props.subtitulosY} /> : null}
          {/* línea editorial: el marcador del bloque (CONTEXTO, DATO, OPINIÓN) cuando empieza, 2,4 s */}
          {fuentesListas
            ? (props.bloques ?? []).map((b, i) => (
                <Sequence key={i} name={`Bloque ${b.etiqueta}`} from={Math.round((b.ms / 1000) * fps)} durationInFrames={Math.round(fps * 2.4)} layout="none">
                  <MarcadorSobreVideo etiqueta={b.etiqueta} />
                </Sequence>
              ))
            : null}
          {fuentesListas ? (
            <Sequence name="Marca de agua" durationInFrames={framesCrudo(props.tramos, fps)} layout="none">
              <MarcaAgua />
            </Sequence>
          ) : null}
          <SonidosCrudo sfx={props.sfx} volumen={props.volumenSfx} />
          {props.musica ? <MusicaCrudo {...props.musica} captions={props.captions} /> : null}
          {fuentesListas && props.cierre ? <CierreSeguir cierre={props.cierre} tramos={props.tramos} /> : null}
        </AbsoluteFill>
      </EscenaContext.Provider>
    </MarcaContext.Provider>
  );
};

/** Tarjetas flotantes "Seguir" cuando la persona lo pide y la placa final, cada una con su "pop" en el toque. */
/** Marcador de bloque encima del video: sobre una franja papel para que se lea con cualquier imagen. */
const MarcadorSobreVideo: React.FC<{ etiqueta: string }> = ({ etiqueta }) => {
  const frame = useCurrentFrame();
  const { kit, colores } = useMarca();
  const sale = interpolate(frame, [58, 72], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: 60, top: 190, opacity: sale }}>
      <div style={{ position: "absolute", left: -14, top: -10, width: 64 + etiqueta.length * 24, height: 84, borderRadius: 14, background: kit?.colores.fondo2 ?? colores.fondo, opacity: 0.92 }} />
      <Marcador etiqueta={etiqueta} x={0} y={0} />
    </div>
  );
};

const CierreSeguir: React.FC<{ cierre: NonNullable<CrudoProps["cierre"]>; tramos: CrudoProps["tramos"] }> = ({ cierre, tramos }) => {
  const { fps } = useVideoConfig();
  const finVideo = framesCrudo(tramos, fps);
  const pop = (duracion: number) =>
    cierre.pop ? (
      <Sequence from={toqueSeguir(duracion)} durationInFrames={fps} layout="none">
        <Audio name="Pop seguir" src={cierre.pop} volume={0.55} />
      </Sequence>
    ) : null;
  return (
    <>
      {cierre.momentos
        .map((ms) => Math.round((ms / 1000) * fps))
        // la tarjeta no se pisa con la placa final
        .filter((f) => f + FRAMES_TARJETA_SEGUIR < finVideo - fps)
        .map((desde, i) => (
          <Sequence key={i} name={`Seguir ${i + 1}`} from={desde} durationInFrames={FRAMES_TARJETA_SEGUIR}>
            <TarjetaSeguir y={cierre.tarjetaY} />
            {pop(FRAMES_TARJETA_SEGUIR)}
          </Sequence>
        ))}
      {cierre.placa ? (
        <Sequence name="Placa Seguir" from={finVideo} durationInFrames={FRAMES_PLACA_SEGUIR}>
          <PlacaSeguir texto={cierre.texto} />
          {pop(FRAMES_PLACA_SEGUIR)}
        </Sequence>
      ) : null}
    </>
  );
};

/** Música de fondo en loop: baja mientras se habla (ducking), con fundidos y arrancando alineada al pulso. */
const MusicaCrudo: React.FC<NonNullable<CrudoProps["musica"]> & { captions: CrudoProps["captions"] }> = ({ src, volumen, desdeMs, captions }) => {
  const { fps, durationInFrames } = useVideoConfig();
  const curva = useMemo(() => curvaMusica(captions.map((c) => ({ desdeMs: c.startMs, hastaMs: c.endMs })), durationInFrames, fps, volumen), [captions, durationInFrames, fps, volumen]);
  return (
    <Audio
      name="Música"
      src={src}
      loop
      loopVolumeCurveBehavior="extend"
      trimBefore={Math.round((desdeMs / 1000) * fps)}
      volume={(f) => curva[Math.min(curva.length - 1, Math.max(0, f))] ?? 0}
    />
  );
};
