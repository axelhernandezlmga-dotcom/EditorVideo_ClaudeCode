import { mkdir } from "node:fs/promises";
import { z } from "zod";
import { TRAMO_CLIP, type Recurso } from "../../shared/biblioteca";
import type { Cortes, Transcripcion } from "../../shared/cortes";
import type { ItemMaterial } from "../../shared/material";
import { maxClipsPara, type OpcionesCrudo } from "../../shared/opcionesCrudo";
import type { Marca } from "../../shared/schemas";
import { pedirAClaude } from "../claude";
import { rutaRecurso } from "../biblioteca";
import { anotarRecientes, candidatosDelVideo, decidirAudio, fichasClips, reglasClips } from "../seleccionClips";
import { ejecutar } from "../proceso";
import type { Trabajo } from "../trabajo";
import { transcripcionNumerada } from "./material";

/** Duración máxima de un clip con su audio (un meme tiene que terminar su frase). */
export const MAX_CLIP_CON_AUDIO_S = 8;

const ClipsElegidosSchema = z.object({
  clips: z
    .array(
      z.object({
        clip: z.string().describe("id del clip del catálogo"),
        palabra_inicio: z.number().int().min(0),
        palabra_fin: z.number().int().min(0),
        desde_s: z.number().min(0).describe("Segundo del clip donde arranca el mejor tramo"),
        duracion_s: z.number().min(TRAMO_CLIP.min).max(MAX_CLIP_CON_AUDIO_S).describe("2 a 5 s; con audio, lo que dure la frase o el efecto (hasta 8 s)"),
        con_audio: z.boolean().describe("true = suena con su audio original (la voz baja mientras tanto)"),
        motivo: z.string().max(200).describe("Por qué ese clip corresponde a lo que se dice"),
      }),
    )
    .max(12),
});

const PROMPT = `Sos editor de video. Te paso (1) la transcripción numerada de un video donde una persona habla a cámara y
(2) clips de su biblioteca (clips propios, de noticieros, memes…) preseleccionados por contexto, con lo que pasa en
cada uno, para qué sirve, lo que se dice y si tiene audio.

Elegí en qué momentos conviene insertar un clip mientras la persona habla:
- Un clip de una persona, lugar o hecho real solo si coincide DE VERDAD con lo que se dice (la misma persona, el mismo
  hecho o la misma frase); un parecido vago no alcanza.
- Nada en los primeros 2 segundos (el gancho es la cara de la persona).
- Elegí el mejor tramo del clip (desde_s + duracion_s ≤ duración del clip): sin audio, 2 a 5 s; con audio, el tramo
  donde está la frase o el sonido completo.
- palabra_inicio/palabra_fin: dónde arranca y termina la mención; un clip con audio conviene ubicarlo justo al
  final de una frase (en la pausa), para tapar lo menos posible a la persona.`;

/**
 * Corta el tramo del clip (leyendo el original, sin tocarlo) a 1080×1920 dentro del trabajo. Sin audio, o con su
 * audio original nivelado (-16 LUFS, picos a -1,5 dB) y con fundidos cortos: así no hay saltos ni distorsión.
 */
export const cortarClip = async (t: Trabajo, c: Recurso, desdeS: number, duracionS: number, rel: string, op: { carpeta?: string; ajustarTramo?: boolean; conAudio?: boolean } = {}) => {
  await mkdir(t.ruta(op.carpeta ?? "clips"), { recursive: true });
  const desde = Math.max(0, Math.min(desdeS, c.duracion - TRAMO_CLIP.min));
  // en un crudo el tramo dura de 2 a 5 s (con audio, hasta 8); en una escena animada, lo que dure la escena
  const maximo = op.conAudio ? MAX_CLIP_CON_AUDIO_S : TRAMO_CLIP.max;
  const dur = op.ajustarTramo === false ? Math.max(0.5, Math.min(duracionS, c.duracion - desde)) : Math.max(TRAMO_CLIP.min, Math.min(duracionS, maximo, c.duracion - desde));
  const audio = op.conAudio && c.audio ? ["-af", audioClip(dur), "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2"] : ["-an"];
  await ejecutar("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-ss",
    desde.toFixed(2),
    "-t",
    dur.toFixed(2),
    "-i",
    rutaRecurso(c),
    // encuadre 9:16: llena el cuadro y recorta los costados (o arriba y abajo)
    "-vf",
    "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30",
    ...audio,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    t.ruta(rel),
  ]);
  return { desde, dur, conAudio: audio[0] !== "-an" };
};

/** Filtro del audio de un clip: nivelado al volumen de la voz menos 2 dB, limitado y con fundidos de 80 ms. */
export const audioClip = (dur: number) => `loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.84,afade=t=in:d=0.08,afade=t=out:st=${Math.max(0, dur - 0.12).toFixed(2)}:d=0.12`;

/**
 * Busca qué clips de la biblioteca (solo de las categorías elegidas) corresponden a lo que se dice y los deja
 * listos como material (tipo "clip"). modo "manual": solo los clips elegidos en el formulario (Claude decide dónde van).
 */
export const detectarClips = async (t: Trabajo, tr: Transcripcion, cortes: Cortes, opciones: OpcionesCrudo["clips"], marca: Marca, primerId: number, signal?: AbortSignal): Promise<ItemMaterial[]> => {
  if (opciones.modo === "no") return [];
  const transcripcion = transcripcionNumerada(tr, cortes);
  const texto = tr.palabras.map((p) => p.texto).join(" ");
  const catalogo = await candidatosDelVideo(opciones, texto);
  if (!catalogo.length) {
    await t.log(opciones.modo === "manual" ? "Clips: no elegiste ninguno." : "Clips: no hay clips en las categorías elegidas de la biblioteca.");
    return [];
  }
  const maximo = opciones.modo === "manual" ? opciones.elegidos.length : maxClipsPara(opciones.frecuencia, (tr.palabras.at(-1)?.finMs ?? 0) / 1000);
  t.actividad("Buscando qué clips de tu biblioteca encajan con lo que decís…");
  const r = await pedirAClaude({
    prompt: `${PROMPT}\n\n${reglasClips(opciones, maximo)}${opciones.modo === "manual" ? "\n\nEstos clips los eligió la persona: ubicá cada uno donde mejor encaje (podés dejar afuera uno que no encaje en ningún lado)." : ""}\n\nClips:\n${await fichasClips(catalogo)}\n\nTranscripción:\n${transcripcion}`,
    schema: ClipsElegidosSchema,
    cwd: t.dir,
    herramientas: [],
    model: marca.modeloClaude,
    signal,
    onLog: (l) => void t.log(l),
  });
  const usados = new Set<string>();
  const items: ItemMaterial[] = [];
  for (const e of r.clips.slice(0, maximo)) {
    const c = catalogo.find((x) => x.id === e.clip);
    const a = tr.palabras[Math.min(e.palabra_inicio, e.palabra_fin)];
    const b = tr.palabras[Math.max(e.palabra_inicio, e.palabra_fin)];
    if (!c || !a || !b || usados.has(c.id) || a.inicioMs < 2000) continue;
    usados.add(c.id);
    const id = `m${String(primerId + items.length).padStart(2, "0")}`;
    const rel = `clips/${id}.mp4`;
    try {
      const { desde, dur, conAudio } = await cortarClip(t, c, e.desde_s, e.duracion_s, rel, { conAudio: decidirAudio(opciones, c, e.con_audio) });
      items.push({
        id,
        tipo: "clip",
        frase: tr.palabras.slice(Math.min(e.palabra_inicio, e.palabra_fin), Math.max(e.palabra_inicio, e.palabra_fin) + 1).map((p) => p.texto).join(" "),
        // un clip con audio arranca al terminar la frase (en la pausa), para tapar lo menos posible a la persona
        origenMs: conAudio ? b.finMs : a.inicioMs,
        origenFinMs: b.finMs,
        estado: "listo",
        clip: { id: c.id, ruta: c.archivo, nombre: c.nombre, desdeS: desde, duracionS: dur, archivo: rel, motivo: e.motivo, conAudio },
      });
    } catch (err) {
      await t.log(`No pude cortar el clip ${c.nombre}: ${(err as Error).message.split("\n")[0]}`, "error");
    }
  }
  await anotarRecientes(items.map((i) => i.clip!.id));
  await t.log(items.length ? `Clips de la biblioteca: ${items.map((i) => `${i.clip!.nombre}${i.clip!.conAudio ? " (con su audio)" : ""} — ${i.clip!.motivo}`).join("; ")}.` : "Clips de la biblioteca: ninguno encaja de verdad con lo que se dice.");
  return items;
};
