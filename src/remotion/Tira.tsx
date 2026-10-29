import { AbsoluteFill, Freeze } from "remotion";
import { ALTO, ANCHO, type VideoProps } from "../shared/render";
import { Video } from "./Video";

export const TIRA_ESCALA = 1 / 3;
export const TIRA_SEPARACION = 8;
export const anchoTira = (n: number) => Math.round(n * ANCHO * TIRA_ESCALA + (n - 1) * TIRA_SEPARACION);
export const ALTO_TIRA = Math.round(ALTO * TIRA_ESCALA);

export type TiraProps = { video: VideoProps; frames: number[] };

/** Varios momentos del mismo video lado a lado (para verificar que las plantillas se mueven). */
export const Tira: React.FC<TiraProps> = ({ video, frames }) => (
  <AbsoluteFill style={{ backgroundColor: "#fff", flexDirection: "row", gap: TIRA_SEPARACION }}>
    {frames.map((f, i) => (
      <div key={i} style={{ position: "relative", width: ANCHO * TIRA_ESCALA, height: ALTO_TIRA, overflow: "hidden", flexShrink: 0 }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: ANCHO, height: ALTO, scale: TIRA_ESCALA, transformOrigin: "0 0" }}>
          <Freeze frame={f}>
            <Video {...video} />
          </Freeze>
        </div>
      </div>
    ))}
  </AbsoluteFill>
);
