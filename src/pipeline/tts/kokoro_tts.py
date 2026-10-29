"""Voz offline con Kokoro (kokoro-onnx, Apache 2.0). Opcional: se instala con `npm run setup -- --kokoro`.

stdin: {"texto", "voz", "velocidad", "salida"}  →  escribe un WAV en `salida`.
"""
import json
import os
import sys

import soundfile as sf
from kokoro_onnx import Kokoro

DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", ".cache", "kokoro")


def main() -> None:
    import espeakng_loader

    # espeak-ng no acepta rutas de datos de 160 caracteres o más (falla con "Error processing file …/phontab")
    if len(espeakng_loader.get_data_path()) >= 160:
        raise RuntimeError("la carpeta del proyecto tiene una ruta demasiado larga para espeak-ng: movela a una carpeta más corta")
    p = json.loads(sys.stdin.read())
    vel = 1.0 + int(p.get("velocidad", "+0%").rstrip("%")) / 100
    k = Kokoro(os.path.join(DIR, "kokoro-v1.0.onnx"), os.path.join(DIR, "voices-v1.0.bin"))
    muestras, sr = k.create(p["texto"], voice=p.get("voz", "em_alex"), speed=vel, lang="es")
    sf.write(p["salida"], muestras, sr)
    sys.stdout.write("{}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        sys.stderr.write(f"{type(e).__name__}: {e}")
        sys.exit(1)
