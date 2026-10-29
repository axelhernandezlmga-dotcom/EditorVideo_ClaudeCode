import { copyFile, readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Cortes, Transcripcion } from "../../shared/cortes";
import type { Marca } from "../../shared/schemas";
import { pedirAClaude } from "../claude";
import { DIR_ASSETS, DIR_PROMPTS } from "../rutas";
import { IDS_MOODS, INTENSIDADES, OpcionesCrudoSchema } from "../../shared/opcionesCrudo";
import { moodPermitido } from "../../shared/musica";
import { leerMarca } from "../config";
import { perfilDeTrabajo } from "../perfiles";
import { ponerMusica, type MusicaTrabajo } from "../musica";
import { asegurarSfxCrudo, type EfectoCrudo } from "../sfx";
import { efectosDeBiblioteca } from "../biblioteca";
import type { Trabajo } from "../trabajo";
import { transcripcionNumerada } from "./material";

const DecisionSchema = z.object({
  efectos: z
    .array(z.object({ tipo: z.enum(["golpe", "ding", "riser"]), palabra: z.number().int().min(0), motivo: z.string().max(160) }))
    .max(12),
  enfasis: z.array(z.string().max(40)).max(8),
  mood: z.enum(IDS_MOODS).describe("Ánimo de la música de fondo según el tema y el tono del video"),
  motivo_mood: z.string().max(200).describe("Por qué ese ánimo, en una frase"),
});

/** sfx.json: efectos anclados a palabras del ORIGINAL (siguen en su lugar aunque cambien los cortes). */
export const SfxSchema = z.object({
  efectos: z.array(z.object({ tipo: z.enum(["golpe", "ding", "riser"]), origenMs: z.number(), palabra: z.number().int(), motivo: z.string() })),
  enfasis: z.array(z.string()),
  /** Archivo de cada efecto dentro del trabajo (audio/sfx-<nombre>.wav). */
  archivos: z.record(z.string(), z.string()),
});
export type Sfx = z.infer<typeof SfxSchema>;

/** Paso "sfx": Claude decide golpes, dings y el riser; los archivos se copian al trabajo para el render. */
export const pasoSfx = async (t: Trabajo, tr: Transcripcion, cortes: Cortes, marca: Marca, signal?: AbortSignal): Promise<Sfx> => {
  const dir = path.join(DIR_ASSETS, "sfx");
  const existentes = (await readdir(dir).catch(() => [] as string[])).filter((f) => /\.(wav|mp3|ogg|m4a)$/i.test(f)).map((f) => path.join(dir, f));
  // los efectos de la Biblioteca con nombre de efecto (whoosh, golpe, ding…) van primero
  const rutas = await asegurarSfxCrudo([...(await efectosDeBiblioteca().catch(() => [])), ...existentes]);
  const archivos: Record<string, string> = {};
  for (const [nombre, ruta] of Object.entries(rutas) as [EfectoCrudo, string][]) {
    const rel = `audio/sfx-${nombre}${path.extname(ruta)}`;
    await copyFile(ruta, t.ruta(rel));
    archivos[nombre] = rel;
  }

  const opciones = OpcionesCrudoSchema.parse((await t.estado()).opciones.crudo ?? {});
  const maxSfx = INTENSIDADES[opciones.intensidad].maxSfx;
  const r = await pedirAClaude({
    prompt: `Como mucho ${maxSfx} efectos en total (edición ${INTENSIDADES[opciones.intensidad].nombre.toLowerCase()}).\n\nTranscripción (cada palabra con su número):\n${transcripcionNumerada(tr, cortes)}`,
    schema: DecisionSchema,
    cwd: t.dir,
    systemPromptFile: path.join(DIR_PROMPTS, "sfx.md"),
    herramientas: [],
    model: marca.modeloClaude,
    signal,
    onLog: (l) => void t.log(l),
  });
  // sin efectos de sonido: igual se guardan las palabras de énfasis (las usan los subtítulos)
  const efectos = opciones.sfx
    ? r.efectos
        .filter((e) => tr.palabras[e.palabra] && !tr.palabras[e.palabra]!.sinTranscribir)
        .slice(0, maxSfx)
        .map((e) => ({ ...e, origenMs: tr.palabras[e.palabra]!.inicioMs }))
    : [];
  const sfx: Sfx = { efectos, enfasis: r.enfasis, archivos: opciones.sfx ? archivos : {} };
  await t.escribir("sfx.json", sfx);
  await elegirMusicaCrudo(t, opciones.musica, r.mood, r.motivo_mood, (tr.palabras.at(-1)?.finMs ?? 0) / 1000);
  const cuenta = (tipo: string) => efectos.filter((e) => e.tipo === tipo).length;
  await t.log(opciones.sfx ? `Efectos: ${cuenta("golpe")} golpe(s), ${cuenta("ding")} ding(s), ${cuenta("riser")} riser(s); más whoosh y pop en el material.` : "Sin efectos de sonido (elegido al subir).");
  return sfx;
};

/** musica.json del crudo: el mood lo elige Claude (o el formulario) y la pista sale de la biblioteca sin repetir. */
const elegirMusicaCrudo = async (t: Trabajo, op: { activa: boolean; mood: string; volumen: number }, moodClaude: MusicaTrabajo["mood"], motivo: string, duracionS: number) => {
  // en automático, dentro de los ánimos que permite el perfil (si los eligió)
  const mood = op.mood === "auto" ? moodPermitido(moodClaude, (await perfilDeTrabajo(t, await leerMarca())).moodsMusica) : (op.mood as MusicaTrabajo["mood"]);
  const base = { activa: op.activa, mood, motivo: op.mood === "auto" ? motivo : "elegido en el formulario", volumen: op.volumen };
  if (!op.activa) {
    await t.escribir("musica.json", { ...base, pista: null, archivo: null, bpm: 0 } satisfies MusicaTrabajo);
    await t.log("Sin música de fondo (elegido al subir).");
    return;
  }
  const r = await ponerMusica(t, mood, { duracionS });
  await t.escribir("musica.json", { ...base, pista: r?.pista.archivo ?? null, archivo: r?.rel ?? null, bpm: r?.pista.bpm ?? 0 } satisfies MusicaTrabajo);
  await t.log(r ? `Música: "${mood}" (${base.motivo}) → ${r.pista.original} (${Math.round(r.pista.bpm)} BPM, ${r.pista.zip}).` : "No hay música (ni incluida ni en la Biblioteca) para ese ánimo: va sin música.");
};
