import { AbsoluteFill, Easing, Img, interpolate } from "remotion";
import type { z } from "zod";
import { ANCHO, CAJA_CONTENIDO, SUBTITULOS, ZONA_SEGURA, ZONA_TEXTO } from "../../shared/render";
import type { MarcoFoto, PropsPorPlantilla } from "../../shared/schemas";
import { useEscena } from "../contexto";
import { CLAMP, TextoCinetico, useEntrada, useTiempo, useTipo } from "./comun";

type Foto = { src: string; credito: string | null };
type Props = z.infer<typeof PropsPorPlantilla.foto_real> & { src?: string | null; credito?: string | null; extras?: Foto[] };

/** Zona donde se compone la foto: entre la zona segura de arriba y los subtítulos (nunca los tapa). */
const ZONA = { arriba: ZONA_SEGURA.arriba, abajo: SUBTITULOS.y - 30 } as const;

/** Fondo de las composiciones: la misma foto desenfocada y oscurecida, con el degradé de la marca encima. */
const FondoFoto: React.FC<{ src: string }> = ({ src }) => {
  const t = useTipo();
  const { frame, dur } = useTiempo();
  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: t.colores.fondo }}>
      <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "blur(38px) saturate(1.2)", scale: String(interpolate(frame, [0, dur], [1.25, 1.35])), opacity: 0.55 }} />
      <AbsoluteFill style={{ background: `linear-gradient(160deg, ${t.colores.fondo}E6 0%, ${t.colores.fondo2}B3 60%, ${t.colores.fondo}F2 100%)` }} />
    </AbsoluteFill>
  );
};

/** Nombre (etiqueta de la marca) y dato debajo, en la posición que pida cada composición. */
const Rotulo: React.FC<{ texto: string; dato?: string; x: number; y: number; ancho: number; alinear?: "left" | "center" }> = ({ texto, dato, x, y, ancho, alinear = "left" }) => {
  const t = useTipo();
  const { dur } = useTiempo();
  const etiqueta = useEntrada(10, 14);
  const sub = useEntrada(Math.round(dur * 0.35));
  return (
    <div style={{ position: "absolute", left: x, top: y, width: ancho, display: "flex", flexDirection: "column", alignItems: alinear === "center" ? "center" : "flex-start", gap: 14 }}>
      <div style={{ padding: "10px 24px", borderRadius: 14, backgroundColor: t.colores.acento, color: t.colores.fondo, fontFamily: t.fuente, fontWeight: t.fuerte, fontSize: 46, lineHeight: 1.1, textAlign: alinear, opacity: etiqueta, translate: `${(1 - etiqueta) * -60}px 0` }}>{texto}</div>
      {dato ? (
        <div style={{ width: "100%", opacity: sub, translate: `0 ${(1 - sub) * 18}px` }}>
          <TextoCinetico texto={dato} alto={110} maxFont={46} maxLineas={2} peso="medio" sincronizar={false} desde={Math.round(dur * 0.35)} />
        </div>
      ) : null}
    </div>
  );
};

/** Una foto impresa (polaroid): borde blanco, sombra, inclinada; entra cayendo y queda apoyada. */
const Polaroid: React.FC<{ src: string; ancho: number; x: number; y: number; giro: number; desde?: number; pie?: string }> = ({ src, ancho, x, y, giro, desde = 0, pie }) => {
  const entra = useEntrada(desde, 12);
  const { frame, dur } = useTiempo();
  const t = useTipo();
  const alto = ancho * 1.08;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: ancho,
        padding: `${ancho * 0.05}px ${ancho * 0.05}px ${pie ? ancho * 0.2 : ancho * 0.14}px`,
        backgroundColor: "#FAFAF7",
        boxShadow: "0 24px 50px rgba(0,0,0,0.5)",
        rotate: `${giro * entra + (1 - entra) * giro * 3}deg`,
        translate: `0 ${(1 - entra) * -220}px`,
        opacity: Math.min(1, entra * 1.5),
      }}
    >
      <div style={{ width: "100%", height: alto * 0.82, overflow: "hidden", backgroundColor: "#111" }}>
        <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover", scale: String(interpolate(frame, [0, dur], [1.02, 1.12])) }} />
      </div>
      {pie ? <div style={{ marginTop: ancho * 0.04, textAlign: "center", fontFamily: t.fuente, fontWeight: t.fuerte, fontSize: Math.round(ancho * 0.07), color: "#1C1C1C", lineHeight: 1.05 }}>{pie}</div> : null}
    </div>
  );
};

/** Composiciones de la foto (la elige el guion según la escena; por defecto, a pantalla completa). */
const Compuesta: React.FC<{ marco: Exclude<MarcoFoto, "completa">; src: string; texto: string; dato?: string; extras: Foto[] }> = ({ marco, src, texto, dato, extras }) => {
  const t = useTipo();
  const { frame, dur } = useTiempo();
  const entra = useEntrada(0, 13);
  const nota = useEntrada(Math.round(dur * 0.25), 11);
  const altoZona = ZONA.abajo - ZONA.arriba;
  if (marco === "polaroid") {
    const ancho = 640;
    return (
      <>
        <FondoFoto src={src} />
        <Polaroid src={src} ancho={ancho} x={(ANCHO - ancho) / 2 - 20} y={ZONA.arriba + 10} giro={-4} pie={texto} />
        {dato ? <Rotulo texto={dato} x={CAJA_CONTENIDO.x} y={ZONA.arriba + ancho * 1.15 + 40} ancho={CAJA_CONTENIDO.ancho} /> : null}
      </>
    );
  }
  if (marco === "circulo") {
    const d = 520;
    const aro = interpolate(frame, [4, 26], [0, 1], { ...CLAMP, easing: Easing.out(Easing.cubic) });
    return (
      <>
        <FondoFoto src={src} />
        <div style={{ position: "absolute", left: (ANCHO - d) / 2, top: ZONA.arriba + 20, width: d, height: d, scale: String(0.6 + 0.4 * entra), opacity: entra }}>
          <svg width={d} height={d} style={{ position: "absolute", inset: 0, rotate: "-90deg" }}>
            <circle cx={d / 2} cy={d / 2} r={d / 2 - 8} fill="none" stroke={t.colores.acento} strokeWidth={14} strokeDasharray={Math.PI * (d - 16)} strokeDashoffset={(1 - aro) * Math.PI * (d - 16)} strokeLinecap="round" />
          </svg>
          <div style={{ position: "absolute", inset: 22, borderRadius: "50%", overflow: "hidden", backgroundColor: "#111" }}>
            <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 25%", scale: String(interpolate(frame, [0, dur], [1.05, 1.15])) }} />
          </div>
        </div>
        <Rotulo texto={texto} dato={dato} x={CAJA_CONTENIDO.x} y={ZONA.arriba + d + 50} ancho={CAJA_CONTENIDO.ancho} alinear="center" />
      </>
    );
  }
  if (marco === "postit") {
    const ancho = 600;
    return (
      <>
        <FondoFoto src={src} />
        <Polaroid src={src} ancho={ancho} x={CAJA_CONTENIDO.x - 30} y={ZONA.arriba} giro={-3} />
        {/* cinta que sostiene la foto */}
        <div style={{ position: "absolute", left: CAJA_CONTENIDO.x - 30 + ancho / 2 - 80, top: ZONA.arriba - 24, width: 160, height: 46, backgroundColor: "rgba(255,255,240,0.55)", rotate: "4deg", opacity: entra }} />
        <div
          style={{
            position: "absolute",
            right: ZONA_SEGURA.derecha - 40,
            top: ZONA.arriba + ancho * 0.85,
            width: 400,
            minHeight: 300,
            padding: 30,
            backgroundColor: t.colores.acento,
            color: t.colores.fondo,
            boxShadow: "0 18px 36px rgba(0,0,0,0.45)",
            rotate: `${4 + (1 - nota) * 12}deg`,
            scale: String(0.7 + 0.3 * nota),
            opacity: nota,
            fontFamily: t.fuente,
          }}
        >
          <div style={{ fontWeight: t.fuerte, fontSize: 44, lineHeight: 1.05 }}>{texto}</div>
          {dato ? <div style={{ marginTop: 14, fontWeight: t.medio, fontSize: 32, lineHeight: 1.2 }}>{dato}</div> : null}
        </div>
      </>
    );
  }
  if (marco === "collage") {
    // el nombre arriba y las fotos debajo, superpuestas como sobre una mesa (sin tapar el rótulo ni los subtítulos)
    const fotos = [src, ...extras.map((e) => e.src)].slice(0, 3);
    const ancho = fotos.length === 1 ? 560 : fotos.length === 2 ? 440 : 360;
    const arriba = ZONA.arriba + 90;
    const lugares = [
      { x: CAJA_CONTENIDO.x - 40, y: arriba, giro: -6 },
      { x: ANCHO - ZONA_SEGURA.derecha - ancho + 50, y: arriba + 100, giro: 5 },
      { x: (ANCHO - ancho) / 2, y: Math.min(arriba + 290, ZONA.abajo - ancho * 1.13), giro: -2 },
    ];
    return (
      <>
        <FondoFoto src={src} />
        <Rotulo texto={texto} x={CAJA_CONTENIDO.x} y={ZONA.arriba} ancho={CAJA_CONTENIDO.ancho} alinear="center" />
        {fotos.map((f, k) => (
          <Polaroid key={k} src={f} ancho={ancho} x={lugares[k]!.x} y={lugares[k]!.y} giro={lugares[k]!.giro} desde={k * Math.round(dur * 0.18)} pie={k === fotos.length - 1 ? dato : undefined} />
        ))}
      </>
    );
  }
  // ventana: recuadro redondeado sobre el fondo de la marca, que se abre desde el centro
  const alto = Math.round(altoZona * 0.62);
  return (
    <>
      <FondoFoto src={src} />
      <div style={{ position: "absolute", left: CAJA_CONTENIDO.x - 20, top: ZONA.arriba + 10, width: CAJA_CONTENIDO.ancho + 40, height: alto, borderRadius: 36, overflow: "hidden", boxShadow: `0 0 0 6px ${t.colores.acento}, 0 30px 60px rgba(0,0,0,0.5)`, clipPath: `inset(${(1 - entra) * 50}% 0 ${(1 - entra) * 50}% 0 round 36px)` }}>
        <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover", scale: String(interpolate(frame, [0, dur], [1.04, 1.16])) }} />
      </div>
      <Rotulo texto={texto} dato={dato} x={CAJA_CONTENIDO.x} y={ZONA.arriba + alto + 50} ancho={CAJA_CONTENIDO.ancho} />
    </>
  );
};

/**
 * Foto REAL de una persona, institución o lugar (verificada mirándola) con Ken Burns, el nombre en una etiqueta y el
 * crédito chiquito. Sin foto verificada: tarjeta de texto animada con el nombre y el dato (nunca una foto equivocada).
 */
export const FotoReal: React.FC<Props> = ({ texto, dato, src, credito, marco, extras = [] }) => {
  const { frame, dur } = useTiempo();
  const { indice } = useEscena();
  const t = useTipo();
  const etiqueta = useEntrada(6, 14);
  const sub = useEntrada(Math.round(dur * 0.35));

  if (src && marco && marco !== "completa") {
    return (
      <>
        <Compuesta marco={marco} src={src} texto={texto} dato={dato} extras={extras} />
        {credito ? <Credito texto={[credito, ...extras.map((e) => e.credito).filter(Boolean)].join(" · ")} /> : null}
      </>
    );
  }

  if (src) {
    const sentido = indice % 2 ? 1 : -1;
    const zoom = interpolate(frame, [0, dur], [1.06, 1.2]);
    const pan = interpolate(frame, [0, dur], [-30, 30]) * sentido;
    return (
      <>
        <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#000" }}>
          <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover", scale: String(zoom), translate: `${pan}px ${pan * 0.3}px` }} />
          <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.7) 100%)" }} />
        </AbsoluteFill>
        <div
          style={{
            position: "absolute",
            left: CAJA_CONTENIDO.x,
            top: ZONA_TEXTO.y + ZONA_TEXTO.alto + 40,
            maxWidth: CAJA_CONTENIDO.ancho,
            padding: "12px 26px",
            borderRadius: 16,
            backgroundColor: t.colores.acento,
            color: t.colores.fondo,
            fontFamily: t.fuente,
            fontWeight: t.fuerte,
            fontSize: 50,
            lineHeight: 1.1,
            translate: `${(1 - etiqueta) * -80}px 0`,
            opacity: etiqueta,
          }}
        >
          {texto}
        </div>
        {dato ? (
          <div style={{ position: "absolute", left: CAJA_CONTENIDO.x, top: ZONA_TEXTO.y + ZONA_TEXTO.alto + 130, maxWidth: CAJA_CONTENIDO.ancho, opacity: sub, translate: `0 ${(1 - sub) * 20}px` }}>
            <TextoCinetico texto={dato} alto={110} maxFont={48} maxLineas={2} peso="medio" sincronizar={false} desde={Math.round(dur * 0.35)} />
          </div>
        ) : null}
        {credito ? <Credito texto={credito} /> : null}
      </>
    );
  }

  // tarjeta de texto: nombre grande, una barra que se dibuja y el dato
  const barra = interpolate(frame, [8, 24], [0, 1], { ...CLAMP, easing: Easing.out(Easing.cubic) });
  return (
    <div style={{ position: "absolute", left: CAJA_CONTENIDO.x, top: ZONA_TEXTO.y - 40, width: CAJA_CONTENIDO.ancho }}>
      <TextoCinetico texto={texto} alto={ZONA_TEXTO.alto} maxFont={110} maxLineas={3} mayusculas desde={2} />
      <div style={{ height: 12, width: `${barra * 60}%`, marginTop: 14, borderRadius: 6, backgroundColor: t.colores.acento }} />
      {dato ? (
        <div style={{ marginTop: 26, opacity: sub, translate: `0 ${(1 - sub) * 20}px` }}>
          <TextoCinetico texto={dato} alto={140} maxFont={56} maxLineas={3} peso="medio" sincronizar={false} desde={Math.round(dur * 0.35)} />
        </div>
      ) : null}
    </div>
  );
};

/** Crédito chiquito arriba a la derecha (de dónde es la foto). */
const Credito: React.FC<{ texto: string }> = ({ texto }) => {
  const t = useTipo();
  return <div style={{ position: "absolute", right: ZONA_SEGURA.derecha, top: ZONA_SEGURA.arriba - 40, maxWidth: 560, textAlign: "right", fontFamily: t.fuente, fontSize: 22, color: "rgba(255,255,255,0.8)", textShadow: "0 1px 4px #000" }}>{texto}</div>;
};
