/** Utilidades de color para la ilustración (todo en #RRGGBB). */

const aRgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const aHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;

/** Mezcla `a` con `b` (t = 0 → a, t = 1 → b). */
export const mezclar = (a: string, b: string, t: number) => {
  const [r1, g1, b1] = aRgb(a);
  const [r2, g2, b2] = aRgb(b);
  return aHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
};

export const oscurecer = (c: string, t: number) => mezclar(c, "#000000", t);
export const aclarar = (c: string, t: number) => mezclar(c, "#ffffff", t);

/** Saturación: 1 = igual, 0 = gris, >1 = más vivo. */
export const saturar = (c: string, s: number) => {
  const [r, g, b] = aRgb(c);
  const gris = 0.299 * r + 0.587 * g + 0.114 * b;
  return aHex(gris + (r - gris) * s, gris + (g - gris) * s, gris + (b - gris) * s);
};

/** Luminancia aproximada 0–1 (para elegir texto claro u oscuro encima). */
export const luminancia = (c: string) => {
  const [r, g, b] = aRgb(c);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

/** Pseudoaleatorio estable a partir de una semilla (mismo valor en cada render del mismo frame). */
export const azar = (semilla: number) => {
  const x = Math.sin(semilla * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** Semilla numérica a partir de un texto. */
export const semillaDe = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h % 10_000) + 1;
};
