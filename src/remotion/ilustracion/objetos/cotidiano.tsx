import { interpolate } from "remotion";
import { oscurecer } from "../color";
import { useIlu } from "../estilo";
import type { FichaObjeto, PropsObjeto } from "./tipos";

const CL = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Chancleta: "golpe" la revolea y la estampa (con un aplastón). */
export const Chancleta: React.FC<PropsObjeto> = ({ accion, t, fps, color }) => {
  const { c, linea, sombra } = useIlu();
  const seg = t / fps;
  const suela = c(color ?? "acento2");
  const ang = accion === "golpe" ? interpolate(seg % 1.2, [0, 0.35, 0.45, 1.2], [-70, 20, 0, 0], CL) : 0;
  return (
    <g transform={`rotate(${ang} -60 20)`}>
      <path d="M -78 6 Q -84 -26 -48 -30 L 50 -26 Q 86 -22 82 4 Q 78 26 44 26 L -46 28 Q -74 30 -78 6 Z" fill={suela} {...linea()} />
      <path d="M -72 12 Q -60 24 -40 24 L 44 22 Q 72 20 76 6" fill="none" stroke={oscurecer(suela, 0.3)} strokeWidth={6} />
      <path d="M 10 -28 Q 34 -66 52 -26" fill="none" stroke={c("blanco")} strokeWidth={14} strokeLinecap="round" />
      <path d="M 10 -28 Q 34 -66 52 -26" fill="none" {...linea(0.8)} />
      <path d="M -40 16 L 44 14 L 44 26 L -46 28 Z" {...sombra(color ?? "acento2")} />
    </g>
  );
};

export const Termo: React.FC<PropsObjeto> = ({ color }) => {
  const { c, linea, sombra } = useIlu();
  const cuerpo = c(color ?? "#4F6D5A");
  return (
    <g>
      <rect x={-30} y={-70} width={60} height={168} rx={14} fill={cuerpo} {...linea()} />
      <rect x={-24} y={-100} width={48} height={34} rx={8} fill={c("plata")} {...linea()} />
      <path d="M 24 -94 L 40 -94 Q 46 -94 46 -86 L 46 -74 L 24 -74" fill={c("plata")} {...linea()} />
      <rect x={-30} y={-28} width={60} height={10} fill={oscurecer(cuerpo, 0.2)} />
      <path d="M 30 -10 Q 52 10 30 40" fill="none" stroke={c("grisOscuro")} strokeWidth={8} strokeLinecap="round" />
      <path d="M 10 -70 L 30 -70 L 30 84 Q 30 98 16 98 L 10 98 Z" {...sombra(color ?? "#4F6D5A")} />
    </g>
  );
};

/** Mate con bombilla: "humear" larga vapor. */
export const Mate: React.FC<PropsObjeto> = ({ accion, t, fps }) => {
  const { c, linea, sombra, p } = useIlu();
  const seg = t / fps;
  const calabaza = c("#8C5A34");
  return (
    <g>
      {accion === "humear"
        ? [0, 1].map((i) => {
            const k = (seg * 0.7 + i * 0.5) % 1;
            return (
              <path key={i} d={`M ${-6 + i * 12} ${-40 - k * 70} q -12 -14 0 -28 q 12 -14 0 -28`} fill="none" stroke={p.tinta} strokeOpacity={(1 - k) * 0.45} strokeWidth={5} strokeLinecap="round" />
            );
          })
        : null}
      <rect x={8} y={-84} width={8} height={70} rx={3} fill={c("plata")} {...linea(0.8)} transform="rotate(14 12 -50)" />
      <path d="M -40 -26 Q -50 30 -20 50 L 20 50 Q 50 30 40 -26 Z" fill={calabaza} {...linea()} />
      <ellipse cx={0} cy={-26} rx={40} ry={9} fill={c("#6C8F3C")} {...linea()} />
      <path d="M -42 -20 L 42 -20" stroke={c("plata")} strokeWidth={8} />
      <path d="M 14 -16 Q 40 0 30 40 L 20 50 L 6 50 Q 30 20 14 -16 Z" {...sombra("#8C5A34")} />
    </g>
  );
};

/** Celular: con "notificacion" vibra y aparecen globitos en la pantalla. */
export const Celular: React.FC<PropsObjeto> = ({ accion, t, fps, color }) => {
  const { c, linea } = useIlu();
  const seg = t / fps;
  const vibra = accion === "notificacion" && seg % 1.2 < 0.3 ? Math.sin(seg * 90) * 4 : 0;
  const n = accion === "notificacion" ? Math.min(3, Math.floor(seg / 0.5) + 1) : 2;
  return (
    <g transform={`translate(${vibra} 0) rotate(${vibra * 0.6})`}>
      <rect x={-50} y={-92} width={100} height={184} rx={16} fill={c("negro")} {...linea()} />
      <rect x={-42} y={-78} width={84} height={150} rx={6} fill={c("celeste")} />
      <rect x={-12} y={78} width={24} height={6} rx={3} fill={c("grisOscuro")} />
      {Array.from({ length: n }, (_, i) => {
        const e = accion === "notificacion" ? interpolate(seg - i * 0.5, [0, 0.2], [0, 1], CL) : 1;
        return (
          <g key={i} transform={`translate(0 ${-56 + i * 42}) scale(${e})`}>
            <rect x={-34} y={-15} width={68} height={30} rx={8} fill={c(i % 2 ? "blanco" : (color ?? "acento"))} {...linea(0.6)} />
            <rect x={-26} y={-6} width={36} height={5} rx={2} fill={c("grisOscuro")} />
            <rect x={-26} y={3} width={24} height={4} rx={2} fill={c("gris")} />
          </g>
        );
      })}
    </g>
  );
};

/** Calendario de taco: "pasar_hojas" arranca una hoja cada 0,6 s y el número avanza. */
export const Calendario: React.FC<PropsObjeto> = ({ accion, t, fps, color }) => {
  const { c, linea, sombra } = useIlu();
  const seg = t / fps;
  const pasando = accion === "pasar_hojas";
  const hoja = pasando ? Math.floor(seg / 0.6) : 0;
  const k = pasando ? (seg % 0.6) / 0.6 : 0;
  const tapa = c(color ?? "acento2");
  const numero = (n: number) => ((n + 13) % 31) + 1;
  const pagina = (n: number) => (
    <g>
      <rect x={-72} y={-56} width={144} height={150} rx={6} fill={c("blanco")} {...linea()} />
      <text x={0} y={60} textAnchor="middle" fontSize={84} fontWeight={900} fill={c("#231F38")} fontFamily="sans-serif">
        {numero(n)}
      </text>
    </g>
  );
  return (
    <g>
      {pagina(hoja + 1)}
      {pasando && k < 0.9 ? (
        // la hoja arrancada sale volando hacia arriba y a un costado
        <g transform={`translate(${Math.sqrt(k) * 260} ${-Math.sqrt(k) * 200}) rotate(${Math.sqrt(k) * 40})`} opacity={k < 0.3 ? 1 : Math.max(0, (0.6 - k) / 0.3)}>
          {pagina(hoja)}
        </g>
      ) : (
        !pasando && pagina(hoja)
      )}
      <rect x={-80} y={-92} width={160} height={42} rx={8} fill={tapa} {...linea()} />
      {[-40, 40].map((x) => (
        <rect key={x} x={x - 6} y={-104} width={12} height={28} rx={5} fill={c("plata")} {...linea(0.8)} />
      ))}
      <path d="M 40 -56 L 72 -56 L 72 88 Q 72 94 66 94 L 40 94 Z" {...sombra("blanco")} />
    </g>
  );
};

/** Reloj de pared: "correr" hace girar las agujas rápido (el tiempo pasa). */
export const Reloj: React.FC<PropsObjeto> = ({ accion, t, fps }) => {
  const { c, linea } = useIlu();
  const seg = t / fps;
  const rapido = accion === "correr";
  const minutos = rapido ? seg * 720 : seg * 18;
  const horas = rapido ? seg * 60 : seg * 1.5;
  return (
    <g>
      <circle r={74} fill={c("acento")} {...linea()} />
      <circle r={60} fill={c("blanco")} {...linea(0.8)} />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return <line key={i} x1={Math.sin(a) * 50} y1={-Math.cos(a) * 50} x2={Math.sin(a) * (i % 3 ? 54 : 44)} y2={-Math.cos(a) * (i % 3 ? 54 : 44)} {...linea(i % 3 ? 0.6 : 1)} />;
      })}
      <line x1={0} y1={0} x2={0} y2={-30} {...linea(2)} transform={`rotate(${horas + 60})`} />
      <line x1={0} y1={0} x2={0} y2={-46} {...linea(1.4)} transform={`rotate(${minutos})`} />
      <circle r={6} fill={c("acento2")} {...linea(0.6)} />
    </g>
  );
};

/** Carrito de supermercado: con "andar" las ruedas giran y el carrito se bambolea. */
export const Carrito: React.FC<PropsObjeto> = ({ accion, t, fps }) => {
  const { c, linea, p } = useIlu();
  const seg = t / fps;
  const anda = accion === "andar" || accion === "llenarse";
  const bam = anda ? Math.sin(seg * 9) * 1.5 : 0;
  const metal = c("plata");
  const productos = accion === "llenarse" ? Math.min(4, Math.floor(seg / 0.5) + 1) : 3;
  const colores = ["acento2", "naranja", "billete", "acento"];
  return (
    <g>
      <g transform={`rotate(${bam} 0 60)`}>
        {Array.from({ length: productos }, (_, i) => (
          <rect key={i} x={-58 + i * 30} y={-60 - (i % 2) * 14} width={26} height={44 + (i % 2) * 14} rx={4} fill={c(colores[i]!)} {...linea(0.8)} />
        ))}
        <path d="M -82 -30 L 70 -30 L 56 40 L -66 40 Z" fill={metal} fillOpacity={0.35} {...linea()} />
        {[-50, -20, 10, 40].map((x) => (
          <line key={x} x1={x} y1={-28} x2={x - 4} y2={38} stroke={p.tinta} strokeWidth={p.trazo * 0.6} />
        ))}
        <line x1={-76} y1={6} x2={64} y2={6} stroke={p.tinta} strokeWidth={p.trazo * 0.6} />
        <path d="M 70 -30 L 96 -60 L 112 -60" fill="none" {...linea(1.6)} />
        <path d="M -66 40 L -60 62 L 50 62" fill="none" {...linea(1.4)} />
      </g>
      {[-48, 40].map((x) => (
        <g key={x} transform={`translate(${x} 74) rotate(${anda ? seg * 400 : 0})`}>
          <circle r={14} fill={c("grisOscuro")} {...linea()} />
          <line x1={-8} y1={0} x2={8} y2={0} stroke={metal} strokeWidth={3} />
        </g>
      ))}
    </g>
  );
};

export const OBJETOS_COTIDIANO: Record<string, FichaObjeto> = {
  chancleta: { nombre: "Chancleta", etiquetas: ["chancleta", "ojota", "reto", "castigo", "abuela", "verano"], acciones: ["golpe"], tam: [82, 30], Dibujo: Chancleta },
  termo: { nombre: "Termo", etiquetas: ["termo", "mate", "uruguayo", "rambla", "costumbre"], acciones: [], tam: [46, 100], Dibujo: Termo },
  mate: { nombre: "Mate", etiquetas: ["mate", "yerba", "uruguayo", "charla", "costumbre"], acciones: ["humear"], tam: [44, 50], Dibujo: Mate },
  celular: { nombre: "Celular", etiquetas: ["celular", "teléfono", "redes", "app", "mensaje", "notificación", "internet"], acciones: ["notificacion"], tam: [50, 92], Dibujo: Celular },
  calendario: { nombre: "Calendario", etiquetas: ["calendario", "fecha", "plazo", "días", "tiempo", "vencimiento"], acciones: ["pasar_hojas"], tam: [80, 94], Dibujo: Calendario },
  reloj: { nombre: "Reloj", etiquetas: ["reloj", "tiempo", "hora", "espera", "años", "demora"], acciones: ["correr"], tam: [74, 74], Dibujo: Reloj },
  carrito: { nombre: "Carrito de súper", etiquetas: ["supermercado", "compras", "precios", "inflación", "canasta", "consumo"], acciones: ["andar", "llenarse"], tam: [112, 88], Dibujo: Carrito },
};
