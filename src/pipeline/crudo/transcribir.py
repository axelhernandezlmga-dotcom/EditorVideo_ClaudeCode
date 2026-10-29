"""Transcribe un WAV de 16 kHz mono con faster-whisper (int8), palabra por palabra.

Uso: python transcribir.py <wav> <modelo> <hilos> <prompt> <salida.json>
     python transcribir.py --bajar <modelo>

Va imprimiendo una línea JSON por evento:
  {"tipo": "descarga", "bajado": bytes}
  {"tipo": "progreso", "fraccion": 0.23, "restante": 40.1}
y al final escribe en <salida.json>: {"palabras": [{"t", "i", "f", "p"}], "duracion", "segundos"}.
El audio se lee con `wave` (no con PyAV: la versión 19 rompe el decodificador de faster-whisper).
"""

import json
import os
import sys
import threading
import time
import wave

REPO = "Systran/faster-whisper-{}"
ARCHIVOS = ["config.json", "model.bin", "tokenizer.json", "vocabulary.*", "preprocessor_config.json"]


def emitir(**datos) -> None:
    print(json.dumps(datos), flush=True)


def tamano_carpeta(ruta: str) -> int:
    total = 0
    for raiz, _, archivos in os.walk(ruta):
        for a in archivos:
            try:
                total += os.path.getsize(os.path.join(raiz, a))
            except OSError:
                pass
    return total


def bajar(modelo: str) -> str:
    """Baja el modelo al caché de Hugging Face (si ya está, no baja nada) informando los bytes bajados."""
    from huggingface_hub import constants, snapshot_download

    repo = REPO.format(modelo)
    try:
        return snapshot_download(repo, allow_patterns=ARCHIVOS, local_files_only=True)
    except Exception:
        pass
    carpeta = os.path.join(constants.HF_HUB_CACHE, "models--" + repo.replace("/", "--"))
    inicial = tamano_carpeta(carpeta) if os.path.isdir(carpeta) else 0
    listo = threading.Event()

    def informar() -> None:
        while not listo.wait(1.0):
            if os.path.isdir(carpeta):
                emitir(tipo="descarga", bajado=tamano_carpeta(carpeta) - inicial)

    hilo = threading.Thread(target=informar, daemon=True)
    hilo.start()
    try:
        return snapshot_download(repo, allow_patterns=ARCHIVOS)
    finally:
        listo.set()
        hilo.join()


def leer_wav(ruta: str):
    import numpy as np

    with wave.open(ruta) as w:
        if w.getframerate() != 16000 or w.getnchannels() != 1 or w.getsampwidth() != 2:
            raise SystemExit("El audio tiene que ser WAV de 16 kHz, mono, 16 bits.")
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768


def main() -> None:
    if sys.argv[1] == "--bajar":
        bajar(sys.argv[2])
        return
    wav, modelo, hilos, prompt, salida = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4], sys.argv[5]
    from faster_whisper import WhisperModel

    ruta = bajar(modelo)
    inicio = time.time()
    m = WhisperModel(ruta, device="cpu", compute_type="int8", cpu_threads=hilos)
    audio = leer_wav(wav)
    duracion = len(audio) / 16000
    segmentos, _ = m.transcribe(audio, language="es", word_timestamps=True, beam_size=5, initial_prompt=prompt or None, vad_filter=False)
    palabras = []
    for s in segmentos:
        palabras.extend({"t": w.word, "i": w.start, "f": w.end, "p": w.probability} for w in s.words or [])
        fraccion = min(1.0, s.end / max(duracion, 0.1))
        pasado = time.time() - inicio
        emitir(tipo="progreso", fraccion=fraccion, restante=pasado / fraccion * (1 - fraccion) if fraccion > 0.02 else None)
    with open(salida, "w", encoding="utf-8") as f:
        json.dump({"palabras": palabras, "duracion": duracion, "segundos": time.time() - inicio}, f, ensure_ascii=False)


if __name__ == "__main__":
    main()
