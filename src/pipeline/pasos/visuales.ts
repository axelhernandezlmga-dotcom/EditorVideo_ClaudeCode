import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { moodDeGuion, moodPermitido } from "../../shared/musica";
import { VozSchema, type Guion, type Marca } from "../../shared/schemas";
import { TRAMO_CLIP } from "../../shared/biblioteca";
import { cortarClip } from "../crudo/clipsCrudo";
import { ponerMusica } from "../musica";
import { creditoCorto, elegirImagenReal } from "../crudo/imagenesReales";
import { pexelsKey } from "../config";
import { buscarClip, descargar } from "../pexels";
import { asegurarSfx, asegurarTic } from "../sfx";
import { efectosDeBiblioteca, recursosDe } from "../biblioteca";
import { DIR_ASSETS } from "../rutas";
import { prepararIlustracion } from "../ilustracion/preparar";
import type { Trabajo } from "../trabajo";

export const VisualesSchema = z.object({
  musica: z.string().nullable(),
  sfx: z.string().nullable(),
  pop: z.string().nullable().default(null),
  /** "Tic" de la apertura de marca (perfiles con kit). */
  tic: z.string().nullable().default(null),
  stock: z.record(z.string(), z.string()),
  /** foto_real: foto verificada por escena (o null = tarjeta de texto); en un collage, las otras en `extras`. */
  fotos: z
    .record(z.string(), z.object({ archivo: z.string(), credito: z.string().nullable(), extras: z.array(z.object({ archivo: z.string(), credito: z.string().nullable() })).default([]) }).nullable())
    .default({}),
  creditos: z.array(z.string()),
  /** Escenas ilustradas: objetos dibujados por la app que usa este video (SVG saneado), por id. */
  svgs: z.record(z.string(), z.string()).default({}),
});
export type Visuales = z.infer<typeof VisualesSchema>;

const EXT_AUDIO = /\.(mp3|m4a|wav|ogg)$/i;

const archivosAudio = async (dir: string): Promise<string[]> => {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await archivosAudio(p)));
    else if (EXT_AUDIO.test(e.name)) out.push(p);
  }
  return out;
};

/** Paso 5 (assets): música, efecto de transición y clips de Pexels, copiados dentro del trabajo. */
export const pasoVisuales = async (t: Trabajo, guion: Guion, marca: Marca, signal?: AbortSignal, moodsPerfil: string[] = []): Promise<Visuales> => {
  const previo = await t.leer("visuales.json", VisualesSchema);
  const v: Visuales = { musica: null, sfx: null, pop: null, tic: null, stock: {}, fotos: {}, creditos: [], svgs: {} };

  if (marca.musica) {
    if (previo?.musica && t.existe(previo.musica)) v.musica = previo.musica;
    else {
      // el perfil puede limitar los ánimos de música (ej. una marca sobria: tensión, chill, motivacional)
      const mood = moodPermitido(moodDeGuion(guion.mood), moodsPerfil);
      // ~2,5 palabras por segundo de narración
      const duracionS = guion.escenas.reduce((n, e) => n + e.narracion.split(/\s+/).length, 0) / 2.5;
      const r = await ponerMusica(t, mood, { duracionS });
      if (r) {
        v.musica = r.rel;
        await t.log(`Música: "${mood}" → ${r.pista.original} (${Math.round(r.pista.bpm)} BPM, ${r.pista.zip}).`);
      } else {
        await t.log("No hay música (ni incluida ni en la Biblioteca) para ese ánimo: el video va sin música de fondo.");
      }
    }
  }

  if (marca.sfx) {
    // whoosh en slides/barridos y pop en zooms; si no hay propios en assets/sfx/, se usan unos sintetizados
    const propios = [...(await efectosDeBiblioteca().catch(() => [])), ...(await archivosAudio(path.join(DIR_ASSETS, "sfx")))];
    const { whoosh, pop } = await asegurarSfx(propios);
    v.sfx = `audio/sfx-whoosh${path.extname(whoosh)}`;
    await copyFile(whoosh, t.ruta(v.sfx));
    v.pop = `audio/sfx-pop${path.extname(pop)}`;
    await copyFile(pop, t.ruta(v.pop));
    const tic = await asegurarTic(propios);
    v.tic = `audio/sfx-tic${path.extname(tic)}`;
    await copyFile(tic, t.ruta(v.tic));
  }

  const clave = pexelsKey();
  const conStock = guion.escenas.map((e, i) => ({ e, i })).filter(({ e }) => e.plantilla === "stock_video");
  if (conStock.length && !clave) await t.log("Hay escenas de video de stock pero no hay PEXELS_API_KEY: se usan animaciones.");
  if (clave) {
    await mkdir(t.ruta("stock"), { recursive: true });
    for (const { e, i } of conStock) {
      const rel = `stock/escena-${String(i + 1).padStart(2, "0")}.mp4`;
      if (previo?.stock[i] === rel && t.existe(rel)) {
        v.stock[i] = rel;
        continue;
      }
      try {
        t.actividad(`Buscando video de stock para la escena ${i + 1}…`);
        const clip = await buscarClip(clave, e.palabras_clave_stock, signal);
        if (!clip) {
          await t.log(`Escena ${i + 1}: no encontré video en Pexels, uso animación.`);
          continue;
        }
        await descargar(clip.url, t.ruta(rel), signal);
        v.stock[i] = rel;
        v.creditos.push(`Video de ${clip.autor} en Pexels: ${clip.pagina}`);
      } catch (err) {
        await t.log(`Escena ${i + 1}: falló Pexels (${(err as Error).message}), uso animación.`, "error");
      }
    }
  }

  // clips de la biblioteca: el tramo del medio, tan largo como la escena (máx. lo que dure el clip), sin audio
  const conClip = guion.escenas.map((e, i) => ({ e, i })).filter(({ e }) => e.plantilla === "clip_biblioteca");
  if (conClip.length) {
    const voz = await t.leer("voz.json", VozSchema);
    const clips = await recursosDe("video");
    for (const { e, i } of conClip) {
      if (e.plantilla !== "clip_biblioteca") continue;
      const rel = `stock/escena-${String(i + 1).padStart(2, "0")}.mp4`;
      const c = clips.find((x) => x.id === e.props.clip);
      if (!c) {
        await t.log(`Escena ${i + 1}: el clip ${e.props.clip} ya no está en la biblioteca; va una animación.`, "error");
        continue;
      }
      if (previo?.stock[i] === rel && t.existe(rel)) {
        v.stock[i] = rel;
        continue;
      }
      const dur = Math.min(c.duracion, Math.max(TRAMO_CLIP.min, (voz?.escenas[i]?.duracionMs ?? 4000) / 1000 + 0.5));
      try {
        t.actividad(`Cortando el clip «${c.nombre}» para la escena ${i + 1}…`);
        await cortarClip(t, c, Math.max(0, (c.duracion - dur) / 2), dur, rel, { carpeta: "stock", ajustarTramo: false });
        v.stock[i] = rel;
        await t.log(`Escena ${i + 1}: clip de la biblioteca «${c.nombre}».`);
      } catch (err) {
        await t.log(`Escena ${i + 1}: no pude cortar el clip «${c.nombre}» (${(err as Error).message.split("\n")[0]}); va una animación.`, "error");
      }
    }
  }

  // fotos REALES de personas, instituciones y lugares: cada candidata se mira antes de usarla
  const investigacion: Record<string, unknown> = {};
  for (const [i, e] of guion.escenas.entries()) {
    if (e.plantilla !== "foto_real") continue;
    if (previo && i in previo.fotos && (previo.fotos[i] === null || t.existe(previo.fotos[i]!.archivo))) {
      v.fotos[i] = previo.fotos[i]!;
      continue;
    }
    t.actividad(`Buscando una foto real de ${e.props.texto}…`);
    const base = `escena-${String(i + 1).padStart(2, "0")}`;
    const { elegida, intentos } = await elegirImagenReal(t, base, e.props.imagenes, e.props.que_debe_verse, e.narracion, e.props.texto, marca.modeloClaude, signal);
    investigacion[`escena ${i + 1}`] = { que: e.props.que_debe_verse, intentos, elegida: elegida?.archivo ?? null };
    v.fotos[i] = elegida ? { archivo: elegida.archivo, credito: creditoCorto(elegida), extras: [] } : null;
    if (elegida) v.creditos.push(`${creditoCorto(elegida)} — ${elegida.pagina ?? elegida.url}`);
    // collage: hasta 2 fotos más, de las candidatas que no se probaron (cada una también se verifica mirándola)
    if (elegida && e.props.marco === "collage") {
      let resto = e.props.imagenes.filter((c) => !intentos.some((x) => x.url === c.url));
      for (let k = 2; k <= 3 && resto.length; k++) {
        const otra = await elegirImagenReal(t, `${base}-${k}`, resto, e.props.que_debe_verse, e.narracion, null, marca.modeloClaude, signal);
        if (!otra.elegida) break;
        v.fotos[i]!.extras.push({ archivo: otra.elegida.archivo, credito: creditoCorto(otra.elegida) });
        v.creditos.push(`${creditoCorto(otra.elegida)} — ${otra.elegida.pagina ?? otra.elegida.url}`);
        resto = resto.filter((c) => !otra.intentos.some((x) => x.url === c.url));
      }
    }
    await t.log(elegida ? `Escena ${i + 1}: foto real de ${e.props.texto} (${elegida.origen}), verificada: ${elegida.veredicto?.motivo ?? ""}` : `Escena ${i + 1}: no hubo una foto real verificada de ${e.props.texto}; va una tarjeta de texto.`);
  }
  if (Object.keys(investigacion).length) await t.escribir("investigacion.json", investigacion);

  // escenas ilustradas: los objetos que pidió el guion y no están en la biblioteca se dibujan (y se miran)
  if (guion.escenas.some((e) => e.plantilla === "escena_ilustrada")) v.svgs = await prepararIlustracion(t, guion, marca, signal);

  await t.escribir("visuales.json", v);
  return v;
};
