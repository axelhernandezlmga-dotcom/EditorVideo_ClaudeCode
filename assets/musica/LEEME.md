# Música de fondo incluida

64 pistas del "Music Loop Bundle" de Abstraction, de dominio público (CC0: se pueden
redistribuir y usar sin atribución; ver `licencias/`). Se rearma con `npm run musica` a partir
de los .zip de música que tengas en Descargas (no los borra). Tu propia música se importa
desde la app, en Biblioteca → Música. Cada carpeta es un mood: feliz, triste, epica, tension, misterio,
motivacional, chill, comica.

- `catalogo.json`: cada pista con su mood, BPM, energía, duración, zip de origen y licencia.
- `descartes.json`: las que no entraron y por qué.
- `licencias/`: el texto de licencia de cada zip.

Las pistas están normalizadas a -14 LUFS (como la voz); el volumen final
(~8 %, con ducking cuando se habla) lo pone cada video.
