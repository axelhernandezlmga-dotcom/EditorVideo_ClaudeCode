import { Easing, interpolate } from "remotion";
import type { z } from "zod";
import { CAJA_CONTENIDO, ZONA_TEXTO } from "../../shared/render";
import type { PropsPorPlantilla } from "../../shared/schemas";
import { useEscena } from "../contexto";
import { Icono } from "../iconos/Icono";
import { CLAMP, framesDePalabras, TextoCinetico, useEntrada, useTiempo, useTipo } from "./comun";

/**
 * Titular: las palabras entran a medida que se dicen, las de énfasis se subrayan.
 * Arriba un ícono (o una barra de acento) y, cuando terminó la frase, una barra que se dibuja + el subtítulo.
 */
export const Titular: React.FC<z.infer<typeof PropsPorPlantilla.titular>> = ({ texto, subtitulo }) => {
  const { frame, fps, dur } = useTiempo();
  const { icono, captions } = useEscena();
  const t = useTipo();
  const palabras = texto.split(/\s+/).filter(Boolean);
  const hasta = dur * 0.6;
  const ultima = framesDePalabras(palabras, captions, fps, 0, hasta).at(-1) ?? 0;
  const finTexto = ultima + 8;
  const barra = interpolate(frame, [finTexto, finTexto + 12], [0, 1], { ...CLAMP, easing: Easing.out(Easing.cubic) });
  const sub = useEntrada(finTexto + 4);
  const ic = useEntrada(0, 9);
  const altoTexto = ZONA_TEXTO.alto;

  return (
    <>
      {/* ícono o marca de acento, en la franja de arriba (15–25 %) */}
      <div
        style={{
          position: "absolute",
          left: CAJA_CONTENIDO.x,
          width: CAJA_CONTENIDO.ancho,
          top: CAJA_CONTENIDO.y,
          height: ZONA_TEXTO.y - CAJA_CONTENIDO.y - 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icono ? (
          <div style={{ scale: ic, rotate: `${interpolate(ic, [0, 1], [-25, 0]) + 6 * Math.sin(frame / 9)}deg`, translate: `0 ${8 * Math.sin(frame / 7)}px` }}>
            <Icono nombre={icono} tam={150} color={t.colores.acento} dibujo={interpolate(frame, [2, 22], [0, 1], CLAMP)} grosor={2.2} />
          </div>
        ) : (
          <div style={{ display: "flex", gap: 14 }}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  backgroundColor: i === 1 ? t.colores.acento2 : t.colores.acento,
                  scale: entradaPunto(frame, i) * (1 + 0.25 * Math.sin(frame / 6 + i * 1.3)),
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* texto principal (25–45 %) */}
      <div
        style={{
          position: "absolute",
          left: CAJA_CONTENIDO.x,
          width: CAJA_CONTENIDO.ancho,
          top: ZONA_TEXTO.y,
          height: altoTexto,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          rotate: `${interpolate(frame, [0, dur], [-1.2, 1.2])}deg`,
          // el bloque entero flota y "respira" (escalar el bloque no pega palabras: el gap escala igual)
          scale: 1 + 0.025 * Math.sin(frame / 11),
          translate: `0 ${10 * Math.sin(frame / 15)}px`,
        }}
      >
        <TextoCinetico texto={texto} alto={altoTexto} maxFont={124} maxLineas={4} mayusculas hasta={hasta} />
      </div>

      {/* barra que se dibuja al terminar + subtítulo */}
      <div
        style={{
          position: "absolute",
          left: CAJA_CONTENIDO.x,
          width: CAJA_CONTENIDO.ancho,
          top: ZONA_TEXTO.y + altoTexto + 16,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 22,
        }}
      >
        <div style={{ height: 10, width: 420 * barra, borderRadius: 5, background: `linear-gradient(90deg, ${t.colores.acento}, ${t.colores.acento2})` }} />
        {subtitulo ? (
          <div style={{ opacity: sub, translate: `0 ${interpolate(sub, [0, 1], [40, 0])}px` }}>
            <TextoCinetico
              texto={subtitulo}
              alto={CAJA_CONTENIDO.y + CAJA_CONTENIDO.alto - (ZONA_TEXTO.y + altoTexto + 60)}
              maxFont={54}
              maxLineas={3}
              peso="medio"
              color={`${t.colores.texto}D9`}
              desde={finTexto + 4}
              sincronizar={false}
            />
          </div>
        ) : null}
      </div>
    </>
  );
};

const entradaPunto = (frame: number, i: number) => interpolate(frame, [i * 4, i * 4 + 10], [0, 1], { ...CLAMP, easing: Easing.out(Easing.back(3)) });
