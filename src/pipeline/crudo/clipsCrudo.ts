import { mkdir } from "node:fs/promises";
import { z } from "zod";
import { clipsRelacionados, TRAMO_CLIP, type Recurso } from "../../shared/biblioteca";
import type { Cortes, Transcripcion } from "../../shared/cortes";
import type { ItemMaterial } from "../../shared/material";
import type { OpcionesCrudo } from "../../shared/opcionesCrudo";
import type { Marca } from "../../shared/schemas";
import { pedirAClaude } from "../claude";
import { leerBiblioteca, recursosDe, rutaRecurso } from "../biblioteca";
import { ejecutar } from "../proceso";
import type { Trabajo } from "../trabajo";
import { transcripcionNumerada } from "./material";

const ClipsElegidosSchema = z.object({
  clips: z
    .array(
      z.object({
        clip: z.string().describe("id del clip del catálogo"),
        palabra_inicio: z.number().int().min(0),
        palabra_fin: z.number().int().min(0),
        desde_s: z.number().min(0).describe("Segundo del clip donde arranca el mejor tramo"),
        duracion_s: z.number().min(TRAMO_CLIP.min).max(TRAMO_CLIP.max),
        motivo: z.string().max(200).describe("Por qué ese clip corresponde a lo que se dice"),
      }),
    )
    .max(8),
});

const PROMPT = `Sos editor de video. Te paso (1) la transcripción numerada de un video donde una persona habla a cámara y
(2) un catálogo de clips de su biblioteca (agrupados en categorías: clips propios, de noticieros, memes…), con
descripción o nombre, etiquetas y lo que se dice en cada uno.

Elegí en qué momentos conviene insertar un clip del catálogo (B-roll) mientras la persona sigue hablando:
- Solo si lo que se dice coincide DE VERDAD con el clip: la misma persona, el mismo lugar, el mismo hecho o la misma
  frase. Si habla de la rambla, un clip de la rambla; si cita a Batlle, un clip de Batlle diciendo eso o algo afín.
  Un parecido vago NO alcanza: en ese caso no pongas nada. No hay un mínimo: cero clips es una respuesta válida.
- Un meme o clip de reacción (el nombre suele decir la frase o la reacción) va solo cuando remata con gracia algo
  que se acaba de decir (una ironía, una sorpresa, un "no contaban con mi astucia") y el tono del video lo permite.
  Nunca en un momento serio (una tragedia, una víctima, un dato delicado).
- Nunca el mismo clip dos veces. Nada en los primeros 2 segundos (el gancho es la cara de la persona).
- Elegí el mejor tramo de 2 a 5 s del clip (desde_s + duracion_s ≤ duración del clip): el más expresivo o el que
  dice la frase que conecta.
- palabra_inicio/palabra_fin: dónde arranca y termina la mención en la transcripción.`;

/** Corta el tramo del clip (leyendo el original, sin tocarlo) a 1080×1920, sin audio, dentro del trabajo. */
export const cortarClip = async (t: Trabajo, c: Recurso, desdeS: number, duracionS: number, rel: string, op: { carpeta?: string; ajustarTramo?: boolean } = {}) => {
  await mkdir(t.ruta(op.carpeta ?? "clips"), { recursive: true });
  const desde = Math.max(0, Math.min(desdeS, c.duracion - TRAMO_CLIP.min));
  // en un crudo el tramo dura de 2 a 5 s; en una escena animada, lo que dure la escena
  const dur = op.ajustarTramo === false ? Math.max(0.5, Math.min(duracionS, c.duracion - desde)) : Math.max(TRAMO_CLIP.min, Math.min(duracionS, c.duracion - desde));
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
    "-an",
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
  return { desde, dur };
};

/** Una línea por clip para el prompt (compacta: con catálogos grandes van solo los más relacionados). */
export const lineaClip = (c: Recurso, categorias: Map<string, string>) =>
  `- id ${c.id} · ${c.duracion.toFixed(1)} s · [${categorias.get(c.categoria) ?? c.categoria}] ${c.nombre}${c.descripcion ? `\n  ${c.descripcion}` : ""}${Object.values(c.etiquetas).flat().length ? `\n  etiquetas: ${Object.values(c.etiquetas).flat().join(", ")}` : ""}${c.transcripcion ? `\n  dice: "${c.transcripcion.slice(0, 200)}"` : ""}`;

/**
 * Busca qué clips de la biblioteca (solo de las categorías elegidas) corresponden a lo que se dice y los deja
 * listos como material (tipo "clip"). modo "manual": solo los clips elegidos en el formulario (Claude decide dónde van).
 */
export const detectarClips = async (t: Trabajo, tr: Transcripcion, cortes: Cortes, opciones: OpcionesCrudo["clips"], marca: Marca, primerId: number, signal?: AbortSignal): Promise<ItemMaterial[]> => {
  if (opciones.modo === "no") return [];
  const todos = await recursosDe("video", opciones.modo === "manual" ? [] : opciones.categorias);
  const transcripcion = transcripcionNumerada(tr, cortes);
  const catalogo = opciones.modo === "manual" ? todos.filter((c) => opciones.elegidos.includes(c.id)) : clipsRelacionados(todos, transcripcion);
  if (!catalogo.length) {
    await t.log(opciones.modo === "manual" ? "Clips: no elegiste ninguno." : "Clips: no hay clips en las categorías elegidas de la biblioteca.");
    return [];
  }
  t.actividad("Buscando qué clips de tu biblioteca corresponden a lo que decís…");
  const nombres = new Map((await leerBiblioteca()).categorias.map((c) => [c.id, c.nombre]));
  const lista = catalogo.map((c) => lineaClip(c, nombres)).join("\n");
  const r = await pedirAClaude({
    prompt: `${PROMPT}${opciones.modo === "manual" ? "\n\nEstos clips los eligió la persona: ubicá cada uno donde mejor encaje (podés dejar afuera uno que no encaje en ningún lado)." : ""}\n\nCatálogo:\n${lista}\n\nTranscripción:\n${transcripcion}`,
    schema: ClipsElegidosSchema,
    cwd: t.dir,
    herramientas: [],
    model: marca.modeloClaude,
    signal,
    onLog: (l) => void t.log(l),
  });
  const usados = new Set<string>();
  const items: ItemMaterial[] = [];
  for (const e of r.clips) {
    const c = catalogo.find((x) => x.id === e.clip);
    const a = tr.palabras[Math.min(e.palabra_inicio, e.palabra_fin)];
    const b = tr.palabras[Math.max(e.palabra_inicio, e.palabra_fin)];
    if (!c || !a || !b || usados.has(c.id) || a.inicioMs < 2000) continue;
    usados.add(c.id);
    const id = `m${String(primerId + items.length).padStart(2, "0")}`;
    const rel = `clips/${id}.mp4`;
    try {
      const { desde, dur } = await cortarClip(t, c, e.desde_s, e.duracion_s, rel);
      items.push({
        id,
        tipo: "clip",
        frase: tr.palabras.slice(Math.min(e.palabra_inicio, e.palabra_fin), Math.max(e.palabra_inicio, e.palabra_fin) + 1).map((p) => p.texto).join(" "),
        origenMs: a.inicioMs,
        origenFinMs: b.finMs,
        estado: "listo",
        clip: { id: c.id, ruta: c.archivo, nombre: c.nombre, desdeS: desde, duracionS: dur, archivo: rel, motivo: e.motivo },
      });
    } catch (err) {
      await t.log(`No pude cortar el clip ${c.nombre}: ${(err as Error).message.split("\n")[0]}`, "error");
    }
  }
  await t.log(items.length ? `Clips de la biblioteca: ${items.map((i) => `${i.clip!.nombre} (${i.clip!.motivo})`).join("; ")}.` : "Clips de la biblioteca: ninguno corresponde de verdad a lo que se dice.");
  return items;
};
