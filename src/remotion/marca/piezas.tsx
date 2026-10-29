import { evolvePath } from "@remotion/paths";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { trazadosIcono } from "../../shared/marca";
import { ALTO, ANCHO, ZONA_SEGURA } from "../../shared/render";
import { avance, caidaPunto, CL, EASE, FUENTE_DATOS, FUENTE_TITULOS, SvgKit, useKit } from "./base";
import { useMarca } from "../contexto";
import { familia } from "../fuentes";

/** Separador: la línea se dibuja de izquierda a derecha y el punto cae en su lugar al final. */
export const SeparadorAnimado: React.FC<{ x: number; y: number; ancho: number; desde?: number; colorLinea?: string }> = ({ x, y, ancho, desde = 0, colorLinea }) => {
  const frame = useCurrentFrame();
  const kit = useKit();
  if (!kit) return null;
  const k = avance(frame, desde, 16);
  const caida = caidaPunto(frame, desde + 12);
  const r = 9;
  return (
    <svg style={{ position: "absolute", left: x, top: y - 40, overflow: "visible" }} width={ancho} height={80}>
      <line x1={0} y1={40} x2={(ancho - 4 * r) * k} y2={40} stroke={colorLinea ?? kit.colores.linea} strokeWidth={3} />
      <circle cx={ancho - r} cy={40 + caida.y * 70} r={r * caida.escala} fill={kit.colores.acento} />
    </svg>
  );
};

/** Marcador de bloque: la barra roja crece y la etiqueta (Plex Mono) se escribe letra por letra. */
export const Marcador: React.FC<{ etiqueta: string; x: number; y: number; desde?: number; tam?: number; color?: string }> = ({ etiqueta, x, y, desde = 0, tam = 34, color }) => {
  const frame = useCurrentFrame();
  const marca = useMarca();
  // sin kit (otros perfiles con línea editorial): el mismo marcador con los colores y la letra del perfil
  const kit = marca.kit ?? { colores: { acento: marca.colores.acento, texto: marca.colores.texto } };
  const fuente = marca.kit ? FUENTE_DATOS : familia(marca.tipografia);
  const barra = avance(frame, desde, 9);
  const letras = Math.max(0, Math.min(etiqueta.length, Math.floor((frame - desde - 5) / 1.4)));
  const alto = tam * 1.9;
  return (
    <div style={{ position: "absolute", left: x, top: y, height: alto, display: "flex", alignItems: "center", gap: tam * 0.6 }}>
      <div style={{ width: Math.max(6, tam * 0.2), height: alto * barra, background: kit.colores.acento, alignSelf: "center" }} />
      <span style={{ fontFamily: fuente, fontSize: tam, letterSpacing: "0.06em", color: color ?? kit.colores.texto, whiteSpace: "pre" }}>
        {etiqueta.slice(0, letras)}
        {/* cursor mientras escribe */}
        {letras < etiqueta.length && frame >= desde + 5 ? <span style={{ opacity: 0.5 }}>▏</span> : null}
      </span>
    </div>
  );
};

/** Destacado: barra roja + fondo rosado suave que se expande detrás; si es un número, cuenta hacia arriba. */
export const Destacado: React.FC<{ texto?: string; numero?: number; decimales?: number; prefijo?: string; unidad?: string; x: number; y: number; ancho: number; tam?: number; desde?: number }> = ({
  texto,
  numero,
  decimales = 0,
  prefijo = "",
  unidad = "",
  x,
  y,
  ancho,
  tam = 120,
  desde = 0,
}) => {
  const frame = useCurrentFrame();
  const kit = useKit();
  if (!kit) return null;
  const fondo = avance(frame, desde, 14);
  const cuenta = avance(frame, desde + 4, 26);
  const valor = numero !== undefined ? (numero * cuenta).toLocaleString("es-UY", { minimumFractionDigits: decimales, maximumFractionDigits: decimales }) : null;
  const alto = tam * 1.45;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: ancho, height: alto }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: ancho * fondo, height: alto, background: kit.colores.apoyo }} />
      <div style={{ position: "absolute", left: 0, top: 0, width: Math.max(8, tam * 0.08), height: alto, background: kit.colores.acento, scale: `1 ${Math.min(1, fondo * 2)}`, transformOrigin: "top" }} />
      <div
        style={{
          position: "absolute",
          left: tam * 0.32,
          top: 0,
          height: alto,
          display: "flex",
          alignItems: "center",
          fontFamily: FUENTE_TITULOS,
          fontWeight: 600,
          fontSize: tam,
          color: kit.colores.texto,
          letterSpacing: "-0.02em",
          opacity: interpolate(frame, [desde + 3, desde + 9], [0, 1], CL),
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {valor !== null ? `${prefijo}${valor}${unidad ? (unidad.length <= 2 ? unidad : ` ${unidad}`) : ""}` : texto}
      </div>
    </div>
  );
};

/** Patrón de puntos: fondo sutil, en onda, SOLO dentro de las zonas que se le pasan (las que no tienen texto). */
export const PatronPuntos: React.FC<{ zonas: { x: number; y: number; ancho: number; alto: number }[]; paso?: number; opacidad?: number; amplitud?: number; deriva?: number }> = ({ zonas, paso = 46, opacidad = 0.35, amplitud = 1.6, deriva = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const kit = useKit();
  if (!kit) return null;
  const t = frame / fps;
  return (
    <svg style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }} width={ANCHO} height={ALTO}>
      {zonas.flatMap((z, k) => {
        const puntos = [];
        // deriva lenta: la grilla se corre de costado (filas alternadas en sentidos opuestos) sin salirse de la franja
        const corrimiento = (t * deriva) % paso;
        for (let y = z.y + paso / 2, fila = 0; y < z.y + z.alto; y += paso, fila++) {
          const dx = fila % 2 ? -corrimiento : corrimiento - paso;
          for (let x0 = z.x + paso / 2 + dx; x0 < z.x + z.ancho + paso; x0 += paso) {
            const x = x0;
            if (x < z.x || x > z.x + z.ancho) continue;
            // onda diagonal que recorre el patrón
            const onda = 0.5 + 0.5 * Math.sin(t * 2.2 - (x + y) / 140);
            puntos.push(<circle key={`${k}-${x}-${y}`} cx={x} cy={y} r={3 + onda * amplitud} fill={kit.colores.acento} opacity={opacidad * (0.45 + 0.55 * onda)} />);
          }
        }
        return puntos;
      })}
    </svg>
  );
};

/** Fecha y fuente en Plex Mono, gris editorial: "26 OCT 2026 / FUENTE 01 · PARLAMENTO.GUB.UY". */
export const FechaFuente: React.FC<{ n?: number; x: number; y: number; desde?: number; tam?: number; color?: string }> = ({ n, x, y, desde = 0, tam = 24, color }) => {
  const frame = useCurrentFrame();
  const kit = useKit();
  if (!kit) return null;
  // el número es el de la fuente que se muestra (FUENTE 01, 02… dentro de las del guion)
  const k0 = n !== undefined ? n % Math.max(1, kit.fuentesGuion.length) : 0;
  const f = n !== undefined ? kit.fuentesGuion[k0] : undefined;
  const texto = [kit.fecha, n !== undefined ? `FUENTE ${String(k0 + 1).padStart(2, "0")}${f ? ` · ${f.dominio.toUpperCase()}` : ""}` : null].filter(Boolean).join(" / ");
  const k = avance(frame, desde, 10);
  return (
    <div style={{ position: "absolute", left: x, top: y, fontFamily: FUENTE_DATOS, fontSize: tam, letterSpacing: "0.05em", color: color ?? kit.colores.secundario, opacity: k, translate: `${(1 - k) * -12}px 0`, whiteSpace: "nowrap" }}>
      {texto}
    </div>
  );
};

/** Ícono de la marca que se dibuja trazo por trazo (grilla 24, trazo 1,75, extremos redondeados). */
export const IconoMarca: React.FC<{ id: string; tam: number; x?: number; y?: number; desde?: number; dur?: number; color?: string; style?: React.CSSProperties }> = ({ id, tam, x, y, desde = 0, dur = 22, color, style }) => {
  const frame = useCurrentFrame();
  const kit = useKit();
  const svg = kit?.iconos[id];
  if (!kit || !svg) return null;
  const trazados = trazadosIcono(svg);
  const pos: React.CSSProperties = x !== undefined && y !== undefined ? { position: "absolute", left: x, top: y } : {};
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" style={{ ...pos, overflow: "visible", ...style }}>
      <g fill="none" stroke={color ?? kit.colores.texto} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
        {trazados.map((d, i) => {
          // cada trazado se dibuja en su turno, con el easing de la marca
          const k = interpolate(frame, [desde + (i * dur) / (trazados.length + 1), desde + ((i + 2) * dur) / (trazados.length + 1)], [0, 1], { ...CL, easing: EASE });
          const ev = evolvePath(k, d);
          return <path key={i} d={d} strokeDasharray={ev.strokeDasharray} strokeDashoffset={ev.strokeDashoffset} />;
        })}
      </g>
    </svg>
  );
};

/** Marca de agua: la «C.» de un solo color, chica, en una esquina (nunca por debajo de su mínimo). */
export const MarcaAguaC: React.FC<{ oscuro?: boolean }> = ({ oscuro = false }) => {
  const kit = useKit();
  const svg = kit?.simbolos.monocromo ?? kit?.simbolos.principal;
  if (!kit || !svg) return null;
  const tam = Math.max(kit.reglas.minimos.simbolo, 62);
  return <SvgKit svg={svg} ancho={tam} color={oscuro ? "#FFFFFF" : kit.colores.texto} style={{ position: "absolute", left: ZONA_SEGURA.izquierda, top: ALTO - ZONA_SEGURA.abajo - tam - 16, opacity: 0.7 }} />;
};
