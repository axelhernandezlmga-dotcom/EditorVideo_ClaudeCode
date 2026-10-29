import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DIR_ASSETS } from "./rutas";

const MUESTREO = 44100;

/** WAV mono de 16 bits a partir de muestras en [-1, 1]. */
const wav = (muestras: Float32Array): Buffer => {
  const datos = Buffer.alloc(muestras.length * 2);
  muestras.forEach((m, i) => datos.writeInt16LE(Math.round(Math.max(-1, Math.min(1, m)) * 32767), i * 2));
  const cab = Buffer.alloc(44);
  cab.write("RIFF", 0);
  cab.writeUInt32LE(36 + datos.length, 4);
  cab.write("WAVE", 8);
  cab.write("fmt ", 12);
  cab.writeUInt32LE(16, 16);
  cab.writeUInt16LE(1, 20); // PCM
  cab.writeUInt16LE(1, 22); // mono
  cab.writeUInt32LE(MUESTREO, 24);
  cab.writeUInt32LE(MUESTREO * 2, 28);
  cab.writeUInt16LE(2, 32);
  cab.writeUInt16LE(16, 34);
  cab.write("data", 36);
  cab.writeUInt32LE(datos.length, 40);
  return Buffer.concat([cab, datos]);
};

/** Ruido determinístico (siempre el mismo archivo). */
const ruido = (semilla: number) => {
  let s = semilla;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 2 ** 32) * 2 - 1;
  };
};

/** "Whoosh": ruido por un filtro pasa-banda cuya frecuencia sube y baja, con envolvente suave. */
export const sintetizarWhoosh = (segundos = 0.55): Buffer => {
  const n = Math.round(MUESTREO * segundos);
  const out = new Float32Array(n);
  const r = ruido(7);
  let bajo = 0;
  let banda = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const env = Math.sin(Math.PI * Math.min(1, t / 0.45) * 0.5) ** 2 * (t < 0.45 ? 1 : Math.exp(-(t - 0.45) * 7));
    const corte = 350 + 3200 * Math.sin(Math.PI * t) ** 1.5;
    const f = 2 * Math.sin((Math.PI * corte) / MUESTREO);
    // filtro de variables de estado (pasa-banda)
    const alto = r() - bajo - 0.7 * banda;
    banda += f * alto;
    bajo += f * banda;
    out[i] = banda * env * 0.9;
  }
  return wav(out);
};

/** "Pop": tono que cae de 900 a 220 Hz con decaimiento rápido. */
export const sintetizarPop = (segundos = 0.16): Buffer => {
  const n = Math.round(MUESTREO * segundos);
  const out = new Float32Array(n);
  let fase = 0;
  for (let i = 0; i < n; i++) {
    const s = i / MUESTREO;
    const frec = 220 + 680 * Math.exp(-s / 0.025);
    fase += (2 * Math.PI * frec) / MUESTREO;
    const env = Math.min(1, s / 0.002) * Math.exp(-s / 0.035);
    out[i] = Math.sin(fase) * env * 0.75;
  }
  return wav(out);
};

/** "Tic" sutil de la marca: un clic seco y agudo (el punto que cae en su lugar). */
export const sintetizarTic = (segundos = 0.09): Buffer => {
  const n = Math.round(MUESTREO * segundos);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = i / MUESTREO;
    const env = Math.min(1, s / 0.0008) * Math.exp(-s / 0.012);
    out[i] = (Math.sin(2 * Math.PI * 2600 * s) * 0.6 + Math.sin(2 * Math.PI * 1300 * s) * 0.4) * env * 0.6;
  }
  return wav(out);
};

/** "Golpe": bombo grave (cae de 140 a 45 Hz) + un chasquido de ruido al principio, para remarcar una palabra. */
export const sintetizarGolpe = (segundos = 0.45): Buffer => {
  const n = Math.round(MUESTREO * segundos);
  const out = new Float32Array(n);
  const r = ruido(11);
  let fase = 0;
  let bajo = 0;
  for (let i = 0; i < n; i++) {
    const s = i / MUESTREO;
    const frec = 45 + 95 * Math.exp(-s / 0.04);
    fase += (2 * Math.PI * frec) / MUESTREO;
    const cuerpo = Math.sin(fase) * Math.min(1, s / 0.003) * Math.exp(-s / 0.16);
    // chasquido: ruido filtrado (pasa-bajos simple) que dura ~25 ms
    bajo += 0.35 * (r() - bajo);
    const chasquido = bajo * Math.exp(-s / 0.012);
    out[i] = Math.tanh(1.6 * (cuerpo * 0.85 + chasquido * 0.6)) * 0.9;
  }
  return wav(out);
};

/** "Ding": campana (fundamental de 1320 Hz con parciales inarmónicos) que se apaga sola, para una cifra. */
export const sintetizarDing = (segundos = 1.1): Buffer => {
  const n = Math.round(MUESTREO * segundos);
  const out = new Float32Array(n);
  const parciales = [
    { f: 1320, a: 1, d: 0.55 },
    { f: 1320 * 2.76, a: 0.35, d: 0.22 },
    { f: 1320 * 5.4, a: 0.18, d: 0.1 },
    { f: 1320 * 0.5, a: 0.25, d: 0.4 },
  ];
  for (let i = 0; i < n; i++) {
    const s = i / MUESTREO;
    let v = 0;
    for (const p of parciales) v += p.a * Math.sin(2 * Math.PI * p.f * s) * Math.exp(-s / p.d);
    out[i] = v * Math.min(1, s / 0.002) * 0.42;
  }
  return wav(out);
};

/**
 * "Riser": ruido que se va abriendo + un tono que sube, cada vez más fuerte, y corta seco al final (ahí entra
 * el remate). Dura `segundos`: se ubica para que termine justo en la palabra del remate.
 */
export const sintetizarRiser = (segundos = 1.6): Buffer => {
  const n = Math.round(MUESTREO * segundos);
  const out = new Float32Array(n);
  const r = ruido(23);
  let bajo = 0;
  let banda = 0;
  let fase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const env = t ** 2.2 * Math.min(1, (1 - t) / 0.015);
    const corte = 300 + 5200 * t ** 1.5;
    const f = 2 * Math.sin((Math.PI * Math.min(corte, MUESTREO / 6)) / MUESTREO);
    const alto = r() - bajo - 0.5 * banda;
    banda += f * alto;
    bajo += f * banda;
    fase += (2 * Math.PI * (180 + 700 * t ** 2)) / MUESTREO;
    out[i] = (banda * 0.55 + Math.sin(fase) * 0.35) * env * 0.6;
  }
  return wav(out);
};

/** Un efecto propio: ruta, o ruta + nombre (los de la Biblioteca se guardan con un id, el nombre es el que le pusiste). */
export type ArchivoSfx = string | { ruta: string; nombre: string };
const conNombre = (xs: ArchivoSfx[]) => xs.map((x) => (typeof x === "string" ? { ruta: x, nombre: path.basename(x) } : x));
const buscarPropio = (xs: ArchivoSfx[], re: RegExp) => conNombre(xs).find((x) => re.test(x.nombre) && !/sintetizado/.test(x.nombre))?.ruta;

/** Efectos de "Editar crudo": sintetizador y nombres de archivo propios que lo reemplazan (ganancias en shared/crudo.ts). */
export const EFECTOS_CRUDO = {
  whoosh: { sintetizar: sintetizarWhoosh, propio: /whoosh|swoosh|transici/i },
  pop: { sintetizar: sintetizarPop, propio: /pop|click|blip/i },
  golpe: { sintetizar: sintetizarGolpe, propio: /golpe|hit|impact|boom/i },
  ding: { sintetizar: sintetizarDing, propio: /ding|bell|campana/i },
  riser: { sintetizar: sintetizarRiser, propio: /riser|subida|build/i },
} as const;
export type EfectoCrudo = keyof typeof EFECTOS_CRUDO;

/**
 * Rutas de los 5 efectos: el archivo propio de assets/sfx/ si hay uno con ese nombre, si no uno sintetizado
 * (se crea una sola vez; generado por código, sin derechos de autor de terceros).
 */
export const asegurarSfxCrudo = async (existentes: ArchivoSfx[]): Promise<Record<EfectoCrudo, string>> => {
  const dir = path.join(DIR_ASSETS, "sfx");
  await mkdir(dir, { recursive: true });
  const out = {} as Record<EfectoCrudo, string>;
  for (const [nombre, e] of Object.entries(EFECTOS_CRUDO) as [EfectoCrudo, (typeof EFECTOS_CRUDO)[EfectoCrudo]][]) {
    const propio = buscarPropio(existentes, e.propio);
    const sintetizado = path.join(dir, `${nombre}-sintetizado.wav`);
    if (!propio && !existsSync(sintetizado)) await writeFile(sintetizado, e.sintetizar());
    out[nombre] = propio ?? sintetizado;
  }
  return out;
};

/** El "tic" de la marca (propio en assets/sfx/ si hay uno que se llame tic, si no sintetizado). */
export const asegurarTic = async (existentes: ArchivoSfx[]): Promise<string> => {
  const propio = buscarPropio(existentes, /(^|[^a-z])tic([^a-z]|$)|tick/i);
  if (propio) return propio;
  const dir = path.join(DIR_ASSETS, "sfx");
  await mkdir(dir, { recursive: true });
  const tic = path.join(dir, "tic-sintetizado.wav");
  if (!existsSync(tic)) await writeFile(tic, sintetizarTic());
  return tic;
};

/**
 * Si en assets/sfx/ no hay un whoosh o un pop propios, crea unos sintetizados (sin derechos de autor).
 * Devuelve las rutas a usar.
 */
export const asegurarSfx = async (existentes: ArchivoSfx[]): Promise<{ whoosh: string; pop: string }> => {
  const dir = path.join(DIR_ASSETS, "sfx");
  await mkdir(dir, { recursive: true });
  const buscar = (re: RegExp) => buscarPropio(existentes, re);
  let whoosh = buscar(/whoosh|swoosh|transici/i);
  let pop = buscar(/pop|click|blip/i);
  if (!whoosh) {
    whoosh = path.join(dir, "whoosh-sintetizado.wav");
    if (!existsSync(whoosh)) await writeFile(whoosh, sintetizarWhoosh());
  }
  if (!pop) {
    pop = path.join(dir, "pop-sintetizado.wav");
    if (!existsSync(pop)) await writeFile(pop, sintetizarPop());
  }
  return { whoosh, pop };
};
