import { Audio } from "@remotion/media";
import { useMemo } from "react";
import { AbsoluteFill, Easing, Img, interpolate, OffthreadVideo, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { MaterialRender, SfxRender } from "../shared/crudo";
import { ANCHO, ZONA_SEGURA } from "../shared/render";
import { EscenaContext, useEscena, useMarca } from "./contexto";
import { NoticiaMarca } from "./marca/NoticiaMarca";
import { fechaMarca } from "../shared/marca";
import { familia, pesoFuerte, pesoMedio } from "./fuentes";
import { CLAMP, Escenario } from "./plantillas/comun";
import { PLANTILLAS } from "./plantillas/registry";
import { PLANTILLAS_MARCA } from "./marca/plantillasMarca";

const FRAMES_ENTRADA = 10;
const FRAMES_SALIDA_MATERIAL = 8;

/** 0→1 al entrar y 1→0 al salir de la secuencia (con un resorte corto en la entrada). */
const useAparicion = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const entrada = spring({ frame, fps, config: { damping: 15, stiffness: 140 }, durationInFrames: FRAMES_ENTRADA + 6 });
  const salida = interpolate(frame, [durationInFrames - FRAMES_SALIDA_MATERIAL, durationInFrames], [1, 0], CLAMP);
  return { entrada, salida, frame, fps, durationInFrames };
};

const fechaCorta = (iso: string | null) => {
  if (!iso) return null;
  const [a, m, d] = iso.split("-");
  return a && m && d ? `${d}/${m}/${a}` : iso;
};

/**
 * Tarjeta de noticia: la captura del titular + bajada entra desde abajo sobre el video oscurecido, con el medio
 * y la fecha abajo; un resaltador "pinta" la frase clave de izquierda a derecha.
 */
const TarjetaNoticia: React.FC<{ m: Extract<MaterialRender, { tipo: "noticia" }>; limiteAbajo: number }> = ({ m, limiteAbajo }) => {
  const { colores, tipografia, kit } = useMarca();
  const { entrada, salida, frame } = useAparicion();
  // con kit de marca: la tarjeta papel con FUENTE, el medio y la fecha en Plex Mono y el resaltado rojo
  if (kit) return <NoticiaMarca imagen={m.imagen} rects={m.rects} proporcion={m.proporcion ?? 1.6} medio={m.medio} fecha={m.fecha ? fechaMarca(new Date(`${m.fecha}T12:00:00`)) : null} limiteAbajo={limiteAbajo} salida={salida} />;
  const ancho = ANCHO - 2 * 70;
  const altoMax = limiteAbajo - (ZONA_SEGURA.arriba + 20) - 110;
  const proporcion = m.proporcion ?? 1.6;
  const altoImg = Math.min(altoMax, ancho / proporcion);
  const anchoImg = altoImg * proporcion;
  const arriba = ZONA_SEGURA.arriba + 20 + Math.max(0, (altoMax - altoImg) / 2);
  const pintado = interpolate(frame, [FRAMES_ENTRADA + 4, FRAMES_ENTRADA + 22], [0, 1], { ...CLAMP, easing: Easing.out(Easing.cubic) });
  const fecha = fechaCorta(m.fecha);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ backgroundColor: "rgba(0,0,0,0.55)", opacity: entrada * salida }} />
      <div
        style={{
          position: "absolute",
          left: (ANCHO - anchoImg) / 2,
          top: arriba,
          width: anchoImg,
          opacity: salida,
          translate: `0 ${(1 - entrada) * 140 + (1 - salida) * -40}px`,
          scale: String(0.92 + 0.08 * entrada),
          rotate: `${(1 - entrada) * -2}deg`,
        }}
      >
        <div style={{ position: "relative", borderRadius: 22, overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,0.55)", backgroundColor: "#fff" }}>
          <Img src={m.imagen} style={{ display: "block", width: anchoImg, height: altoImg, objectFit: "cover", objectPosition: "top" }} />
          {m.rects.map((r, i) => {
            // cada renglón se pinta después del anterior
            const p = interpolate(pintado * m.rects.length - i, [0, 1], [0, 1], CLAMP);
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: `${r.x * 100}%`,
                  top: `${(r.y - r.h * 0.08) * 100}%`,
                  width: `${r.w * 100 * p}%`,
                  height: `${r.h * 116}%`,
                  backgroundColor: colores.acento,
                  mixBlendMode: "multiply",
                  opacity: 0.6,
                  borderRadius: 6,
                }}
              />
            );
          })}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 14,
            marginTop: 18,
            fontFamily: familia(tipografia),
            fontWeight: pesoMedio(tipografia),
            fontSize: 34,
            color: colores.texto,
            textShadow: "0 2px 10px rgba(0,0,0,0.7)",
          }}
        >
          <span style={{ backgroundColor: colores.acento2, color: "#fff", padding: "6px 18px", borderRadius: 999, fontWeight: pesoFuerte(tipografia) }}>{m.medio}</span>
          {fecha ? <span style={{ padding: "6px 0" }}>{fecha}</span> : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Foto de una persona, un lugar o un concepto a pantalla completa, con Ken Burns, etiqueta y crédito. */
const ImagenKenBurns: React.FC<{ m: Extract<MaterialRender, { tipo: "imagen" }>; indice: number; limiteAbajo: number }> = ({ m, indice, limiteAbajo }) => {
  const { colores, tipografia } = useMarca();
  const { entrada, salida, frame, durationInFrames } = useAparicion();
  const t = frame / Math.max(1, durationInFrames);
  const sentido = indice % 2 === 0 ? 1 : -1;
  return (
    <AbsoluteFill style={{ opacity: Math.min(entrada, salida), backgroundColor: "#000" }}>
      <Img
        src={m.imagen}
        style={{ width: "100%", height: "100%", objectFit: "cover", scale: String(1.06 + 0.12 * t), translate: `${sentido * (t - 0.5) * 50}px ${(0.5 - t) * 30}px` }}
      />
      <AbsoluteFill style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.65) 100%)" }} />
      {m.etiqueta ? (
        <div
          style={{
            position: "absolute",
            left: 70,
            top: limiteAbajo - 120,
            translate: `${(1 - entrada) * -60}px 0`,
            fontFamily: familia(tipografia),
            fontWeight: pesoFuerte(tipografia),
            fontSize: 44,
            color: colores.fondo,
            backgroundColor: colores.acento,
            padding: "8px 22px",
            borderRadius: 12,
          }}
        >
          {m.etiqueta}
        </div>
      ) : null}
      {m.credito ? (
        <div style={{ position: "absolute", right: ZONA_SEGURA.derecha, top: ZONA_SEGURA.arriba - 10, maxWidth: 520, textAlign: "right", fontFamily: familia(tipografia), fontSize: 20, color: "rgba(255,255,255,0.75)", textShadow: "0 1px 4px #000" }}>
          {m.credito}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/**
 * Foto en un marco (modo "Normal con imágenes"): chica, en una esquina de arriba (alterna izquierda y derecha),
 * para que la persona que habla siga a la vista. Círculo con aro, polaroid, post-it o ventana.
 */
const ImagenEnMarco: React.FC<{ m: Extract<MaterialRender, { tipo: "imagen" }>; indice: number }> = ({ m, indice }) => {
  const { colores, tipografia } = useMarca();
  const { entrada, salida, frame, durationInFrames } = useAparicion();
  const izquierda = indice % 2 === 0;
  const ancho = m.marco === "circulo" ? 420 : 470;
  const x = izquierda ? 60 : ANCHO - ancho - 60;
  const y = ZONA_SEGURA.arriba - 40;
  const giro = (izquierda ? -1 : 1) * (m.marco === "polaroid" || m.marco === "postit" ? 4 : 0);
  const zoom = 1.04 + 0.08 * (frame / Math.max(1, durationInFrames));
  const img = <Img src={m.imagen} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 30%", scale: String(zoom) }} />;
  const etiqueta = m.etiqueta ? (
    <div style={{ marginTop: 14, alignSelf: m.marco === "circulo" ? "center" : "flex-start", maxWidth: ancho + 60, padding: "6px 18px", borderRadius: 12, backgroundColor: colores.acento, color: colores.fondo, fontFamily: familia(tipografia), fontWeight: pesoFuerte(tipografia), fontSize: 36, lineHeight: 1.1 }}>{m.etiqueta}</div>
  ) : null;
  const marco =
    m.marco === "circulo" ? (
      <div style={{ width: ancho, height: ancho, borderRadius: "50%", overflow: "hidden", boxShadow: `0 0 0 10px ${colores.acento}, 0 20px 50px rgba(0,0,0,0.5)` }}>{img}</div>
    ) : m.marco === "polaroid" || m.marco === "postit" ? (
      <div style={{ width: ancho, padding: "22px 22px 70px", backgroundColor: "#FAFAF7", boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}>
        <div style={{ width: "100%", height: ancho * 0.85, overflow: "hidden" }}>{img}</div>
      </div>
    ) : (
      <div style={{ width: ancho, height: ancho * 0.72, borderRadius: 28, overflow: "hidden", boxShadow: `0 0 0 6px ${colores.acento}, 0 20px 50px rgba(0,0,0,0.5)` }}>{img}</div>
    );
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: x, top: y, display: "flex", flexDirection: "column", opacity: Math.min(entrada, salida), rotate: `${giro}deg`, translate: `${(1 - entrada) * (izquierda ? -140 : 140)}px 0`, scale: String(0.85 + 0.15 * entrada) }}>
        {marco}
        {m.marco === "postit" && m.etiqueta ? (
          <div style={{ marginTop: -40, marginLeft: izquierda ? ancho * 0.45 : -40, width: 300, padding: 20, backgroundColor: colores.acento, color: colores.fondo, rotate: `${izquierda ? 6 : -6}deg`, boxShadow: "0 12px 26px rgba(0,0,0,0.45)", fontFamily: familia(tipografia), fontWeight: pesoFuerte(tipografia), fontSize: 34, lineHeight: 1.1 }}>
            {m.etiqueta}
          </div>
        ) : (
          etiqueta
        )}
      </div>
      {m.credito ? (
        <div style={{ position: "absolute", [izquierda ? "left" : "right"]: 60, top: y - 34, fontFamily: familia(tipografia), fontSize: 20, color: "rgba(255,255,255,0.8)", textShadow: "0 1px 4px #000" }}>{m.credito}</div>
      ) : null}
    </AbsoluteFill>
  );
};

/** Dato con una plantilla animada (número, gráfico, comparación, línea de tiempo, mapa o escena) sobre el fondo de la marca. */
const PlantillaMaterial: React.FC<{ m: Extract<MaterialRender, { tipo: "plantilla" }>; desdeMs: number }> = ({ m, desdeMs }) => {
  const { colores } = useMarca();
  const escena = useEscena();
  const { durationInFrames } = useVideoConfig();
  const { entrada, salida } = useAparicion();
  // con kit de marca, la versión de marca de la plantilla (el número va en un Destacado, etc.)
  const { kit } = useMarca();
  const Comp = (kit ? PLANTILLAS_MARCA[m.plantilla] : undefined) ?? PLANTILLAS[m.plantilla];
  // la plantilla sincroniza sus animaciones con las palabras: se le pasan corridas al comienzo de la secuencia
  const valor = useMemo(
    () => ({
      ...escena,
      duracionFrames: durationInFrames,
      captions: escena.captions.map((c) => ({ ...c, startMs: c.startMs - desdeMs, endMs: c.endMs - desdeMs, timestampMs: c.timestampMs === null ? null : c.timestampMs - desdeMs })),
    }),
    [escena, durationInFrames, desdeMs],
  );
  return (
    <AbsoluteFill style={{ opacity: Math.min(entrada, salida) }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 35%, ${colores.fondo2}EE 0%, ${colores.fondo}F2 70%)` }} />
      <EscenaContext.Provider value={valor}>
        <Escenario>
          <Comp {...m.props} />
        </Escenario>
      </EscenaContext.Provider>
    </AbsoluteFill>
  );
};

/** Todo el material del crudo, cada cosa en su secuencia. `limiteAbajo` = borde de arriba de los subtítulos. */
/** Clip propio a pantalla completa (ya cortado a 9:16 y sin audio): entra con un fundido y un zoom lento. */
const ClipPropio: React.FC<{ m: Extract<MaterialRender, { tipo: "clip" }> }> = ({ m }) => {
  const { entrada, salida, frame, durationInFrames } = useAparicion();
  return (
    <AbsoluteFill style={{ opacity: Math.min(entrada, salida), backgroundColor: "#000" }}>
      <OffthreadVideo src={m.video} muted style={{ width: "100%", height: "100%", objectFit: "cover", scale: String(1.02 + 0.06 * (frame / Math.max(1, durationInFrames))) }} />
    </AbsoluteFill>
  );
};

/**
 * Tarjeta de texto animada: cuando no hay una imagen REAL verificada de una persona o un lugar, va el nombre y el
 * dato (nunca una foto equivocada). Entra deslizándose, una barra se dibuja debajo del nombre y el dato aparece.
 */
const TarjetaTexto: React.FC<{ m: Extract<MaterialRender, { tipo: "tarjeta" }>; limiteAbajo: number }> = ({ m, limiteAbajo }) => {
  const { colores, tipografia } = useMarca();
  const { entrada, salida, frame } = useAparicion();
  const barra = interpolate(frame, [FRAMES_ENTRADA, FRAMES_ENTRADA + 14], [0, 1], { ...CLAMP, easing: Easing.out(Easing.cubic) });
  const dato = interpolate(frame, [FRAMES_ENTRADA + 8, FRAMES_ENTRADA + 18], [0, 1], CLAMP);
  const tamTitulo = m.titulo.length > 28 ? 64 : m.titulo.length > 18 ? 78 : 92;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ backgroundColor: "rgba(0,0,0,0.45)", opacity: entrada * salida }} />
      <div
        style={{
          position: "absolute",
          left: 80,
          right: ZONA_SEGURA.derecha,
          top: Math.max(ZONA_SEGURA.arriba + 40, limiteAbajo - 520),
          padding: "44px 48px",
          borderRadius: 32,
          background: `linear-gradient(140deg, ${colores.fondo} 0%, ${colores.fondo2} 140%)`,
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
          opacity: salida,
          translate: `${(1 - entrada) * -120}px 0`,
          rotate: `${(1 - entrada) * -3}deg`,
        }}
      >
        <div style={{ fontFamily: familia(tipografia), fontWeight: pesoFuerte(tipografia), fontSize: tamTitulo, lineHeight: 1.05, color: colores.texto, textTransform: "uppercase" }}>{m.titulo}</div>
        <div style={{ height: 10, width: `${barra * 62}%`, marginTop: 18, borderRadius: 5, backgroundColor: colores.acento }} />
        {m.texto ? (
          <div style={{ marginTop: 22, fontFamily: familia(tipografia), fontWeight: pesoMedio(tipografia), fontSize: 44, lineHeight: 1.2, color: colores.texto, opacity: dato, translate: `0 ${(1 - dato) * 20}px` }}>{m.texto}</div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

export const MaterialCrudo: React.FC<{ material: MaterialRender[]; limiteAbajo: number }> = ({ material, limiteAbajo }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {material.map((m, i) => {
        const desde = Math.round((m.desdeMs / 1000) * fps);
        const duracion = Math.max(1, Math.round(((m.hastaMs - m.desdeMs) / 1000) * fps));
        return (
          <Sequence key={i} name={`${m.tipo} ${i + 1}`} from={desde} durationInFrames={duracion} premountFor={fps}>
            {m.tipo === "noticia" ? (
              <TarjetaNoticia m={m} limiteAbajo={limiteAbajo} />
            ) : m.tipo === "imagen" ? (
              m.marco && m.marco !== "completa" ? <ImagenEnMarco m={m} indice={i} /> : <ImagenKenBurns m={m} indice={i} limiteAbajo={limiteAbajo} />
            ) : m.tipo === "clip" ? (
              <ClipPropio m={m} />
            ) : m.tipo === "tarjeta" ? (
              <TarjetaTexto m={m} limiteAbajo={limiteAbajo} />
            ) : (
              <PlantillaMaterial m={m} desdeMs={m.desdeMs} />
            )}
          </Sequence>
        );
      })}
    </>
  );
};

/** Efectos de sonido, cada uno en su momento y por debajo de la voz. */
export const SonidosCrudo: React.FC<{ sfx: SfxRender[]; volumen: number }> = ({ sfx, volumen }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {sfx.map((s, i) => (
        <Sequence key={i} name={`Efecto ${i + 1}`} from={Math.max(0, Math.round((s.enMs / 1000) * fps))} durationInFrames={Math.round(fps * 3)}>
          <Audio name="Efecto" src={s.src} volume={Math.min(1, s.volumen * volumen)} />
        </Sequence>
      ))}
    </>
  );
};
