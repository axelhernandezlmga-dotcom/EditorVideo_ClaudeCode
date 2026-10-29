import { z } from "zod";
import { agruparFrases, calcularTramos, detectarMuletillas, duracionTramos, motivoQuitar, resumirCortes, type Cortes, type Transcripcion } from "../../shared/cortes";
import { OpcionesCrudoSchema, PAUSA_SILENCIO } from "../../shared/opcionesCrudo";
import type { Marca } from "../../shared/schemas";
import { pedirAClaude } from "../claude";
import type { Trabajo } from "../trabajo";

const TomasSchema = z.object({
  descartar: z
    .array(z.object({ frase: z.number().int().min(0), motivo: z.string().max(200) }))
    .describe("Frases a quitar: intentos fallidos o repetidos. Vacío si no hay tomas repetidas."),
  tropiezos: z
    .array(z.object({ frase: z.number().int().min(0), repetido: z.string().min(1).max(80), motivo: z.string().max(200) }))
    .default([])
    .describe("Tropiezos DENTRO de una frase: el fragmento que se dijo dos veces seguidas sin querer, copiado tal cual (se quita la PRIMERA vez)."),
});

const PROMPT_TOMAS = `Sos editor de video. Te paso la transcripción de un video grabado de corrido, dividida en frases numeradas.
Cuando la persona se equivoca, se traba o no le gusta cómo le salió, repite la misma idea: eso es una "toma repetida".

Tu tarea: marcar para DESCARTAR los intentos fallidos o incompletos, y quedarte con la ÚLTIMA toma buena de cada idea.
Reglas:
- Solo descartá una frase si la misma idea se vuelve a decir después (casi con las mismas palabras, o claramente un reintento).
- Las frases cortadas a la mitad seguidas de un reintento ("El gobierno anunció que… El gobierno anunció ayer que…") se descartan.
- Frases como "no, esperá", "de nuevo", "corto", "otra vez" dichas para reiniciar también se descartan.
- Si la última toma está incompleta y una anterior está completa, quedate con la completa.
- No descartes frases que solo se parecen por tema: tiene que ser un reintento de lo mismo.
- No reescribas nada: solo devolvé los números de frase a descartar con un motivo corto.

Además, marcá los TROPIEZOS dentro de una frase: un pedazo (1 a 5 palabras) que se dijo dos veces seguidas porque
la persona se trabó ("con la cantidad, con la cantidad de problemas" → tropiezo "con la cantidad").
- Copiá el fragmento repetido tal cual aparece (se quita la primera vez que se dice).
- NO marques repeticiones a propósito para dar énfasis ("no corresponde, no corresponde", "tan grande, pero tan grande",
  "¿cómo se puede…? ¿cómo se puede…?" como pregunta retórica): esas son parte del discurso.`;

const RecorteSchema = z.object({
  quitar: z.array(z.object({ frase: z.number().int().min(0), motivo: z.string().max(200) })).describe("Frases a quitar para llegar a la duración pedida."),
});

const PROMPT_RECORTE = `Sos editor de reels. El video quedó más largo que el máximo pedido y hay que acortarlo quitando frases enteras.
Elegí las frases MENOS importantes hasta que lo que queda entre en la duración pedida. Reglas:
- Nunca quites la primera frase (el gancho) ni la última (el cierre).
- Quitá primero lo redundante: ideas que se repiten, ejemplos de más, rodeos, aclaraciones.
- Lo que queda tiene que seguir entendiéndose de corrido (no cortes en la mitad de un razonamiento).
- Devolvé solo los números de frase a quitar con un motivo corto.`;

/** Tomas repetidas con `claude -p` (sin herramientas): devuelve índices de palabras a quitar. */
export const detectarTomas = async (t: Trabajo, tr: Transcripcion, marca: Marca, signal?: AbortSignal) => {
  const reales = tr.palabras.map((p, i) => ({ p, i })).filter(({ p }) => !p.sinTranscribir);
  const frases = agruparFrases(reales.map(({ p }) => p));
  if (frases.length < 2) return [];
  const lineas = frases.map((f, n) => {
    const texto = reales
      .slice(f.desde, f.hasta + 1)
      .map(({ p }) => p.texto)
      .join(" ");
    return `[${n}] (${(reales[f.desde]!.p.inicioMs / 1000).toFixed(1)} s) ${texto}`;
  });
  const r = await pedirAClaude({
    prompt: `${PROMPT_TOMAS}\n\nFrases:\n${lineas.join("\n")}`,
    schema: TomasSchema,
    cwd: t.dir,
    herramientas: [],
    model: marca.modeloClaude,
    signal,
    onLog: (l) => void t.log(l),
  });
  const out: { i: number; motivo: string }[] = [];
  for (const d of r.descartar) {
    const f = frases[d.frase];
    if (!f) continue;
    for (let k = f.desde; k <= f.hasta; k++) out.push({ i: reales[k]!.i, motivo: d.motivo });
  }
  for (const tr0 of r.tropiezos) {
    const f = frases[tr0.frase];
    if (!f) continue;
    const k = buscarRepeticion(reales.slice(f.desde, f.hasta + 1).map(({ p }) => p.texto), tr0.repetido);
    if (k === null) continue;
    const largo = tr0.repetido.trim().split(/\s+/).length;
    for (let j = 0; j < largo; j++) out.push({ i: reales[f.desde + k + j]!.i, motivo: `Tropiezo: "${tr0.repetido}" repetido` });
  }
  return out;
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * Dónde empieza la PRIMERA vez de un fragmento que aparece dos veces seguidas en la frase (índice de palabra),
 * o null si no está repetido de verdad (así un tropiezo mal copiado por Claude no corta nada).
 */
export const buscarRepeticion = (palabras: string[], fragmento: string): number | null => {
  const f = fragmento.trim().split(/\s+/).map(norm).filter(Boolean);
  const w = palabras.map(norm);
  if (!f.length) return null;
  for (let k = 0; k + 2 * f.length <= w.length; k++) {
    const igual = (desde: number) => f.every((x, j) => w[desde + j] === x);
    if (igual(k) && igual(k + f.length)) return k;
  }
  return null;
};

/** Si el video quedó más largo que `maxMs`, Claude elige frases enteras para quitar (tipo "largo"). */
export const recortarDuracion = async (t: Trabajo, tr: Transcripcion, cortes: Cortes, maxMs: number, marca: Marca, signal?: AbortSignal) => {
  const actual = duracionTramos(calcularTramos(tr.palabras, cortes, tr.duracionMs));
  if (actual <= maxMs) return [];
  const quedan = tr.palabras.map((p, i) => ({ p, i })).filter(({ p, i }) => !p.sinTranscribir && motivoQuitar(cortes, i) === null);
  const frases = agruparFrases(quedan.map(({ p }) => p));
  if (frases.length < 3) return [];
  const lineas = frases.map((f, n) => {
    const ps = quedan.slice(f.desde, f.hasta + 1);
    const seg = (ps.at(-1)!.p.finMs - ps[0]!.p.inicioMs) / 1000;
    return `[${n}] (${seg.toFixed(1)} s) ${ps.map(({ p }) => p.texto).join(" ")}`;
  });
  t.actividad(`El video dura ${Math.round(actual / 1000)} s: recortando a ${Math.round(maxMs / 1000)} s…`);
  const r = await pedirAClaude({
    prompt: `${PROMPT_RECORTE}\n\nDura ${(actual / 1000).toFixed(0)} s y tiene que quedar en ${(maxMs / 1000).toFixed(0)} s o menos (sobran ~${Math.ceil((actual - maxMs) / 1000)} s).\n\nFrases:\n${lineas.join("\n")}`,
    schema: RecorteSchema,
    cwd: t.dir,
    herramientas: [],
    model: marca.modeloClaude,
    signal,
    onLog: (l) => void t.log(l),
  });
  const out: { i: number; motivo: string }[] = [];
  for (const q of r.quitar) {
    const f = frases[q.frase];
    if (!f || q.frase === 0 || q.frase === frases.length - 1) continue;
    for (let k = f.desde; k <= f.hasta; k++) out.push({ i: quedan[k]!.i, motivo: q.motivo });
  }
  return out;
};

/** Paso "cortes": muletillas por reglas + tomas repetidas con Claude. Las pausas se calculan solas al armar los tramos. */
export const pasoCortes = async (t: Trabajo, tr: Transcripcion, marca: Marca, signal?: AbortSignal): Promise<Cortes> => {
  const elegidas = (await t.estado()).opciones.crudo;
  const opciones = OpcionesCrudoSchema.parse(elegidas ?? {});
  const muletillas = opciones.cortes.muletillas ? detectarMuletillas(tr.palabras) : [];
  t.actividad("Buscando tomas repetidas y tropiezos…");
  const tomas = await detectarTomas(t, tr, marca, signal);
  const enToma = new Set(tomas.map((x) => x.i));
  const cortes: Cortes = {
    // los trabajos sin formulario siguen con el ajuste de la configuración
    pausaMaxMs: elegidas ? PAUSA_SILENCIO[opciones.cortes.silencio] : Math.round(marca.crudo.pausaMaxS * 1000),
    margenMs: marca.crudo.margenMs,
    automatico: true,
    sugeridos: {
      palabras: [
        ...tomas.filter((x, k) => tomas.findIndex((y) => y.i === x.i) === k).map((x) => ({ i: x.i, tipo: "toma" as const, motivo: x.motivo })),
        ...muletillas.filter((m) => !enToma.has(m.i)).map((m) => ({ i: m.i, tipo: "muletilla" as const, motivo: m.motivo })),
      ].sort((a, b) => a.i - b.i),
    },
    manual: { quitar: [], conservar: [], pausasConservadas: [], pausasCortadas: [] },
  };
  if (opciones.duracionMax > 0) {
    const largos = await recortarDuracion(t, tr, cortes, opciones.duracionMax * 1000, marca, signal);
    cortes.sugeridos.palabras = [...cortes.sugeridos.palabras, ...largos.map((x) => ({ i: x.i, tipo: "largo" as const, motivo: x.motivo }))].sort((a, b) => a.i - b.i);
  }
  await t.escribir("cortes.json", cortes);
  const tramos = calcularTramos(tr.palabras, cortes, tr.duracionMs);
  const r = resumirCortes(tr.palabras, cortes, tr.duracionMs, tramos);
  await t.log(
    `Cortes sugeridos: ${(tr.duracionMs / 1000).toFixed(1)} s → ${(duracionTramos(tramos) / 1000).toFixed(1)} s ` +
      `(pausas ${r.pausa.cantidad}, muletillas ${r.muletilla.cantidad}, tomas y tropiezos ${r.toma.cantidad}${r.largo.cantidad ? `, recortes por duración ${r.largo.cantidad}` : ""}).`,
  );
  return cortes;
};
