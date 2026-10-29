import { existsSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { downloadWhisperModel, installWhisperCpp } from "@remotion/install-whisper-cpp";
import { duracionMs, ejecutar } from "./proceso";
import { PYTHON_VENV, RAIZ } from "./rutas";
import { WHISPER_DIR, WHISPER_MODELO, WHISPER_VERSION } from "./whisper";

/**
 * Instalación de las piezas locales: entorno de Python (.venv), whisper.cpp y, opcional, Kokoro.
 * La usan `npm run setup` y el botón "Instalar" de Configuración.
 */
export type Registro = (linea: string) => void;

const enWindows = process.platform === "win32";
/** Versiones fijas: lo que se probó en este proyecto. */
/** opencv: detectar caras en los crudos para que los subtítulos no las tapen. */
const PAQUETES_BASE = ["edge-tts==7.3.1", "opencv-python-headless==4.14.0.94", "faster-whisper==1.2.1"];
const PAQUETES_KOKORO = ["kokoro-onnx==0.4.7", "soundfile==0.13.1"];

export const DIR_KOKORO = path.join(RAIZ, ".cache", "kokoro");
const MODELOS_KOKORO = ["kokoro-v1.0.onnx", "voices-v1.0.bin"];
const URL_MODELOS_KOKORO = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0";

/** Primer Python ≥ 3.10 que haya en la compu. */
const buscarPython = async (): Promise<string[]> => {
  const candidatos = enWindows ? [["py", "-3"], ["python"]] : [["python3"], ["python"]];
  for (const [bin, ...args] of candidatos) {
    try {
      const v = (await ejecutar(bin!, [...args, "-c", "import sys; print('%d.%d' % sys.version_info[:2])"])).trim();
      const [mayor = 0, menor = 0] = v.split(".").map(Number);
      if (mayor === 3 && menor >= 10) return [bin!, ...args];
    } catch {
      // probar el siguiente
    }
  }
  throw new Error("No encontré Python 3.10 o más nuevo. Instalalo desde https://www.python.org/downloads/ y volvé a correr `npm run setup`.");
};

const pip = (paquetes: string[]) => ejecutar(PYTHON_VENV, ["-m", "pip", "install", "--disable-pip-version-check", "-q", ...paquetes]);

export const instalarVenv = async (log: Registro) => {
  if (!existsSync(PYTHON_VENV)) {
    const [bin, ...args] = await buscarPython();
    log("Creando el entorno de Python (.venv)…");
    await ejecutar(bin!, [...args, "-m", "venv", path.join(RAIZ, ".venv")]);
  }
  log(`Instalando ${PAQUETES_BASE.join(", ")} en .venv…`);
  await pip(PAQUETES_BASE);
};

export const instalarWhisper = async (log: Registro) => {
  log(`whisper.cpp ${WHISPER_VERSION} (subtítulos de respaldo)…`);
  await installWhisperCpp({ to: WHISPER_DIR, version: WHISPER_VERSION, printOutput: false });
  const { alreadyExisted } = await downloadWhisperModel({ model: WHISPER_MODELO, folder: WHISPER_DIR, printOutput: false });
  log(alreadyExisted ? `Modelo ${WHISPER_MODELO} de whisper: ya estaba.` : `Modelo ${WHISPER_MODELO} de whisper descargado.`);
};

const descargar = async (url: string, destino: string, log: Registro) => {
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok || !r.body) throw new Error(`No pude descargar ${url} (HTTP ${r.status}).`);
  const total = Number(r.headers.get("content-length")) || 0;
  const partes: Uint8Array[] = [];
  let bajado = 0;
  let ultimo = 0;
  for await (const trozo of r.body as unknown as AsyncIterable<Uint8Array>) {
    partes.push(trozo);
    bajado += trozo.length;
    if (total && bajado / total - ultimo >= 0.25) {
      ultimo = bajado / total;
      log(`  ${path.basename(destino)}: ${Math.round(ultimo * 100)} %`);
    }
  }
  // se escribe aparte y se renombra: un corte a mitad de descarga no deja un modelo roto
  await writeFile(`${destino}.part`, Buffer.concat(partes));
  await rename(`${destino}.part`, destino);
};

/** Instala Kokoro en .venv, baja sus modelos (~350 MB) y prueba una frase. Devuelve el WAV de prueba. */
export const instalarKokoro = async (log: Registro): Promise<string> => {
  if (!existsSync(PYTHON_VENV)) await instalarVenv(log);
  log(`Instalando ${PAQUETES_KOKORO.join(", ")} en .venv (trae onnxruntime y espeak-ng, puede tardar)…`);
  await pip(PAQUETES_KOKORO);
  await mkdir(DIR_KOKORO, { recursive: true });
  for (const archivo of MODELOS_KOKORO) {
    const destino = path.join(DIR_KOKORO, archivo);
    if (existsSync(destino)) continue;
    log(`Bajando ${archivo}…`);
    await descargar(`${URL_MODELOS_KOKORO}/${archivo}`, destino, log);
  }
  log("Probando una frase con Kokoro…");
  const prueba = path.join(DIR_KOKORO, "prueba.wav");
  await rm(prueba, { force: true });
  await ejecutar(PYTHON_VENV, [path.join(RAIZ, "src", "pipeline", "tts", "kokoro_tts.py")], {
    stdin: JSON.stringify({ texto: "Hola, soy Kokoro: la voz que funciona sin internet.", voz: "em_alex", velocidad: "+0%", salida: prueba }),
  });
  const ms = await duracionMs(prueba);
  if (ms < 500) throw new Error("Kokoro generó un audio vacío.");
  log(`Kokoro funciona: ${(ms / 1000).toFixed(1)} s de prueba en ${path.relative(RAIZ, prueba)}`);
  kokoroCache = null;
  return prueba;
};

// la comprobación importa onnxruntime (tarda ~1 s): se guarda un rato
let kokoroCache: { ok: boolean; hasta: number } | null = null;

/** Kokoro está listo si están sus modelos y el .venv importa kokoro_onnx y soundfile. */
export const kokoroInstalado = async (): Promise<boolean> => {
  if (kokoroCache && kokoroCache.hasta > Date.now()) return kokoroCache.ok;
  let ok = existsSync(PYTHON_VENV) && MODELOS_KOKORO.every((a) => existsSync(path.join(DIR_KOKORO, a)));
  if (ok) ok = await ejecutar(PYTHON_VENV, ["-c", "import kokoro_onnx, soundfile"]).then(() => true, () => false);
  kokoroCache = { ok, hasta: Date.now() + 60_000 };
  return ok;
};
