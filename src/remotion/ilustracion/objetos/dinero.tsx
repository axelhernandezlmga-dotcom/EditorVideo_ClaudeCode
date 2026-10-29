import { azar, oscurecer } from "../color";
import { useIlu } from "../estilo";
import type { FichaObjeto, PropsObjeto } from "./tipos";

/** Signo $ dibujado (las fuentes del sistema lo hacen parecer un 2 o una S). */
const Pesos: React.FC<{ x: number; y: number; alto: number; color: string }> = ({ x, y, alto, color }) => {
  const k = alto / 48;
  return (
    <path
      d="M 11 -13 Q 4 -19 -3 -18 Q -13 -16 -12 -8 Q -11 -2 0 1 Q 12 4 12 11 Q 11 19 0 19 Q -8 19 -13 13 M 0 -25 L 0 25"
      transform={`translate(${x} ${y}) scale(${k})`}
      fill="none"
      stroke={color}
      strokeWidth={5.5 / Math.max(0.6, k)}
      strokeLinecap="round"
    />
  );
};

/** Progreso 0→1 en `seg` segundos. */
const avance = (t: number, fps: number, seg: number) => Math.max(0, Math.min(1, t / (fps * seg)));

export const Billete: React.FC<PropsObjeto> = ({ color }) => {
  const { c, linea, sombra } = useIlu();
  const verde = c(color ?? "billete");
  return (
    <g>
      <rect x={-70} y={-34} width={140} height={68} rx={6} fill={verde} {...linea()} />
      <rect x={-60} y={-25} width={120} height={50} rx={4} fill="none" stroke={oscurecer(verde, 0.3)} strokeWidth={2.5} />
      <circle cx={0} cy={0} r={17} fill={oscurecer(verde, 0.12)} {...linea(0.7)} />
      <Pesos x={0} y={0} alto={24} color={oscurecer(verde, 0.55)} />
      <path d="M -70 10 L -70 34 L 70 34 L 70 10 Z" {...sombra(color ?? "billete")} />
    </g>
  );
};

export const Moneda: React.FC<PropsObjeto> = ({ accion, t, fps }) => {
  const { c, linea } = useIlu();
  const oro = c("oro");
  // "girar_moneda": gira sobre su eje (se achica en x)
  const giro = accion === "girar_moneda" ? Math.cos((t / fps) * Math.PI * 3) : 1;
  return (
    <g transform={`scale(${Math.abs(giro) < 0.08 ? 0.08 : giro} 1)`}>
      <circle cx={0} cy={0} r={38} fill={oscurecer(oro, 0.18)} {...linea()} />
      <circle cx={-3} cy={-3} r={34} fill={oro} />
      <circle cx={-3} cy={-3} r={25} fill="none" stroke={oscurecer(oro, 0.3)} strokeWidth={3} />
      <Pesos x={-3} y={-3} alto={30} color={oscurecer(oro, 0.45)} />
      <ellipse cx={-16} cy={-18} rx={7} ry={4} fill="#FFFFFF" fillOpacity={0.6} transform="rotate(-35 -16 -18)" />
    </g>
  );
};

/** Pila de monedas: con "apilarse" van cayendo una por una. */
export const PilaMonedas: React.FC<PropsObjeto> = ({ accion, t, fps }) => {
  const { c, linea } = useIlu();
  const oro = c("oro");
  const n = 7;
  const hechas = accion === "apilarse" ? Math.min(n, Math.floor(t / (fps * 0.22)) + 1) : n;
  return (
    <g>
      {Array.from({ length: hechas }, (_, i) => {
        const llegada = accion === "apilarse" ? avance(t - i * fps * 0.22, fps, 0.2) : 1;
        const y = 64 - i * 18 - (1 - llegada) * 260;
        return (
          <g key={i} transform={`translate(${(azar(i + 4) - 0.5) * 8} ${y})`}>
            <rect x={-46} y={-9} width={92} height={18} rx={8} fill={oscurecer(oro, 0.15)} {...linea()} />
            <ellipse cx={0} cy={-9} rx={46} ry={9} fill={oro} {...linea()} />
          </g>
        );
      })}
    </g>
  );
};

/** Alcancía chanchito: con "llenarse" le caen monedas por la ranura y engorda; con "romperse" se raja. */
export const Alcancia: React.FC<PropsObjeto> = ({ accion, t, fps, color }) => {
  const { c, linea, sombra } = useIlu();
  const rosa = c(color ?? "#F2A7B5");
  const seg = t / fps;
  const llena = accion === "llenarse" ? Math.min(1, seg / 3) : 0;
  const crece = 1 + llena * 0.12 + (accion === "llenarse" ? Math.max(0, Math.sin(seg * Math.PI * 2.5)) * 0.03 : 0);
  const caida = (seg * 2.5) % 1;
  return (
    <g>
      {accion === "llenarse" ? (
        <g transform={`translate(0 ${-150 + caida * 120}) scale(${0.45})`} opacity={caida < 0.9 ? 1 : 0}>
          <circle r={38} fill={c("oro")} {...linea(1.6)} />
        </g>
      ) : null}
      <g transform={`translate(0 ${70}) scale(${crece}) translate(0 ${-70})`}>
        {[-50, -20, 20, 50].map((x) => (
          <rect key={x} x={x - 9} y={38} width={18} height={30} rx={6} fill={oscurecer(rosa, 0.1)} {...linea()} />
        ))}
        <ellipse cx={0} cy={0} rx={100} ry={64} fill={rosa} {...linea()} />
        <path d="M -70 -46 L -52 -84 L -32 -54 Z" fill={oscurecer(rosa, 0.08)} {...linea()} />
        <ellipse cx={92} cy={6} rx={22} ry={26} fill={oscurecer(rosa, 0.1)} {...linea()} />
        <circle cx={88} cy={0} r={4} fill={c("#7A3B48")} />
        <circle cx={97} cy={12} r={4} fill={c("#7A3B48")} />
        <circle cx={56} cy={-22} r={6} fill={c("#231F38")} />
        <rect x={-30} y={-62} width={50} height={8} rx={4} fill={c("#7A3B48")} />
        <path d="M -100 -4 q -22 -10 -16 -26 q 8 -10 14 4" fill="none" {...linea(1.2)} />
        <path d="M -80 30 Q 0 76 80 30 Q 0 64 -80 30 Z" {...sombra(color ?? "#F2A7B5")} />
        {accion === "romperse" && seg > 0.3 ? <path d="M -10 -60 L 6 -20 L -12 4 L 10 40" fill="none" {...linea(1.3)} /> : null}
      </g>
    </g>
  );
};

export const Maletin: React.FC<PropsObjeto> = ({ accion, t, fps }) => {
  const { c, linea, sombra } = useIlu();
  const cuero = c("#6E4A2E");
  const abre = accion === "abrirse" ? avance(t, fps, 0.5) : 0;
  return (
    <g>
      <path d="M -28 -50 L -28 -70 Q -28 -78 -20 -78 L 20 -78 Q 28 -78 28 -70 L 28 -50" fill="none" {...linea(2.4)} />
      <rect x={-82} y={-52} width={164} height={110} rx={10} fill={cuero} {...linea()} />
      {abre > 0 ? (
        <g transform={`translate(0 ${-52}) scale(1 ${1 - abre * 1.6}) translate(0 52)`}>
          <rect x={-82} y={-52} width={164} height={44} rx={8} fill={oscurecer(cuero, 0.15)} {...linea()} />
        </g>
      ) : null}
      {abre > 0.3
        ? [-40, 0, 40].map((x, i) => (
            <rect key={x} x={x - 26} y={-30 - abre * 40 - i * 6} width={52} height={26} rx={3} fill={c("billete")} {...linea(0.7)} transform={`rotate(${(i - 1) * 10} ${x} -30)`} />
          ))
        : null}
      <line x1={-82} y1={-8} x2={82} y2={-8} {...linea(0.8)} />
      <rect x={-12} y={-16} width={24} height={16} rx={3} fill={c("oro")} {...linea(0.8)} />
      <path d="M -82 20 L 82 20 L 82 48 Q 82 58 72 58 L -72 58 Q -82 58 -82 48 Z" {...sombra("#6E4A2E")} />
    </g>
  );
};

/** Balanza de dos platos: "inclinarse" (gana un lado), "equilibrar" (oscila hasta quedar pareja). */
export const Balanza: React.FC<PropsObjeto> = ({ accion, t, fps }) => {
  const { c, linea } = useIlu();
  const seg = t / fps;
  const metal = c("oro");
  const ang =
    accion === "inclinarse"
      ? -16 * Math.min(1, seg / 0.6) + Math.sin(seg * 3) * 1.2
      : accion === "equilibrar"
        ? 18 * Math.exp(-seg * 1.2) * Math.cos(seg * 5)
        : Math.sin(seg * 1.5) * 3;
  const rad = (ang * Math.PI) / 180;
  const plato = (lado: -1 | 1) => {
    const x = lado * 100 * Math.cos(rad);
    const y = -80 + lado * 100 * Math.sin(rad);
    return (
      <g key={lado} transform={`translate(${x} ${y})`}>
        <line x1={0} y1={0} x2={-34} y2={60} {...linea(0.8)} />
        <line x1={0} y1={0} x2={34} y2={60} {...linea(0.8)} />
        <path d="M -46 60 Q 0 92 46 60 Z" fill={metal} {...linea()} />
      </g>
    );
  };
  return (
    <g>
      <path d="M -60 120 L 60 120 L 40 100 L -40 100 Z" fill={oscurecer(metal, 0.2)} {...linea()} />
      <rect x={-8} y={-84} width={16} height={190} rx={4} fill={metal} {...linea()} />
      <g transform={`rotate(${ang} 0 -80)`}>
        <rect x={-110} y={-86} width={220} height={12} rx={6} fill={metal} {...linea()} />
      </g>
      <circle cx={0} cy={-90} r={14} fill={oscurecer(metal, 0.1)} {...linea()} />
      {plato(-1)}
      {plato(1)}
    </g>
  );
};

export const OBJETOS_DINERO: Record<string, FichaObjeto> = {
  billete: { nombre: "Billete", etiquetas: ["billete", "plata", "dinero", "pesos", "sueldo", "pago"], acciones: [], tam: [72, 36], Dibujo: Billete },
  moneda: { nombre: "Moneda", etiquetas: ["moneda", "plata", "ahorro", "peso"], acciones: ["girar_moneda"], tam: [40, 40], Dibujo: Moneda },
  pila_monedas: { nombre: "Pila de monedas", etiquetas: ["monedas", "ahorro", "fondo", "acumular", "aportes"], acciones: ["apilarse"], tam: [50, 74], Dibujo: PilaMonedas },
  alcancia: { nombre: "Alcancía", etiquetas: ["alcancía", "chanchito", "ahorro", "fondo", "jubilación", "AFAP"], acciones: ["llenarse", "romperse"], tam: [120, 72], Dibujo: Alcancia },
  maletin: { nombre: "Maletín", etiquetas: ["maletín", "empresa", "negocio", "plata", "corrupción", "ejecutivo"], acciones: ["abrirse"], tam: [84, 60], Dibujo: Maletin },
  balanza: { nombre: "Balanza", etiquetas: ["balanza", "justicia", "equilibrio", "comparar", "ley"], acciones: ["inclinarse", "equilibrar"], tam: [112, 122], Dibujo: Balanza },
};
