import { azar, oscurecer } from "../color";
import { useIlu } from "../estilo";

/** Margen a cada lado del cuadro (px) para que los paneos no muestren el borde. */
export const MARGEN = 320;
export const ANCHO_ESC = 1080 + MARGEN * 2;

/** Capa con profundidad: se corre con la cámara multiplicada por `prof` (0 = infinito, 1 = el piso). */
export const Capa: React.FC<{ camara: number; prof: number; children: React.ReactNode }> = ({ camara, prof, children }) => <g transform={`translate(${-camara * prof} 0)`}>{children}</g>;

/** Cielo en degradé. */
export const Cielo: React.FC<{ id: string; arriba: string; abajo: string; alto?: number }> = ({ id, arriba, abajo, alto = 1920 }) => {
  const { c } = useIlu();
  return (
    <g>
      <defs>
        <linearGradient id={`cielo-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c(arriba)} />
          <stop offset="1" stopColor={c(abajo)} />
        </linearGradient>
      </defs>
      <rect x={-MARGEN} y={0} width={ANCHO_ESC} height={alto} fill={`url(#cielo-${id})`} />
    </g>
  );
};

export const Nube: React.FC<{ x: number; y: number; escala?: number; color?: string }> = ({ x, y, escala = 1, color = "#FFFFFF" }) => {
  const { c, linea } = useIlu();
  const d = "M -90 20 Q -100 -16 -60 -18 Q -50 -56 -8 -50 Q 20 -76 54 -46 Q 96 -50 96 -10 Q 116 14 86 24 Z";
  return (
    <g transform={`translate(${x} ${y}) scale(${escala})`}>
      <path d={d} fill={c(color)} {...linea(0.6)} strokeOpacity={0.35} />
    </g>
  );
};

/** Nubes que pasan despacio (y vuelven a entrar por el otro lado). */
export const NubesQuePasan: React.FC<{ t: number; fps: number; y: number; cantidad?: number; color?: string; velocidad?: number }> = ({ t, fps, y, cantidad = 4, color, velocidad = 18 }) => (
  <g>
    {Array.from({ length: cantidad }, (_, i) => {
      const x = ((azar(i + 1) * ANCHO_ESC + (t / fps) * velocidad * (0.6 + azar(i + 9))) % (ANCHO_ESC + 300)) - MARGEN - 150;
      return <Nube key={i} x={x} y={y + azar(i + 5) * 260} escala={0.8 + azar(i + 2) * 0.8} color={color} />;
    })}
  </g>
);

/** Silueta de persona que camina (gente del fondo, sin cara). */
export const Caminante: React.FC<{ x: number; y: number; t: number; fps: number; color: string; escala?: number; mira?: 1 | -1 }> = ({ x, y, t, fps, color, escala = 1, mira = 1 }) => {
  const { c } = useIlu();
  const col = c(color);
  const w = Math.sin((t / fps) * Math.PI * 2 * 1.6);
  return (
    <g transform={`translate(${x} ${y}) scale(${escala * mira} ${escala})`}>
      <line x1={0} y1={-40} x2={w * 12} y2={0} stroke={col} strokeWidth={9} strokeLinecap="round" />
      <line x1={0} y1={-40} x2={-w * 12} y2={0} stroke={col} strokeWidth={9} strokeLinecap="round" />
      <rect x={-11} y={-92} width={22} height={56} rx={10} fill={col} />
      <line x1={0} y1={-84} x2={-w * 14} y2={-48} stroke={col} strokeWidth={7} strokeLinecap="round" />
      <circle cx={0} cy={-106} r={13} fill={col} />
    </g>
  );
};

/** Gente que cruza el fondo a distintas velocidades. */
export const GenteQuePasa: React.FC<{ t: number; fps: number; y: number; cantidad?: number; colores: string[]; escala?: number }> = ({ t, fps, y, cantidad = 4, colores, escala = 1 }) => (
  <g>
    {Array.from({ length: cantidad }, (_, i) => {
      const dir = azar(i + 30) > 0.5 ? 1 : -1;
      const vel = 50 + azar(i + 40) * 40;
      const base = azar(i + 50) * ANCHO_ESC;
      const x = ((((base + dir * (t / fps) * vel) % ANCHO_ESC) + ANCHO_ESC) % ANCHO_ESC) - MARGEN;
      return <Caminante key={i} x={x} y={y + (i % 2) * 14} t={t + i * 7} fps={fps} color={colores[i % colores.length]!} escala={escala * (0.9 + azar(i) * 0.2)} mira={dir as 1 | -1} />;
    })}
  </g>
);

export const Arbol: React.FC<{ x: number; y: number; t: number; fps: number; escala?: number; color?: string }> = ({ x, y, t, fps, escala = 1, color = "#5E9E4A" }) => {
  const { c, linea, sombra } = useIlu();
  const viento = Math.sin((t / fps) * 1.4 + x) * 2.5;
  return (
    <g transform={`translate(${x} ${y}) scale(${escala})`}>
      <rect x={-12} y={-120} width={24} height={120} rx={6} fill={c("madera")} {...linea()} />
      <g transform={`rotate(${viento} 0 -110)`}>
        <circle cx={0} cy={-190} r={80} fill={c(color)} {...linea()} />
        <circle cx={-56} cy={-150} r={50} fill={c(color)} {...linea()} />
        <circle cx={58} cy={-150} r={52} fill={c(color)} {...linea()} />
        <path d="M 10 -260 Q 90 -220 80 -130 Q 40 -100 10 -112 Z" {...sombra(color)} />
      </g>
    </g>
  );
};

export const Farola: React.FC<{ x: number; y: number; prendida?: number }> = ({ x, y, prendida = 0 }) => {
  const { c, linea } = useIlu();
  return (
    <g transform={`translate(${x} ${y})`}>
      {prendida ? <ellipse cx={30} cy={-250} rx={90} ry={90} fill="#FFE9A0" fillOpacity={0.18 * prendida} /> : null}
      <rect x={-6} y={-260} width={12} height={260} fill={c("grisOscuro")} {...linea(0.7)} />
      <path d="M 0 -256 Q 4 -280 34 -276" fill="none" stroke={c("grisOscuro")} strokeWidth={9} />
      <path d="M 18 -278 L 50 -278 L 44 -262 L 24 -262 Z" fill={c(prendida ? "#FFE58A" : "gris")} {...linea(0.7)} />
    </g>
  );
};

/** Fila de edificios con ventanas (fondo de ciudad). `noche` prende ventanas al azar que titilan. */
export const Edificios: React.FC<{ y: number; t: number; fps: number; colores: string[]; noche?: boolean; alto?: number; semilla?: number }> = ({ y, t, fps, colores, noche, alto = 1, semilla = 1 }) => {
  const { c, linea } = useIlu();
  const out: React.ReactNode[] = [];
  let x = -MARGEN;
  let i = 0;
  while (x < 1080 + MARGEN) {
    const w = 130 + azar(semilla * 13 + i) * 90;
    const h = (280 + azar(semilla * 7 + i) * 380) * alto;
    const col = c(colores[i % colores.length]!);
    const ventanas: React.ReactNode[] = [];
    for (let fy = y - h + 30; fy < y - 40; fy += 52) {
      for (let fx = x + 18; fx < x + w - 34; fx += 40) {
        const k = Math.round(fx * 7 + fy * 3);
        const prendida = noche ? azar(k + Math.floor((t / fps) * 0.7 + azar(k) * 5)) > 0.45 : false;
        ventanas.push(<rect key={k} x={fx} y={fy} width={22} height={30} fill={noche ? (prendida ? "#FFDE7A" : oscurecer(col, 0.35)) : c("#DCEBF5")} fillOpacity={noche ? 1 : 0.7} />);
      }
    }
    out.push(
      <g key={i}>
        <rect x={x} y={y - h} width={w} height={h} fill={col} {...linea(0.7)} />
        {ventanas}
      </g>,
    );
    x += w + 6;
    i++;
  }
  return <g>{out}</g>;
};

/** Autitos que cruzan una calle (frente). */
export const Transito: React.FC<{ t: number; fps: number; y: number; colores: string[]; noche?: boolean }> = ({ t, fps, y, colores, noche }) => {
  const { c, linea } = useIlu();
  return (
    <g>
      {colores.map((col, i) => {
        const dir = i % 2 ? -1 : 1;
        const vel = 260 + azar(i + 70) * 160;
        const x = ((((azar(i + 60) * ANCHO_ESC + dir * (t / fps) * vel) % (ANCHO_ESC + 400)) + ANCHO_ESC + 400) % (ANCHO_ESC + 400)) - MARGEN - 200;
        const yy = y + (dir === 1 ? 70 : 0);
        return (
          <g key={i} transform={`translate(${x} ${yy}) scale(${dir} 1)`}>
            {noche ? <path d="M 110 -10 L 300 -40 L 300 30 Z" fill="#FFF2B0" fillOpacity={0.25} /> : null}
            <path d="M -110 0 L -110 -30 Q -108 -40 -94 -42 L -50 -44 L -26 -78 L 50 -78 L 76 -44 L 104 -40 Q 114 -36 114 -22 L 114 0 Z" fill={c(col)} {...linea()} />
            <path d="M -20 -70 L 10 -70 L 10 -46 L -40 -46 Z M 20 -70 L 46 -70 L 64 -46 L 20 -46 Z" fill={c("celeste")} {...linea(0.6)} />
            <circle cx={-64} cy={2} r={20} fill={c("negro")} {...linea()} />
            <circle cx={70} cy={2} r={20} fill={c("negro")} {...linea()} />
          </g>
        );
      })}
    </g>
  );
};

/** Piso desde `y` hasta abajo del cuadro (con una línea de borde). */
export const Piso: React.FC<{ y: number; color: string; borde?: string }> = ({ y, color, borde }) => {
  const { c, linea } = useIlu();
  return (
    <g>
      <rect x={-MARGEN} y={y} width={ANCHO_ESC} height={1920 - y + 10} fill={c(color)} />
      <line x1={-MARGEN} y1={y} x2={1080 + MARGEN} y2={y} {...linea(1.2)} stroke={borde ? c(borde) : undefined} />
    </g>
  );
};
