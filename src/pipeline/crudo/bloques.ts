import { z } from "zod";
import { agruparFrases, motivoQuitar, type Cortes, type Transcripcion } from "../../shared/cortes";
import type { Marca } from "../../shared/schemas";
import { pedirAClaude } from "../claude";
import type { Trabajo } from "../trabajo";

/**
 * Línea editorial en crudos: en qué frase la persona pasa de los hechos al contexto o a su opinión. No se toca
 * lo que dice: solo se marca dónde empieza cada bloque (DATO, FUENTE, CONTEXTO, OPINIÓN) para el marcador.
 */
export const BloquesCrudoSchema = z.object({
  bloques: z.array(z.object({ desdeMs: z.number().min(0), bloque: z.enum(["dato", "fuente", "contexto", "opinion"]), motivo: z.string().max(200).default("") })),
});
export type BloquesCrudo = z.infer<typeof BloquesCrudoSchema>;

const RespuestaSchema = z.object({
  cambios: z
    .array(z.object({ frase: z.number().int().min(0), bloque: z.enum(["dato", "fuente", "contexto", "opinion"]), motivo: z.string().max(200) }))
    .describe("La frase donde EMPIEZA cada bloque, en orden. Solo cuando cambia el tipo de lo que se dice."),
});

const PROMPT = `Sos editor de un canal de actualidad con línea editorial "Hechos → Contexto → Opinión".
Te paso lo que dice una persona en su video, en frases numeradas. NO cambies nada de lo que dice: solo marcá dónde
EMPIEZA cada bloque, para poner una etiqueta en pantalla:
- "dato": cuenta hechos o cifras (qué pasó, cuánto, cuándo).
- "fuente": cita lo que dice un documento, una ley, una resolución, un medio o una institución.
- "contexto": explica por qué pasa, antecedentes, cómo funciona, qué cambia.
- "opinion": da SU opinión o postura ("yo creo", "me parece", "para mí", juicios de valor, críticas).
Reglas: marcá solo los cambios reales (lo normal son 2 a 4 en un video corto); si todo es de un tipo, una sola marca en
la frase 0. No marques opinión si la persona solo cuenta hechos con energía. Devolvé las frases donde empieza cada bloque.`;

/** Detecta los bloques con Claude (sin herramientas) y deja bloques.json, con tiempos del video original. */
export const detectarBloques = async (t: Trabajo, tr: Transcripcion, cortes: Cortes, marca: Marca, signal?: AbortSignal): Promise<BloquesCrudo> => {
  const quedan = tr.palabras.map((p, i) => ({ p, i })).filter(({ p, i }) => !p.sinTranscribir && motivoQuitar(cortes, i) === null);
  const frases = agruparFrases(quedan.map(({ p }) => p));
  const lineas = frases.map((f, n) => `[${n}] ${quedan.slice(f.desde, f.hasta + 1).map(({ p }) => p.texto).join(" ")}`);
  t.actividad("Marcando los bloques: hechos, contexto y opinión…");
  const r = frases.length
    ? await pedirAClaude({ prompt: `${PROMPT}\n\nFrases:\n${lineas.join("\n")}`, schema: RespuestaSchema, cwd: t.dir, herramientas: [], model: marca.modeloClaude, signal, onLog: (l) => void t.log(l) })
    : { cambios: [] };
  const bloques = r.cambios
    .filter((c) => frases[c.frase])
    .sort((a, b) => a.frase - b.frase)
    // dos marcas seguidas del mismo bloque no tienen sentido
    .filter((c, k, a) => k === 0 || a[k - 1]!.bloque !== c.bloque)
    .map((c) => ({ desdeMs: quedan[frases[c.frase]!.desde]!.p.inicioMs, bloque: c.bloque, motivo: c.motivo }));
  const out: BloquesCrudo = { bloques };
  await t.escribir("bloques.json", out);
  await t.log(`Línea editorial: ${bloques.length ? bloques.map((b) => `${b.bloque.toUpperCase()} en ${(b.desdeMs / 1000).toFixed(1)} s`).join(", ") : "sin cambios de bloque"}.`);
  return out;
};
