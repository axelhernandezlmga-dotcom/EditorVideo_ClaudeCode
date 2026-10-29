import { azar, oscurecer } from "../color";
import { useIlu } from "../estilo";
import type { FichaObjeto, PropsObjeto } from "./tipos";

const Rueda: React.FC<{ x: number; y: number; r: number; giro: number }> = ({ x, y, r, giro }) => {
  const { c, linea } = useIlu();
  return (
    <g transform={`translate(${x} ${y}) rotate(${giro})`}>
      <circle r={r} fill={c("negro")} {...linea()} />
      <circle r={r * 0.5} fill={c("plata")} {...linea(0.7)} />
      <line x1={-r * 0.45} y1={0} x2={r * 0.45} y2={0} stroke={c("grisOscuro")} strokeWidth={3} />
    </g>
  );
};

/** Auto: con "andar" giran las ruedas, el cuerpo se bambolea y sale humito. */
export const Auto: React.FC<PropsObjeto> = ({ accion, t, fps, color }) => {
  const { c, linea, sombra, p } = useIlu();
  const seg = t / fps;
  const anda = accion === "andar";
  const carro = c(color ?? "acento2");
  const bam = anda ? Math.sin(seg * 14) * 2 : 0;
  return (
    <g>
      {anda
        ? [0, 1, 2].map((i) => {
            const k = (seg * 1.5 + i / 3) % 1;
            return <circle key={i} cx={-150 - k * 60} cy={40 - k * 20} r={8 + k * 14} fill={p.tinta} fillOpacity={(1 - k) * 0.2} />;
          })
        : null}
      <g transform={`translate(0 ${bam})`}>
        <path d="M -140 40 L -140 0 Q -138 -14 -120 -16 L -70 -20 L -40 -62 Q -32 -70 -18 -70 L 56 -70 Q 70 -70 78 -60 L 104 -22 L 132 -16 Q 146 -12 146 6 L 146 40 Z" fill={carro} {...linea()} />
        <path d="M -30 -58 L 8 -58 L 8 -24 L -56 -24 Z" fill={c("celeste")} {...linea(0.8)} />
        <path d="M 20 -58 L 62 -58 Q 68 -58 72 -52 L 90 -24 L 20 -24 Z" fill={c("celeste")} {...linea(0.8)} />
        <rect x={126} y={-6} width={20} height={12} rx={3} fill={c("#FFF2B0")} {...linea(0.6)} />
        <rect x={-142} y={-2} width={14} height={12} rx={3} fill={c("acento2")} {...linea(0.6)} />
        <line x1={14} y1={-24} x2={14} y2={36} {...linea(0.6)} />
        <path d="M -140 20 L 146 20 L 146 40 L -140 40 Z" {...sombra(color ?? "acento2")} />
      </g>
      <Rueda x={-82} y={44} r={26} giro={anda ? seg * 540 : 0} />
      <Rueda x={90} y={44} r={26} giro={anda ? seg * 540 : 0} />
    </g>
  );
};

/** Ómnibus urbano: "andar" igual que el auto; "parar" abre la puerta. */
export const Omnibus: React.FC<PropsObjeto> = ({ accion, t, fps, color }) => {
  const { c, linea, sombra } = useIlu();
  const seg = t / fps;
  const anda = accion === "andar";
  const cuerpo = c(color ?? "#2E7DB8");
  const bam = anda ? Math.sin(seg * 11) * 2 : 0;
  return (
    <g>
      <g transform={`translate(0 ${bam})`}>
        <rect x={-220} y={-110} width={440} height={190} rx={22} fill={cuerpo} {...linea()} />
        <rect x={-220} y={20} width={440} height={22} fill={c("blanco")} />
        {[-190, -120, -50, 20, 90].map((x, i) => (
          <g key={x}>
            <rect x={x} y={-88} width={58} height={70} rx={6} fill={c("celeste")} {...linea(0.8)} />
            {/* pasajeros: cabecitas que se mueven distinto */}
            <circle cx={x + 29} cy={-36 + Math.sin(seg * 4 + i) * 2} r={14} fill={c(["piel2", "piel4", "piel1", "piel3", "piel5"][i]!)} {...linea(0.6)} />
          </g>
        ))}
        <rect x={162} y={-88} width={44} height={150} rx={4} fill={c("celeste")} {...linea(0.8)} />
        {accion === "parar" ? <rect x={162} y={-88} width={44 * Math.max(0, 1 - seg / 0.5)} height={150} fill={cuerpo} /> : null}
        <rect x={190} y={52} width={30} height={16} rx={4} fill={c("#FFF2B0")} {...linea(0.6)} />
        <rect x={-160} y={-132} width={120} height={22} rx={4} fill={c("negro")} {...linea(0.6)} />
        <text x={-100} y={-115} textAnchor="middle" fontSize={16} fontWeight={800} fill={c("#FFB800")} fontFamily="monospace">
          CENTRO
        </text>
        <path d="M -220 44 L 220 44 L 220 60 Q 220 80 198 80 L -198 80 Q -220 80 -220 60 Z" {...sombra(color ?? "#2E7DB8")} />
      </g>
      <Rueda x={-140} y={84} r={30} giro={anda ? seg * 480 : 0} />
      <Rueda x={130} y={84} r={30} giro={anda ? seg * 480 : 0} />
    </g>
  );
};

/** Casa: "luces" prende ventanas de a una; siempre sale humo de la chimenea. */
export const Casa: React.FC<PropsObjeto> = ({ accion, t, fps, color }) => {
  const { c, linea, sombra, p } = useIlu();
  const seg = t / fps;
  const pared = c(color ?? "crema");
  const techo = c("ladrillo");
  const luz = (i: number) => (accion === "luces" ? seg > 0.3 + i * 0.4 : false);
  return (
    <g>
      {[0, 1, 2].map((i) => {
        const k = (seg * 0.5 + i / 3) % 1;
        return <circle key={i} cx={64 + k * 30} cy={-150 - k * 90} r={12 + k * 18} fill={p.tinta} fillOpacity={(1 - k) * 0.18} />;
      })}
      <rect x={50} y={-150} width={30} height={60} fill={oscurecer(techo, 0.15)} {...linea()} />
      <rect x={-112} y={-30} width={224} height={160} fill={pared} {...linea()} />
      <path d="M -134 -24 L 0 -130 L 134 -24 Z" fill={techo} {...linea()} />
      <rect x={-28} y={40} width={56} height={90} rx={4} fill={c("madera")} {...linea()} />
      <circle cx={16} cy={88} r={4} fill={c("oro")} />
      {[-80, 52].map((x, i) => (
        <g key={x}>
          <rect x={x} y={4} width={40} height={40} fill={c(luz(i) ? "#FFE58A" : "celeste")} {...linea(0.8)} />
          <line x1={x + 20} y1={4} x2={x + 20} y2={44} {...linea(0.6)} />
          <line x1={x} y1={24} x2={x + 40} y2={24} {...linea(0.6)} />
        </g>
      ))}
      <path d="M 60 -30 L 112 -30 L 112 130 L 60 130 Z" {...sombra(color ?? "crema")} />
    </g>
  );
};

/** Edificio de oficinas: ventanas que se prenden y apagan ("luces"); de noche brilla más. */
export const Edificio: React.FC<PropsObjeto> = ({ accion, t, fps, color }) => {
  const { c, linea, sombra } = useIlu();
  const seg = t / fps;
  const muro = c(color ?? "hormigon");
  const filas = 9;
  return (
    <g>
      <rect x={-104} y={-226} width={208} height={452} fill={muro} {...linea()} />
      <rect x={-116} y={-240} width={232} height={18} fill={oscurecer(muro, 0.2)} {...linea()} />
      {Array.from({ length: filas }, (_, f) =>
        [0, 1, 2, 3].map((k) => {
          const id = f * 4 + k;
          const prendida = accion === "luces" ? azar(id + Math.floor(seg * 1.5 + azar(id) * 3)) > 0.5 : azar(id) > 0.6;
          return <rect key={id} x={-84 + k * 44} y={-206 + f * 44} width={36} height={30} fill={c(prendida ? "#FFE58A" : "#8FB7D3")} {...linea(0.6)} />;
        }),
      )}
      <rect x={-30} y={176} width={60} height={50} fill={c("#8FB7D3")} {...linea()} />
      <line x1={0} y1={176} x2={0} y2={226} {...linea(0.6)} />
      <path d="M 50 -226 L 104 -226 L 104 226 L 50 226 Z" {...sombra(color ?? "hormigon")} />
    </g>
  );
};

export const OBJETOS_CIUDAD: Record<string, FichaObjeto> = {
  auto: { nombre: "Auto", etiquetas: ["auto", "coche", "tránsito", "combustible", "nafta", "viaje"], acciones: ["andar"], tam: [150, 70], Dibujo: Auto },
  omnibus: { nombre: "Ómnibus", etiquetas: ["ómnibus", "bondi", "transporte", "boleto", "pasajeros"], acciones: ["andar", "parar"], tam: [222, 114], Dibujo: Omnibus },
  casa: { nombre: "Casa", etiquetas: ["casa", "vivienda", "hogar", "alquiler", "familia", "barrio"], acciones: ["luces"], tam: [136, 130], Dibujo: Casa },
  edificio: { nombre: "Edificio de oficinas", etiquetas: ["edificio", "oficinas", "empresa", "banco", "AFAP", "institución"], acciones: ["luces"], tam: [116, 226], Dibujo: Edificio },
};
