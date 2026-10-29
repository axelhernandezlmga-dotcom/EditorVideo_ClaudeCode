import type React from "react";
import type { Caption } from "@remotion/captions";
import { AbsoluteFill, Easing, interpolate, spring as springRemotion, useCurrentFrame, useVideoConfig, type SpringConfig } from "remotion";
import type { Animacion } from "../../shared/render";
import { CAJA_CONTENIDO } from "../../shared/render";
import { momentoPalabra, normalizar, useEscena, useMarca } from "../contexto";
import { FAMILIA_KIT_DATOS, familia, pesoFuerte, pesoMedio } from "../fuentes";
import { ajustarTexto } from "../texto";

export const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Ajusta un resorte al estilo de animación del tono: "tranquila" llega sin rebotar, "rebote" rebota más. */
export const ajustarResorte = (config: Partial<SpringConfig> = {}, animacion: Animacion = "normal"): Partial<SpringConfig> => {
  if (animacion === "tranquila") return { ...config, damping: Math.max((config.damping ?? 10) * 1.5, 15), overshootClamping: true };
  if (animacion === "rebote") return { ...config, damping: Math.max((config.damping ?? 10) * 0.65, 4) };
  return config;
};

/** `spring` de Remotion con el estilo de animación de la marca/tono. */
export const useResorte = () => {
  const { animacion } = useMarca();
  return (o: Parameters<typeof springRemotion>[0]) => springRemotion({ ...o, config: ajustarResorte(o.config, animacion) });
};

/** Progreso 0→1 de una entrada con resorte que empieza en `desde` (frames). */
export const useEntrada = (desde = 0, damping = 14) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const spring = useResorte();
  return spring({ frame: frame - desde, fps, config: { damping, mass: 0.7 } });
};

/** Frames de la escena + helpers de tiempo. */
export const useTiempo = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { duracionFrames: dur, captions } = useEscena();
  return {
    frame,
    fps,
    dur,
    /** ms (relativos a la escena) → frame */
    aFrame: (ms: number) => (ms / 1000) * fps,
    /** Frame en que la voz dice `palabra` (o `porDefecto` si no la dice). */
    frameDe: (palabra: string, porDefecto: number, desdeMs = 0) => {
      const ms = momentoPalabra(captions, palabra, desdeMs);
      return ms === null ? porDefecto : (ms / 1000) * fps;
    },
  };
};

/** Frames que dura la salida de los elementos al final de cada escena. */
export const FRAMES_SALIDA = 14;

/** 0 durante la escena → 1 en el último frame (para animar la salida). */
export const useSalida = () => {
  const { frame, dur } = useTiempo();
  return interpolate(frame, [dur - FRAMES_SALIDA, dur - 1], [0, 1], { ...CLAMP, easing: Easing.in(Easing.cubic) });
};

/**
 * Cámara de la escena: zoom lento continuo + leve paneo, y la salida (se achica, sube y se desvanece).
 * Envuelve la plantilla; los subtítulos quedan afuera para que no se muevan.
 */
export const Escenario: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { frame, dur } = useTiempo();
  const { indice } = useEscena();
  const salida = useSalida();
  const sentido = indice % 2 === 0 ? 1 : -1;
  const zoom = interpolate(frame, [0, dur], [1, 1.07]);
  const panX = sentido * interpolate(frame, [0, dur], [-14, 14]);
  return (
    <AbsoluteFill
      style={{
        transformOrigin: "50% 36%",
        scale: zoom * (1 - 0.12 * salida),
        // flotación leve y continua de la cámara: nunca queda todo quieto
        translate: `${panX}px ${10 * Math.sin(frame / 20) - 60 * salida}px`,
        rotate: `${0.6 * Math.sin(frame / 33)}deg`,
        opacity: 1 - 0.85 * salida,
        filter: salida > 0.01 ? `blur(${salida * 6}px)` : undefined,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/** Contenedor del área de contenido (respeta zonas seguras y deja libre la franja de subtítulos). */
export const Caja: React.FC<{
  children: React.ReactNode;
  justify?: React.CSSProperties["justifyContent"];
  gap?: number;
  y?: number;
  alto?: number;
}> = ({ children, justify = "center", gap = 28, y = CAJA_CONTENIDO.y, alto = CAJA_CONTENIDO.alto }) => (
  <div
    style={{
      position: "absolute",
      left: CAJA_CONTENIDO.x,
      top: y,
      width: CAJA_CONTENIDO.ancho,
      height: alto,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: justify,
      gap,
      textAlign: "center",
    }}
  >
    {children}
  </div>
);

export const useTipo = () => {
  const { tipografia, colores, usuario } = useMarca();
  return { fuente: familia(tipografia), fuerte: pesoFuerte(tipografia), medio: pesoMedio(tipografia), colores, tipografia, usuario };
};

/**
 * Frame en que aparece cada palabra de un texto en pantalla: cuando la voz la dice (si la encuentra en
 * los captions, en orden) y, si no, repartida entre las que sí encontró. Todas aparecen entre `desde` y `hasta`.
 */
export const framesDePalabras = (palabras: string[], captions: Caption[], fps: number, desde: number, hasta: number): number[] => {
  const n = palabras.length;
  const encontrados: (number | null)[] = [];
  let ultimoMs = 0;
  for (const p of palabras) {
    const norm = normalizar(p);
    if (norm.length < 3) {
      encontrados.push(null);
      continue;
    }
    const c = captions.find((c) => c.startMs >= ultimoMs && normalizar(c.text) === norm);
    if (c) {
      ultimoMs = c.startMs;
      encontrados.push((c.startMs / 1000) * fps - 2);
    } else encontrados.push(null);
  }
  const paso = Math.max(2, Math.min(5, (hasta - desde) / Math.max(1, n)));
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const f = encontrados[i];
    if (f !== null && f !== undefined) {
      out.push(f);
      continue;
    }
    // interpolar entre el anterior conocido y el siguiente conocido
    const prev = out[i - 1] ?? desde - paso;
    let j = i + 1;
    while (j < n && (encontrados[j] === null || encontrados[j] === undefined)) j++;
    const sig = j < n ? (encontrados[j] as number) : null;
    out.push(sig === null ? prev + paso : prev + (sig - prev) / (j - i + 1));
  }
  // la primera palabra aparece enseguida; ninguna después de `hasta`; siempre en orden
  let previo = -Infinity;
  return out.map((f, i) => {
    const tope = i === 0 ? Math.min(desde + 4, hasta) : hasta;
    const v = Math.max(previo, Math.min(tope, Math.max(desde, f)));
    previo = v;
    return v;
  });
};

export type EstiloTexto = {
  ancho?: number;
  alto: number;
  maxFont: number;
  minFont?: number;
  maxLineas?: number;
  mayusculas?: boolean;
  peso?: "fuerte" | "medio";
  color?: string;
  alinear?: "center" | "left";
  interlineado?: number;
  sombra?: boolean;
};

/**
 * Texto cinético: cada palabra aparece (rebote desde abajo) cuando la voz la dice; las palabras de énfasis
 * van en color de acento, pegan un salto cuando se dicen y se subrayan con un trazo que se dibuja.
 * Las palabras van separadas con `gap` (no con espacios) y nunca se escalan por encima de 1, así no se pegan.
 */
export const TextoCinetico: React.FC<
  EstiloTexto & {
    texto: string;
    /** Frame mínimo de aparición. */
    desde?: number;
    /** Frame máximo de aparición (por defecto, 65 % de la escena). */
    hasta?: number;
    /** Si es false, el texto aparece entero (sin sincronizar). */
    sincronizar?: boolean;
    enfasisExtra?: string[];
  }
> = ({
  texto,
  ancho = CAJA_CONTENIDO.ancho,
  alto,
  maxFont,
  minFont,
  maxLineas = 4,
  mayusculas = false,
  peso = "fuerte",
  color,
  alinear = "center",
  interlineado = 1.12,
  sombra = true,
  desde = 0,
  hasta,
  sincronizar = true,
  enfasisExtra = [],
}) => {
  const spring = useResorte();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { captions, enfasis, duracionFrames } = useEscena();
  const t = useTipo();
  const { kit } = useMarca();
  // con kit de marca: nada de párrafos en mayúsculas ni sombras; tinta sobre papel
  if (kit) {
    mayusculas = false;
    sombra = false;
  }
  const fontWeight = kit ? (peso === "fuerte" ? 600 : 500) : peso === "fuerte" ? t.fuerte : t.medio;
  const { fontSize } = ajustarTexto({ text: texto, ancho, alto, fontFamily: t.fuente, fontWeight, maxFont, minFont, maxLineas, mayusculas, interlineado });
  const palabras = texto.split(/\s+/).filter(Boolean);
  const enfasisNorm = new Set([...enfasis, ...enfasisExtra].flatMap((e) => e.split(/\s+/)).map(normalizar).filter(Boolean));
  const tope = hasta ?? Math.max(desde + 6, duracionFrames * 0.65);
  const apariciones = sincronizar ? framesDePalabras(palabras, captions, fps, desde, tope) : palabras.map(() => desde);

  return (
    <div
      style={{
        width: ancho,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: alinear === "center" ? "center" : "flex-start",
        alignContent: "center",
        columnGap: fontSize * 0.27,
        fontFamily: t.fuente,
        fontWeight,
        fontSize,
        lineHeight: interlineado,
        color: color ?? t.colores.texto,
        textTransform: mayusculas ? "uppercase" : undefined,
        textShadow: sombra ? "0 6px 24px rgba(0,0,0,0.45)" : undefined,
      }}
    >
      {palabras.map((p, i) => {
        const inicio = apariciones[i] ?? desde;
        const e = spring({ frame: frame - inicio, fps, config: { damping: 11, stiffness: 180, mass: 0.6 } });
        const esEnfasis = enfasisNorm.has(normalizar(p));
        // el énfasis "pega" cuando la voz lo dice (o al aparecer)
        const pico = esEnfasis ? Math.max(inicio, (momentoPalabra(captions, p) ?? (inicio / fps) * 1000) / (1000 / fps)) : 0;
        const punch = esEnfasis ? spring({ frame: frame - pico, fps, config: { damping: 8, stiffness: 240 } }) : 0;
        // nunca más ancha que su tamaño normal (si no, se "come" el espacio con la palabra vecina):
        // la entrada crece hasta 1 y el énfasis es un salto + inclinación, no un escalado
        const escala = Math.min(1, interpolate(e, [0, 1], [0.4, 1]));
        const salto = esEnfasis ? Math.sin(Math.min(1, punch) * Math.PI) : 0;
        const subrayado = esEnfasis ? interpolate(frame, [pico, pico + 9], [0, 1], { ...CLAMP, easing: Easing.out(Easing.cubic) }) : 0;
        return (
          <span
            key={i}
            style={{
              position: "relative",
              display: "inline-block",
              whiteSpace: "nowrap",
              opacity: interpolate(e, [0, 0.4], [0, 1], CLAMP),
              translate: `0 ${interpolate(e, [0, 1], [fontSize * 0.45, 0]) - (kit ? 0 : salto * fontSize * 0.2)}px`,
              rotate: kit ? undefined : `${salto * -4}deg`,
              scale: escala,
              // con kit el énfasis no se pinta de rojo: lo marca el subrayado rojo
              color: esEnfasis && !kit ? t.colores.acento : undefined,
            }}
          >
            {esEnfasis ? (
              <span
                style={{
                  position: "absolute",
                  left: "-2%",
                  bottom: "4%",
                  height: "0.13em",
                  width: `${104 * subrayado}%`,
                  borderRadius: 99,
                  backgroundColor: kit ? t.colores.acento : t.colores.acento2,
                  zIndex: -1,
                }}
              />
            ) : null}
            {p}
          </span>
        );
      })}
    </div>
  );
};

/** Etiqueta pequeña tipo "píldora" en color de acento. */
export const Pildora: React.FC<{ children: React.ReactNode; color?: string; tam?: number }> = ({ children, color, tam = 38 }) => {
  const t = useTipo();
  const { kit } = useMarca();
  if (kit)
    return (
      <div style={{ display: "flex", alignItems: "center", gap: tam * 0.55, maxWidth: CAJA_CONTENIDO.ancho }}>
        <div style={{ width: Math.max(6, tam * 0.2), height: tam * 1.7, background: kit.colores.acento }} />
        <span style={{ fontFamily: `"${FAMILIA_KIT_DATOS}", ui-monospace, monospace`, fontSize: tam * 0.85, letterSpacing: "0.06em", color: kit.colores.texto, textTransform: "uppercase" }}>{children}</span>
      </div>
    );
  return (
    <div
      style={{
        fontFamily: t.fuente,
        fontWeight: t.fuerte,
        fontSize: tam,
        color: t.colores.fondo,
        backgroundColor: color ?? t.colores.acento,
        padding: "10px 30px",
        borderRadius: 40,
        maxWidth: CAJA_CONTENIDO.ancho,
        lineHeight: 1.2,
        textTransform: "uppercase",
        letterSpacing: "0.02em",
        boxShadow: `0 10px 30px rgba(0,0,0,0.35)`,
      }}
    >
      {children}
    </div>
  );
};

/** Píldora de título que cae desde arriba con rebote. */
export const TituloPildora: React.FC<{ texto?: string; desde?: number }> = ({ texto, desde = 0 }) => {
  const e = useEntrada(desde, 10);
  if (!texto) return null;
  return (
    <div style={{ opacity: interpolate(e, [0, 0.5], [0, 1], CLAMP), translate: `0 ${interpolate(e, [0, 1], [-80, 0])}px`, scale: interpolate(e, [0, 1], [0.7, 1]) }}>
      <Pildora>{texto}</Pildora>
    </div>
  );
};

/** Ajusta una lista de frames para que sea estrictamente creciente (lo exige `interpolate`). */
export const creciente = (xs: number[]): number[] => {
  let prev = -Infinity;
  return xs.map((x) => (prev = Math.max(x, prev + 0.01)));
};

/** Número con formato local (1.500 / 43,9). */
export const formatear = (n: number, decimales = 0) =>
  n.toLocaleString("es-UY", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });

/** Cantidad de decimales "naturales" de un número (máx. 2). */
export const decimalesDe = (n: number) => {
  const s = String(n);
  const i = s.indexOf(".");
  return i < 0 ? 0 : Math.min(2, s.length - i - 1);
};

/** Destellos que salen disparados desde el centro en el frame `en` (para remates de animación). */
export const Destello: React.FC<{ en: number; radio: number; color: string; cantidad?: number; x?: number | string; y?: number | string }> = ({
  en,
  radio,
  color,
  cantidad = 12,
  x = "50%",
  y = "50%",
}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [en, en + 20], [0, 1], { ...CLAMP, easing: Easing.out(Easing.cubic) });
  if (p <= 0 || p >= 1) return null;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 0, height: 0 }}>
      {Array.from({ length: cantidad }, (_, i) => {
        const ang = (i / cantidad) * Math.PI * 2;
        const r = radio * (0.6 + 0.6 * p);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: Math.cos(ang) * r - 6,
              top: Math.sin(ang) * r - 6,
              width: 12 + 26 * (1 - p),
              height: 12,
              borderRadius: 6,
              backgroundColor: color,
              opacity: 1 - p,
              rotate: `${ang}rad`,
            }}
          />
        );
      })}
    </div>
  );
};
