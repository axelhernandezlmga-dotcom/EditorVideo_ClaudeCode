import { Easing, interpolate } from "remotion";
import type { z } from "zod";
import { CAJA_CONTENIDO } from "../../shared/render";
import type { PropsPorPlantilla } from "../../shared/schemas";
import { Icono } from "../iconos/Icono";
import { ajustarTexto } from "../texto";
import { CLAMP, decimalesDe, Destello, formatear, TituloPildora, useTiempo, useTipo, useResorte } from "./comun";

type Props = z.infer<typeof PropsPorPlantilla.comparacion>;
type Lado = Props["a"];

const ANCHO_COL = 360;
const ALTO_BARRA_MAX = 400;

/**
 * A vs B: cada lado entra desde su borde, el "VS" cae en el medio, las barras crecen hasta su valor
 * (cuando la voz nombra cada lado) y al final el ganador se resalta con un trofeo; el otro se apaga.
 */
export const Comparacion: React.FC<Props> = ({ titulo, a, b, unidad, ganador }) => {
  const spring = useResorte();
  const { frame, fps, dur, frameDe } = useTiempo();
  const t = useTipo();
  const conValores = a.valor !== undefined && b.valor !== undefined;
  const max = Math.max(a.valor ?? 0, b.valor ?? 0, 1e-9);
  const lider: "a" | "b" | null = ganador ?? (conValores && a.valor !== b.valor ? ((a.valor ?? 0) > (b.valor ?? 0) ? "a" : "b") : null);

  // cada barra crece cuando la voz nombra a ese lado (o escalonado si no lo encuentra)
  const crecerA = Math.min(frameDe(a.etiqueta, 14), dur * 0.35);
  const crecerB = Math.max(crecerA + 6, Math.min(frameDe(b.etiqueta, crecerA + 12), dur * 0.5));
  const duracionCrecer = Math.round(fps * 1.1);
  const finBarras = crecerB + duracionCrecer;
  const momentoGanador = Math.min(finBarras + 6, dur * 0.72);

  const vs = spring({ frame: frame - 10, fps, config: { damping: 7, stiffness: 160 } });
  const altoTitulo = titulo ? 100 : 0;

  const columna = (lado: Lado, id: "a" | "b", desdeIzq: boolean) => {
    const entrada = spring({ frame: frame - (desdeIzq ? 0 : 5), fps, config: { damping: 14, mass: 0.7 } });
    const inicio = id === "a" ? crecerA : crecerB;
    const crec = interpolate(frame, [inicio, inicio + duracionCrecer], [0, 1], { ...CLAMP, easing: Easing.out(Easing.back(1.4)) });
    const esLider = lider === id;
    const gano = frame >= momentoGanador && lider !== null;
    const resalte = gano ? spring({ frame: frame - momentoGanador, fps, config: { damping: 10 } }) : 0;
    const color = id === "a" ? t.colores.acento : t.colores.acento2;
    const alto = conValores ? Math.max(14, (ALTO_BARRA_MAX * (lado.valor ?? 0)) / max) * crec : 0;
    const etiquetaFs = ajustarTexto({ text: lado.etiqueta, ancho: ANCHO_COL - 20, alto: 120, fontFamily: t.fuente, fontWeight: t.fuerte, maxFont: 60, maxLineas: 2 }).fontSize;
    const dec = Math.max(decimalesDe(a.valor ?? 0), decimalesDe(b.valor ?? 0));
    return (
      <div
        style={{
          width: ANCHO_COL,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 14,
          translate: `${interpolate(entrada, [0, 1], [desdeIzq ? -700 : 700, 0])}px 0`,
          opacity: gano && !esLider ? interpolate(resalte, [0, 1], [1, 0.45]) : 1,
          scale: gano && esLider ? 1 + 0.06 * resalte : 1,
        }}
      >
        {conValores ? (
          <>
            <div style={{ position: "relative", height: 90, display: "flex", alignItems: "flex-end" }}>
              {gano && esLider ? (
                <div style={{ position: "absolute", left: "50%", top: -100, translate: "-50% 0", scale: resalte, rotate: `${8 * Math.sin(frame / 6)}deg` }}>
                  <Icono nombre="trophy" tam={90} color={t.colores.acento} grosor={2.4} dibujo={resalte * 1.4} />
                </div>
              ) : null}
              <div style={{ fontFamily: t.fuente, fontWeight: t.fuerte, fontSize: 76, color: t.colores.texto, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", opacity: crec > 0 ? 1 : 0 }}>
                {formatear((lado.valor ?? 0) * Math.min(1, crec), dec)}
                <span style={{ fontSize: 44, color }}>{unidad ?? ""}</span>
              </div>
            </div>
            <div
              style={{
                width: 190,
                height: alto,
                borderRadius: "22px 22px 8px 8px",
                background: `linear-gradient(180deg, ${color}, ${color}99)`,
                boxShadow: gano && esLider ? `0 0 ${50 * resalte}px ${color}` : `0 10px 30px rgba(0,0,0,0.3)`,
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* brillo que recorre la barra mientras crece */}
              <div style={{ position: "absolute", left: 0, right: 0, height: 60, top: `${interpolate(frame % 40, [0, 40], [110, -40])}%`, background: "linear-gradient(180deg, transparent, rgba(255,255,255,0.35), transparent)" }} />
            </div>
          </>
        ) : null}
        <div style={{ fontFamily: t.fuente, fontWeight: t.fuerte, fontSize: etiquetaFs, lineHeight: 1.05, color: conValores ? t.colores.texto : color, textTransform: "uppercase", minHeight: 70, display: "flex", alignItems: "center", textAlign: "center" }}>
          {lado.etiqueta}
        </div>
        {lado.texto ? (
          <div style={{ fontFamily: t.fuente, fontWeight: t.medio, fontSize: 36, lineHeight: 1.15, color: `${t.colores.texto}CC`, textAlign: "center", opacity: interpolate(frame, [inicio, inicio + 10], [0, 1], CLAMP) }}>
            {lado.texto}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div style={{ position: "absolute", left: CAJA_CONTENIDO.x, top: CAJA_CONTENIDO.y, width: CAJA_CONTENIDO.ancho, height: CAJA_CONTENIDO.alto }}>
      <div style={{ position: "absolute", top: 0, width: "100%", display: "flex", justifyContent: "center" }}>
        <TituloPildora texto={titulo} />
      </div>
      <div style={{ position: "absolute", top: altoTitulo + 20, bottom: 0, left: 0, right: 0, display: "flex", justifyContent: "space-between" }}>
        {columna(a, "a", true)}
        {columna(b, "b", false)}
      </div>
      {/* línea base */}
      {conValores ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 96 + (a.texto || b.texto ? 90 : 0),
            height: 4,
            backgroundColor: `${t.colores.texto}33`,
            scale: `${interpolate(frame, [4, 18], [0, 1], CLAMP)} 1`,
          }}
        />
      ) : null}
      {/* VS */}
      <div
        style={{
          position: "absolute",
          left: CAJA_CONTENIDO.ancho / 2 - 70,
          top: altoTitulo + (conValores ? 170 : CAJA_CONTENIDO.alto / 2 - 120),
          width: 140,
          height: 140,
          borderRadius: "50%",
          backgroundColor: t.colores.texto,
          color: t.colores.fondo,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: t.fuente,
          fontWeight: t.fuerte,
          fontSize: 60,
          scale: vs * (1 + 0.07 * Math.sin(frame / 5)),
          rotate: `${interpolate(vs, [0, 1], [-200, 0]) + 5 * Math.sin(frame / 11)}deg`,
          boxShadow: `0 0 40px ${t.colores.acento}66`,
        }}
      >
        VS
      </div>
      {lider ? <Destello en={momentoGanador} radio={240} color={t.colores.acento} x={lider === "a" ? ANCHO_COL / 2 : CAJA_CONTENIDO.ancho - ANCHO_COL / 2} y="40%" /> : null}
    </div>
  );
};
