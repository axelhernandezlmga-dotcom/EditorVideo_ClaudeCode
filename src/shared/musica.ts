import { z } from "zod";
import { IDS_MOODS, type Mood } from "./opcionesCrudo";

/** Lo que mide scripts/analizar_musica.py de cada pista. */
export type AnalisisPista = {
  archivo: string;
  duracion: number;
  silencioInicio: number;
  arranque: number;
  bpm: number;
  energiaDb: number;
  dinamicaDb: number;
  modo: "mayor" | "menor";
  tonalidad: string;
  confianzaModo: number;
  brillo: number;
};

export const PistaSchema = z.object({
  /**
   * Ruta relativa a assets/musica/ (ej. "epica/abstraction-sketchbook-2024-03-06-01.ogg"), o "biblioteca/<ruta>"
   * para la música que importaste a la Biblioteca (relativa a biblioteca/medios/).
   */
  archivo: z.string(),
  mood: z.enum(IDS_MOODS),
  bpm: z.number(),
  /** 0–1, relativa a la biblioteca. */
  energia: z.number(),
  duracion: z.number(),
  tonalidad: z.string(),
  zip: z.string(),
  original: z.string(),
  licencia: z.string(),
  autor: z.string(),
  /** Música de la Biblioteca: el nombre de su categoría. */
  categoria: z.string().optional(),
});
export type Pista = z.infer<typeof PistaSchema>;
export const CatalogoMusicaSchema = z.object({ pistas: z.array(PistaSchema) });

/** Pistas que se quedan por mood: suficientes para no repetir y pocas para que todas sean buenas. */
export const POR_MOOD = 8;

/**
 * Mood de una pista a partir de su sonido (no se puede escuchar: es una heurística con tempo, tonalidad, energía,
 * dinámica y brillo). Devuelve el mood con más puntos.
 */
export const clasificarMood = (p: AnalisisPista, zip: string): Mood => {
  const mayor = p.modo === "mayor";
  const menor = !mayor;
  const chiptune = /chiptune/i.test(zip);
  const e = p.energiaDb;
  const pts: Record<Mood, number> = {
    feliz: 2 * +mayor + +(p.bpm >= 110) + +(e > -19) + +(p.brillo > 1300),
    comica: 3 * +chiptune + +mayor + +(p.bpm >= 120) + +(p.brillo > 2200),
    epica: 2 * +(e > -16) + +(p.dinamicaDb >= 15) + +(p.brillo < 1600) + +(p.bpm >= 85 && p.bpm <= 135),
    tension: 2 * +menor + +(p.bpm >= 115) + +(e > -18) + +(p.dinamicaDb >= 12),
    misterio: 2 * +menor + +(e < -19) + +(p.brillo < 1400) + +(p.bpm < 110),
    triste: 2 * +menor + 2 * +(p.bpm < 95) + +(e < -18),
    motivacional: 2 * +mayor + +(p.bpm >= 95 && p.bpm < 130) + +(e > -18) + +(p.dinamicaDb >= 10 && p.dinamicaDb < 18),
    chill: +(p.bpm < 105) + 2 * +(e < -19) + +(p.dinamicaDb < 12) + +mayor,
  };
  // en un empate gana el que está antes en esta lista (los más específicos primero)
  const orden: Mood[] = ["comica", "triste", "misterio", "tension", "epica", "motivacional", "chill", "feliz"];
  return orden.reduce((mejor, m) => (pts[m] > pts[mejor] ? m : mejor), orden[0]!);
};

/** Por qué una pista NO sirve de fondo de un reel, o null si sirve. */
export const motivoDescarte = (p: AnalisisPista): string | null => {
  if (p.duracion < 30) return "dura menos de 30 s";
  if (p.silencioInicio > 1) return `arranca con ${p.silencioInicio.toFixed(1)} s de silencio`;
  if (p.arranque > 3) return `tarda ${p.arranque.toFixed(1)} s en arrancar`;
  if (p.energiaDb < -27) return "es casi inaudible";
  if (p.dinamicaDb > 24) return "tiene cambios de volumen muy bruscos (taparían la voz)";
  return null;
};

/**
 * Qué tan bien funciona de fondo (más es mejor): que dure 45 s o más (así no se nota el loop en un reel),
 * volumen parejo (poca dinámica) y una tonalidad clara (el mood es más confiable).
 */
export const puntajeFondo = (p: AnalisisPista) => Math.min(p.duracion, 120) / 60 - p.dinamicaDb / 12 + p.confianzaModo;

/** "Sketchbook 2024-01-24_01.ogg" → "sketchbook-2024-01-24-01". */
export const slugPista = (nombre: string) =>
  nombre
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Prefijo de las pistas que vienen de la Biblioteca (no de assets/musica). */
export const PREFIJO_BIBLIOTECA = "biblioteca/";
export const esDeBiblioteca = (archivo: string) => archivo.startsWith(PREFIJO_BIBLIOTECA);
/** URL para escuchar una pista en la app. */
export const urlPista = (archivo: string) =>
  esDeBiblioteca(archivo) ? `/biblioteca-medios/${archivo.slice(PREFIJO_BIBLIOTECA.length).split("/").map(encodeURIComponent).join("/")}` : `/musica/${archivo.split("/").map(encodeURIComponent).join("/")}`;

/** De dónde sale la música automática: la incluida con la app, la de tu Biblioteca, o las dos. */
export const FUENTES_MUSICA = [
  { id: "todas", nombre: "La incluida y la de tu Biblioteca" },
  { id: "biblioteca", nombre: "Solo la de tu Biblioteca" },
  { id: "incluida", nombre: "Solo la incluida con la app" },
] as const;
export type FuenteMusica = (typeof FUENTES_MUSICA)[number]["id"];
export const IDS_FUENTES_MUSICA = FUENTES_MUSICA.map((f) => f.id) as [FuenteMusica, ...FuenteMusica[]];
export const deFuente = (p: Pick<Pista, "archivo">, fuente: FuenteMusica) => fuente === "todas" || (fuente === "biblioteca") === esDeBiblioteca(p.archivo);

/**
 * Elige una pista del mood sin repetir las últimas usadas (si todas se usaron hace poco, la que se usó hace más).
 * `azar` permite que dos videos seguidos del mismo mood no saquen siempre la misma. Con `duracionS`, prefiere las
 * pistas que duran al menos eso (así no se nota la vuelta del loop).
 */
export const elegirPista = (pistas: Pista[], mood: Mood, recientes: string[], azar = Math.random, duracionS = 0): Pista | null => {
  const delMood = pistas.filter((p) => p.mood === mood);
  const porMood = delMood.length ? delMood : pistas;
  const largas = porMood.filter((p) => p.duracion >= duracionS);
  const pool = duracionS && largas.length ? largas : porMood;
  if (!pool.length) return null;
  const nuevas = pool.filter((p) => !recientes.includes(p.archivo));
  if (nuevas.length) return nuevas[Math.floor(azar() * nuevas.length)]!;
  // todas usadas: la que hace más que no sale
  return [...pool].sort((a, b) => recientes.indexOf(b.archivo) - recientes.indexOf(a.archivo))[0]!;
};

/** Mood viejo del guion de los videos animados → mood de la biblioteca. */
export const MOOD_GUION: Record<string, Mood> = { tenso: "tension", epico: "epica", curioso: "misterio", alegre: "feliz", neutro: "chill" };
export const moodDeGuion = (m: string): Mood => ((IDS_MOODS as readonly string[]).includes(m) ? (m as Mood) : (MOOD_GUION[m] ?? "chill"));

/**
 * Volumen de la música en cada frame: `volumen` en los silencios, 55 % de eso mientras se habla (ducking), con
 * transición suave y fundidos de entrada (0,5 s) y salida (1 s). `habla` = intervalos [desdeMs, hastaMs).
 */
export const curvaMusica = (habla: { desdeMs: number; hastaMs: number }[], totalFrames: number, fps: number, volumen: number): Float32Array => {
  const hablando = new Uint8Array(totalFrames);
  for (const h of habla) {
    const a = Math.floor(((h.desdeMs - 150) / 1000) * fps);
    const b = Math.ceil(((h.hastaMs + 250) / 1000) * fps);
    for (let f = Math.max(0, a); f < Math.min(totalFrames, b); f++) hablando[f] = 1;
  }
  // con las pistas a -14 LUFS (como la voz): 8 % = -22 dB en las pausas y -27 dB mientras se habla
  const bajo = volumen * 0.55;
  const curva = new Float32Array(totalFrames);
  let v = volumen;
  for (let f = 0; f < totalFrames; f++) {
    const objetivo = hablando[f] ? bajo : volumen;
    // sube o baja como máximo un 15 % del rango por frame
    v += Math.max(-0.15 * volumen, Math.min(0.15 * volumen, objetivo - v));
    curva[f] = v;
  }
  const entrada = Math.round(fps * 0.5);
  const salida = fps;
  for (let f = 0; f < totalFrames; f++) {
    if (f < entrada) curva[f] = curva[f]! * (f / entrada);
    const resto = totalFrames - 1 - f;
    if (resto < salida) curva[f] = curva[f]! * (resto / salida);
  }
  return curva;
};

/**
 * Desde dónde arranca la pista (ms) para que un pulso caiga justo en el primer golpe: así golpes y cortes
 * acompañan el ritmo. Las pistas son loops que empiezan en un pulso.
 */
export const desfaseAlPulso = (bpm: number, primerGolpeMs: number | null) => {
  if (!primerGolpeMs || bpm <= 0) return 0;
  const pulso = 60000 / bpm;
  return Math.round((pulso - (primerGolpeMs % pulso)) % pulso);
};

/** Ánimo más parecido de cada uno (para quedarse dentro de los que permite un perfil). */
const PARECIDOS: Record<string, string[]> = {
  feliz: ["motivacional", "chill", "comica", "epica"],
  triste: ["chill", "misterio", "tension"],
  epica: ["motivacional", "tension", "feliz"],
  tension: ["misterio", "epica", "chill"],
  misterio: ["tension", "chill", "triste"],
  motivacional: ["epica", "feliz", "chill"],
  chill: ["motivacional", "feliz", "triste"],
  comica: ["feliz", "chill", "motivacional"],
};

/** El ánimo pedido si el perfil lo permite; si no, el permitido más parecido (sin lista, cualquiera). */
export const moodPermitido = <T extends string>(mood: T, permitidos: string[]): T => {
  if (!permitidos.length || permitidos.includes(mood)) return mood;
  return ((PARECIDOS[mood] ?? []).find((m) => permitidos.includes(m)) ?? permitidos[0]) as T;
};

/** Cuánto bajan la voz y la música mientras suena el audio original de un clip (factor de volumen). */
export const DUCKING_CLIP = { voz: 0.18, musica: 0.3, rampaMs: 220 } as const;

/**
 * Factor de volumen por frame (1 = normal) que baja a `nivel` durante cada intervalo [desdeMs, hastaMs) y vuelve,
 * con rampas de `rampaMs` (coseno) que terminan de bajar justo cuando empieza el intervalo y empiezan a subir cuando
 * termina: así no hay saltos ni clics, y el clip suena entero sobre el fondo ya bajo.
 */
export const curvaDucking = (intervalos: { desdeMs: number; hastaMs: number }[], totalFrames: number, fps: number, nivel: number, rampaMs: number = DUCKING_CLIP.rampaMs): Float32Array => {
  const curva = new Float32Array(totalFrames).fill(1);
  for (let f = 0; f < totalFrames; f++) {
    const ms = (f / fps) * 1000;
    let factor = 1;
    for (const { desdeMs, hastaMs } of intervalos) {
      let x: number; // 0 = volumen normal, 1 = bajado del todo
      if (ms >= desdeMs && ms < hastaMs) x = 1;
      else if (ms < desdeMs && ms >= desdeMs - rampaMs) x = (ms - (desdeMs - rampaMs)) / rampaMs;
      else if (ms >= hastaMs && ms < hastaMs + rampaMs) x = 1 - (ms - hastaMs) / rampaMs;
      else continue;
      const suave = 0.5 - 0.5 * Math.cos(Math.PI * x);
      factor = Math.min(factor, 1 - (1 - nivel) * suave);
    }
    curva[f] = factor;
  }
  return curva;
};
