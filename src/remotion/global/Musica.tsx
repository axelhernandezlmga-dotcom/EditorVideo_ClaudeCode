import { useMemo } from "react";
import { Audio } from "@remotion/media";
import { Sequence, useVideoConfig } from "remotion";
import type { EscenaRender } from "../../shared/render";
import { curvaDucking, curvaMusica, DUCKING_CLIP } from "../../shared/musica";
import { iniciosEscenas } from "../../shared/render";
import { transicion } from "../transiciones";

/** Cuándo habla la voz (ms del video), para que la música baje (ducking). */
const intervalosHabla = (escenas: EscenaRender[], fps: number) => {
  const inicios = iniciosEscenas(escenas.map((e) => e.duracionFrames));
  return escenas.flatMap((e, i) => {
    const base = ((inicios[i] ?? 0) / fps) * 1000;
    return e.captions.map((c) => ({ desdeMs: base + c.startMs, hastaMs: base + c.endMs }));
  });
};

/** Cuándo suena el audio original de un meme (ms del video). */
export const intervalosMemes = (escenas: EscenaRender[], fps: number, desplazamiento = 0) => {
  const inicios = iniciosEscenas(escenas.map((e) => e.duracionFrames));
  return escenas.flatMap((e, i) =>
    e.meme?.conAudio ? [{ desdeMs: (((inicios[i] ?? 0) + desplazamiento + e.meme.desdeFrame) / fps) * 1000, hastaMs: (((inicios[i] ?? 0) + desplazamiento + e.meme.desdeFrame + e.meme.duracionFrames) / fps) * 1000 }] : [],
  );
};

export const Musica: React.FC<{ src: string; volumen: number; escenas: EscenaRender[] }> = ({ src, volumen, escenas }) => {
  const { durationInFrames, fps } = useVideoConfig();
  // baja cuando habla la voz y más todavía cuando suena un meme
  const curva = useMemo(() => {
    const base = curvaMusica(intervalosHabla(escenas, fps), durationInFrames, fps, volumen);
    const duck = curvaDucking(intervalosMemes(escenas, fps), durationInFrames, fps, DUCKING_CLIP.musica);
    return base.map((v, f) => v * (duck[f] ?? 1));
  }, [escenas, durationInFrames, fps, volumen]);
  return (
    <Audio
      name="Música"
      src={src}
      loop
      loopVolumeCurveBehavior="extend"
      volume={(f) => curva[Math.min(curva.length - 1, Math.max(0, f))] ?? 0}
    />
  );
};

/** Un "whoosh" o "pop" corto en cada cambio de escena, según el tipo de transición (si falta uno, usa el otro). */
export const SonidosTransicion: React.FC<{ whoosh: string | null; pop: string | null; escenas: EscenaRender[] }> = ({ whoosh, pop, escenas }) => {
  const { fps } = useVideoConfig();
  const inicios = iniciosEscenas(escenas.map((e) => e.duracionFrames));
  return (
    <>
      {inicios.slice(1).map((inicio, k) => {
        const tipo = transicion(k + 1).sonido;
        const src = tipo === "pop" ? (pop ?? whoosh) : (whoosh ?? pop);
        if (!src) return null;
        // la transición hacia la escena k+1 ocupa sus primeros FRAMES_TRANSICION frames: el sonido arranca apenas antes
        return (
          <Sequence key={k} name={`${tipo} ${k + 1}`} from={Math.max(0, inicio - 2)} durationInFrames={fps} layout="none">
            <Audio src={src} volume={tipo === "pop" ? 0.5 : 0.35} />
          </Sequence>
        );
      })}
    </>
  );
};

