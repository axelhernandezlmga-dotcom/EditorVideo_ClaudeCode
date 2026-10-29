import { AbsoluteFill, interpolate, OffthreadVideo } from "remotion";
import type { z } from "zod";
import { CAJA_CONTENIDO, ZONA_TEXTO } from "../../shared/render";
import type { PropsPorPlantilla } from "../../shared/schemas";
import { useEscena } from "../contexto";
import { StockVideo } from "./StockVideo";
import { TextoCinetico, useEntrada, useTiempo } from "./comun";

type Props = z.infer<typeof PropsPorPlantilla.clip_biblioteca> & { src?: string | null };

/**
 * Clip de la Biblioteca (un clip propio, de un noticiero o un meme), ya cortado a 9:16 y sin audio: entra con un
 * zoom lento y, si tiene, un título corto arriba. Si el clip ya no está, la animación de fondo de siempre.
 */
export const ClipBiblioteca: React.FC<Props> = ({ texto, src }) => {
  const { frame, dur } = useTiempo();
  const { indice } = useEscena();
  const placa = useEntrada(4, 12);
  if (!src) return <StockVideo texto={texto ?? "…"} icono="clapperboard" />;
  const zoom = interpolate(frame, [0, dur], [1.02, 1.1]);
  const pan = interpolate(frame, [0, dur], [-14, 14]) * (indice % 2 ? 1 : -1);
  return (
    <>
      <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#000" }}>
        <OffthreadVideo src={src} muted style={{ width: "100%", height: "100%", objectFit: "cover", scale: String(zoom), translate: `${pan}px 0` }} />
      </AbsoluteFill>
      {texto ? (
        <div style={{ position: "absolute", left: CAJA_CONTENIDO.x - 10, top: ZONA_TEXTO.y - 20, width: CAJA_CONTENIDO.ancho + 20, padding: "18px 24px", borderRadius: 28, backgroundColor: "rgba(0,0,0,0.5)", opacity: placa, scale: `1 ${placa}` }}>
          <TextoCinetico texto={texto} alto={150} maxFont={72} maxLineas={2} mayusculas desde={6} />
        </div>
      ) : null}
    </>
  );
};
