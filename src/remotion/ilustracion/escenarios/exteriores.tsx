import { azar, oscurecer } from "../color";
import { useIlu } from "../estilo";
import { Arbol, Capa, Cielo, Edificios, Farola, GenteQuePasa, MARGEN, ANCHO_ESC, NubesQuePasan, Piso, Transito } from "./comunes";
import type { FichaEscenario, PropsEscenario } from "./tipos";

export const PISO_EXTERIOR = 1110;

const Sol: React.FC<{ x: number; y: number; t: number; fps: number }> = ({ x, y, t, fps }) => {
  const { c } = useIlu();
  const pulso = 1 + Math.sin((t / fps) * 1.3) * 0.03;
  return (
    <g transform={`translate(${x} ${y}) scale(${pulso}) rotate(${(t / fps) * 4})`}>
      <circle r={120} fill={c("#FFF1B8")} fillOpacity={0.5} />
      <circle r={78} fill={c("#FFD95A")} />
    </g>
  );
};

const Vereda: React.FC<{ y: number }> = ({ y }) => {
  const { c, linea } = useIlu();
  return (
    <g>
      <Piso y={y} color="#B9BDC4" />
      {/* cordón y calle */}
      <rect x={-MARGEN} y={y + 90} width={ANCHO_ESC} height={16} fill={c("#9A9EA6")} {...linea(0.8)} />
      <rect x={-MARGEN} y={y + 106} width={ANCHO_ESC} height={420} fill={c("#56595F")} />
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x={-MARGEN + i * 160} y={y + 250} width={80} height={12} fill={c("#E6E2D6")} />
      ))}
      {Array.from({ length: 14 }, (_, i) => (
        <line key={i} x1={-MARGEN + i * 130} y1={y} x2={-MARGEN + i * 130 - 30} y2={y + 90} stroke={c("#A3A7AE")} strokeWidth={3} />
      ))}
    </g>
  );
};

export const CiudadDia: React.FC<PropsEscenario> = ({ t, fps, camara }) => (
  <g>
    <Cielo id="ciudad-dia" arriba="#8CCBEB" abajo="#DDF0F8" />
    <Capa camara={camara} prof={0.05}>
      <Sol x={840} y={330} t={t} fps={fps} />
    </Capa>
    <Capa camara={camara} prof={0.12}>
      <NubesQuePasan t={t} fps={fps} y={250} cantidad={4} />
    </Capa>
    <Capa camara={camara} prof={0.3}>
      <Edificios y={PISO_EXTERIOR - 20} t={t} fps={fps} colores={["#BFD1E0", "#AFC3D6", "#C9D6E3"]} alto={1.15} semilla={3} />
    </Capa>
    <Capa camara={camara} prof={0.6}>
      <Edificios y={PISO_EXTERIOR} t={t} fps={fps} colores={["#E9B872", "#D98E73", "#9DB7A5", "#E7D3A8", "#B6A6CA"]} alto={0.75} semilla={8} />
    </Capa>
    <Capa camara={camara} prof={1}>
      <Vereda y={PISO_EXTERIOR} />
      <Farola x={120} y={PISO_EXTERIOR + 20} />
      <Farola x={900} y={PISO_EXTERIOR + 20} />
      <Transito t={t} fps={fps} y={PISO_EXTERIOR + 230} colores={["acento2", "azul", "mostaza"]} />
    </Capa>
  </g>
);

export const CiudadNoche: React.FC<PropsEscenario> = ({ t, fps, camara }) => {
  const { c } = useIlu();
  return (
    <g>
      <Cielo id="ciudad-noche" arriba="#0E1430" abajo="#34325E" />
      <Capa camara={camara} prof={0.03}>
        {Array.from({ length: 60 }, (_, i) => {
          const brillo = 0.4 + 0.6 * Math.abs(Math.sin((t / fps) * (1 + azar(i) * 2) + i));
          return <circle key={i} cx={-MARGEN + azar(i + 1) * ANCHO_ESC} cy={60 + azar(i + 2) * 640} r={1.5 + azar(i + 3) * 2.5} fill="#FFFFFF" fillOpacity={brillo} />;
        })}
        <circle cx={780} cy={330} r={70} fill={c("#F4F1DE")} />
        <circle cx={808} cy={312} r={62} fill={c("#1A2145")} />
      </Capa>
      <Capa camara={camara} prof={0.3}>
        <Edificios y={PISO_EXTERIOR - 20} t={t} fps={fps} colores={["#252A50", "#2C325C", "#20254A"]} noche alto={1.15} semilla={3} />
      </Capa>
      <Capa camara={camara} prof={0.6}>
        <Edificios y={PISO_EXTERIOR} t={t} fps={fps} colores={["#3A3D6A", "#433E66", "#35456A"]} noche alto={0.75} semilla={8} />
      </Capa>
      <Capa camara={camara} prof={1}>
        <Vereda y={PISO_EXTERIOR} />
        <rect x={-MARGEN} y={PISO_EXTERIOR} width={ANCHO_ESC} height={900} fill="#0B1030" fillOpacity={0.45} />
        <Farola x={120} y={PISO_EXTERIOR + 20} prendida={1} />
        <Farola x={900} y={PISO_EXTERIOR + 20} prendida={1} />
        <Transito t={t} fps={fps} y={PISO_EXTERIOR + 230} colores={["acento2", "azul"]} noche />
      </Capa>
    </g>
  );
};

export const Rambla: React.FC<PropsEscenario> = ({ t, fps, camara }) => {
  const { c, linea } = useIlu();
  const seg = t / fps;
  const horizonte = 760;
  const olas = (y: number, amp: number, fase: number, col: string, prof: number) => {
    const pts = Array.from({ length: 30 }, (_, i) => {
      const x = -MARGEN + (i / 29) * ANCHO_ESC;
      return `${x} ${y + Math.sin(x / 70 + seg * 1.6 + fase) * amp}`;
    });
    return (
      <Capa camara={camara} prof={prof}>
        <path d={`M ${pts.join(" L ")} L ${1080 + MARGEN} 1100 L ${-MARGEN} 1100 Z`} fill={c(col)} />
      </Capa>
    );
  };
  return (
    <g>
      <Cielo id="rambla" arriba="#87C5E8" abajo="#F3E6CF" alto={horizonte + 10} />
      <Capa camara={camara} prof={0.05}>
        <Sol x={260} y={360} t={t} fps={fps} />
      </Capa>
      <Capa camara={camara} prof={0.1}>
        <NubesQuePasan t={t} fps={fps} y={170} cantidad={3} />
        {/* gaviotas */}
        {[0, 1, 2].map((i) => {
          const x = ((seg * 60 + i * 300) % ANCHO_ESC) - MARGEN;
          const ala = Math.sin(seg * 8 + i) * 10;
          return <path key={i} d={`M ${x - 24} ${520 + i * 40 + ala} Q ${x - 12} ${510 + i * 40} ${x} ${520 + i * 40} Q ${x + 12} ${510 + i * 40} ${x + 24} ${520 + i * 40 + ala}`} fill="none" {...linea(1)} />;
        })}
      </Capa>
      <Capa camara={camara} prof={0.15}>
        <Edificios y={horizonte} t={t} fps={fps} colores={["#CFC6D8", "#D8CFC2", "#C4CCD8"]} alto={0.35} semilla={21} />
      </Capa>
      {olas(horizonte, 3, 0, "#4C9CC8", 0.2)}
      {olas(horizonte + 90, 6, 1, "#3A8DBA", 0.35)}
      {olas(horizonte + 190, 9, 2, "#2F7FAE", 0.5)}
      <Capa camara={camara} prof={1}>
        {/* murallita de la rambla y la vereda */}
        <rect x={-MARGEN} y={PISO_EXTERIOR - 110} width={ANCHO_ESC} height={110} fill={c("#D9CDB6")} {...linea()} />
        {Array.from({ length: 16 }, (_, i) => (
          <line key={i} x1={-MARGEN + i * 110} y1={PISO_EXTERIOR - 110} x2={-MARGEN + i * 110} y2={PISO_EXTERIOR} {...linea(0.5)} />
        ))}
        <Piso y={PISO_EXTERIOR} color="#C9B99B" />
        {Array.from({ length: 30 }, (_, i) => (
          <rect key={i} x={-MARGEN + (i % 10) * 180 + (Math.floor(i / 10) % 2) * 90} y={PISO_EXTERIOR + 40 + Math.floor(i / 10) * 120} width={160} height={8} rx={3} fill={oscurecer(c("#C9B99B"), 0.08)} />
        ))}
        <Farola x={980} y={PISO_EXTERIOR + 10} />
      </Capa>
    </g>
  );
};

const Vaca: React.FC<{ x: number; y: number; t: number; fps: number; escala?: number; mira?: 1 | -1 }> = ({ x, y, t, fps, escala = 1, mira = 1 }) => {
  const { c, linea } = useIlu();
  const seg = t / fps;
  const cola = Math.sin(seg * 3 + x) * 18;
  const cabeza = Math.sin(seg * 0.8 + x) * 6;
  return (
    <g transform={`translate(${x} ${y}) scale(${escala * mira} ${escala})`}>
      <path d={`M -88 -70 Q -110 -40 ${-104 + cola * 0.3} ${-10 + Math.abs(cola) * 0.2}`} fill="none" {...linea(1.2)} />
      {[-62, -36, 40, 66].map((lx) => (
        <rect key={lx} x={lx - 9} y={-40} width={18} height={40} rx={6} fill={c("blanco")} {...linea()} />
      ))}
      <ellipse cx={0} cy={-70} rx={92} ry={46} fill={c("blanco")} {...linea()} />
      <path d="M -40 -110 Q -10 -96 -20 -66 Q -50 -60 -56 -84 Z" fill={c("negro")} />
      <path d="M 30 -62 Q 50 -84 70 -66 Q 60 -40 34 -46 Z" fill={c("negro")} />
      <g transform={`rotate(${cabeza} 80 -86)`}>
        <ellipse cx={104} cy={-84} rx={34} ry={28} fill={c("blanco")} {...linea()} />
        <ellipse cx={126} cy={-72} rx={20} ry={16} fill={c("#F2B8B8")} {...linea()} />
        <circle cx={100} cy={-92} r={4} fill={c("negro")} />
        <path d="M 84 -108 L 76 -124 M 112 -110 L 118 -126" {...linea(1.4)} />
      </g>
    </g>
  );
};

export const Campo: React.FC<PropsEscenario> = ({ t, fps, camara }) => {
  const { c, linea } = useIlu();
  const seg = t / fps;
  return (
    <g>
      <Cielo id="campo" arriba="#8FD0F0" abajo="#E8F5F0" />
      <Capa camara={camara} prof={0.05}>
        <Sol x={820} y={300} t={t} fps={fps} />
      </Capa>
      <Capa camara={camara} prof={0.12}>
        <NubesQuePasan t={t} fps={fps} y={200} cantidad={4} />
      </Capa>
      <Capa camara={camara} prof={0.25}>
        <path d={`M ${-MARGEN} 860 Q 100 700 420 800 Q 760 900 1000 760 Q 1250 650 ${1080 + MARGEN} 790 L ${1080 + MARGEN} 1300 L ${-MARGEN} 1300 Z`} fill={c("#A7CF73")} {...linea(0.7)} />
        {/* molino */}
        <g transform="translate(760 820)">
          <path d="M -14 0 L -4 -200 L 4 -200 L 14 0 Z" fill={c("grisOscuro")} {...linea(0.7)} />
          <g transform={`translate(0 -200) rotate(${seg * 90})`}>
            {[0, 60, 120, 180, 240, 300].map((a) => (
              <path key={a} d="M 0 0 L 8 -60 L -8 -60 Z" fill={c("plata")} {...linea(0.6)} transform={`rotate(${a})`} />
            ))}
          </g>
        </g>
      </Capa>
      <Capa camara={camara} prof={0.5}>
        <path d={`M ${-MARGEN} 980 Q 300 880 640 960 Q 980 1040 ${1080 + MARGEN} 930 L ${1080 + MARGEN} 1400 L ${-MARGEN} 1400 Z`} fill={c("#8DBF5A")} {...linea(0.7)} />
        <Arbol x={140} y={980} t={t} fps={fps} escala={0.9} />
        <Vaca x={560} y={1010} t={t} fps={fps} escala={0.6} mira={-1} />
      </Capa>
      <Capa camara={camara} prof={1}>
        <Piso y={PISO_EXTERIOR} color="#77AC48" />
        {/* alambrado */}
        {Array.from({ length: 10 }, (_, i) => (
          <rect key={i} x={-MARGEN + i * 190} y={PISO_EXTERIOR - 120} width={14} height={130} fill={c("madera")} {...linea(0.7)} />
        ))}
        {[-90, -50].map((dy) => (
          <line key={dy} x1={-MARGEN} y1={PISO_EXTERIOR + dy} x2={1080 + MARGEN} y2={PISO_EXTERIOR + dy} stroke={c("grisOscuro")} strokeWidth={2.5} />
        ))}
        <Vaca x={880} y={PISO_EXTERIOR + 40} t={t} fps={fps} escala={0.95} />
        {/* pasto que se mueve */}
        {Array.from({ length: 40 }, (_, i) => {
          const x = -MARGEN + azar(i) * ANCHO_ESC;
          const y = PISO_EXTERIOR + 120 + azar(i + 1) * 600;
          const v = Math.sin(seg * 2 + i) * 5;
          return <path key={i} d={`M ${x} ${y} q ${v} -16 ${v * 2} -28 M ${x + 8} ${y} q ${v} -12 ${v * 2 + 4} -22`} fill="none" stroke={c("#5E9238")} strokeWidth={3} strokeLinecap="round" />;
        })}
      </Capa>
    </g>
  );
};

const CasaBaja: React.FC<{ x: number; color: string; ancho: number; y: number; techo?: boolean }> = ({ x, color, ancho, y, techo }) => {
  const { c, linea } = useIlu();
  const col = c(color);
  return (
    <g>
      {techo ? <path d={`M ${x - 14} ${y - 300} L ${x + ancho / 2} ${y - 400} L ${x + ancho + 14} ${y - 300} Z`} fill={c("ladrillo")} {...linea()} /> : null}
      <rect x={x} y={y - 300} width={ancho} height={300} fill={col} {...linea()} />
      {!techo ? <rect x={x - 8} y={y - 316} width={ancho + 16} height={22} fill={oscurecer(col, 0.15)} {...linea()} /> : null}
      <rect x={x + ancho * 0.12} y={y - 220} width={ancho * 0.3} height={110} fill={c("celeste")} {...linea(0.8)} />
      <rect x={x + ancho * 0.12} y={y - 220} width={ancho * 0.3} height={110} fill="none" {...linea(0.6)} strokeDasharray="6 10" />
      <rect x={x + ancho * 0.58} y={y - 190} width={ancho * 0.28} height={190} fill={c("madera")} {...linea(0.8)} />
    </g>
  );
};

export const Barrio: React.FC<PropsEscenario> = ({ t, fps, camara }) => {
  const { linea } = useIlu();
  const seg = t / fps;
  return (
    <g>
      <Cielo id="barrio" arriba="#9AD2F0" abajo="#F1F2E4" />
      <Capa camara={camara} prof={0.1}>
        <NubesQuePasan t={t} fps={fps} y={180} cantidad={3} />
      </Capa>
      <Capa camara={camara} prof={0.3}>
        <Edificios y={PISO_EXTERIOR - 160} t={t} fps={fps} colores={["#C7D3DE", "#D3DBE3"]} alto={0.6} semilla={14} />
      </Capa>
      <Capa camara={camara} prof={0.7}>
        {/* cables de luz que se mecen */}
        {[0, 1].map((i) => (
          <path key={i} d={`M ${-MARGEN} ${560 + i * 30} Q 540 ${640 + i * 30 + Math.sin(seg + i) * 8} ${1080 + MARGEN} ${560 + i * 30}`} fill="none" {...linea(0.6)} />
        ))}
        {[
          ["#F2C6A0", 260, true],
          ["#A9D3C5", 300, false],
          ["#F3E2A3", 240, true],
          ["#D9B2C8", 280, false],
          ["#B9C8E8", 260, true],
          ["#F2C6A0", 300, false],
        ].reduce<{ x: number; nodos: React.ReactNode[] }>(
          (acc, [col, w, techo], i) => {
            acc.nodos.push(<CasaBaja key={i} x={acc.x} color={col as string} ancho={w as number} y={PISO_EXTERIOR} techo={techo as boolean} />);
            acc.x += (w as number) + 12;
            return acc;
          },
          { x: -MARGEN + 20, nodos: [] },
        ).nodos}
      </Capa>
      <Capa camara={camara} prof={1}>
        <Piso y={PISO_EXTERIOR} color="#BDB8AE" />
        <Arbol x={60} y={PISO_EXTERIOR + 60} t={t} fps={fps} escala={1.1} />
        <Arbol x={1040} y={PISO_EXTERIOR + 60} t={t} fps={fps} escala={1.2} color="#6FAE52" />
        <GenteQuePasa t={t} fps={fps} y={PISO_EXTERIOR + 70} cantidad={3} colores={["#7C6E92", "#6E8B9E", "#9E7C6E"]} escala={0.8} />
      </Capa>
    </g>
  );
};

/** Parlamento genérico: edificio de columnas con frontón (no copia ningún edificio real). */
export const Parlamento: React.FC<PropsEscenario> = ({ t, fps, camara }) => {
  const { c, linea, sombra } = useIlu();
  const seg = t / fps;
  const piedra = c("#E7DFCF");
  const bandera = (x: number) => {
    const ola = (k: number) => Math.sin(seg * 5 - k) * 8;
    return (
      <g transform={`translate(${x} 0)`}>
        <rect x={-4} y={330} width={8} height={330} fill={c("grisOscuro")} />
        <path d={`M 4 340 Q 40 ${330 + ola(0)} 80 ${340 + ola(1)} Q 100 ${360 + ola(2)} 120 ${350 + ola(2)} L 120 ${410 + ola(2)} Q 80 ${400 + ola(1)} 40 ${410 + ola(0)} L 4 400 Z`} fill={c("acento")} {...linea(0.7)} />
      </g>
    );
  };
  return (
    <g>
      <Cielo id="parlamento" arriba="#93C9EA" abajo="#E9F1F4" />
      <Capa camara={camara} prof={0.1}>
        <NubesQuePasan t={t} fps={fps} y={150} cantidad={3} />
      </Capa>
      <Capa camara={camara} prof={0.45}>
        <path d="M 40 520 L 540 330 L 1040 520 Z" fill={piedra} {...linea()} />
        <path d="M 160 500 L 540 368 L 920 500 Z" fill={oscurecer(piedra, 0.06)} {...linea(0.7)} />
        <rect x={20} y={520} width={1040} height={40} fill={piedra} {...linea()} />
        {Array.from({ length: 8 }, (_, i) => (
          <g key={i}>
            <rect x={70 + i * 126} y={560} width={60} height={360} fill={piedra} {...linea()} />
            <rect x={60 + i * 126} y={552} width={80} height={16} fill={piedra} {...linea(0.7)} />
            <rect x={60 + i * 126} y={912} width={80} height={16} fill={piedra} {...linea(0.7)} />
            <rect x={104 + i * 126} y={568} width={26} height={344} {...sombra("#E7DFCF")} />
          </g>
        ))}
        <rect x={20} y={920} width={1040} height={30} fill={oscurecer(piedra, 0.05)} {...linea()} />
        {Array.from({ length: 5 }, (_, i) => (
          <rect key={i} x={-20 - i * 30} y={950 + i * 32} width={1120 + i * 60} height={32} fill={oscurecer(piedra, 0.04 * i)} {...linea(0.7)} />
        ))}
        {bandera(-60)}
        {bandera(1120)}
      </Capa>
      <Capa camara={camara} prof={1}>
        <Piso y={PISO_EXTERIOR} color="#CFC7B8" />
        {/* palomas que picotean */}
        {[180, 260, 860].map((x, i) => {
          const pica = Math.max(0, Math.sin(seg * 4 + i * 2)) * 10;
          return (
            <g key={x} transform={`translate(${x} ${PISO_EXTERIOR + 60})`}>
              <ellipse cx={0} cy={-18} rx={26} ry={16} fill={c("#9AA0AE")} {...linea(0.8)} />
              <circle cx={22} cy={-30 + pica} r={10} fill={c("#9AA0AE")} {...linea(0.8)} />
              <path d={`M 30 ${-30 + pica} l 8 3 l -8 3`} fill={c("naranja")} />
            </g>
          );
        })}
      </Capa>
    </g>
  );
};

export const ESCENARIOS_EXTERIORES: Record<string, FichaEscenario> = {
  ciudad_dia: { nombre: "Ciudad de día", etiquetas: ["ciudad", "centro", "calle", "Montevideo", "tránsito", "día"], piso: PISO_EXTERIOR, vivos: ["nubes", "sol", "autos"], Dibujo: CiudadDia },
  ciudad_noche: { nombre: "Ciudad de noche", etiquetas: ["ciudad", "noche", "inseguridad", "calle", "luces"], piso: PISO_EXTERIOR, vivos: ["estrellas", "ventanas que titilan", "autos con luces"], Dibujo: CiudadNoche },
  rambla: { nombre: "Rambla con mar", etiquetas: ["rambla", "mar", "playa", "costa", "verano", "Montevideo"], piso: PISO_EXTERIOR, vivos: ["olas", "gaviotas", "nubes"], Dibujo: Rambla },
  campo: { nombre: "Campo con vacas", etiquetas: ["campo", "vacas", "rural", "agro", "ganadería", "interior", "productores"], piso: PISO_EXTERIOR, vivos: ["vacas", "molino", "pasto", "nubes"], Dibujo: Campo },
  barrio: { nombre: "Barrio", etiquetas: ["barrio", "casas", "vecinos", "vivienda", "familia"], piso: PISO_EXTERIOR, vivos: ["gente caminando", "árboles", "cables"], Dibujo: Barrio },
  parlamento: { nombre: "Parlamento genérico", etiquetas: ["parlamento", "legislativo", "ley", "votación", "senado", "diputados", "gobierno"], piso: PISO_EXTERIOR, vivos: ["banderas", "palomas", "nubes"], Dibujo: Parlamento },
};
