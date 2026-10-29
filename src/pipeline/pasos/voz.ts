import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import type { Caption } from "@remotion/captions";
import { COLCHON_MS, duracionEscenaFrames, FPS, FRAMES_TRANSICION, iniciosEscenas } from "../../shared/render";
import { VozSchema, type Guion, type Marca, type Tono, type Voz } from "../../shared/schemas";
import { alinear, desplazar, type PalabraTiempo } from "../alinear";
import { duracionMs, ffmpeg } from "../proceso";
import type { Trabajo } from "../trabajo";
import { proveedor, proveedorDeVoz } from "../tts";
import { claveDe } from "../claves";
import { ErrorGemini, sintetizarGemini } from "../tts/gemini";
import { kokoroInstalado } from "../instalar";
import { geminiAgotadoHoy } from "../usoGemini";
import { tiemposConWhisper, whisperDisponible } from "../whisper";

const hash = (...partes: string[]) => createHash("sha1").update(partes.join("|")).digest("hex").slice(0, 10);

/** Pruebas: FABRICA_FORZAR_WHISPER=1 hace que edge no dé tiempos; FABRICA_FORZAR_FALLO_WHISPER=1 hace fallar whisper. */
const forzarWhisper = () => process.env.FABRICA_FORZAR_WHISPER === "1";

const transcribir = async (audio: string, signal?: AbortSignal): Promise<PalabraTiempo[]> => {
  if (process.env.FABRICA_FORZAR_FALLO_WHISPER === "1") throw new Error("fallo forzado (FABRICA_FORZAR_FALLO_WHISPER=1)");
  if (!whisperDisponible()) throw new Error("whisper.cpp no está instalado. Corré `npm run setup`.");
  return tiemposConWhisper(audio, signal);
};

/** Notas de dirección para Gemini: las del tono + acento y ritmo. */
export const estiloGemini = (tono: Tono | null, velocidad: string) => {
  const v = parseInt(velocidad, 10) || 0;
  const ritmo = v >= 12 ? "Ritmo rápido, con energía." : v >= 4 ? "Ritmo un poco rápido, ágil." : v <= -5 ? "Ritmo pausado." : "Ritmo natural de video corto para redes.";
  const base = tono?.estiloVoz ?? "Narrador de video corto para redes, claro y con ganas de contar.";
  const acento = /rioplatense|uruguay|montevide|argentin|españ|neutro|mexican/i.test(base) ? "" : " Acento rioplatense uruguayo (Montevideo), con voseo.";
  return `${base}${acento} ${ritmo}`.trim();
};

/**
 * Dónde cortar el audio completo para separar cada escena: entre el final de la última palabra de una escena
 * y el principio de la primera de la siguiente, dejando un margen chico de aire a cada lado.
 * `conteos` = cantidad de palabras de cada escena (en orden); `caps` = las palabras de toda la narración.
 */
export const cortesPorEscena = (caps: Caption[], conteos: number[], duracionTotalMs: number): { ini: number; fin: number }[] => {
  // whisper suele marcar el comienzo de una palabra un poco tarde: más aire antes que después
  const ANTES = 160;
  const DESPUES = 180;
  const rangos: { primera: number; ultima: number }[] = [];
  let i = 0;
  for (const n of conteos) {
    rangos.push({ primera: i, ultima: i + n - 1 });
    i += n;
  }
  // límites entre escenas (punto medio del silencio entre una y otra)
  const limites = [0];
  for (let k = 0; k < rangos.length - 1; k++) {
    const fin = caps[rangos[k]!.ultima]!.endMs;
    const ini = caps[rangos[k + 1]!.primera]!.startMs;
    limites.push(ini > fin ? (fin + ini) / 2 : ini);
  }
  limites.push(duracionTotalMs);
  return rangos.map((r, k) => {
    const desde = limites[k]!;
    const hasta = limites[k + 1]!;
    const ini = k === 0 ? 0 : Math.max(desde, caps[r.primera]!.startMs - ANTES);
    const fin = Math.min(hasta, caps[r.ultima]!.endMs + DESPUES);
    return { ini: Math.round(ini), fin: Math.round(Math.max(fin, ini + 200)) };
  });
};

/** Milisegundos de silencio al principio de un WAV PCM de 16 bits (ventanas de 10 ms bajo -40 dB), menos 40 ms de aire. */
export const silencioInicialMs = (wav: Buffer): number => {
  let pos = 12;
  let canales = 1;
  let frecuencia = 24000;
  while (pos + 8 <= wav.length) {
    const id = wav.toString("ascii", pos, pos + 4);
    const largo = wav.readUInt32LE(pos + 4);
    if (id === "fmt ") {
      if (wav.readUInt16LE(pos + 22) !== 16) return 0; // solo PCM de 16 bits
      canales = wav.readUInt16LE(pos + 10);
      frecuencia = wav.readUInt32LE(pos + 12);
    } else if (id === "data") {
      const inicio = pos + 8;
      const fin = Math.min(wav.length, inicio + largo);
      const ventana = Math.round(frecuencia / 100) * canales * 2;
      const umbral = 32768 * 0.01;
      for (let v = inicio; v + ventana <= fin; v += ventana) {
        let suma = 0;
        for (let k = v; k < v + ventana; k += 2) suma += wav.readInt16LE(k) ** 2;
        if (Math.sqrt(suma / (ventana / 2)) > umbral) return Math.max(0, ((v - inicio) / ventana) * 10 - 40);
      }
      return 0;
    }
    pos += 8 + largo + (largo % 2);
  }
  return 0;
};

const relativo = (t: Trabajo, archivo: string) => archivo.slice(t.dir.length + 1).replaceAll("\\", "/");

/**
 * Gemini: toda la narración en UNA llamada (suena más natural y gasta un solo pedido del cupo),
 * tiempos por palabra con whisper.cpp, y después se corta un audio por escena.
 * Si whisper falla, los tiempos se estiman en proporción al texto (y queda en el log).
 */
const vozGemini = async (t: Trabajo, guion: Guion, voz: string, estilo: string, previo: Voz | null, signal?: AbortSignal): Promise<Voz["escenas"]> => {
  const narraciones = guion.escenas.map((e) => e.narracion.trim());
  const h = hash(narraciones.join("\n"), voz, estilo);
  if (previo?.hash === h && previo.escenas.length === narraciones.length && previo.escenas.every((e) => t.existe(e.archivo))) return previo.escenas;

  const completo = t.ruta("audio", `gemini-${h}.wav`);
  if (!t.existe(relativo(t, completo))) {
    t.actividad("Generando la narración completa con Gemini TTS (una sola llamada)…");
    const crudo = completo.replace(/\.wav$/, ".crudo.wav");
    await sintetizarGemini({
      texto: narraciones.join("\n\n"),
      voz,
      estilo,
      salida: crudo,
      signal,
      alFallar: (e, n) => void t.log(`Gemini TTS falló (intento ${n}): ${(e as Error).message}`, "error"),
    });
    // Gemini arranca con ~0,5 s de silencio: se saca para que el gancho empiece ya
    const silencio = silencioInicialMs(await readFile(crudo));
    await ffmpeg(["-y", "-i", crudo, "-ss", (silencio / 1000).toFixed(3), "-c:a", "pcm_s16le", completo], signal);
    await rm(crudo, { force: true });
  }
  t.progreso("voz", 0.5);
  const dur = await duracionMs(completo);

  const textoCompleto = narraciones.join(" ");
  let palabras: PalabraTiempo[] = [];
  let origen: Voz["escenas"][number]["origenTiempos"] = "whisper";
  try {
    t.actividad("Sacando los tiempos de cada palabra con whisper.cpp…");
    palabras = await transcribir(completo, signal);
    if (palabras.length === 0) throw new Error("whisper no reconoció palabras");
    await t.log(`Tiempos por palabra: whisper.cpp (${palabras.length} palabras reconocidas)`);
  } catch (e) {
    if (signal?.aborted) throw e;
    origen = "proporcional";
    await t.log(`whisper.cpp falló (${(e as Error).message}): los subtítulos van con tiempos estimados por la largura del texto.`, "error");
  }
  const caps = alinear(textoCompleto, palabras, dur);
  const conteos = narraciones.map((n) => n.split(/\s+/).filter(Boolean).length);
  const cortes = cortesPorEscena(caps, conteos, dur);

  const escenas: Voz["escenas"] = [];
  let desde = 0;
  for (const [i, c] of cortes.entries()) {
    const archivo = t.ruta("audio", `escena-${String(i + 1).padStart(2, "0")}-${h}.wav`);
    await ffmpeg(["-y", "-i", completo, "-ss", (c.ini / 1000).toFixed(3), "-to", (c.fin / 1000).toFixed(3), "-c:a", "pcm_s16le", archivo], signal);
    const propias = caps.slice(desde, desde + conteos[i]!).map((cap, k) => (k === 0 ? { ...cap, text: cap.text.trimStart() } : cap));
    desde += conteos[i]!;
    const dur = await duracionMs(archivo);
    // las palabras quedan dentro del audio de su escena (por si whisper se pasó un poco del corte)
    const captions = desplazar(propias, -c.ini).map((cap) => {
      const startMs = Math.min(Math.max(0, cap.startMs), Math.max(0, dur - 1));
      const endMs = Math.max(startMs + 1, Math.min(cap.endMs, dur));
      return { ...cap, startMs, endMs, timestampMs: Math.round((startMs + endMs) / 2) };
    });
    escenas.push({ archivo: relativo(t, archivo), duracionMs: dur, captions, origenTiempos: origen });
  }
  return escenas;
};

/** edge-tts / Kokoro: un audio por escena; si una escena no cambió, reutiliza su audio. */
const vozPorEscena = async (t: Trabajo, guion: Guion, voz: string, marca: Marca, previo: Voz | null, signal?: AbortSignal): Promise<Voz["escenas"]> => {
  const { velocidad, tono } = marca;
  const prov = proveedor(proveedorDeVoz(voz) === "kokoro" ? "kokoro" : "edge");
  const escenas: Voz["escenas"] = [];
  for (const [i, e] of guion.escenas.entries()) {
    const nombre = `audio/escena-${String(i + 1).padStart(2, "0")}-${hash(e.narracion, voz, velocidad, tono)}`;
    const reutilizable = previo?.escenas.find((p) => p.archivo.startsWith(nombre) && t.existe(p.archivo));
    if (reutilizable && !(forzarWhisper() && reutilizable.origenTiempos !== "whisper")) {
      escenas.push(reutilizable);
      continue;
    }
    t.actividad(`Generando voz de la escena ${i + 1} de ${guion.escenas.length}…`);
    t.progreso("voz", i / guion.escenas.length);
    const res = await prov.sintetizar({ texto: e.narracion, voz, velocidad, tono, salidaSinExt: t.ruta(nombre), sinTiempos: forzarWhisper(), signal });
    const dur = await duracionMs(res.archivo);
    let palabras = res.palabras;
    let origen: Voz["escenas"][number]["origenTiempos"] = "tts";
    if (palabras.length === 0) {
      await t.log(`Escena ${i + 1}: la voz no trajo tiempos por palabra, uso whisper.cpp`);
      t.actividad(`Transcribiendo escena ${i + 1} con whisper.cpp…`);
      try {
        palabras = await transcribir(res.archivo, signal);
        origen = "whisper";
      } catch (err) {
        if (signal?.aborted) throw err;
        origen = "proporcional";
        await t.log(`Escena ${i + 1}: whisper.cpp falló (${(err as Error).message}), tiempos estimados.`, "error");
      }
    }
    escenas.push({ archivo: relativo(t, res.archivo), duracionMs: dur, captions: alinear(e.narracion, palabras, dur), origenTiempos: origen });
  }
  return escenas;
};

/**
 * Paso 4: audio por escena (así cada escena dura exactamente lo que dura su voz)
 * + tiempos por palabra + audio completo + captions.json global.
 */
export const pasoVoz = async (t: Trabajo, guion: Guion, marca: Marca, tono: Tono | null, signal?: AbortSignal): Promise<Voz> => {
  const estado = await t.estado();
  const vozPedida = estado.opciones.voz ?? marca.voz;
  let voz = vozPedida;
  const previo = await t.leer("voz.json", VozSchema);
  await mkdir(t.ruta("audio"), { recursive: true });

  const estilo = estiloGemini(tono, marca.velocidad);
  let respaldo: Voz["respaldo"];
  const usarRespaldo = async (motivo: string) => {
    voz = marca.vozRespaldo;
    respaldo = { vozPedida, motivo };
    await t.log(`Voz de respaldo: este video sale con ${voz} (edge-tts) en vez de ${vozPedida}. Motivo: ${motivo}`, "error");
  };
  let escenas: Voz["escenas"] | null = null;
  if (proveedorDeVoz(vozPedida) === "gemini") {
    // la misma narración ya generada con Gemini se reutiliza aunque hoy no quede cupo
    const reutilizable = previo?.proveedor === "gemini" && previo.voz === vozPedida && previo.hash === hash(guion.escenas.map((e) => e.narracion.trim()).join("\n"), vozPedida, estilo);
    if (!reutilizable && !claveDe("GEMINI_API_KEY")) await usarRespaldo("falta GEMINI_API_KEY");
    else if (!reutilizable && (await geminiAgotadoHoy())) await usarRespaldo("hoy ya se llegó al límite gratis de Google");
    else {
      try {
        escenas = await vozGemini(t, guion, vozPedida, estilo, previo, signal);
      } catch (e) {
        if (!(e instanceof ErrorGemini && ((e.http === 429 && e.limite === "diario") || e.http === 0))) throw e;
        await usarRespaldo(e.http === 0 ? "falta GEMINI_API_KEY" : "Google respondió 429 RESOURCE_EXHAUSTED (límite gratis del día)");
      }
    }
  }
  // Kokoro es opcional: si no está instalado, el video sale igual con la voz de respaldo
  if (!escenas && proveedorDeVoz(voz) === "kokoro" && !(await kokoroInstalado())) await usarRespaldo("Kokoro no está instalado (npm run setup -- --kokoro)");
  escenas ??= await vozPorEscena(t, guion, voz, marca, previo, signal);
  const prov = proveedorDeVoz(voz);
  t.progreso("voz", 1);

  const resultado: Voz = {
    voz,
    proveedor: prov,
    ...(prov === "gemini" ? { hash: hash(guion.escenas.map((e) => e.narracion.trim()).join("\n"), voz, estilo) } : {}),
    velocidad: marca.velocidad,
    tono: marca.tono,
    escenas,
    ...(respaldo ? { respaldo } : {}),
  };
  await t.escribir("voz.json", resultado);

  // captions.json global, desplazado según el inicio de cada escena en el video
  const inicios = iniciosEscenas(escenas.map((e) => duracionEscenaFrames(e.duracionMs)));
  const globales: Caption[] = escenas.flatMap((e, i) => desplazar(e.captions, ((inicios[i] ?? 0) / FPS) * 1000));
  await t.escribir("captions.json", globales);

  // audio completo (voz sola), con el mismo espaciado que en el video
  const lista = t.ruta("audio", "lista.txt");
  // el concat de ffmpeg pide el mismo formato en todos: silencio en wav para Gemini/Kokoro, mp3 para edge
  const enWav = escenas[0]?.archivo.endsWith(".wav") ?? false;
  const silencio = t.ruta("audio", enWav ? "silencio.wav" : "silencio.mp3");
  const gapMs = COLCHON_MS - (FRAMES_TRANSICION / FPS) * 1000;
  const codec = enWav ? ["-c:a", "pcm_s16le"] : ["-c:a", "libmp3lame", "-b:a", "48k"];
  await ffmpeg(["-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", (Math.max(0.05, gapMs / 1000)).toFixed(3), ...codec, silencio], signal);
  await writeFile(lista, escenas.flatMap((e) => [`file '${t.ruta(e.archivo).replaceAll("\\", "/").replaceAll("'", "'\\''")}'`, `file '${silencio.replaceAll("\\", "/")}'`]).join("\n"), "utf8");
  await ffmpeg(["-y", "-f", "concat", "-safe", "0", "-i", lista, "-ar", "24000", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "96k", t.ruta("audio", "completo.mp3")], signal);
  await rm(lista, { force: true });
  await rm(silencio, { force: true });
  return resultado;
};
