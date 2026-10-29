import { azar } from "../color";

/**
 * Poses y acciones del esqueleto, en grados. El personaje mira a la derecha (mira = 1).
 * - Brazos, "hacia afuera": 0 = colgando, 90 = horizontal hacia su costado, 180 = para arriba; el codo es
 *   relativo al brazo (negativo = se dobla hacia el cuerpo). El brazo "delantero" (bd) es el del lado
 *   hacia el que mira; el trasero (bt) queda detrás del torso.
 * - Piernas, en el plano de la marcha: + = el pie va hacia adelante; rodilla negativa = el pie va hacia atrás.
 */
export type Expresion = "neutral" | "feliz" | "sorpresa" | "enojo" | "pensativo" | "triste" | "preocupado" | "mueca";

/** Qué tiene en la mano: forma de la mano o un objeto chico. */
export type Mano = "abierta" | "puno" | "dedo" | "billetes" | "voto" | "microfono" | "celular" | "baston" | "papel";

export type Pose = {
  /** Brazo trasero: [hombro, codo]. */
  bt: [number, number];
  /** Brazo delantero: [hombro, codo]. */
  bd: [number, number];
  /** Piernas: [cadera, rodilla]. */
  pt: [number, number];
  pd: [number, number];
  /** Inclinación del torso (+ = hacia adelante, hacia donde mira). */
  torso: number;
  /** Inclinación de la cabeza (+ = hacia adelante). */
  cabeza: number;
  /** Desplazamiento del cuerpo entero (salto, temblor). */
  x: number;
  y: number;
  /** Hombros levantados (encogerse), en unidades. */
  hombros: number;
  /** Estirar y aplastar: 1 = normal, >1 más alto y angosto. */
  estira: number;
  expresion: Expresion;
  /** Hacia dónde miran los ojos: x (-1 atrás … 1 adelante), y (-1 arriba … 1 abajo). */
  mirada: [number, number];
  manoT: Mano;
  manoD: Mano;
};

export const POSE_BASE: Pose = {
  bt: [7, -8],
  bd: [7, -8],
  pt: [-3, 0],
  pd: [3, 0],
  torso: 0,
  cabeza: 0,
  x: 0,
  y: 0,
  hombros: 0,
  estira: 1,
  expresion: "neutral",
  mirada: [0.3, 0],
  manoT: "abierta",
  manoD: "abierta",
};

export const ACCIONES = [
  "reposo",
  "hablar",
  "senalar",
  "caminar",
  "sorprenderse",
  "enojarse",
  "festejar",
  "pensar",
  "encogerse",
  "contar_plata",
  "votar",
  "saludar",
  "preocuparse",
] as const;
export type Accion = (typeof ACCIONES)[number];

export const NOMBRES_ACCIONES: Record<Accion, string> = {
  reposo: "Respira (quieto pero vivo)",
  hablar: "Habla con gestos",
  senalar: "Señala hacia adelante",
  caminar: "Camina",
  sorprenderse: "Se sorprende (salta)",
  enojarse: "Se enoja (tiembla)",
  festejar: "Festeja con los brazos arriba",
  pensar: "Piensa (mano en el mentón)",
  encogerse: "Se encoge de hombros",
  contar_plata: "Cuenta billetes",
  votar: "Mete el voto",
  saludar: "Saluda con la mano",
  preocuparse: "Se agarra la cabeza",
};

const onda = (t: number, hz: number, fase = 0) => Math.sin(2 * Math.PI * hz * t + fase);
/** Llega rápido y se asienta (0 → 1 con un rebote). */
const golpe = (t: number, dur = 0.35) => {
  if (t <= 0) return 0;
  if (t >= dur * 2.5) return 1;
  const u = t / dur;
  return 1 - Math.exp(-4 * u) * Math.cos(5 * u);
};

/**
 * Pose de una acción a los `seg` segundos de empezada. `x` = exageración del estilo; `s` = semilla
 * (cada personaje gesticula distinto).
 */
export const poseDe = (accion: Accion, seg: number, x: number, s: number): Pose => {
  const b = POSE_BASE;
  const f = (k: number) => azar(s * 7 + k) * Math.PI * 2;
  // respiración: siempre algo se mueve
  const resp = onda(seg, 0.33, f(1));
  const vivo: Pose = { ...b, y: resp * 1.6, bt: [7 + resp * 2, -8], bd: [7 - resp * 2, -8], cabeza: onda(seg, 0.21, f(2)) * 1.6 };
  switch (accion) {
    case "reposo":
      return vivo;
    case "hablar": {
      // dos gestos que se alternan cada ~1,6 s: mano abierta explicando y las dos manos "presentando"
      const fase = Math.floor((seg + azar(s) * 2) / 1.6) % 3;
      const g = onda(seg, 1.15, f(3));
      const asiente = onda(seg, 2.3, f(4)) * 2.2 * x;
      if (fase === 1)
        return { ...vivo, bt: [28 + g * 6, -70 - g * 10], bd: [30 - g * 6, -75 + g * 10], cabeza: asiente, expresion: "neutral", mirada: [0.5, 0] };
      return { ...vivo, bt: [9, -12], bd: [24 + g * 10 * x, -78 + g * 18 * x], cabeza: asiente, torso: 1.5 + g, mirada: [0.6, 0] };
    }
    case "senalar": {
      const entra = golpe(seg);
      const pulso = onda(seg, 1.6) * 3 * x;
      return { ...vivo, bd: [12 + entra * (96 + pulso), -8 + entra * 8], manoD: "dedo", torso: 3 * entra, cabeza: 3 * entra, mirada: [1, -0.2], expresion: "neutral" };
    }
    case "caminar": {
      const w = onda(seg, 1.05);
      const atras = (v: number) => -Math.max(0, -v) * 28;
      return {
        ...b,
        pt: [w * 24 * Math.min(1.25, x), atras(w)],
        pd: [-w * 24 * Math.min(1.25, x), atras(-w)],
        bt: [w * 20 + 6, -18],
        bd: [w * 20 + 6, -18],
        y: -Math.abs(onda(seg, 1.05)) * 6 * x,
        torso: 4,
        cabeza: onda(seg, 2.1) * 1.5,
        mirada: [1, 0],
      };
    }
    case "sorprenderse": {
      const salto = seg < 0.5 ? Math.sin((seg / 0.5) * Math.PI) * 34 * x : 0;
      const arriba = 1 - golpe(seg - 0.45, 0.5) * 0.45;
      return {
        ...vivo,
        y: -salto,
        bt: [125 * arriba, -25],
        bd: [125 * arriba, -25],
        manoT: "abierta",
        manoD: "abierta",
        estira: seg < 0.5 ? 1 + 0.06 * x * Math.sin((seg / 0.5) * Math.PI) : 1,
        cabeza: -4,
        expresion: "sorpresa",
        mirada: [0.6, -0.3],
      };
    }
    case "enojarse": {
      const temblor = onda(seg, 13) * 2.2 * x;
      const golpea = Math.max(0, onda(seg, 1.2)) * 14 * x;
      return { ...vivo, x: temblor, bt: [22, -95 + golpea], bd: [24, -100 + golpea], manoT: "puno", manoD: "puno", torso: 5, cabeza: 6, expresion: "enojo", mirada: [1, 0.1] };
    }
    case "festejar": {
      const p = onda(seg, 1.9);
      return {
        ...b,
        y: -Math.abs(onda(seg, 0.95)) * 26 * x,
        bt: [150 + p * 12, 15],
        bd: [150 - p * 12, 15],
        manoT: "puno",
        manoD: "puno",
        estira: 1 + Math.abs(onda(seg, 0.95)) * 0.05 * x,
        cabeza: -5,
        expresion: "feliz",
        mirada: [0.3, -0.4],
      };
    }
    case "pensar": {
      const balanceo = onda(seg, 0.4, f(5));
      return { ...vivo, bd: [86 + balanceo * 3, -190], manoD: "puno", bt: [26, -108], cabeza: 7 + balanceo * 3, torso: -2, expresion: "pensativo", mirada: [0.6, -0.9] };
    }
    case "encogerse": {
      const e = seg < 0.9 ? Math.sin((seg / 0.9) * Math.PI) : Math.max(0, Math.sin(((seg - 0.9) / 1.2) * Math.PI)) * 0.6;
      return { ...vivo, hombros: 12 * e * x, bt: [30 + 18 * e, 95 + 15 * e], bd: [30 + 18 * e, 95 + 15 * e], cabeza: -8 * e, expresion: "mueca", mirada: [0.3, 0] };
    }
    case "contar_plata": {
      const pasa = onda(seg, 3.2);
      return { ...vivo, bd: [14, -112], manoD: "billetes", bt: [22, -100 + pasa * 14], manoT: "abierta", cabeza: 9, expresion: "feliz", mirada: [0.4, 1] };
    }
    case "votar": {
      // levanta el sobre y lo baja (a la urna) cada 2 s
      const ciclo = (seg % 2) / 2;
      const sube = ciclo < 0.5 ? Math.sin(ciclo * Math.PI * 2 * 0.5) : 1 - (ciclo - 0.5) * 2;
      return { ...vivo, bd: [30 + sube * 45, -40 - sube * 20], manoD: "voto", torso: 3, cabeza: 6, expresion: "neutral", mirada: [0.8, 0.6] };
    }
    case "saludar": {
      const w = onda(seg, 2.4);
      return { ...vivo, bd: [140, 18 + w * 26], manoD: "abierta", expresion: "feliz", mirada: [0.6, 0] };
    }
    case "preocuparse": {
      const vaiven = onda(seg, 0.9);
      return { ...vivo, bt: [128, 90], bd: [128, 90], cabeza: vaiven * 5 * x, torso: 2, expresion: "preocupado", mirada: [0.2, -0.2] };
    }
  }
};

const mezclarPar = (a: [number, number], b: [number, number], t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** Mezcla dos poses (para pasar de una acción a otra sin saltos). */
export const mezclarPoses = (a: Pose, b: Pose, t: number): Pose => {
  const n = (k: "torso" | "cabeza" | "x" | "y" | "hombros" | "estira") => a[k] + (b[k] - a[k]) * t;
  return {
    bt: mezclarPar(a.bt, b.bt, t),
    bd: mezclarPar(a.bd, b.bd, t),
    pt: mezclarPar(a.pt, b.pt, t),
    pd: mezclarPar(a.pd, b.pd, t),
    torso: n("torso"),
    cabeza: n("cabeza"),
    x: n("x"),
    y: n("y"),
    hombros: n("hombros"),
    estira: n("estira"),
    expresion: t < 0.5 ? a.expresion : b.expresion,
    mirada: mezclarPar(a.mirada, b.mirada, t),
    manoT: t < 0.5 ? a.manoT : b.manoT,
    manoD: t < 0.5 ? a.manoD : b.manoD,
  };
};

/** Un tramo de acción dentro de la escena: desde qué frame. */
export type TramoAccion = { desde: number; accion: Accion };

/** Frames que tarda en pasar de una acción a la siguiente. */
export const FRAMES_MEZCLA = 7;

/** Pose en el frame dado, con la mezcla entre tramos. */
export const poseEnFrame = (tramos: TramoAccion[], frame: number, fps: number, x: number, s: number): Pose => {
  const orden = [...tramos].sort((a, b) => a.desde - b.desde);
  let i = orden.findLastIndex((t) => t.desde <= frame);
  if (i < 0) i = 0;
  const actual = orden[i] ?? { desde: 0, accion: "reposo" as Accion };
  const pose = poseDe(actual.accion, Math.max(0, frame - actual.desde) / fps, x, s);
  const anterior = orden[i - 1];
  const desdeCambio = frame - actual.desde;
  if (anterior && desdeCambio < FRAMES_MEZCLA) {
    const previa = poseDe(anterior.accion, (frame - anterior.desde) / fps, x, s);
    const u = desdeCambio / FRAMES_MEZCLA;
    return mezclarPoses(previa, pose, u * u * (3 - 2 * u));
  }
  return pose;
};
