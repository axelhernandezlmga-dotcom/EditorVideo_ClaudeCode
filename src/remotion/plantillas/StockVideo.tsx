import { Video } from "@remotion/media";
import { AbsoluteFill, interpolate, random } from "remotion";
import type { z } from "zod";
import { ANCHO, CAJA_CONTENIDO, ZONA_TEXTO } from "../../shared/render";
import type { PropsPorPlantilla } from "../../shared/schemas";
import { useEscena } from "../contexto";
import { Icono } from "../iconos/Icono";
import { CLAMP, TextoCinetico, useEntrada, useTiempo, useTipo } from "./comun";

type Props = z.infer<typeof PropsPorPlantilla.stock_video> & { src?: string | null; icono?: string };

/** Texto sobre el video, en la franja 25–45 %, con una placa oscura que se despliega. */
const TextoSobreFondo: React.FC<{ texto: string; subtitulo?: string }> = ({ texto, subtitulo }) => {
  const { dur } = useTiempo();
  const t = useTipo();
  const placa = useEntrada(0, 16);
  const sub = useEntrada(Math.round(dur * 0.4));
  return (
    <div
      style={{
        position: "absolute",
        left: CAJA_CONTENIDO.x - 20,
        top: ZONA_TEXTO.y - 30,
        width: CAJA_CONTENIDO.ancho + 40,
        minHeight: ZONA_TEXTO.alto + 60,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
      }}
    >
      <div style={{ position: "absolute", inset: 0, borderRadius: 36, backgroundColor: "rgba(0,0,0,0.42)", backdropFilter: "blur(6px)", scale: `1 ${placa}` }} />
      <div style={{ position: "relative" }}>
        <TextoCinetico texto={texto} alto={subtitulo ? ZONA_TEXTO.alto - 70 : ZONA_TEXTO.alto} maxFont={110} maxLineas={3} mayusculas desde={4} />
      </div>
      {subtitulo ? (
        <div style={{ position: "relative", opacity: sub, translate: `0 ${interpolate(sub, [0, 1], [30, 0])}px` }}>
          <TextoCinetico texto={subtitulo} alto={90} maxFont={46} maxLineas={2} peso="medio" color={`${t.colores.texto}DD`} sincronizar={false} desde={Math.round(dur * 0.4)} />
        </div>
      ) : null}
    </div>
  );
};

/**
 * Video de stock: clip vertical de Pexels con efecto Ken Burns (zoom + paneo) y oscurecido;
 * sin clip, un fondo animado con capas de íconos en paralaje y una luz que barre.
 */
export const StockVideo: React.FC<Props> = ({ texto, subtitulo, src, icono }) => {
  const { frame, dur } = useTiempo();
  const { indice } = useEscena();
  const sentido = indice % 2 ? 1 : -1;
  const zoom = interpolate(frame, [0, dur], [1.12, 1.32]);
  const pan = interpolate(frame, [0, dur], [-40, 40]) * sentido;

  if (src) {
    return (
      <>
        <AbsoluteFill style={{ overflow: "hidden" }}>
          <AbsoluteFill style={{ scale: zoom, translate: `${pan}px ${pan * 0.4}px` }}>
            <Video src={src} muted loop style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </AbsoluteFill>
          <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 40%, rgba(0,0,0,0.55) 100%)" }} />
        </AbsoluteFill>
        <TextoSobreFondo texto={texto} subtitulo={subtitulo} />
      </>
    );
  }
  return (
    <>
      <FondoAnimado icono={icono ?? "sparkles"} zoom={zoom} pan={pan} />
      <TextoSobreFondo texto={texto} subtitulo={subtitulo} />
    </>
  );
};

const CAPAS = [0, 1, 2].map((capa) =>
  Array.from({ length: 7 }, (_, i) => ({
    x: random(`sx${capa}-${i}`) * ANCHO,
    y: 150 + random(`sy${capa}-${i}`) * 1500,
    rot: random(`sr${capa}-${i}`) * 60 - 30,
  })),
);

/** Fondo de respaldo: íconos en 3 capas de paralaje + ícono grande que se dibuja + barrido de luz. */
const FondoAnimado: React.FC<{ icono: string; zoom: number; pan: number }> = ({ icono, zoom, pan }) => {
  const { frame, dur } = useTiempo();
  const t = useTipo();
  const heroe = useEntrada(0, 10);
  const barrido = interpolate(frame % 50, [0, 50], [-0.4, 1.4]);
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill style={{ scale: zoom, translate: `${pan}px 0` }}>
        {CAPAS.map((items, capa) => {
          const vel = (capa + 1) * 0.9;
          const tam = 60 + capa * 40;
          return items.map((it, i) => (
            <div
              key={`${capa}-${i}`}
              style={{
                position: "absolute",
                left: it.x,
                top: it.y - frame * vel,
                rotate: `${it.rot + frame * (capa % 2 ? 0.4 : -0.4)}deg`,
                opacity: 0.1 + capa * 0.06,
              }}
            >
              <Icono nombre={icono} tam={tam} color={capa === 2 ? t.colores.acento : t.colores.texto} grosor={2} />
            </div>
          ));
        })}
        {/* ícono protagonista, entre el texto y los subtítulos (termina al 57 %) */}
        <div
          style={{
            position: "absolute",
            left: CAJA_CONTENIDO.x + CAJA_CONTENIDO.ancho / 2 - 100,
            top: ZONA_TEXTO.y + ZONA_TEXTO.alto + 30,
            scale: heroe,
            translate: `0 ${12 * Math.sin(frame / 10)}px`,
            rotate: `${5 * Math.sin(frame / 14)}deg`,
            filter: `drop-shadow(0 0 30px ${t.colores.acento}88)`,
          }}
        >
          <Icono nombre={icono} tam={200} color={t.colores.acento} grosor={1.8} dibujo={interpolate(frame, [4, 30], [0, 1], CLAMP)} relleno={`${t.colores.acento}1A`} />
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: `linear-gradient(115deg, transparent ${barrido * 100 - 12}%, ${t.colores.texto}14 ${barrido * 100}%, transparent ${barrido * 100 + 12}%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% ${interpolate(frame, [0, dur], [30, 60])}%, ${t.colores.acento2}22, transparent 60%)` }} />
    </AbsoluteFill>
  );
};
