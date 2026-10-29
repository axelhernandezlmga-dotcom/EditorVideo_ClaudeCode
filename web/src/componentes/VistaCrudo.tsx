import { Player, type PlayerRef } from "@remotion/player";
import { useEffect, useRef } from "react";
import { aEditadoCercano, aOriginal } from "../../../src/shared/cortes";
import { framesCrudo, type CrudoProps } from "../../../src/shared/crudo";
import { ALTO, ANCHO, FPS } from "../../../src/shared/render";
import { Crudo } from "../../../src/remotion/Crudo";

/**
 * Vista previa con el mismo componente que se renderiza (Remotion Player), sobre el proxy de 720p.
 * `onTiempo` avisa el momento del ORIGINAL que se está viendo; `irA` salta a un momento del original.
 */
export const VistaCrudo: React.FC<{ props: CrudoProps; onTiempo: (ms: number | null) => void; irA: React.RefObject<(ms: number) => void> }> = ({ props, onTiempo, irA }) => {
  const player = useRef<PlayerRef>(null);
  const duracion = framesCrudo(props.tramos, FPS, Boolean(props.cierre?.placa));
  const tramos = useRef(props.tramos);
  tramos.current = props.tramos;

  irA.current = (ms) => {
    const p = player.current;
    if (!p) return;
    p.seekTo(Math.min(duracion - 1, Math.round((aEditadoCercano(tramos.current, ms) / 1000) * FPS)));
    p.play();
  };

  useEffect(() => {
    const p = player.current;
    if (!p) return;
    const alCambiar = (e: { detail: { frame: number } }) => onTiempo(aOriginal(tramos.current, (e.detail.frame / FPS) * 1000));
    p.addEventListener("frameupdate", alCambiar);
    return () => p.removeEventListener("frameupdate", alCambiar);
  }, [onTiempo]);

  return (
    <div className="tarjeta vista-cortada">
      <div className="marco">
        <Player
          ref={player}
          component={Crudo}
          inputProps={props}
          durationInFrames={Math.max(1, duracion)}
          compositionWidth={ANCHO}
          compositionHeight={ALTO}
          fps={FPS}
          style={{ width: "100%", height: "100%" }}
          controls
          clickToPlay
          acknowledgeRemotionLicense
        />
      </div>
      <p className="ayuda" style={{ margin: "10px 0 0" }}>
        {(duracion / FPS).toFixed(1)} s · {props.tramos.length} tramos · {props.material.length} en pantalla · {props.sfx.length} efectos
      </p>
    </div>
  );
};
