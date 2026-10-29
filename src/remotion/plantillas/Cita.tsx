import { Easing, interpolate } from "remotion";
import type { z } from "zod";
import { CAJA_CONTENIDO, ZONA_TEXTO } from "../../shared/render";
import type { PropsPorPlantilla } from "../../shared/schemas";
import { useEscena } from "../contexto";
import { CLAMP, framesDePalabras, TextoCinetico, useTiempo, useTipo, useResorte } from "./comun";

const iniciales = (autor: string) =>
  autor
    .split(/\s+/)
    .filter((p) => /^\p{Lu}/u.test(p))
    .slice(0, 2)
    .map((p) => p[0])
    .join("") || autor.slice(0, 1).toUpperCase();

/**
 * Cita: unas comillas gigantes caen girando, la frase se escribe al ritmo de la voz, una barra lateral
 * crece con la lectura y al final entra el autor con su "avatar" de iniciales.
 */
export const Cita: React.FC<z.infer<typeof PropsPorPlantilla.cita>> = ({ texto, autor, fecha }) => {
  const spring = useResorte();
  const { frame, fps, dur } = useTiempo();
  const { captions } = useEscena();
  const t = useTipo();
  const comillas = spring({ frame, fps, config: { damping: 9, mass: 0.8 } });
  const palabras = texto.split(/\s+/).filter(Boolean);
  const hasta = dur * 0.62;
  const apariciones = framesDePalabras(palabras, captions, fps, 6, hasta);
  const finTexto = (apariciones.at(-1) ?? 0) + 6;
  const leidas = apariciones.filter((f) => frame >= f).length / Math.max(1, palabras.length);
  const autorIn = spring({ frame: frame - finTexto, fps, config: { damping: 12 } });
  const linea = interpolate(frame, [finTexto, finTexto + 12], [0, 1], { ...CLAMP, easing: Easing.out(Easing.cubic) });
  const altoTexto = ZONA_TEXTO.y + ZONA_TEXTO.alto + 60 - CAJA_CONTENIDO.y - 120;

  return (
    <div style={{ position: "absolute", left: CAJA_CONTENIDO.x, top: CAJA_CONTENIDO.y, width: CAJA_CONTENIDO.ancho, height: CAJA_CONTENIDO.alto }}>
      <div
        style={{
          position: "absolute",
          left: -10,
          top: -60,
          fontFamily: "Georgia, serif",
          fontSize: 360,
          lineHeight: 1,
          color: t.colores.acento,
          opacity: 0.9 * comillas,
          scale: interpolate(comillas, [0, 1], [2.2, 1]),
          rotate: `${interpolate(comillas, [0, 1], [-40, 0]) + 4 * Math.sin(frame / 14)}deg`,
          translate: `0 ${10 * Math.sin(frame / 10)}px`,
          textShadow: `0 0 50px ${t.colores.acento}66`,
        }}
      >
        “
      </div>
      {/* barra que crece a medida que se lee la cita */}
      <div style={{ position: "absolute", left: 6, top: 130, width: 12, height: altoTexto * interpolate(leidas, [0, 1], [0, 1]), borderRadius: 6, background: `linear-gradient(180deg, ${t.colores.acento}, ${t.colores.acento2})` }} />
      <div style={{ position: "absolute", left: 50, top: 120, width: CAJA_CONTENIDO.ancho - 50, height: altoTexto, display: "flex", alignItems: "center" }}>
        <TextoCinetico texto={texto} ancho={CAJA_CONTENIDO.ancho - 50} alto={altoTexto} maxFont={76} maxLineas={6} peso="fuerte" alinear="left" desde={6} hasta={hasta} interlineado={1.18} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 50,
          top: 120 + altoTexto + 30,
          display: "flex",
          alignItems: "center",
          gap: 26,
          opacity: autorIn,
          translate: `${interpolate(autorIn, [0, 1], [120, 0])}px 0`,
        }}
      >
        <div
          style={{
            width: 104,
            height: 104,
            borderRadius: "50%",
            background: `linear-gradient(135deg, ${t.colores.acento}, ${t.colores.acento2})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: t.fuente,
            fontWeight: t.fuerte,
            fontSize: 44,
            color: t.colores.fondo,
            scale: autorIn,
            rotate: `${interpolate(autorIn, [0, 1], [-90, 0])}deg`,
            boxShadow: `0 0 ${20 + 10 * Math.sin(frame / 6)}px ${t.colores.acento}66`,
          }}
        >
          {iniciales(autor)}
        </div>
        <div>
          <div style={{ height: 6, width: 120 * linea, backgroundColor: t.colores.acento, borderRadius: 3, marginBottom: 12 }} />
          <div style={{ fontFamily: t.fuente, fontWeight: t.fuerte, fontSize: 46, color: t.colores.texto, lineHeight: 1.1 }}>{autor}</div>
          {fecha ? <div style={{ fontFamily: t.fuente, fontWeight: t.medio, fontSize: 34, color: `${t.colores.texto}AA`, marginTop: 6 }}>{fecha}</div> : null}
        </div>
      </div>
    </div>
  );
};
