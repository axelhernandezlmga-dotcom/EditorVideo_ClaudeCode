import { interpolate } from "remotion";
import { oscurecer } from "../color";
import { useIlu } from "../estilo";
import { Capa, MARGEN, ANCHO_ESC, NubesQuePasan, Piso } from "./comunes";
import type { FichaEscenario, PropsEscenario } from "./tipos";

export const PISO_INTERIOR = 1110;

const Pared: React.FC<{ color: string; zocalo: string }> = ({ color, zocalo }) => {
  const { c, linea } = useIlu();
  return (
    <g>
      <rect x={-MARGEN} y={0} width={ANCHO_ESC} height={PISO_INTERIOR} fill={c(color)} />
      <rect x={-MARGEN} y={PISO_INTERIOR - 60} width={ANCHO_ESC} height={60} fill={c(zocalo)} {...linea(0.8)} />
    </g>
  );
};

/** Baldosas en perspectiva simple. */
const Baldosas: React.FC<{ color: string }> = ({ color }) => {
  const { c } = useIlu();
  const linea2 = oscurecer(c(color), 0.12);
  return (
    <g>
      <Piso y={PISO_INTERIOR} color={color} />
      {Array.from({ length: 7 }, (_, i) => (
        <line key={`h${i}`} x1={-MARGEN} y1={PISO_INTERIOR + 40 + i * i * 22} x2={1080 + MARGEN} y2={PISO_INTERIOR + 40 + i * i * 22} stroke={linea2} strokeWidth={3} />
      ))}
      {Array.from({ length: 15 }, (_, i) => {
        const x = -MARGEN + i * (ANCHO_ESC / 14);
        return <line key={`v${i}`} x1={540 + (x - 540) * 0.6} y1={PISO_INTERIOR} x2={540 + (x - 540) * 2.2} y2={1920} stroke={linea2} strokeWidth={3} />;
      })}
    </g>
  );
};

const RelojPared: React.FC<{ x: number; y: number; t: number; fps: number }> = ({ x, y, t, fps }) => {
  const { c, linea } = useIlu();
  const seg = t / fps;
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={58} fill={c("blanco")} {...linea()} />
      <line x1={0} y1={0} x2={0} y2={-26} {...linea(1.8)} transform={`rotate(${120 + seg * 3})`} />
      <line x1={0} y1={0} x2={0} y2={-42} {...linea(1.2)} transform={`rotate(${seg * 36})`} />
      <line x1={0} y1={6} x2={0} y2={-46} stroke={c("acento2")} strokeWidth={2.5} transform={`rotate(${Math.floor(seg) * 6})`} />
      <circle r={5} fill={c("#231F38")} />
    </g>
  );
};

const Ventana: React.FC<{ x: number; y: number; w: number; h: number; t: number; fps: number; persiana?: boolean }> = ({ x, y, w, h, t, fps, persiana }) => {
  const { c, linea } = useIlu();
  return (
    <g>
      <defs>
        <clipPath id={`ventana-${x}-${y}`}>
          <rect x={x} y={y} width={w} height={h} />
        </clipPath>
      </defs>
      <rect x={x} y={y} width={w} height={h} fill={c("cielo")} />
      <g clipPath={`url(#ventana-${x}-${y})`}>
        <g transform={`translate(${x - 300} ${y - 120})`}>
          <NubesQuePasan t={t} fps={fps} y={80} cantidad={3} velocidad={14} />
        </g>
      </g>
      {persiana
        ? Array.from({ length: Math.floor(h / 26) }, (_, i) => <rect key={i} x={x} y={y + i * 26} width={w} height={12} fill={c("#E8E4DA")} fillOpacity={0.85} />)
        : null}
      <rect x={x} y={y} width={w} height={h} fill="none" {...linea(2)} stroke={c("blanco")} />
      <rect x={x} y={y} width={w} height={h} fill="none" {...linea()} />
      <line x1={x + w / 2} y1={y} x2={x + w / 2} y2={y + h} {...linea(0.8)} />
    </g>
  );
};

/** Oficina pública: mostrador de atención, número de turno que avanza, reloj, planta y banco de espera. */
export const OficinaPublica: React.FC<PropsEscenario> = ({ t, fps, camara }) => {
  const { c, linea, sombra } = useIlu();
  const seg = t / fps;
  const turno = 47 + Math.floor(seg / 2.5);
  const destello = interpolate(seg % 2.5, [0, 0.15, 0.4], [1, 0.3, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <g>
      <Pared color="#DCE5E1" zocalo="#9EB3AA" />
      <Capa camara={camara} prof={0.3}>
        <Ventana x={-120} y={300} w={300} h={380} t={t} fps={fps} persiana />
        <RelojPared x={560} y={330} t={t} fps={fps} />
        {/* cartel de turnos */}
        <rect x={720} y={260} width={300} height={150} rx={10} fill={c("negro")} {...linea()} />
        <text x={870} y={300} textAnchor="middle" fontSize={26} fontWeight={700} fill="#9AE6A0" fontFamily="monospace">
          NÚMERO
        </text>
        <text x={870} y={385} textAnchor="middle" fontSize={78} fontWeight={900} fill="#9AE6A0" fillOpacity={1 - destello * 0.6} fontFamily="monospace">
          {String(turno).padStart(3, "0")}
        </text>
      </Capa>
      <Capa camara={camara} prof={0.6}>
        {/* mostrador con vidrio */}
        <rect x={260} y={560} width={600} height={70} rx={6} fill={c("acento")} {...linea()} />
        <text x={560} y={608} textAnchor="middle" fontSize={34} fontWeight={800} fill={c("#231F38")} fontFamily="sans-serif">
          ATENCIÓN AL PÚBLICO
        </text>
        <rect x={260} y={640} width={600} height={240} fill={c("celeste")} fillOpacity={0.35} {...linea()} />
        <rect x={230} y={880} width={660} height={170} fill={c("madera")} {...linea()} />
        <rect x={230} y={880} width={660} height={26} fill={oscurecer(c("madera"), 0.2)} {...linea(0.8)} />
        <path d="M 760 906 L 890 906 L 890 1050 L 760 1050 Z" {...sombra("madera")} />
        {/* pila de expedientes que crece y baja */}
        {Array.from({ length: 4 + Math.round(Math.sin(seg * 0.8) * 1.5) }, (_, i) => (
          <rect key={i} x={300} y={862 - i * 14} width={110} height={14} fill={c(i % 2 ? "crema" : "blanco")} {...linea(0.6)} />
        ))}
      </Capa>
      <Capa camara={camara} prof={1}>
        <Baldosas color="#C9C2B4" />
        {/* banco de espera y planta */}
        <rect x={-200} y={PISO_INTERIOR - 130} width={300} height={30} rx={6} fill={c("azul")} {...linea()} />
        <rect x={-180} y={PISO_INTERIOR - 100} width={14} height={100} fill={c("grisOscuro")} />
        <rect x={60} y={PISO_INTERIOR - 100} width={14} height={100} fill={c("grisOscuro")} />
        <g transform={`translate(980 ${PISO_INTERIOR})`}>
          <path d="M -40 0 L -50 -80 L 50 -80 L 40 0 Z" fill={c("ladrillo")} {...linea()} />
          {[-30, 0, 30].map((a, i) => (
            <path key={a} d="M 0 -80 Q -30 -170 0 -240 Q 30 -170 0 -80 Z" fill={c("verde")} {...linea(0.8)} transform={`rotate(${a + Math.sin(seg * 1.2 + i) * 3} 0 -80)`} />
          ))}
        </g>
      </Capa>
    </g>
  );
};

/** Aula: pizarrón donde se va escribiendo, bancos, ventana y reloj. */
export const Aula: React.FC<PropsEscenario> = ({ t, fps, camara }) => {
  const { c, linea } = useIlu();
  const seg = t / fps;
  const escrito = (seg * 0.5) % 1.2;
  return (
    <g>
      <Pared color="#F0E6CF" zocalo="#B79D74" />
      <Capa camara={camara} prof={0.3}>
        <Ventana x={850} y={280} w={300} h={420} t={t} fps={fps} />
        <RelojPared x={-60} y={320} t={t} fps={fps} />
      </Capa>
      <Capa camara={camara} prof={0.5}>
        <rect x={60} y={250} width={700} height={430} rx={8} fill={c("madera")} {...linea()} />
        <rect x={80} y={270} width={660} height={390} fill={c("#2F4A3E")} />
        {[0, 1, 2, 3].map((i) => {
          const largo = 520 - i * 90;
          const k = Math.max(0, Math.min(1, (escrito - i * 0.22) / 0.22));
          return <path key={i} d={`M 120 ${330 + i * 80} q 20 -20 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0`} fill="none" stroke="#F4F1E6" strokeWidth={6} strokeLinecap="round" strokeDasharray={largo * 1.6} strokeDashoffset={largo * 1.6 * (1 - k)} />;
        })}
        <rect x={100} y={660} width={200} height={14} fill={c("blanco")} {...linea(0.6)} />
      </Capa>
      <Capa camara={camara} prof={1}>
        <Piso y={PISO_INTERIOR} color="#C49A6C" />
        {Array.from({ length: 10 }, (_, i) => (
          <line key={i} x1={-MARGEN} y1={PISO_INTERIOR + 30 + i * i * 9} x2={1080 + MARGEN} y2={PISO_INTERIOR + 30 + i * i * 9} stroke={oscurecer(c("#C49A6C"), 0.12)} strokeWidth={3} />
        ))}
        {/* bancos del frente (de espaldas a la cámara) */}
        {[-120, 300, 720, 1140].map((x) => (
          <g key={x} transform={`translate(${x} ${PISO_INTERIOR + 260})`}>
            <rect x={-150} y={-40} width={300} height={36} rx={6} fill={c("madera")} {...linea()} />
            <rect x={-130} y={-4} width={16} height={160} fill={c("grisOscuro")} />
            <rect x={114} y={-4} width={16} height={160} fill={c("grisOscuro")} />
          </g>
        ))}
      </Capa>
    </g>
  );
};

export const ESCENARIOS_INTERIORES: Record<string, FichaEscenario> = {
  oficina_publica: { nombre: "Oficina pública", etiquetas: ["oficina", "trámite", "burocracia", "BPS", "ventanilla", "Estado", "atención"], piso: PISO_INTERIOR, vivos: ["número de turno", "reloj", "nubes en la ventana", "planta"], Dibujo: OficinaPublica },
  aula: { nombre: "Aula", etiquetas: ["aula", "escuela", "liceo", "clase", "educación", "explicar"], piso: PISO_INTERIOR, vivos: ["pizarrón que se escribe", "reloj", "nubes"], Dibujo: Aula },
};
