import type { Caption } from "@remotion/captions";
import { useMemo } from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import type { MaterialRender } from "../shared/crudo";
import { SUBTITULOS, SUBTITULOS_Y, type MarcaVisual } from "../shared/render";
import { EscenaContext, MarcaContext } from "./contexto";
import { useFuentesListas } from "./fuentes";
import { MarcaAgua } from "./global/MarcaAgua";
import { FRAMES_PLACA_SEGUIR, PlacaSeguir } from "./global/PlacaSeguir";
import { Subtitulos } from "./global/Subtitulos";
import { MaterialCrudo } from "./MaterialCrudo";

export type DemoPerfilProps = { marca: MarcaVisual };

const FRASE = "Así se ven tus subtítulos y tus noticias con este perfil";
const MS_SUBS = 2600;
const MS_NOTICIA = 2400;
export const FRAMES_DEMO_PERFIL = Math.round(((MS_SUBS + MS_NOTICIA) / 1000) * 30) + FRAMES_PLACA_SEGUIR;

/** Captura de noticia inventada (SVG), para ver el resaltador y la etiqueta del medio con los colores del perfil. */
const NOTICIA_DEMO = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="520"><rect width="900" height="520" fill="#fff"/><text x="40" y="70" font-family="Arial" font-size="22" fill="#b00" font-weight="700">ACTUALIDAD</text><text x="40" y="140" font-family="Georgia" font-size="52" font-weight="700" fill="#111">Así se ve una noticia</text><text x="40" y="205" font-family="Georgia" font-size="52" font-weight="700" fill="#111">con la frase resaltada</text><text x="40" y="290" font-family="Arial" font-size="28" fill="#444">La captura del titular entra desde abajo y un</text><text x="40" y="330" font-family="Arial" font-size="28" fill="#444">resaltador pinta la frase clave con el color</text><text x="40" y="370" font-family="Arial" font-size="28" fill="#444">principal del perfil.</text></svg>`,
)}`;

/** Fondo que hace de "video": un degradé con una silueta, para ver cómo contrastan los subtítulos. */
const FondoFalso: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "linear-gradient(160deg, #5b6470 0%, #2c3138 55%, #15181c 100%)" }}>
      <div style={{ position: "absolute", left: 340 + Math.sin(frame / 30) * 8, top: 380, width: 400, height: 480, borderRadius: "50% 50% 46% 46%", background: "#8a7b6e", opacity: 0.55, filter: "blur(6px)" }} />
      <div style={{ position: "absolute", left: 200, top: 820, width: 680, height: 1100, borderRadius: "48% 48% 0 0", background: "#3b4a5c", opacity: 0.7, filter: "blur(6px)" }} />
    </AbsoluteFill>
  );
};

/** Vista previa en vivo de un perfil: subtítulo, tarjeta de noticia y placa "Seguir" con su paleta y tipografía. */
export const DemoPerfil: React.FC<DemoPerfilProps> = ({ marca }) => {
  const fuentesListas = useFuentesListas();
  const escena = useMemo(() => {
    const palabras = FRASE.split(" ");
    const paso = MS_SUBS / palabras.length;
    const captions: Caption[] = palabras.map((p, i) => ({ text: i ? ` ${p}` : p, startMs: i * paso, endMs: (i + 1) * paso, timestampMs: null, confidence: 1 }));
    return { captions, enfasis: ["noticias"], duracionFrames: FRAMES_DEMO_PERFIL, indice: 0 };
  }, []);
  const noticia: MaterialRender = {
    tipo: "noticia",
    desdeMs: MS_SUBS,
    hastaMs: MS_SUBS + MS_NOTICIA,
    imagen: NOTICIA_DEMO,
    medio: "El Diario",
    fecha: "2026-10-26",
    titulo: "Así se ve una noticia",
    resaltado: "con la frase resaltada",
    rects: [{ x: 0.04, y: 0.31, w: 0.58, h: 0.12 }],
    proporcion: 900 / 520,
  };
  const inicioPlaca = Math.round(((MS_SUBS + MS_NOTICIA) / 1000) * 30);
  return (
    <MarcaContext.Provider value={marca}>
      <EscenaContext.Provider value={escena}>
        <AbsoluteFill>
          <FondoFalso />
          {fuentesListas ? <MaterialCrudo material={[noticia]} limiteAbajo={SUBTITULOS_Y - SUBTITULOS.alto / 2 - 20} /> : null}
          {fuentesListas ? (
            <Sequence durationInFrames={inicioPlaca}>
              <Subtitulos paginaMs={1200} />
              <MarcaAgua />
            </Sequence>
          ) : null}
          {fuentesListas ? (
            <Sequence from={inicioPlaca} durationInFrames={FRAMES_PLACA_SEGUIR}>
              <PlacaSeguir />
            </Sequence>
          ) : null}
        </AbsoluteFill>
      </EscenaContext.Provider>
    </MarcaContext.Provider>
  );
};
