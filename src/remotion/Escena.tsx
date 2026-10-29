import { Audio } from "@remotion/media";
import { AbsoluteFill } from "remotion";
import type { EscenaRender } from "../shared/render";
import { EscenaContext, useMarca } from "./contexto";
import { PLANTILLAS_MARCA } from "./marca/plantillasMarca";
import { Marcador } from "./marca/piezas";
import { avance, FUENTE_DATOS } from "./marca/base";
import { useCurrentFrame } from "remotion";

/** La fecha que se sacó de un título, en Plex Mono gris (debajo del contenido, arriba de los subtítulos). */
const FechaSuelta: React.FC<{ fecha: string }> = ({ fecha }) => {
  const frame = useCurrentFrame();
  const { kit } = useMarca();
  return <div style={{ position: "absolute", left: 80, top: 1084, fontFamily: FUENTE_DATOS, fontSize: 30, letterSpacing: "0.05em", color: kit?.colores.secundario, opacity: avance(frame, 10, 10) }}>{fecha}</div>;
};
import { Decoracion } from "./global/Decoracion";
import { Subtitulos } from "./global/Subtitulos";
import { Escenario } from "./plantillas/comun";
import { resolverPlantilla } from "./plantillas/registry";

/**
 * Una escena = 3 capas en movimiento: decoración de fondo propia, la plantilla (dentro de la "cámara"
 * que hace zoom lento y la salida) y los subtítulos sincronizados con la voz.
 */
export const Escena: React.FC<{ escena: EscenaRender; paginaMs: number; indice: number; etiqueta?: string }> = ({ escena, paginaMs, indice, etiqueta }) => {
  const resuelta = resolverPlantilla(escena);
  const { kit } = useMarca();
  // con kit de marca, algunas plantillas tienen su versión de marca (tarjeta, destacado, ícono, cierre)
  const Marca = kit && resuelta.nombre === escena.plantilla ? PLANTILLAS_MARCA[resuelta.nombre] : undefined;
  const Comp = Marca ?? resuelta.Comp;
  const { props } = resuelta;
  return (
    <EscenaContext.Provider
      value={{ captions: escena.captions, enfasis: escena.palabras_enfasis, duracionFrames: escena.duracionFrames, indice, icono: escena.emoji_o_icono, etiqueta }}
    >
      <AbsoluteFill>
        {kit ? null : <Decoracion />}
        <Escenario>
          <Comp {...props} />
        </Escenario>
        {/* la primera escena de cada bloque editorial lleva su marcador (las de marca lo dibujan adentro) */}
        {etiqueta && (!Marca || resuelta.nombre === "cierre_cta") ? <Marcador etiqueta={etiqueta} x={80} y={116} tam={30} /> : null}
        {kit && escena.fechaMarca ? <FechaSuelta fecha={escena.fechaMarca} /> : null}
        <Subtitulos paginaMs={paginaMs} />
        {escena.audioSrc ? <Audio name="Voz" src={escena.audioSrc} /> : null}
      </AbsoluteFill>
    </EscenaContext.Provider>
  );
};
