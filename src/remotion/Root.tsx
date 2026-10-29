import { Composition, type CalculateMetadataFunction } from "remotion";
import { framesCrudo, type CrudoProps } from "../shared/crudo";
import { Crudo } from "./Crudo";
import { DemoPerfil, FRAMES_DEMO_PERFIL } from "./DemoPerfil";
import { ALTO, ANCHO, duracionVideo, FPS, FRAME_PORTADA, type PortadaProps, type VideoProps } from "../shared/render";
import { ejemploCrudo, ejemploPortada, ejemploVideo } from "./ejemplo";
import { Portada } from "./Portada";
import { ALTO_TIRA, anchoTira, Tira, type TiraProps } from "./Tira";
import { Video } from "./Video";
import { Hoja, medidasHoja, type HojaProps } from "./ilustracion/Hoja";
import { FRAMES_HOJA_MARCA, HojaMarca, type HojaMarcaProps } from "./marca/HojaMarca";

// la duración tiene que cubrir el frame más alto: `Freeze` no puede ir más allá del final de la composición
const medidasTira: CalculateMetadataFunction<TiraProps> = ({ props }) => ({
  width: anchoTira(props.frames.length),
  height: ALTO_TIRA,
  durationInFrames: Math.max(1, ...props.frames) + 1,
});

const duracionCrudo: CalculateMetadataFunction<CrudoProps> = ({ props }) => ({ durationInFrames: framesCrudo(props.tramos, FPS, Boolean(props.cierre?.placa)) });

const calcularDuracion: CalculateMetadataFunction<VideoProps> = ({ props }) => ({
  durationInFrames: duracionVideo(props),
});

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Video"
      component={Video}
      width={ANCHO}
      height={ALTO}
      fps={FPS}
      durationInFrames={300}
      defaultProps={ejemploVideo}
      calculateMetadata={calcularDuracion}
    />
    {/* Video grabado por vos, ya cortado y vestido ("Editar crudo") */}
    <Composition id="Crudo" component={Crudo} width={ANCHO} height={ALTO} fps={FPS} durationInFrames={300} defaultProps={ejemploCrudo} calculateMetadata={duracionCrudo} />
    {/* Vista previa de un perfil: subtítulo, noticia y placa "Seguir" */}
    <Composition id="DemoPerfil" component={DemoPerfil} width={ANCHO} height={ALTO} fps={FPS} durationInFrames={FRAMES_DEMO_PERFIL} defaultProps={{ marca: ejemploVideo.marca }} />
    {/* La portada se renderiza en el frame FRAME_PORTADA: ahí las animaciones de entrada de la escena ya terminaron */}
    <Composition id="Portada" component={Portada} width={ANCHO} height={ALTO} fps={FPS} durationInFrames={FRAME_PORTADA + 1} defaultProps={ejemploPortada satisfies PortadaProps} />
    <Composition id="Tira" component={Tira} width={anchoTira(4)} height={ALTO_TIRA} fps={FPS} durationInFrames={1} defaultProps={{ video: ejemploVideo, frames: [10, 40, 70, 95] } satisfies TiraProps} calculateMetadata={medidasTira} />
    {/* Hoja de marca en movimiento (perfiles con kit): todas las piezas de la marca animadas */}
    <Composition id="HojaMarca" component={HojaMarca} width={ANCHO} height={ALTO} fps={FPS} durationInFrames={FRAMES_HOJA_MARCA} defaultProps={{ marca: ejemploVideo.marca } satisfies HojaMarcaProps} />
    {/* Hojas de prueba y de catálogo de la biblioteca de ilustración */}
    <Composition
      id="HojaIlustracion"
      component={Hoja}
      width={800}
      height={600}
      fps={FPS}
      durationInFrames={1}
      defaultProps={{ secciones: [{ celdas: [{ tipo: "personaje", id: "jubilado", estilo: "plano", frame: 10, accion: "hablar" }], columnas: 1, ancho: 400, alto: 460 }] } satisfies HojaProps}
      calculateMetadata={medidasHoja}
    />
  </>
);
