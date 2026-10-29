import { existsSync, readdirSync, statSync } from "node:fs";
import { mkdir, readFile, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { downloadWhisperModel, toCaptions, transcribe } from "@remotion/install-whisper-cpp";
import type { PalabraCrudo, Transcripcion } from "../../shared/cortes";
import type { Marca } from "../../shared/schemas";
import { infoModelo, MB_PREGUNTAR_DESCARGA, textoMb, unirPalabrasFw, type IdModeloTranscripcion } from "../../shared/transcripcion";
import { ejecutar } from "../proceso";
import { PYTHON_VENV, RAIZ } from "../rutas";
import { unirSubpalabras, WHISPER_DIR, WHISPER_VERSION } from "../whisper";
import type { Trabajo } from "../trabajo";
import { envolvente, umbralVoz } from "./audio";

/**
 * Prompt inicial: whisper "limpia" lo que transcribe y tiende a omitir las muletillas. Si el contexto ya las
 * trae escritas, las conserva. Español rioplatense para que acierte el voseo.
 */
export const PROMPT_MULETILLAS = "Eh... mmm, este, o sea, bueno, eh, viste, ¿no? Mirá, eh, te cuento.";

/** Siglas y nombres que whisper escribe mal si no los conoce ("INAW" en vez de INAU). */
export const PROMPT_NOMBRES = "INAU, BPS, UTE, Antel, ANCAP, OSE, MIDES, ASSE, AFAP, Frente Amplio, Partido Nacional, Partido Colorado, Intendencia de Montevideo.";

/**
 * Ajusta los tiempos de cada palabra con la energía real del audio (whisper suele estirar las palabras sobre
 * el silencio) y agrega como "[...]" los sonidos de voz donde no escribió nada.
 */
export const ajustarConEnergia = (palabras: PalabraCrudo[], db: Float32Array, pasoMs: number, umbral: number): PalabraCrudo[] => {
  const voz = (ms: number) => (db[Math.floor(ms / pasoMs)] ?? -100) >= umbral;
  const bloques = (a: number, b: number) => {
    const out: number[] = [];
    for (let ms = Math.max(0, a); ms < b; ms += pasoMs) out.push(ms);
    return out;
  };
  const ajustadas = palabras.map((p) => ({ ...p }));
  for (let i = 0; i < ajustadas.length; i++) {
    const p = ajustadas[i]!;
    const prevFin = i > 0 ? ajustadas[i - 1]!.finMs : 0;
    const sigInicio = palabras[i + 1]?.inicioMs ?? p.finMs + 400;
    // 1) recortar el silencio que whisper metió adentro de la palabra (solo si sobra más de 120 ms)
    const conVoz = bloques(p.inicioMs, p.finMs).filter(voz);
    if (conVoz.length) {
      const primero = conVoz[0]!;
      const ultimo = conVoz.at(-1)! + pasoMs;
      if (primero - p.inicioMs > 120) p.inicioMs = primero;
      if (p.finMs - ultimo > 120) p.finMs = ultimo;
    }
    // 2) estirar hasta donde de verdad empieza y termina la voz (las colas de las palabras son suaves)
    let ini = p.inicioMs;
    while (ini - pasoMs >= Math.max(prevFin, p.inicioMs - 150) && voz(ini - pasoMs)) ini -= pasoMs;
    let fin = p.finMs;
    while (fin + pasoMs <= Math.min(sigInicio, p.finMs + 200) && voz(fin)) fin += pasoMs;
    p.inicioMs = Math.max(prevFin, ini);
    p.finMs = Math.max(p.inicioMs + pasoMs, Math.min(sigInicio, fin));
  }
  // 3) sonidos de voz entre palabras sin transcribir (150 ms a 1,2 s): casi siempre "eh" o "mmm"
  const out: PalabraCrudo[] = [];
  const total = db.length * pasoMs;
  for (let i = 0; i <= ajustadas.length; i++) {
    const desde = i === 0 ? 0 : ajustadas[i - 1]!.finMs + 60;
    const hasta = i === ajustadas.length ? total : ajustadas[i]!.inicioMs - 60;
    let inicioRun: number | null = null;
    for (let ms = desde; ms <= hasta; ms += pasoMs) {
      const v = ms < hasta && voz(ms);
      if (v && inicioRun === null) inicioRun = ms;
      if (!v && inicioRun !== null) {
        const d = ms - inicioRun;
        if (d >= 150 && d <= 1200) out.push({ texto: "[...]", inicioMs: inicioRun, finMs: ms, prob: null, sinTranscribir: true });
        inicioRun = null;
      }
    }
    if (i < ajustadas.length) out.push(ajustadas[i]!);
  }
  return out;
};

/**
 * Saca las marcas que whisper inventa entre corchetes o paréntesis ("[MÚSICA]", "(risas)", "[MÚSICA DE FUNDO]"):
 * no son palabras dichas. Pueden venir partidas en varias palabras.
 */
export const sinMarcas = <T extends { texto: string }>(palabras: T[]): T[] => {
  const out: T[] = [];
  let cierre: string | null = null;
  for (const p of palabras) {
    const t = p.texto.trim();
    if (cierre) {
      if (t.endsWith(cierre)) cierre = null;
      continue;
    }
    const apertura = t[0];
    if (apertura === "[" || apertura === "(") {
      const fin = apertura === "[" ? "]" : ")";
      if (!t.endsWith(fin)) cierre = fin;
      continue;
    }
    out.push(p);
  }
  return out;
};

/**
 * Frases que whisper "escucha" en el silencio o el ruido (vienen de los subtítulos con los que se entrenó):
 * "Subtítulos por la comunidad de Amara.org", "¡Gracias por ver!"… Nadie las dice en un video de verdad.
 */
const ALUCINACIONES = [
  "subtitulos por la comunidad de amaraorg",
  "subtitulos realizados por la comunidad de amaraorg",
  "subtitulado por la comunidad de amaraorg",
  "subtitulos en espanol de amaraorg",
  "gracias por ver el video",
  "gracias por ver",
  "suscribete al canal",
  "no olvides suscribirte",
  "subtitulos por",
].map((f) => f.split(" "));

const normalizarAlucinacion = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "");

/** Saca las alucinaciones típicas de whisper (frases enteras, palabra por palabra). */
export const sinAlucinaciones = <T extends { texto: string }>(palabras: T[]): T[] => {
  const w = palabras.map((p) => normalizarAlucinacion(p.texto));
  const quitar = new Set<number>();
  for (let i = 0; i < w.length; i++) {
    for (const frase of ALUCINACIONES) {
      // "amara.org" puede venir junto ("amaraorg") o partido en "amara" + "org"
      let k = i;
      let ok = true;
      for (const parte of frase) {
        if (w[k] === parte) k++;
        else if (parte === "amaraorg" && w[k] === "amara" && w[k + 1] === "org") k += 2;
        else {
          ok = false;
          break;
        }
      }
      // "gracias por ver" / "subtitulos por" solo si es lo último que se dice (si no, puede ser real)
      const alFinal = k >= w.length || frase.some((p) => p === "amaraorg");
      if (ok && (alFinal || frase.length >= 4)) for (let j = i; j < k; j++) quitar.add(j);
    }
  }
  return palabras.filter((_, i) => !quitar.has(i));
};

type ModeloCpp = "base" | "small" | "medium";
const rutaModelo = (modelo: ModeloCpp) => path.join(WHISPER_DIR, `ggml-${modelo}.bin`);

/** Tamaño exacto de cada modelo de whisper.cpp (el mismo que verifica @remotion/install-whisper-cpp). */
const TAMANOS_MODELO: Record<ModeloCpp, number> = { base: 147951465, small: 487601967, medium: 1533763059 };

/** ¿Está el modelo de whisper.cpp completo? Un archivo a medias (descarga cortada) cuenta como que no está. */
export const modeloCompleto = (modelo: ModeloCpp) => existsSync(rutaModelo(modelo)) && statSync(rutaModelo(modelo)).size === TAMANOS_MODELO[modelo];

/** El crudo queda en pausa hasta que apruebes bajar un modelo grande (puede gastar datos del celular). */
export class FaltaPermisoDescarga extends Error {
  constructor(
    readonly modelo: IdModeloTranscripcion,
    readonly mb: number,
  ) {
    super(`Para transcribir hace falta bajar el modelo "${modelo}" (${textoMb(mb)}). Si estás con los datos del celular, conviene esperar al Wi-Fi. Aprobalo en la Cola o elegí un modelo más chico.`);
  }
}

/** Caché de Hugging Face, donde faster-whisper guarda sus modelos. */
const cacheHf = () => process.env.HF_HUB_CACHE ?? path.join(process.env.HF_HOME ?? path.join(os.homedir(), ".cache", "huggingface"), "hub");

/** ¿Ya está bajado el modelo de faster-whisper? Hugging Face recién lo enlaza en snapshots/ cuando terminó. */
export const modeloFwBajado = (modelo: IdModeloTranscripcion) => {
  const snaps = path.join(cacheHf(), `models--Systran--faster-whisper-${modelo}`, "snapshots");
  try {
    return readdirSync(snaps).some((s) => existsSync(path.join(snaps, s, "model.bin")));
  } catch {
    return false;
  }
};

let fwInstalado: Promise<boolean> | null = null;
/** ¿Está faster-whisper en el .venv? (lo instala `npm run setup`). */
export const fasterWhisperInstalado = () =>
  (fwInstalado ??= existsSync(PYTHON_VENV) ? ejecutar(PYTHON_VENV, ["-c", "import faster_whisper"]).then(() => true, () => false) : Promise.resolve(false));

/** ¿Está bajado el modelo para el motor que se va a usar? */
export const modeloBajado = async (modelo: IdModeloTranscripcion, motor: Marca["crudo"]["motorTranscripcion"]) =>
  motor === "faster-whisper" && (await fasterWhisperInstalado()) ? modeloFwBajado(modelo) : modeloCompleto(modelo === "large-v3" ? "medium" : modelo);

/** Si el modelo no está y pesa más de 500 MB, frena hasta que lo apruebes (una sola vez por modelo). */
const pedirPermiso = async (t: Trabajo, marca: Marca, modelo: IdModeloTranscripcion, mb: number) => {
  if (mb <= MB_PREGUNTAR_DESCARGA || marca.crudo.modelosAprobados.includes(modelo)) return;
  await t.actualizar((e) => {
    e.descargaPendiente = { modelo, mb };
  });
  throw new FaltaPermisoDescarga(modelo, mb);
};

/** Avisa la descarga en pantalla siempre y en el log cada 10 %. */
const avisoDescarga = (t: Trabajo, modelo: string, totalMb: number) => {
  let decena = -1;
  return (bajadoMb: number) => {
    const pct = Math.min(100, Math.floor((bajadoMb / totalMb) * 100));
    t.actividad(`Bajando el modelo "${modelo}"… ${Math.round(bajadoMb)} de ${Math.round(totalMb)} MB (${pct} %)`);
    t.progreso("transcripcion", pct / 100);
    if (Math.floor(pct / 10) > decena) {
      decena = Math.floor(pct / 10);
      void t.log(`Bajando el modelo "${modelo}" de whisper: ${Math.round(bajadoMb)} de ${Math.round(totalMb)} MB.`);
    }
  };
};

/** "~40 s" o "~2 min". */
const restante = (s: number | null) => (s === null ? "" : s < 60 ? ` · faltan ~${Math.max(1, Math.round(s))} s` : ` · faltan ~${Math.round(s / 60)} min`);

/** Avisa el % de la transcripción en pantalla siempre y en el log cada 25 %. */
const avisoProgreso = (t: Trabajo) => {
  let cuarto = 0;
  return (fraccion: number, segundosRestantes: number | null) => {
    const pct = Math.floor(fraccion * 100);
    t.actividad(`Transcribiendo palabra por palabra… ${pct} %${restante(segundosRestantes)}`);
    t.progreso("transcripcion", fraccion);
    if (Math.floor(pct / 25) > cuarto && pct < 100) {
      cuarto = Math.floor(pct / 25);
      void t.log(`Transcripción: ${pct} %${restante(segundosRestantes)}.`);
    }
  };
};

/**
 * Baja el modelo de whisper.cpp a una carpeta aparte y lo mueve recién cuando está completo: la librería escribe
 * directo al nombre final y, si se corta, deja un archivo a medias que después no vuelve a bajar.
 */
const asegurarModeloCpp = async (t: Trabajo, modelo: ModeloCpp, signal?: AbortSignal) => {
  if (modeloCompleto(modelo)) return;
  const tmp = path.join(WHISPER_DIR, ".descarga");
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  const avisar = avisoDescarga(t, modelo, TAMANOS_MODELO[modelo] / 1e6);
  await downloadWhisperModel({ model: modelo, folder: tmp, printOutput: false, signal, onProgress: (bajado) => avisar(bajado / 1e6) });
  const bajado = path.join(tmp, `ggml-${modelo}.bin`);
  if (!existsSync(bajado) || statSync(bajado).size !== TAMANOS_MODELO[modelo]) throw new Error(`La descarga del modelo "${modelo}" de whisper quedó incompleta. Revisá la conexión y reanudá el trabajo.`);
  await rename(bajado, rutaModelo(modelo));
  await rm(tmp, { recursive: true, force: true });
  await t.log(`Modelo "${modelo}" de whisper descargado.`);
};

/** whisper.cpp (respaldo): más lento, sin large-v3. */
const transcribirCpp = async (t: Trabajo, marca: Marca, modelo: ModeloCpp, audio: string, signal?: AbortSignal) => {
  if (!existsSync(path.join(WHISPER_DIR, "main")) && !existsSync(path.join(WHISPER_DIR, "main.exe"))) {
    throw new Error("whisper.cpp no está instalado. Corré `npm run setup`.");
  }
  if (!modeloCompleto(modelo)) await pedirPermiso(t, marca, modelo, TAMANOS_MODELO[modelo] / 1e6);
  await asegurarModeloCpp(t, modelo, signal);
  const avisar = avisoProgreso(t);
  const inicio = Date.now();
  const salida = await transcribe({
    inputPath: audio,
    whisperPath: WHISPER_DIR,
    whisperCppVersion: WHISPER_VERSION,
    model: modelo,
    tokenLevelTimestamps: true,
    language: "es",
    printOutput: false,
    splitOnWord: true,
    signal,
    additionalArgs: [["--prompt", `${PROMPT_MULETILLAS} ${PROMPT_NOMBRES}`], ["--threads", String(marca.crudo.hilosTranscripcion)]],
    onProgress: (p) => {
      const pasado = (Date.now() - inicio) / 1000;
      avisar(p, p > 0.02 ? (pasado / p) * (1 - p) : null);
    },
  });
  return unirSubpalabras(toCaptions({ whisperCppOutput: salida }).captions);
};

/** faster-whisper (principal): corre transcribir.py en el .venv y va leyendo su progreso. */
const transcribirFw = async (t: Trabajo, marca: Marca, modelo: IdModeloTranscripcion, audio: string, signal?: AbortSignal) => {
  const { mb } = infoModelo(modelo);
  const bajado = modeloFwBajado(modelo);
  if (!bajado) await pedirPermiso(t, marca, modelo, mb);
  const descarga = avisoDescarga(t, modelo, mb);
  const progreso = avisoProgreso(t);
  const salida = t.ruta("audio", "transcripcion-fw.json");
  await ejecutar(
    PYTHON_VENV,
    [path.join(RAIZ, "src", "pipeline", "crudo", "transcribir.py"), audio, modelo, String(marca.crudo.hilosTranscripcion), `${PROMPT_MULETILLAS} ${PROMPT_NOMBRES}`, salida],
    {
      signal,
      onStdoutLinea: (l) => {
        try {
          const e = JSON.parse(l) as { tipo: string; bajado?: number; fraccion?: number; restante?: number | null };
          if (e.tipo === "descarga") descarga((e.bajado ?? 0) / 1e6);
          else if (e.tipo === "progreso") progreso(e.fraccion ?? 0, e.restante ?? null);
        } catch {
          // línea que no es JSON (aviso de una librería): se ignora
        }
      },
    },
  );
  if (!bajado) await t.log(`Modelo "${modelo}" de faster-whisper descargado.`);
  const r = JSON.parse(await readFile(salida, "utf8")) as { palabras: { t: string; i: number; f: number; p: number | null }[]; segundos: number };
  await rm(salida, { force: true });
  return { palabras: unirPalabrasFw(r.palabras), segundos: r.segundos };
};

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** Paso "transcripcion": palabra por palabra sobre el audio limpio, sin borrar muletillas. */
export const pasoTranscripcion = async (t: Trabajo, marca: Marca, duracionMs: number, signal?: AbortSignal): Promise<Transcripcion> => {
  const estado = await t.estado();
  const modelo = estado.opciones.modeloWhisper ?? marca.crudo.modeloWhisper;
  if (estado.descargaPendiente) {
    await t.actualizar((e) => {
      e.descargaPendiente = undefined;
    });
  }
  const audio = t.ruta("audio", "limpio16k.wav");
  const usarFw = marca.crudo.motorTranscripcion === "faster-whisper" && (await fasterWhisperInstalado());
  if (marca.crudo.motorTranscripcion === "faster-whisper" && !usarFw) await t.log("faster-whisper no está instalado (corré `npm run setup`): uso whisper.cpp, que es más lento.");
  const inicio = Date.now();
  let motor: string;
  let palabrasMotor: { texto: string; inicioMs: number; finMs: number; prob: number | null }[];
  if (usarFw) {
    motor = "faster-whisper";
    palabrasMotor = (await transcribirFw(t, marca, modelo, audio, signal)).palabras;
  } else {
    motor = "whisper.cpp";
    palabrasMotor = await transcribirCpp(t, marca, modelo === "large-v3" ? "medium" : modelo, audio, signal);
  }
  const segundos = (Date.now() - inicio) / 1000;
  const crudas: PalabraCrudo[] = sinAlucinaciones(sinMarcas(palabrasMotor)).map((p) => ({ ...p, sinTranscribir: false }));
  const { db, pasoMs } = await envolvente(audio);
  const palabras = ajustarConEnergia(crudas, db, pasoMs, umbralVoz(db));
  const tr: Transcripcion = { modelo: `${motor}:${modelo}`, duracionMs, palabras };
  await t.escribir("transcripcion.json", tr);
  const sin = palabras.filter((p) => p.sinTranscribir).length;
  await t.log(
    `Transcripción (${motor} ${modelo}, ${mmss(segundos)} para ${mmss(duracionMs / 1000)} de audio): ${palabras.length - sin} palabras${sin ? ` y ${sin} sonido(s) sin palabra` : ""}.`,
  );
  return tr;
};
