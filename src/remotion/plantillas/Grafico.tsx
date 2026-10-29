import { Easing, interpolate } from "remotion";
import type { z } from "zod";
import { CAJA_CONTENIDO, type KitVisual } from "../../shared/render";
import { useMarca } from "../contexto";
import type { PropsPorPlantilla } from "../../shared/schemas";
import { Icono } from "../iconos/Icono";
import { ajustarTexto } from "../texto";
import { CLAMP, decimalesDe, Destello, formatear, TituloPildora, useTiempo, useTipo, useResorte } from "./comun";

type Props = z.infer<typeof PropsPorPlantilla.grafico>;

/** Paleta de series a partir de la marca. */
const paleta = (c: { acento: string; acento2: string; texto: string }, kit?: KitVisual) =>
  // con kit: solo colores de la marca (el rojo para el que se destaca, el resto en tinta y grises)
  kit ? [kit.colores.acento, kit.colores.texto, kit.colores.secundario, kit.colores.linea, kit.colores.texto, kit.colores.secundario] : [c.acento, c.acento2, "#4CC9F0", "#7BE495", "#B388FF", c.texto];

export const Grafico: React.FC<Props> = (props) => (props.tipo === "torta" ? <Torta {...props} /> : props.tipo === "lineas" ? <Lineas {...props} /> : <Barras {...props} />);

/**
 * Líneas (una evolución en el tiempo): la línea se dibuja de izquierda a derecha, cada punto aparece cuando la
 * línea llega (con su valor), el área de abajo se llena suave y el último punto se resalta con su cifra grande.
 */
const Lineas: React.FC<Props> = ({ titulo, unidad, datos }) => {
  const { frame, fps, dur } = useTiempo();
  const t = useTipo();
  const { kit } = useMarca();
  const color = paleta(t.colores, kit)[0]!;
  const altoTitulo = titulo ? 110 : 0;
  const ancho = CAJA_CONTENIDO.ancho;
  const alto = CAJA_CONTENIDO.alto - altoTitulo - 200;
  const margen = { izq: 30, der: 30, arriba: 90, abajo: 70 };
  const min = Math.min(0, ...datos.map((d) => d.valor));
  const max = Math.max(...datos.map((d) => d.valor), 1e-9);
  const x = (i: number) => margen.izq + (i / Math.max(1, datos.length - 1)) * (ancho - margen.izq - margen.der);
  const y = (v: number) => margen.arriba + (1 - (v - min) / (max - min || 1)) * (alto - margen.arriba - margen.abajo);
  const puntos = datos.map((d, i) => ({ x: x(i), y: y(d.valor), d }));
  const camino = puntos.map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const largo = puntos.reduce((n, p, i) => (i ? n + Math.hypot(p.x - puntos[i - 1]!.x, p.y - puntos[i - 1]!.y) : 0), 0);
  const finDibujo = Math.min(dur * 0.6, 8 + fps * 0.45 * datos.length);
  const avance = interpolate(frame, [8, finDibujo], [0, 1], { ...CLAMP, easing: Easing.inOut(Easing.cubic) });
  const dec = Math.max(...datos.map((d) => decimalesDe(d.valor)));
  const ultimo = puntos.at(-1)!;
  const final = interpolate(frame, [finDibujo, finDibujo + 12], [0, 1], CLAMP);
  const area = `${camino} L ${ultimo.x.toFixed(1)} ${alto - margen.abajo} L ${puntos[0]!.x.toFixed(1)} ${alto - margen.abajo} Z`;
  return (
    <div style={{ position: "absolute", left: CAJA_CONTENIDO.x, top: CAJA_CONTENIDO.y, width: ancho, height: CAJA_CONTENIDO.alto }}>
      <div style={{ position: "absolute", top: 0, width: "100%", display: "flex", justifyContent: "center" }}>
        <TituloPildora texto={titulo} />
      </div>
      <svg width={ancho} height={alto} style={{ position: "absolute", top: altoTitulo, overflow: "visible" }}>
        <defs>
          <linearGradient id="area-lineas" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
          <clipPath id="avance-lineas">
            <rect x={0} y={0} width={margen.izq + avance * (ancho - margen.izq - margen.der) + 2} height={alto} />
          </clipPath>
        </defs>
        <line x1={margen.izq} x2={ancho - margen.der} y1={alto - margen.abajo} y2={alto - margen.abajo} stroke={`${t.colores.texto}55`} strokeWidth={3} />
        <path d={area} fill="url(#area-lineas)" clipPath="url(#avance-lineas)" />
        <path d={camino} fill="none" stroke={color} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={largo} strokeDashoffset={(1 - avance) * largo} />
        {puntos.map((p, i) => {
          const llega = (p.x - margen.izq) / (ancho - margen.izq - margen.der);
          const v = interpolate(avance, [llega - 0.02, llega + 0.06], [0, 1], CLAMP);
          const esUltimo = i === puntos.length - 1;
          return (
            <g key={i} opacity={v}>
              <circle cx={p.x} cy={p.y} r={esUltimo ? 16 + 6 * final : 12} fill={esUltimo ? color : t.colores.fondo} stroke={color} strokeWidth={6} />
              {!esUltimo || final < 0.5 ? (
                <text x={p.x} y={p.y - 30} textAnchor="middle" fontFamily={t.fuente} fontWeight={t.fuerte} fontSize={36} fill={t.colores.texto}>
                  {formatear(p.d.valor, dec)}
                </text>
              ) : null}
              <text x={p.x} y={alto - margen.abajo + 50} textAnchor="middle" fontFamily={t.fuente} fontWeight={t.medio} fontSize={30} fill={`${t.colores.texto}CC`}>
                {p.d.etiqueta}
              </text>
            </g>
          );
        })}
      </svg>
      <div
        style={{
          position: "absolute",
          top: altoTitulo + alto + 30,
          width: "100%",
          textAlign: "center",
          fontFamily: t.fuente,
          fontWeight: t.fuerte,
          fontSize: 96,
          lineHeight: 1,
          color,
          opacity: final,
          scale: String(0.8 + 0.2 * final),
        }}
      >
        {formatear(ultimo.d.valor * final, dec)}
        {unidad ? <span style={{ fontSize: 48, marginLeft: 10, color: t.colores.texto }}>{unidad}</span> : null}
        <div style={{ fontSize: 32, fontWeight: t.medio, color: `${t.colores.texto}CC`, marginTop: 8 }}>{ultimo.d.etiqueta}</div>
      </div>
    </div>
  );
};

/**
 * Barras horizontales (ideal para elecciones: % por candidato): crecen escalonadas con su valor contando,
 * y al final la mayor se resalta con un trofeo y las demás se atenúan.
 */
const Barras: React.FC<Props> = ({ titulo, unidad, datos }) => {
  const spring = useResorte();
  const { frame, fps, dur, frameDe } = useTiempo();
  const t = useTipo();
  const { kit } = useMarca();
  const colores = paleta(t.colores, kit);
  const max = Math.max(...datos.map((d) => d.valor), 1e-9);
  const iMax = datos.findIndex((d) => d.valor === max);
  const altoTitulo = titulo ? 110 : 0;
  // con 2 o más datos se deja lugar abajo para la placa de ventaja
  const disponible = CAJA_CONTENIDO.alto - altoTitulo - 10 - (datos.length > 1 ? 110 : 0);
  const fila = Math.min(200, disponible / datos.length);
  const yInicio = altoTitulo + (disponible - fila * datos.length) / 2;
  const anchoBarraMax = CAJA_CONTENIDO.ancho - 20;
  const dec = Math.max(...datos.map((d) => decimalesDe(d.valor)));
  const fsEtiqueta = Math.min(...datos.map((d) => ajustarTexto({ text: d.etiqueta, ancho: anchoBarraMax * 0.62, alto: fila * 0.34, fontFamily: t.fuente, fontWeight: t.fuerte, maxFont: 50, maxLineas: 1 }).fontSize));
  // cada barra arranca cuando se nombra su etiqueta, con un mínimo escalonado
  let previo = 2;
  const inicios = datos.map((d, i) => {
    const f = Math.min(frameDe(d.etiqueta, 8 + i * 7), dur * 0.45);
    previo = Math.max(previo + 5, f);
    return i === 0 ? Math.min(previo, 8) : previo;
  });
  const durCrecer = Math.round(fps * 1);
  const finTodo = (inicios.at(-1) ?? 0) + durCrecer + 4;
  const momentoLider = Math.min(finTodo, dur * 0.72);
  const lider = frame >= momentoLider;
  const resalte = lider ? spring({ frame: frame - momentoLider, fps, config: { damping: 11 } }) : 0;
  const ordenados = [...datos].sort((a, b) => b.valor - a.valor);
  const segundo = ordenados[1];
  const ventaja = segundo ? max - segundo.valor : 0;
  const placa = spring({ frame: frame - momentoLider - 12, fps, config: { damping: 10 } });
  const latidoLider = lider ? 0.5 + 0.5 * Math.sin((frame - momentoLider) / 6) : 0;

  return (
    <div style={{ position: "absolute", left: CAJA_CONTENIDO.x, top: CAJA_CONTENIDO.y, width: CAJA_CONTENIDO.ancho, height: CAJA_CONTENIDO.alto }}>
      <div style={{ position: "absolute", top: 0, width: "100%", display: "flex", justifyContent: "center" }}>
        <TituloPildora texto={titulo} />
      </div>
      {datos.map((d, i) => {
        const ini = inicios[i] ?? 0;
        const entrada = spring({ frame: frame - ini + 4, fps, config: { damping: 14 } });
        const crec = interpolate(frame, [ini, ini + durCrecer], [0, 1], { ...CLAMP, easing: Easing.out(Easing.back(1.2)) });
        const esMax = i === iMax;
        const color = colores[i % colores.length]!;
        const ancho = Math.max(18, (anchoBarraMax * d.valor) / max) * crec;
        const y = yInicio + i * fila;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 0,
              top: y,
              width: CAJA_CONTENIDO.ancho,
              height: fila,
              opacity: interpolate(entrada, [0, 0.5], [0, 1], CLAMP) * (lider && !esMax ? interpolate(resalte, [0, 1], [1, 0.5]) : 1),
              translate: `${interpolate(entrada, [0, 1], [-80, 0])}px 0`,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", height: fila * 0.4, paddingRight: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: t.fuente, fontWeight: t.fuerte, fontSize: fsEtiqueta, color: t.colores.texto, lineHeight: 1, whiteSpace: "nowrap" }}>
                {d.etiqueta}
                {lider && esMax ? (
                  <span style={{ display: "inline-flex", scale: resalte, rotate: `${10 * Math.sin(frame / 6)}deg` }}>
                    <Icono nombre="trophy" tam={fsEtiqueta * 1.1} color={t.colores.acento} grosor={2.6} dibujo={resalte * 1.5} />
                  </span>
                ) : null}
              </div>
              <div style={{ fontFamily: t.fuente, fontWeight: t.fuerte, fontSize: fsEtiqueta * 1.15, color, fontVariantNumeric: "tabular-nums", lineHeight: 1, scale: esMax && lider ? 1 + 0.15 * resalte : 1, transformOrigin: "right bottom" }}>
                {formatear(d.valor * Math.min(1, crec), dec)}
                {/* "50 votos", pero "43,9%" (las unidades de una o dos letras van pegadas) */}
                {unidad ? (unidad.length > 2 ? ` ${unidad}` : unidad) : ""}
              </div>
            </div>
            <div style={{ marginTop: 10, height: fila * 0.36, width: anchoBarraMax, borderRadius: 18, backgroundColor: `${t.colores.texto}14`, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: ancho,
                  borderRadius: 18,
                  background: `linear-gradient(90deg, ${color}AA, ${color})`,
                  boxShadow: esMax && lider ? `0 0 ${(20 + 30 * latidoLider) * resalte}px ${color}` : "none",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div style={{ position: "absolute", top: 0, bottom: 0, width: 90, left: `${interpolate((frame + i * 9) % 45, [0, 45], [-30, 130])}%`, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)" }} />
              </div>
            </div>
          </div>
        );
      })}
      <Destello en={momentoLider} radio={160} color={t.colores.acento} x={CAJA_CONTENIDO.ancho - 120} y={yInicio + iMax * fila + fila * 0.5} />
      {/* después del ganador: la ventaja sobre el segundo, en una placa que entra y flota */}
      {segundo !== undefined && lider ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: yInicio + datos.length * fila + 10,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "12px 30px",
              borderRadius: 40,
              backgroundColor: `${t.colores.acento}22`,
              border: `3px solid ${t.colores.acento}`,
              fontFamily: t.fuente,
              fontWeight: t.fuerte,
              fontSize: 44,
              color: t.colores.texto,
              scale: placa,
              translate: `0 ${8 * Math.sin(frame / 9)}px`,
            }}
          >
            <Icono nombre="trending-up" tam={48} color={t.colores.acento} grosor={2.6} dibujo={placa * 1.4} />
            {`+${formatear(ventaja * Math.min(1, placa), dec)}${unidad === "%" ? " pts" : unidad ? (unidad.length > 2 ? ` ${unidad}` : unidad) : ""}`}
            <span style={{ fontWeight: t.medio, fontSize: 32, color: `${t.colores.texto}BB` }}>de ventaja</span>
          </div>
        </div>
      ) : null}
    </div>
  );
};

const D = 470;
const GROSOR = 96;

/**
 * Torta (dona): cada porción se dibuja una tras otra; en el centro se va mostrando la porción que se dibuja
 * y al final la mayor se separa un poco y late. La leyenda aparece a la par.
 */
const Torta: React.FC<Props> = ({ titulo, unidad, datos }) => {
  const spring = useResorte();
  const { frame, fps, dur } = useTiempo();
  const t = useTipo();
  const { kit } = useMarca();
  const colores = paleta(t.colores, kit);
  const total = datos.reduce((a, d) => a + d.valor, 0) || 1;
  const r = (D - GROSOR) / 2;
  const circ = 2 * Math.PI * r;
  const altoTitulo = titulo ? 100 : 0;
  const finDibujo = Math.min(dur * 0.55, fps * 0.7 * datos.length + 8);
  const avance = interpolate(frame, [6, finDibujo], [0, 1], { ...CLAMP, easing: Easing.inOut(Easing.cubic) });
  const iMax = datos.reduce((m, d, i) => (d.valor > (datos[m]?.valor ?? 0) ? i : m), 0);
  const final = frame >= finDibujo;
  const resalte = final ? spring({ frame: frame - finDibujo, fps, config: { damping: 9 } }) : 0;
  const dec = Math.max(...datos.map((d) => decimalesDe(d.valor)));

  let acumulado = 0;
  const porciones = datos.map((d, i) => {
    const desde = acumulado / total;
    acumulado += d.valor;
    const hasta = acumulado / total;
    const visible = Math.max(0, Math.min(avance, hasta) - desde);
    return { d, i, desde, hasta, visible };
  });
  const enCurso = porciones.find((p) => avance >= p.desde && avance < p.hasta) ?? porciones[iMax]!;
  const centro = final ? porciones[iMax]! : enCurso;

  return (
    <div style={{ position: "absolute", left: CAJA_CONTENIDO.x, top: CAJA_CONTENIDO.y, width: CAJA_CONTENIDO.ancho, height: CAJA_CONTENIDO.alto }}>
      <div style={{ position: "absolute", top: 0, width: "100%", display: "flex", justifyContent: "center" }}>
        <TituloPildora texto={titulo} />
      </div>
      <div style={{ position: "absolute", left: (CAJA_CONTENIDO.ancho - D) / 2, top: altoTitulo + 10, width: D, height: D, rotate: `${interpolate(frame, [0, dur], [-100, -80])}deg` }}>
        <svg width={D} height={D} style={{ overflow: "visible" }}>
          {porciones.map(({ i, desde, visible, hasta }) => {
            const medio = ((desde + hasta) / 2) * Math.PI * 2;
            const sep = i === iMax ? 22 * resalte : 0;
            return (
              <circle
                key={i}
                cx={D / 2 + Math.cos(medio) * sep}
                cy={D / 2 + Math.sin(medio) * sep}
                r={r}
                fill="none"
                stroke={colores[i % colores.length]}
                strokeWidth={GROSOR * (i === iMax ? 1 + 0.12 * resalte : 1)}
                strokeDasharray={`${circ * visible} ${circ}`}
                transform={`rotate(${desde * 360} ${D / 2} ${D / 2})`}
              />
            );
          })}
        </svg>
      </div>
      <div
        style={{
          position: "absolute",
          left: (CAJA_CONTENIDO.ancho - D) / 2,
          top: altoTitulo + 10,
          width: D,
          height: D,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: t.fuente,
          color: t.colores.texto,
        }}
      >
        <div style={{ fontWeight: t.fuerte, fontSize: 62, lineHeight: 1, color: colores[centro.i % colores.length], scale: 1 + 0.1 * resalte * Math.sin(frame / 5) }}>
          {formatear(centro.d.valor, dec)}
          {unidad ?? ""}
        </div>
        <div style={{ fontWeight: t.medio, fontSize: 28, maxWidth: D - GROSOR * 2 - 40, textAlign: "center", lineHeight: 1.1, marginTop: 6 }}>{centro.d.etiqueta}</div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: altoTitulo + D + 40, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "14px 30px" }}>
        {porciones.map(({ d, i, desde }) => {
          const ap = spring({ frame: frame - (6 + desde * (finDibujo - 6)), fps, config: { damping: 12 } });
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, opacity: ap, scale: interpolate(ap, [0, 1], [0.6, 1]), fontFamily: t.fuente, fontWeight: t.fuerte, fontSize: 36, color: t.colores.texto }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: colores[i % colores.length] }} />
              {d.etiqueta}
            </div>
          );
        })}
      </div>
    </div>
  );
};
