"""Transcribe muchos clips cortos con faster-whisper cargando el modelo una sola vez (para la Biblioteca).

Uso: python transcribir_lote.py <modelo> <hilos> <lista.json>
lista.json = [{"id": "...", "wav": "ruta a un WAV de 16 kHz mono"}]

Imprime una línea JSON por clip, apenas lo termina:
  {"id": "...", "texto": "lo que se dice", "idioma": "es", "prob_idioma": 0.97}
  {"id": "...", "error": "..."}
El idioma se detecta solo (los memes vienen en español de varios países y en inglés); con VAD para no
inventar palabras en la música o el silencio.
"""

import json
import sys

from transcribir import bajar, leer_wav


def main() -> None:
    modelo, hilos, lista = sys.argv[1], int(sys.argv[2]), sys.argv[3]
    from faster_whisper import WhisperModel

    m = WhisperModel(bajar(modelo), device="cpu", compute_type="int8", cpu_threads=hilos)
    with open(lista, encoding="utf-8") as f:
        clips = json.load(f)
    for c in clips:
        try:
            segmentos, info = m.transcribe(leer_wav(c["wav"]), beam_size=5, vad_filter=True, condition_on_previous_text=False)
            texto = " ".join(s.text.strip() for s in segmentos if s.no_speech_prob < 0.6).strip()
            print(json.dumps({"id": c["id"], "texto": texto, "idioma": info.language, "prob_idioma": round(info.language_probability, 2)}, ensure_ascii=False), flush=True)
        except Exception as e:  # un clip roto no frena el lote
            print(json.dumps({"id": c["id"], "error": str(e)[:200]}), flush=True)


if __name__ == "__main__":
    main()
