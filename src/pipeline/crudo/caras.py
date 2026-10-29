"""Detecta la cara principal en un video, un fotograma por segundo.

Uso: python caras.py <video> [segundos_entre_muestras]
Imprime JSON: {"ancho", "alto", "muestras": [{"t": segundos, "cara": [x, y, w, h] | null}]}
con la caja normalizada (0-1) respecto del fotograma. Se queda con la cara más grande de cada muestra.
"""

import json
import sys

import cv2


def main() -> None:
    ruta = sys.argv[1]
    paso = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0
    video = cv2.VideoCapture(ruta)
    if not video.isOpened():
        raise SystemExit(f"No pude abrir {ruta}")
    fps = video.get(cv2.CAP_PROP_FPS) or 30
    total = int(video.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    ancho = int(video.get(cv2.CAP_PROP_FRAME_WIDTH))
    alto = int(video.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frontal = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    perfil = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_profileface.xml")
    minimo = max(24, int(min(ancho, alto) * 0.08))

    muestras = []
    t = 0.0
    while total == 0 or t * fps < total:
        video.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ok, cuadro = video.read()
        if not ok:
            break
        gris = cv2.equalizeHist(cv2.cvtColor(cuadro, cv2.COLOR_BGR2GRAY))
        caras = list(frontal.detectMultiScale(gris, scaleFactor=1.1, minNeighbors=6, minSize=(minimo, minimo)))
        if not caras:
            caras = list(perfil.detectMultiScale(gris, scaleFactor=1.1, minNeighbors=6, minSize=(minimo, minimo)))
        cara = None
        if caras:
            x, y, w, h = max(caras, key=lambda c: c[2] * c[3])
            cara = [round(x / ancho, 4), round(y / alto, 4), round(w / ancho, 4), round(h / alto, 4)]
        muestras.append({"t": round(t, 2), "cara": cara})
        t += paso

    print(json.dumps({"ancho": ancho, "alto": alto, "muestras": muestras}))


if __name__ == "__main__":
    main()
