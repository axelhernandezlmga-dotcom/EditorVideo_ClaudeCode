import { interpolate } from "remotion";
import { oscurecer } from "../color";
import { useIlu } from "../estilo";
import type { FichaObjeto, PropsObjeto } from "./tipos";

const CL = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Sobre de votación con la papeleta asomando. */
export const Voto: React.FC<PropsObjeto> = ({ color }) => {
  const { c, linea, sombra } = useIlu();
  return (
    <g>
      <rect x={-36} y={-46} width={64} height={52} rx={3} fill={c("blanco")} {...linea()} transform="rotate(-8)" />
      <path d="M -24 -30 l 10 10 l 18 -22" fill="none" stroke={c(color ?? "acento2")} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" transform="rotate(-8)" />
      <rect x={-52} y={-14} width={104} height={50} rx={4} fill={c("crema")} {...linea()} />
      <path d="M -52 -12 L 0 18 L 52 -12" fill="none" {...linea(0.8)} />
      <path d="M -52 20 L 52 20 L 52 32 Q 52 36 48 36 L -48 36 Q -52 36 -52 32 Z" {...sombra("crema")} />
    </g>
  );
};

/** Urna: con "recibir_voto" cae un sobre por la ranura cada 1,5 s. */
export const Urna: React.FC<PropsObjeto> = ({ accion, t, fps }) => {
  const { c, linea, sombra } = useIlu();
  const caja = c("celeste");
  const ciclo = ((t / fps) % 1.5) / 1.5;
  const y = interpolate(ciclo, [0, 0.55, 0.75], [-210, -95, -40], CL);
  return (
    <g>
      {accion === "recibir_voto" && ciclo < 0.75 ? (
        <g transform={`translate(0 ${y}) scale(0.7)`}>
          <rect x={-40} y={-26} width={80} height={44} rx={3} fill={c("crema")} {...linea(1.4)} />
          <path d="M -40 -24 L 0 2 L 40 -24" fill="none" {...linea(1)} />
        </g>
      ) : null}
      <path d="M -96 -70 L 96 -70 L 86 100 L -86 100 Z" fill={caja} fillOpacity={0.85} {...linea()} />
      <path d="M -104 -92 L 104 -92 L 96 -70 L -96 -70 Z" fill={oscurecer(caja, 0.18)} {...linea()} />
      <rect x={-46} y={-87} width={92} height={10} rx={4} fill={c("#231F38")} />
      <rect x={-44} y={-20} width={88} height={56} rx={6} fill={c("blanco")} {...linea(0.8)} />
      <path d="M -24 8 l 14 14 l 30 -34" fill="none" stroke={c("acento2")} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 50 -70 L 96 -70 L 86 100 L 46 100 Z" {...sombra("celeste")} />
    </g>
  );
};

/** Documento con sello: "sellar" baja el sello y deja la marca. */
export const Documento: React.FC<PropsObjeto> = ({ accion, t, fps, color }) => {
  const { c, linea, sombra } = useIlu();
  const seg = t / fps;
  const sello = c(color ?? "acento2");
  const bajada = accion === "sellar" ? interpolate(seg, [0, 0.35, 0.45, 0.8], [-150, 0, 0, -150], CL) : null;
  const marca = accion === "sellar" ? seg > 0.38 : true;
  return (
    <g>
      <path d="M -78 -104 L 50 -104 L 80 -74 L 80 106 L -78 106 Z" fill={c("blanco")} {...linea()} />
      <path d="M 50 -104 L 50 -74 L 80 -74" fill={c("crema")} {...linea(0.8)} />
      {[-70, -50, -30, -10, 10].map((y, i) => (
        <line key={y} x1={-56} y1={y} x2={i === 0 ? 20 : 56} y2={y} stroke={c("gris")} strokeWidth={i === 0 ? 7 : 4} strokeLinecap="round" />
      ))}
      <path d="M -52 80 q 14 -18 26 0 t 26 0" fill="none" stroke={c("azul")} strokeWidth={3} />
      {marca ? (
        <g transform="translate(26 52) rotate(-14)" opacity={0.85}>
          <circle r={30} fill="none" stroke={sello} strokeWidth={5} />
          <circle r={22} fill="none" stroke={sello} strokeWidth={2} />
          <text y={6} textAnchor="middle" fontSize={15} fontWeight={900} fill={sello} fontFamily="sans-serif">
            OK
          </text>
        </g>
      ) : null}
      {bajada !== null ? (
        <g transform={`translate(26 ${52 + bajada - 40})`}>
          <rect x={-30} y={20} width={60} height={14} rx={3} fill={sello} {...linea()} />
          <rect x={-10} y={-26} width={20} height={46} rx={4} fill={c("madera")} {...linea()} />
          <circle cx={0} cy={-34} r={16} fill={c("madera")} {...linea()} />
        </g>
      ) : null}
      <path d="M 40 -74 L 80 -74 L 80 106 L 56 106 Z" {...sombra("blanco")} />
    </g>
  );
};

/** Candado: "cerrar" baja el arco; "abrir" lo sube. */
export const Candado: React.FC<PropsObjeto> = ({ accion, t, fps }) => {
  const { c, linea, sombra } = useIlu();
  const metal = c("oro");
  const seg = t / fps;
  const sube = accion === "abrir" ? interpolate(seg, [0.2, 0.5], [0, 26], CL) : accion === "cerrar" ? interpolate(seg, [0.2, 0.45], [26, 0], CL) : 0;
  const rebote = accion === "cerrar" && seg > 0.45 && seg < 0.7 ? Math.sin(((seg - 0.45) / 0.25) * Math.PI) * 4 : 0;
  return (
    <g transform={`translate(0 ${rebote})`}>
      <g transform={`translate(0 ${-sube})`}>
        <path d="M -32 -10 L -32 -44 Q -32 -80 0 -80 Q 32 -80 32 -44 L 32 -10" fill="none" stroke={c("plata")} strokeWidth={16} strokeLinecap="round" />
        <path d="M -32 -10 L -32 -44 Q -32 -80 0 -80 Q 32 -80 32 -44 L 32 -10" fill="none" stroke={c("#231F38")} strokeWidth={2} />
      </g>
      <rect x={-52} y={-24} width={104} height={98} rx={14} fill={metal} {...linea()} />
      <circle cx={0} cy={14} r={11} fill={c("#231F38")} />
      <rect x={-4} y={18} width={8} height={24} rx={3} fill={c("#231F38")} />
      <path d="M 22 -24 L 38 -24 Q 52 -24 52 -10 L 52 60 Q 52 74 38 74 L 22 74 Z" {...sombra("oro")} />
    </g>
  );
};

/** Megáfono: con "gritar" salen ondas de sonido. */
export const Megafono: React.FC<PropsObjeto> = ({ accion, t, fps, color }) => {
  const { c, linea, p } = useIlu();
  const seg = t / fps;
  const col = c(color ?? "acento2");
  const temblor = accion === "gritar" ? Math.sin(seg * 60) * 1.8 : 0;
  return (
    <g transform={`translate(${temblor} 0)`}>
      <rect x={-78} y={-6} width={26} height={44} rx={8} fill={c("grisOscuro")} {...linea()} transform="rotate(12 -66 16)" />
      <path d="M -80 -22 L -20 -22 L 66 -64 L 66 64 L -20 22 L -80 22 Z" fill={col} {...linea()} />
      <ellipse cx={66} cy={0} rx={14} ry={64} fill={oscurecer(col, 0.25)} {...linea()} />
      <rect x={-96} y={-24} width={22} height={48} rx={6} fill={c("grisOscuro")} {...linea()} />
      {accion === "gritar"
        ? [0, 1, 2].map((i) => {
            const k = (seg * 1.8 + i / 3) % 1;
            return (
              <path key={i} d={`M ${92 + k * 70} ${-40 - k * 30} Q ${116 + k * 80} 0 ${92 + k * 70} ${40 + k * 30}`} fill="none" stroke={p.tinta} strokeWidth={p.trazo * 1.6} strokeLinecap="round" opacity={1 - k} />
            );
          })
        : null}
    </g>
  );
};

/** Bandera genérica de franjas (sin escudos reales): "flamear" la ondula. */
export const Bandera: React.FC<PropsObjeto> = ({ t, fps, color }) => {
  const { c, linea } = useIlu();
  const seg = t / fps;
  const franja = c(color ?? "acento");
  const pts = (y0: number, y1: number) => {
    const ola = (x: number, y: number) => y + Math.sin(seg * 5 - x / 26) * (x / 150) * 12;
    const arriba = Array.from({ length: 9 }, (_, i) => -86 + (i / 8) * 190).map((x) => `${x} ${ola(x + 86, y0)}`);
    const abajo = Array.from({ length: 9 }, (_, i) => 104 - (i / 8) * 190).map((x) => `${x} ${ola(x + 86, y1)}`);
    return `M ${arriba.join(" L ")} L ${abajo.join(" L ")} Z`;
  };
  return (
    <g>
      <rect x={-100} y={-130} width={12} height={262} rx={5} fill={c("madera")} {...linea()} />
      <circle cx={-94} cy={-134} r={10} fill={c("oro")} {...linea()} />
      <path d={pts(-120, -10)} fill={c("blanco")} {...linea()} />
      <path d={pts(-96, -78)} fill={franja} />
      <path d={pts(-60, -42)} fill={franja} />
      <path d={pts(-24, -10)} fill={franja} />
      <path d={pts(-120, -10)} fill="none" {...linea()} />
    </g>
  );
};

/** Lupa: con "buscar" da vueltas como revisando. */
export const Lupa: React.FC<PropsObjeto> = ({ accion, t, fps }) => {
  const { c, linea } = useIlu();
  const seg = t / fps;
  const [x, y] = accion === "buscar" ? [Math.cos(seg * 2.6) * 26, Math.sin(seg * 5.2) * 14] : [0, 0];
  return (
    <g transform={`translate(${x} ${y}) rotate(${accion === "buscar" ? Math.sin(seg * 2.6) * 8 : 0})`}>
      <rect x={18} y={20} width={18} height={60} rx={8} fill={c("madera")} {...linea()} transform="rotate(-45 27 50)" />
      <circle cx={-10} cy={-10} r={46} fill={c("celeste")} fillOpacity={0.5} stroke={c("grisOscuro")} strokeWidth={12} />
      <circle cx={-10} cy={-10} r={52} fill="none" {...linea()} />
      <path d="M -36 -26 Q -30 -40 -16 -44" fill="none" stroke="#FFFFFF" strokeWidth={6} strokeLinecap="round" />
    </g>
  );
};

/** Pizarrón con gráfico de línea: "subir" o "bajar" dibuja la curva y la flecha. */
export const Pizarron: React.FC<PropsObjeto> = ({ accion, t, fps, color }) => {
  const { c, linea } = useIlu();
  const seg = t / fps;
  const baja = accion === "bajar";
  const dib = accion === "subir" || baja ? interpolate(seg, [0.1, 1.4], [0, 1], CL) : 1;
  const ys = baja ? [-50, -30, -42, 0, 10, 40] : [40, 20, 30, -10, -20, -60];
  const xs = [-120, -76, -32, 12, 56, 100];
  const largo = 330;
  const verde = c("#2F4A3E");
  const tiza = c(color ?? "acento");
  const ultimo = { x: xs[5]!, y: ys[5]! };
  return (
    <g>
      <line x1={-110} y1={100} x2={-140} y2={130} stroke={c("madera")} strokeWidth={10} strokeLinecap="round" />
      <line x1={110} y1={100} x2={140} y2={130} stroke={c("madera")} strokeWidth={10} strokeLinecap="round" />
      <rect x={-170} y={-120} width={340} height={224} rx={10} fill={c("madera")} {...linea()} />
      <rect x={-154} y={-106} width={308} height={196} rx={4} fill={verde} />
      <line x1={-132} y1={-90} x2={-132} y2={70} stroke="#FFFFFF" strokeOpacity={0.7} strokeWidth={3} />
      <line x1={-132} y1={70} x2={136} y2={70} stroke="#FFFFFF" strokeOpacity={0.7} strokeWidth={3} />
      {xs.map((x, i) => (
        <rect key={x} x={x - 12} y={70 - (60 - ys[i]!) * 0.5} width={24} height={(60 - ys[i]!) * 0.5} fill="#FFFFFF" fillOpacity={0.18} />
      ))}
      <path
        d={`M ${xs.map((x, i) => `${x} ${ys[i]}`).join(" L ")}`}
        fill="none"
        stroke={tiza}
        strokeWidth={8}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={largo}
        strokeDashoffset={largo * (1 - dib)}
      />
      {dib > 0.97 ? (
        <path d={baja ? `M ${ultimo.x - 16} ${ultimo.y - 6} L ${ultimo.x + 6} ${ultimo.y + 8} L ${ultimo.x - 4} ${ultimo.y - 18}` : `M ${ultimo.x - 18} ${ultimo.y + 2} L ${ultimo.x + 6} ${ultimo.y - 8} L ${ultimo.x - 2} ${ultimo.y + 18}`} fill="none" stroke={tiza} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
      ) : null}
    </g>
  );
};

export const OBJETOS_CIVICO: Record<string, FichaObjeto> = {
  urna: { nombre: "Urna", etiquetas: ["urna", "elecciones", "votación", "balotaje", "plebiscito", "democracia"], acciones: ["recibir_voto"], tam: [104, 100], Dibujo: Urna },
  voto: { nombre: "Voto (sobre)", etiquetas: ["voto", "sobre", "papeleta", "lista", "elección"], acciones: [], tam: [54, 36], Dibujo: Voto },
  documento: { nombre: "Documento con sello", etiquetas: ["documento", "ley", "trámite", "contrato", "decreto", "firma", "aprobado"], acciones: ["sellar"], tam: [80, 106], Dibujo: Documento },
  candado: { nombre: "Candado", etiquetas: ["candado", "seguridad", "bloqueo", "cerrado", "prohibido", "privacidad"], acciones: ["cerrar", "abrir"], tam: [54, 74], Dibujo: Candado },
  megafono: { nombre: "Megáfono", etiquetas: ["megáfono", "anuncio", "protesta", "reclamo", "sindicato", "paro"], acciones: ["gritar"], tam: [100, 64], Dibujo: Megafono },
  bandera: { nombre: "Bandera genérica", etiquetas: ["bandera", "país", "patria", "nación"], acciones: ["flamear"], tam: [104, 134], Dibujo: Bandera },
  lupa: { nombre: "Lupa", etiquetas: ["lupa", "investigar", "buscar", "analizar", "auditoría", "detalle"], acciones: ["buscar"], tam: [64, 64], Dibujo: Lupa },
  pizarron: { nombre: "Pizarrón con gráfico", etiquetas: ["gráfico", "pizarrón", "estadística", "sube", "baja", "rentabilidad", "inflación"], acciones: ["subir", "bajar"], tam: [170, 130], Dibujo: Pizarron },
};
