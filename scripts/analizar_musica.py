"""Analiza pistas de música para elegir las que sirven de fondo en reels.

Uso: python analizar_musica.py <archivo> [<archivo>...]
Imprime una línea JSON por pista: duración, silencio al inicio, BPM, energía (dB RMS), dinámica,
tonalidad (mayor/menor y su confianza) y brillo (centroide espectral). Solo numpy + ffmpeg.
"""

import json
import subprocess
import sys

import numpy as np

SR = 22050
# perfiles de tonalidad de Krumhansl-Kessler (mayor y menor)
MAYOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MENOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
NOTAS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def leer(ruta: str) -> np.ndarray:
    crudo = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", ruta, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
        capture_output=True,
        check=True,
    ).stdout
    return np.frombuffer(crudo, dtype=np.float32)


def stft(x: np.ndarray, n: int = 2048, salto: int = 512) -> np.ndarray:
    ventana = np.hanning(n).astype(np.float32)
    cuadros = 1 + max(0, (len(x) - n) // salto)
    idx = np.arange(n)[None, :] + salto * np.arange(cuadros)[:, None]
    return np.abs(np.fft.rfft(x[idx] * ventana, axis=1))


def bpm(espectro: np.ndarray, salto: int = 512) -> float:
    """Tempo por autocorrelación del flujo espectral (onsets), entre 60 y 180 BPM, con preferencia cerca de 115."""
    log = np.log1p(espectro)
    flujo = np.maximum(0, np.diff(log, axis=0)).sum(axis=1)
    flujo = flujo - flujo.mean()
    ac = np.correlate(flujo, flujo, mode="full")[len(flujo) - 1 :]
    fps = SR / salto
    retardos = np.arange(len(ac))
    con_bpm = 60 * fps / np.maximum(retardos, 1)
    validos = (con_bpm >= 60) & (con_bpm <= 180)
    peso = np.exp(-0.5 * (np.log2(con_bpm / 115) / 0.9) ** 2)
    puntaje = np.where(validos, ac * peso, -np.inf)
    return float(con_bpm[int(np.argmax(puntaje))])


def tonalidad(espectro: np.ndarray) -> tuple[str, str, float]:
    frecs = np.fft.rfftfreq(2048, 1 / SR)
    sirve = (frecs > 55) & (frecs < 2000)
    clase = (np.round(12 * np.log2(frecs[sirve] / 261.63)) % 12).astype(int)
    energia = espectro[:, sirve].mean(axis=0)
    croma = np.bincount(clase, weights=energia, minlength=12)
    croma = (croma - croma.mean()) / (croma.std() + 1e-9)
    mejores = []
    for k in range(12):
        for modo, perfil in (("mayor", MAYOR), ("menor", MENOR)):
            p = np.roll(perfil, k)
            mejores.append((float(np.corrcoef(croma, p)[0, 1]), NOTAS[k], modo))
    mejores.sort(reverse=True)
    return mejores[0][1], mejores[0][2], mejores[0][0]


def analizar(ruta: str) -> dict:
    x = leer(ruta)
    dur = len(x) / SR
    # energía cada 50 ms
    bloque = int(SR * 0.05)
    n = len(x) // bloque
    rms = np.sqrt((x[: n * bloque].reshape(n, bloque) ** 2).mean(axis=1) + 1e-12)
    db = 20 * np.log10(rms)
    sonando = np.nonzero(db > -40)[0]
    silencio_inicio = float(sonando[0] * 0.05) if len(sonando) else dur
    activos = db[db > -50]
    espectro = stft(x)
    frecs = np.fft.rfftfreq(2048, 1 / SR)
    centroide = float((espectro * frecs).sum() / (espectro.sum() + 1e-9))
    nota, modo, confianza = tonalidad(espectro)
    # cuánto tarda en llegar a la energía "normal" de la pista (arranque rápido o lento)
    meseta = np.percentile(activos, 50) if len(activos) else -60
    llega = np.nonzero(db >= meseta - 6)[0]
    arranque = float(llega[0] * 0.05) if len(llega) else dur
    return {
        "archivo": ruta,
        "duracion": round(dur, 1),
        "silencioInicio": round(silencio_inicio, 2),
        "arranque": round(arranque, 2),
        "bpm": round(bpm(espectro), 1),
        "energiaDb": round(float(np.mean(activos)) if len(activos) else -60.0, 1),
        "dinamicaDb": round(float(np.percentile(activos, 95) - np.percentile(activos, 10)) if len(activos) else 0.0, 1),
        "tonalidad": f"{nota} {modo}",
        "modo": modo,
        "confianzaModo": round(confianza, 2),
        "brillo": round(centroide),
    }


if __name__ == "__main__":
    for ruta in sys.argv[1:]:
        try:
            print(json.dumps(analizar(ruta), ensure_ascii=False), flush=True)
        except Exception as e:  # una pista rota no frena el resto
            print(json.dumps({"archivo": ruta, "error": str(e)}, ensure_ascii=False), flush=True)
