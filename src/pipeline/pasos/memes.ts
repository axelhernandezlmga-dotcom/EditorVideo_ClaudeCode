import { z } from "zod";
import { maxClipsPara } from "../../shared/opcionesCrudo";
import { VozSchema, type Guion, type Marca } from "../../shared/schemas";
import { pedirAClaude } from "../claude";
import { cortarClip, MAX_CLIP_CON_AUDIO_S } from "../crudo/clipsCrudo";
import { anotarRecientes, candidatosDelVideo, decidirAudio, fichasClips, reglasClips } from "../seleccionClips";
import type { Trabajo } from "../trabajo";

const MemesSchema = z.object({
  memes: z
    .array(
      z.object({
        escena: z.number().int().min(1).describe("número de la escena DESPUÉS de cuya narración entra el clip"),
        clip: z.string().describe("id del clip"),
        desde_s: z.number().min(0).describe("segundo del clip donde arranca el tramo"),
        duracion_s: z.number().min(1).max(MAX_CLIP_CON_AUDIO_S),
        con_audio: z.boolean(),
        motivo: z.string().max(200).describe("qué remata o ilustra de lo que se acaba de decir"),
      }),
    )
    .max(12),
});

const PROMPT = `Sos editor de videos verticales. Te paso las escenas de un video (lo que dice la narración en cada una) y
clips de la biblioteca del usuario (memes, reacciones, clips propios) preseleccionados por contexto. Elegí después de
qué escenas conviene insertar un clip: entra cuando la narración de esa escena termina, como remate o ilustración de
lo que se acaba de decir. Un clip con audio suena solo (la narración ya terminó); sin audio, se ve sobre el final.
No pongas clips después de la primera escena (el gancho) ni de la última (el cierre).`;

/**
 * Animados: elige memes de la Biblioteca para insertar al final de algunas escenas y corta su tramo (con su audio
 * nivelado, o sin audio). El montaje se ajusta al armar el video: con audio, la escena se alarga lo que dura el clip.
 */
export const elegirMemes = async (t: Trabajo, guion: Guion, marca: Marca, signal?: AbortSignal) => {
  const uso = (await t.estado()).opciones.biblioteca;
  if (!uso || uso.modo === "no") return {};
  const narracion = guion.escenas.map((e) => e.narracion).join(" ");
  const candidatos = await candidatosDelVideo(uso, narracion);
  if (!candidatos.length) return {};
  const voz = await t.leer("voz.json", VozSchema);
  const duracionS = voz ? voz.escenas.reduce((n, e) => n + e.duracionMs, 0) / 1000 : narracion.split(/\s+/).length / 2.5;
  const maximo = uso.modo === "manual" ? uso.elegidos.length : maxClipsPara(uso.frecuencia, duracionS);
  t.actividad("Buscando memes y clips de tu biblioteca que encajen…");
  const escenas = guion.escenas.map((e, i) => `${i + 1}. ${e.narracion}`).join("\n");
  const r = await pedirAClaude({
    prompt: `${PROMPT}\n\n${reglasClips(uso, maximo)}\n\nClips:\n${await fichasClips(candidatos)}\n\nEscenas:\n${escenas}`,
    schema: MemesSchema,
    cwd: t.dir,
    herramientas: [],
    model: marca.modeloClaude,
    signal,
    onLog: (l) => void t.log(l),
  });
  const memes: Record<string, { archivo: string; duracionMs: number; conAudio: boolean; clip: string; nombre: string; motivo: string }> = {};
  const usados = new Set(guion.escenas.flatMap((e) => (e.plantilla === "clip_biblioteca" ? [e.props.clip] : [])));
  for (const m of r.memes.slice(0, maximo)) {
    const i = m.escena - 1;
    const c = candidatos.find((x) => x.id === m.clip);
    if (!c || usados.has(c.id) || i <= 0 || i >= guion.escenas.length - 1 || memes[i]) continue;
    usados.add(c.id);
    try {
      const rel = `stock/meme-${String(i + 1).padStart(2, "0")}.mp4`;
      const { dur, conAudio } = await cortarClip(t, c, m.desde_s, m.duracion_s, rel, { carpeta: "stock", conAudio: decidirAudio(uso, c, m.con_audio) });
      memes[i] = { archivo: rel, duracionMs: Math.round(dur * 1000), conAudio, clip: c.id, nombre: c.nombre, motivo: m.motivo };
    } catch (e) {
      await t.log(`No pude cortar el clip ${c.nombre}: ${(e as Error).message.split("\n")[0]}`, "error");
    }
  }
  await anotarRecientes(Object.values(memes).map((m) => m.clip));
  await t.log(Object.keys(memes).length ? `Memes de la biblioteca: ${Object.entries(memes).map(([i, m]) => `después de la escena ${Number(i) + 1}: ${m.nombre}${m.conAudio ? " (con su audio)" : ""} — ${m.motivo}`).join("; ")}.` : "Memes de la biblioteca: ninguno encaja de verdad con este video.");
  return memes;
};
