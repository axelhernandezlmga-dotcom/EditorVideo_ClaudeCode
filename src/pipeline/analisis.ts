import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { EtiquetasClipSchema, type Recurso } from "../shared/biblioteca";
import { actualizarRecursos, DIR_FOTOGRAMAS, DIR_TMP, ErrorBiblioteca, leerBiblioteca, rutaRecurso } from "./biblioteca";
import { pedirAClaude } from "./claude";
import { leerMarca } from "./config";
import { fasterWhisperInstalado } from "./crudo/transcripcion";
import { ejecutar } from "./proceso";
import { PYTHON_VENV, RAIZ } from "./rutas";

/**
 * Análisis de los clips de la Biblioteca, en dos fases que se pueden correr por separado y se REANUDAN (cada clip
 * anota qué fase terminó, así nunca se repite uno ya hecho):
 *  1. local (gratis, en tu compu): una hoja con 4 fotogramas, el volumen del audio y la transcripción de lo que
 *     se dice (faster-whisper, el modelo se carga una sola vez para todo el lote);
 *  2. Claude (usa tu cuenta de Claude Code): mira los fotogramas de varios clips por pedido y escribe qué pasa,
 *     personajes, acciones, tono, por qué es gracioso, en qué situaciones sirve y sus categorías semánticas.
 * Las descripciones que corregiste a mano no se pisan.
 */

/** Clips por pedido a Claude: menos pedidos (cada uno mira hasta 6 hojas de fotogramas). */
export const CLIPS_POR_PEDIDO = 6;
/** Clips por tanda de la fase local (se guarda al terminar cada tanda). */
const TANDA_LOCAL = 20;

export type FaseAnalisis = "local" | "claude";
export type EstadoAnalisis = {
  activa: boolean;
  fase: FaseAnalisis | null;
  categoria: string | null;
  hechos: number;
  total: number;
  /** Pedidos a Claude hechos en esta corrida. */
  pedidos: number;
  actual: string | null;
  errores: { nombre: string; error: string }[];
  cancelar: boolean;
};
export const analisis: EstadoAnalisis = { activa: false, fase: null, categoria: null, hechos: 0, total: 0, pedidos: 0, actual: null, errores: [], cancelar: false };

const esVideo = (r: Recurso) => r.tipo === "video";
export const faltaLocal = (r: Recurso) => esVideo(r) && !r.analisis.local;
export const faltaClaude = (r: Recurso) => esVideo(r) && !r.analisis.claude && r.descripcionPor !== "manual";

/** Cuántos clips de cada categoría faltan analizar (para mostrar antes de arrancar). */
export const pendientesAnalisis = async () => {
  const b = await leerBiblioteca();
  return Object.fromEntries(
    b.categorias.map((c) => {
      const suyos = b.recursos.filter((r) => r.categoria === c.id && esVideo(r));
      return [c.id, { clips: suyos.length, local: suyos.filter(faltaLocal).length, claude: suyos.filter(faltaClaude).length, pedidos: Math.ceil(suyos.filter(faltaClaude).length / CLIPS_POR_PEDIDO) }];
    }),
  );
};

// ---------- fase local ----------

/** Hoja 2×2 con 4 fotogramas (10, 35, 65 y 90 % del clip). */
const hojaFotogramas = async (archivo: string, id: string, duracion: number) => {
  await mkdir(DIR_FOTOGRAMAS, { recursive: true });
  const t = [0.1, 0.35, 0.65, 0.9].map((p) => Math.max(0, duracion * p).toFixed(2));
  await ejecutar("ffmpeg", [
    "-v",
    "error",
    "-y",
    ...t.flatMap((s) => ["-ss", s, "-i", archivo]),
    "-filter_complex",
    "[0:v]scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2,setsar=1[a];[1:v]scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2,setsar=1[b];[2:v]scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2,setsar=1[c];[3:v]scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2,setsar=1[d];[a][b][c][d]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0",
    "-frames:v",
    "1",
    "-q:v",
    "5",
    path.join(DIR_FOTOGRAMAS, `${id}.jpg`),
  ]);
};

/** Volumen medio del audio (dB). */
export const volumenMedio = async (archivo: string): Promise<number | null> => {
  const err = await ejecutar("ffmpeg", ["-hide_banner", "-nostats", "-i", archivo, "-vn", "-af", "volumedetect", "-f", "null", "-"], { devolverStderr: true });
  const m = /mean_volume:\s*(-?[\d.]+|-inf) dB/.exec(err);
  return m ? (m[1] === "-inf" ? -100 : Number(m[1])) : null;
};

const faseLocal = async (lista: Recurso[]) => {
  const marca = await leerMarca();
  // FABRICA_SIN_WHISPER: para los tests (no carga el modelo)
  const whisper = !process.env.FABRICA_SIN_WHISPER && (await fasterWhisperInstalado());
  await mkdir(DIR_TMP, { recursive: true });
  for (let i = 0; i < lista.length && !analisis.cancelar; i += TANDA_LOCAL) {
    const tanda = lista.slice(i, i + TANDA_LOCAL);
    const datos = new Map<string, Partial<Recurso>>();
    const wavs: { id: string; wav: string }[] = [];
    for (const r of tanda) {
      analisis.actual = r.nombre;
      try {
        const archivo = rutaRecurso(r);
        await hojaFotogramas(archivo, r.id, r.duracion);
        const volumenDb = r.audio ? await volumenMedio(archivo) : null;
        datos.set(r.id, { volumenDb });
        if (whisper && r.audio && (volumenDb ?? 0) > -45) {
          const wav = path.join(DIR_TMP, `${r.id}.wav`);
          await ejecutar("ffmpeg", ["-v", "error", "-y", "-i", archivo, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav]);
          wavs.push({ id: r.id, wav });
        }
      } catch (e) {
        analisis.errores.push({ nombre: r.nombre, error: (e as Error).message.split("\n")[0]! });
      }
    }
    // transcripción de toda la tanda con el modelo cargado una vez
    if (wavs.length) {
      const lista = path.join(DIR_TMP, `lote-${Date.now()}.json`);
      await writeFile(lista, JSON.stringify(wavs));
      try {
        await ejecutar(PYTHON_VENV, [path.join(RAIZ, "src", "pipeline", "crudo", "transcribir_lote.py"), marca.crudo.modeloWhisper, String(marca.crudo.hilosTranscripcion), lista], {
          onStdoutLinea: (l) => {
            try {
              const j = JSON.parse(l) as { id?: string; texto?: string; idioma?: string; error?: string };
              if (!j.id) return;
              const d = datos.get(j.id) ?? {};
              if (j.error) analisis.errores.push({ nombre: tanda.find((r) => r.id === j.id)?.nombre ?? j.id, error: `transcripción: ${j.error}` });
              // menos de 2 palabras suele ser ruido o una risa: no se guarda como diálogo
              else datos.set(j.id, { ...d, transcripcion: j.texto && j.texto.split(/\s+/).length >= 2 ? j.texto : null, idioma: j.idioma ?? null });
            } catch {
              // línea de progreso de la descarga del modelo
            }
          },
        });
      } catch (e) {
        analisis.errores.push({ nombre: "transcripción", error: (e as Error).message.split("\n")[0]! });
      } finally {
        await rm(lista, { force: true });
        for (const w of wavs) await rm(w.wav, { force: true });
      }
    }
    const ahora = new Date().toISOString();
    await actualizarRecursos((recursos) => {
      for (const r of recursos) {
        const d = datos.get(r.id);
        if (!d) continue;
        Object.assign(r, d);
        r.analisis = { ...r.analisis, local: ahora, error: null };
      }
    });
    analisis.hechos += tanda.length;
  }
};

// ---------- fase con Claude ----------

const AnalisisClipSchema = z.object({
  n: z.number().int().min(1).describe("número del clip en la lista"),
  descripcion: z.string().max(400).describe("qué pasa en el clip, concreto (quién, dónde, qué hace, qué dice)"),
  etiquetas: EtiquetasClipSchema,
  usos: z.array(z.string().max(160)).min(1).max(6).describe("situaciones concretas de un video en las que este clip queda bien (ej. 'cuando alguien gasta mucha plata', 'reacción a una decisión absurda')"),
  semantica: z.array(z.string().max(40)).max(10).describe("categorías semánticas en minúscula (ej. dinero, riqueza, celebración, error, incredulidad, enojo, victoria)"),
  tono: z.string().max(80).describe("tono emocional (ej. eufórico, irónico, avergonzado, épico, tenso)"),
  humor: z.string().max(240).describe("por qué es gracioso o qué efecto hace al insertarlo; vacío si no es humorístico"),
  audio_importante: z.boolean().describe("true si el clip pierde su gracia sin su audio (una frase, un grito, un efecto sonoro)"),
});
const RespuestaAnalisisSchema = z.object({ clips: z.array(AnalisisClipSchema) });

const PROMPT_ANALISIS = `Sos archivista de un editor de video. Te paso varios clips cortos de una biblioteca (muchos son memes o
reacciones). De cada uno tenés una hoja con 4 fotogramas (clip-N.jpg, en orden: 10 %, 35 %, 65 % y 90 % del clip), el
nombre del archivo, la carpeta de donde vino, la duración y lo que se dice (transcripción automática: puede tener errores).

Mirá cada hoja con la herramienta Read y describí el clip SIN inventar: quién aparece (si es un personaje o persona
conocida, o lo dice el nombre del archivo, nombralo; si no, describilo), qué hace, objetos importantes, el tono y por
qué funciona como meme. Lo más importante son los "usos": situaciones de un video (un tema, una frase, un momento) en
las que insertar este clip tiene sentido y suma; escribilos como los diría un editor. Las etiquetas y la semántica van
en español, minúsculas, cortas. Si el nombre y la imagen se contradicen, manda la imagen.`;

const faseClaude = async (lista: Recurso[]) => {
  const marca = await leerMarca();
  const nombres = new Map((await leerBiblioteca()).categorias.map((c) => [c.id, c.nombre]));
  for (let i = 0; i < lista.length && !analisis.cancelar; i += CLIPS_POR_PEDIDO) {
    const lote = lista.slice(i, i + CLIPS_POR_PEDIDO);
    analisis.actual = lote.map((r) => r.nombre).join(" · ").slice(0, 120);
    const dir = path.join(DIR_TMP, `analisis-${lote[0]!.id}`);
    try {
      await mkdir(dir, { recursive: true });
      // la hoja de fotogramas sale de la fase local; si falta, se hace ahora
      for (const [n, r] of lote.entries()) {
        const hoja = path.join(DIR_FOTOGRAMAS, `${r.id}.jpg`);
        await copyFile(hoja, path.join(dir, `clip-${n + 1}.jpg`)).catch(async () => {
          await hojaFotogramas(rutaRecurso(r), r.id, r.duracion);
          await copyFile(hoja, path.join(dir, `clip-${n + 1}.jpg`));
        });
      }
      const fichas = lote
        .map((r, n) => `${n + 1}. clip-${n + 1}.jpg · "${r.nombre}" · ${r.duracion.toFixed(1)} s · carpeta: ${r.origen || nombres.get(r.categoria)}${r.transcripcion ? `\n   Dice${r.idioma ? ` (${r.idioma})` : ""}: "${r.transcripcion.slice(0, 300)}"` : r.audio ? "\n   Sin diálogo (música, risa o efecto)." : "\n   Sin audio."}`)
        .join("\n");
      const resp = await pedirAClaude({ prompt: `${PROMPT_ANALISIS}\n\nClips:\n${fichas}\n\nDevolvé un elemento por clip, con su número.`, schema: RespuestaAnalisisSchema, cwd: dir, herramientas: ["Read"], model: marca.modeloClaude });
      analisis.pedidos++;
      const ahora = new Date().toISOString();
      await actualizarRecursos((recursos) => {
        for (const a of resp.clips) {
          const original = lote[a.n - 1];
          const r = original && recursos.find((x) => x.id === original.id);
          if (!r || r.descripcionPor === "manual") continue;
          const objetos = [...new Set([...a.etiquetas.objetos, ...r.etiquetas.objetos])].slice(0, 12);
          Object.assign(r, { descripcion: a.descripcion, etiquetas: { ...a.etiquetas, objetos }, usos: a.usos, semantica: a.semantica, tono: a.tono, humor: a.humor, audioClave: a.audio_importante, descripcionPor: "claude" as const });
          r.analisis = { ...r.analisis, claude: ahora, error: null };
        }
      });
      const faltaron = lote.filter((r) => !resp.clips.some((a) => lote[a.n - 1]?.id === r.id));
      for (const r of faltaron) analisis.errores.push({ nombre: r.nombre, error: "Claude no lo devolvió (queda pendiente)" });
    } catch (e) {
      for (const r of lote) analisis.errores.push({ nombre: r.nombre, error: (e as Error).message.split("\n")[0]!.slice(0, 200) });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
    analisis.hechos += lote.length;
  }
};

/**
 * Analiza en segundo plano los clips pendientes de una categoría (o los elegidos). `limite` = como mucho tantos
 * clips (para probar con pocos antes de gastar en todos). Devuelve enseguida; el progreso queda en `analisis`.
 */
export const analizarClips = async (pedido: { fase: FaseAnalisis; categoria?: string; ids?: string[]; limite?: number; esperar?: boolean }) => {
  if (analisis.activa) throw new ErrorBiblioteca("Ya hay un análisis en curso: esperá a que termine o detenelo.");
  const b = await leerBiblioteca();
  const falta = pedido.fase === "local" ? faltaLocal : faltaClaude;
  let lista = b.recursos.filter((r) => (pedido.ids ? pedido.ids.includes(r.id) : r.categoria === pedido.categoria) && falta(r));
  if (pedido.ids && pedido.fase === "claude") lista = b.recursos.filter((r) => pedido.ids!.includes(r.id) && esVideo(r) && r.descripcionPor !== "manual");
  if (pedido.limite) lista = lista.slice(0, pedido.limite);
  Object.assign(analisis, { activa: true, fase: pedido.fase, categoria: pedido.categoria ?? null, hechos: 0, total: lista.length, pedidos: 0, actual: null, errores: [], cancelar: false });
  const correr = (pedido.fase === "local" ? faseLocal(lista) : faseClaude(lista))
    .catch((e: Error) => {
      analisis.errores.push({ nombre: "análisis", error: e.message.split("\n")[0]! });
    })
    .finally(() => {
    analisis.activa = false;
    analisis.actual = null;
  });
  if (pedido.esperar) await correr;
  else void correr;
  return analisis;
};
