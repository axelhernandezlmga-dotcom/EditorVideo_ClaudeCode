import { Player } from "@remotion/player";
import { useMemo } from "react";
import { ALTO, ANCHO, duracionTotalFrames, FPS, type MarcaVisual, type VideoProps } from "../../../src/shared/render";
import type { Escena } from "../../../src/shared/schemas";
import { aRender } from "../../../src/remotion/ejemplo";
import { Video } from "../../../src/remotion/Video";

/**
 * Vista previa en vivo con el mismo componente que se renderiza (Remotion Player).
 * Sin audio: los tiempos de las palabras se simulan.
 */
export const VistaPrevia: React.FC<{ escenas: Escena[]; marca: MarcaVisual; autoPlay?: boolean }> = ({ escenas, marca, autoPlay = true }) => {
  const props = useMemo<VideoProps>(
    () => ({ marca, escenas: escenas.map(aRender), musicaSrc: null, volumenMusica: 0, sfxSrc: null, paginaSubtitulosMs: 1200 }),
    [escenas, marca],
  );
  const duracion = duracionTotalFrames(props.escenas.map((e) => e.duracionFrames));
  return (
    <div className="vista-previa">
      <Player
        component={Video}
        inputProps={props}
        durationInFrames={Math.max(1, duracion)}
        compositionWidth={ANCHO}
        compositionHeight={ALTO}
        fps={FPS}
        style={{ width: "100%", aspectRatio: "9 / 16" }}
        controls
        loop
        autoPlay={autoPlay}
        // arrancar un poco adentro de la primera escena (en el frame 0 todavía no entró nada)
        initialFrame={Math.min(20, Math.max(0, duracion - 1))}
        acknowledgeRemotionLicense
      />
    </div>
  );
};
