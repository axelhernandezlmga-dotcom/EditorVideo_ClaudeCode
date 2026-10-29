import { Easing, interpolate } from "remotion";
import type { z } from "zod";
import { CAJA_CONTENIDO } from "../../shared/render";
import type { PropsPorPlantilla } from "../../shared/schemas";
import { esEmoji, Icono, resolverIcono } from "../iconos/Icono";
import { CLAMP, TextoCinetico, useEntrada, useTiempo, useTipo, useResorte } from "./comun";

const TAM = 330;

type Movimiento = "urna" | "reloj" | "reloj_arena" | "balanza" | "golpe" | "latido" | "campana" | "giro" | "flotar" | "subir";

/** Qué animación propia corresponde a cada ícono. */
export const movimientoDe = (nombre: string): Movimiento => {
  if (esEmoji(nombre)) return /[⏰⏱⌛⏳🕐-🕧]/u.test(nombre) ? "reloj" : /🗳/u.test(nombre) ? "urna" : /❤|💓|💗/u.test(nombre) ? "latido" : "flotar";
  const n = resolverIcono(nombre) ?? "";
  if (/^(vote|ballot|box|archive|inbox)/.test(n)) return "urna";
  if (/hourglass/.test(n)) return "reloj_arena";
  if (/^(clock|timer|alarm|watch|history)/.test(n)) return "reloj";
  if (/^scale/.test(n)) return "balanza";
  if (/^(gavel|hammer|stamp)/.test(n)) return "golpe";
  if (/heart/.test(n)) return "latido";
  if (/^(bell|megaphone|siren|volume|phone)/.test(n)) return "campana";
  if (/^(globe|earth|refresh|rotate|loader|sun|settings|cog|fan|recycle)/.test(n)) return "giro";
  if (/trending-up|arrow-up|rocket|chart|plane/.test(n)) return "subir";
  return "flotar";
};

/** Urna: una boleta cae por la ranura cada ~1,3 s; la urna rebota al recibirla y aparece un ✓. */
const Urna: React.FC<{ color: string; acento: string; fondo: string }> = ({ color, acento, fondo }) => {
  const spring = useResorte();
  const { frame, fps } = useTiempo();
  const ciclo = Math.round(fps * 1.3);
  const f = (frame - 8) % ciclo;
  const vuelta = Math.floor((frame - 8) / ciclo);
  const caida = interpolate(f, [0, ciclo * 0.45], [0, 1], { ...CLAMP, easing: Easing.in(Easing.quad) });
  const golpe = f > ciclo * 0.45 ? spring({ frame: f - ciclo * 0.45, fps, config: { damping: 6, stiffness: 260 } }) : 1;
  const check = frame > 8 + ciclo * 0.45 ? interpolate(frame, [8 + ciclo * 0.45, 8 + ciclo * 0.45 + 10], [0, 1], CLAMP) : 0;
  const dibujo = interpolate(frame, [0, 18], [0, 1], CLAMP);
  return (
    <svg width={TAM} height={TAM} viewBox="0 0 200 200" style={{ overflow: "visible" }}>
      {/* boleta */}
      {frame >= 8 ? (
        <g transform={`translate(0 ${interpolate(caida, [0, 1], [-120, 40])})`} opacity={caida < 1 ? 1 : 0}>
          <rect x={72} y={20} width={56} height={70} rx={6} fill={color} stroke={fondo} strokeWidth={3} />
          <path d={`M84 52 l10 10 l20 -22`} stroke={acento} strokeWidth={7} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ) : null}
      {/* urna (tapa con ranura + caja) */}
      <g transform={`translate(100 175) scale(${1 + 0.07 * (1 - golpe)} ${1 - 0.07 * (1 - golpe)}) translate(-100 -175)`}>
        <rect x={30} y={84} width={140} height={92} rx={14} fill={`${acento}33`} stroke={acento} strokeWidth={7} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - dibujo} />
        <rect x={20} y={70} width={160} height={22} rx={8} fill={acento} opacity={dibujo} />
        <rect x={68} y={76} width={64} height={9} rx={4} fill={fondo} opacity={dibujo} />
        <path d="M78 132 l16 16 l30 -32" stroke={color} strokeWidth={10} fill="none" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - check} />
        <text x={100} y={172} textAnchor="middle" fontSize={14} fill={color} opacity={vuelta >= 1 ? 0.8 : 0} fontWeight={900}>
          {"✓".repeat(Math.min(4, Math.max(0, vuelta)))}
        </text>
      </g>
    </svg>
  );
};

/** Reloj: aguja larga que gira rápido, corta lenta, y las marcas de la esfera se dibujan. */
const Reloj: React.FC<{ color: string; acento: string }> = ({ color, acento }) => {
  const { frame } = useTiempo();
  const dibujo = interpolate(frame, [0, 20], [0, 1], CLAMP);
  return (
    <svg width={TAM} height={TAM} viewBox="0 0 200 200">
      <circle cx={100} cy={100} r={86} fill={`${acento}22`} stroke={acento} strokeWidth={9} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - dibujo} transform="rotate(-90 100 100)" />
      {Array.from({ length: 12 }, (_, i) => (
        <line key={i} x1={100} y1={24} x2={100} y2={i % 3 === 0 ? 40 : 33} stroke={color} strokeWidth={i % 3 === 0 ? 7 : 4} strokeLinecap="round" transform={`rotate(${i * 30} 100 100)`} opacity={interpolate(frame, [i * 1.2, i * 1.2 + 4], [0, 1], CLAMP)} />
      ))}
      <line x1={100} y1={100} x2={100} y2={58} stroke={color} strokeWidth={10} strokeLinecap="round" transform={`rotate(${frame * 1.2} 100 100)`} />
      <line x1={100} y1={100} x2={100} y2={36} stroke={acento} strokeWidth={6} strokeLinecap="round" transform={`rotate(${frame * 14} 100 100)`} />
      <circle cx={100} cy={100} r={9} fill={color} />
    </svg>
  );
};

/**
 * Ícono grande con animación propia según el tipo (urna que recibe un voto, reloj que gira, balanza que oscila,
 * martillo que golpea, corazón que late…) sobre un halo de rayos que giran; el texto aparece con la voz.
 */
export const IconoTexto: React.FC<z.infer<typeof PropsPorPlantilla.icono_texto>> = ({ icono, texto, subtitulo }) => {
  const spring = useResorte();
  const { frame, fps, dur } = useTiempo();
  const t = useTipo();
  const mov = movimientoDe(icono);
  const entrada = spring({ frame, fps, config: { damping: 9, mass: 0.8 } });
  const dibujo = interpolate(frame, [2, 24], [0, 1], CLAMP);
  const s = frame / fps;

  let transformacion: React.CSSProperties = {};
  const ciclo = (periodo: number) => ((frame % periodo) + periodo) % periodo;
  switch (mov) {
    case "balanza":
      transformacion = { rotate: `${12 * Math.sin(s * 3.2)}deg`, transformOrigin: "50% 20%" };
      break;
    case "golpe": {
      const c = ciclo(Math.round(fps * 0.9));
      const ang = c < 10 ? interpolate(c, [0, 10], [-40, 18], { easing: Easing.in(Easing.cubic) }) : interpolate(c, [10, 26], [18, -40], CLAMP);
      transformacion = { rotate: `${ang}deg`, transformOrigin: "80% 80%", translate: c >= 10 && c < 14 ? `${(c % 2) * 8 - 4}px 6px` : undefined };
      break;
    }
    case "latido": {
      const c = ciclo(Math.round(fps * 0.8));
      transformacion = { scale: 1 + 0.16 * Math.max(0, Math.sin((c / (fps * 0.8)) * Math.PI * 4)) * (c < fps * 0.4 ? 1 : 0) };
      break;
    }
    case "campana": {
      const c = ciclo(Math.round(fps * 1.2));
      transformacion = { rotate: `${18 * Math.sin(c * 0.9) * Math.exp(-c / 10)}deg`, transformOrigin: "50% 8%" };
      break;
    }
    case "giro":
      transformacion = { rotate: `${frame * 2.4}deg` };
      break;
    case "reloj_arena": {
      const c = ciclo(Math.round(fps * 1.5));
      const vueltas = Math.floor(frame / Math.round(fps * 1.5));
      transformacion = { rotate: `${vueltas * 180 + interpolate(c, [fps * 1.1, fps * 1.5], [0, 180], { ...CLAMP, easing: Easing.inOut(Easing.cubic) })}deg` };
      break;
    }
    case "subir":
      transformacion = { translate: `${6 * Math.sin(s * 2)}px ${-14 * Math.abs(Math.sin(s * 2.4))}px`, rotate: `${-4 + 4 * Math.sin(s * 2.4)}deg` };
      break;
    case "flotar":
      transformacion = { translate: `0 ${16 * Math.sin(s * 2.2)}px`, rotate: `${6 * Math.sin(s * 1.6)}deg` };
      break;
    default:
      break;
  }

  const textoDesde = 10;
  const sub = useEntrada(Math.round(dur * 0.45));
  const altoIcono = 400;

  return (
    <div style={{ position: "absolute", left: CAJA_CONTENIDO.x, top: CAJA_CONTENIDO.y, width: CAJA_CONTENIDO.ancho, height: CAJA_CONTENIDO.alto }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: "100%", height: altoIcono, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {/* halo con rayos */}
        <div
          style={{
            position: "absolute",
            width: 520,
            height: 520,
            borderRadius: "50%",
            background: `repeating-conic-gradient(${t.colores.acento}40 0deg 8deg, transparent 8deg 24deg)`,
            maskImage: "radial-gradient(circle, black 30%, transparent 70%)",
            rotate: `${frame * 0.8}deg`,
            scale: entrada * (1 + 0.05 * Math.sin(s * 3)),
          }}
        />
        <div style={{ position: "absolute", width: 380, height: 380, borderRadius: "50%", background: `radial-gradient(circle, ${t.colores.acento}40, transparent 70%)`, scale: entrada }} />
        <div style={{ scale: interpolate(entrada, [0, 1], [0.2, 1]), rotate: `${interpolate(entrada, [0, 1], [-30, 0])}deg` }}>
          <div style={transformacion}>
            {mov === "urna" && !esEmoji(icono) ? (
              <Urna color={t.colores.texto} acento={t.colores.acento} fondo={t.colores.fondo} />
            ) : mov === "reloj" && !esEmoji(icono) ? (
              <Reloj color={t.colores.texto} acento={t.colores.acento} />
            ) : (
              <Icono nombre={icono} tam={TAM} color={t.colores.acento} dibujo={dibujo} grosor={1.8} relleno={`${t.colores.acento}22`} />
            )}
          </div>
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, top: altoIcono + 10, width: "100%", height: subtitulo ? 250 : CAJA_CONTENIDO.alto - altoIcono - 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <TextoCinetico texto={texto} alto={subtitulo ? 240 : CAJA_CONTENIDO.alto - altoIcono - 20} maxFont={90} maxLineas={3} mayusculas desde={textoDesde} />
      </div>
      {subtitulo ? (
        <div style={{ position: "absolute", left: 0, top: altoIcono + 270, width: "100%", display: "flex", justifyContent: "center", opacity: sub, translate: `0 ${interpolate(sub, [0, 1], [30, 0])}px` }}>
          <TextoCinetico texto={subtitulo} alto={CAJA_CONTENIDO.alto - altoIcono - 280} maxFont={46} maxLineas={2} peso="medio" color={`${t.colores.texto}D9`} sincronizar={false} desde={Math.round(dur * 0.45)} />
        </div>
      ) : null}
    </div>
  );
};
