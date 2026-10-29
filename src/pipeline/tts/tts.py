"""Puente entre Node y edge-tts.

Uso:
  python tts.py sintetizar  < {"texto", "voz", "velocidad", "tono", "salida", "sin_tiempos"?}
  python tts.py voces       (lista voces en español)

Escribe el MP3 en `salida` e imprime por stdout un JSON con los tiempos por palabra (en ms).
"""
import asyncio
import inspect
import json
import sys

import edge_tts

HNS_POR_MS = 10_000  # edge-tts da offset/duration en unidades de 100 ns


async def sintetizar(p: dict) -> dict:
    kwargs = dict(rate=p.get("velocidad", "+0%"), pitch=p.get("tono", "+0Hz"))
    # Las versiones nuevas mandan SentenceBoundary por defecto: pedimos palabras explícitamente.
    soporta_boundary = "boundary" in inspect.signature(edge_tts.Communicate.__init__).parameters
    if soporta_boundary:
        kwargs["boundary"] = "WordBoundary"
    com = edge_tts.Communicate(p["texto"], p["voz"], **kwargs)
    palabras = []
    with open(p["salida"], "wb") as f:
        async for chunk in com.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary" and not p.get("sin_tiempos"):
                palabras.append(
                    {
                        "texto": chunk["text"],
                        "inicioMs": chunk["offset"] / HNS_POR_MS,
                        "duracionMs": chunk["duration"] / HNS_POR_MS,
                    }
                )
    return {"palabras": palabras, "soportaBoundary": soporta_boundary, "version": edge_tts.__version__ if hasattr(edge_tts, "__version__") else None}


async def voces() -> dict:
    todas = await edge_tts.list_voices()
    es = [
        {"id": v["ShortName"], "genero": v["Gender"], "locale": v["Locale"]}
        for v in todas
        if v["Locale"].startswith("es-")
    ]
    return {"voces": es}


def main() -> None:
    modo = sys.argv[1] if len(sys.argv) > 1 else "sintetizar"
    try:
        if modo == "voces":
            res = asyncio.run(voces())
        else:
            res = asyncio.run(sintetizar(json.loads(sys.stdin.read())))
        sys.stdout.write(json.dumps(res, ensure_ascii=False))
    except Exception as e:  # noqa: BLE001 - devolvemos el error a Node
        sys.stderr.write(f"{type(e).__name__}: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
