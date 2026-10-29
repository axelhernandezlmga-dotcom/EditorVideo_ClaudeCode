# Música de fondo

La arma `npm run musica` a partir de los .zip de música que tengas en Descargas
(no los borra). Cada carpeta es un mood: feliz, triste, epica, tension, misterio,
motivacional, chill, comica.

- `catalogo.json`: cada pista con su mood, BPM, energía, duración, zip de origen y licencia.
- `descartes.json`: las que no entraron y por qué.
- `licencias/`: el texto de licencia de cada zip.

Las pistas están normalizadas a -14 LUFS (como la voz); el volumen final
(~8 %, con ducking cuando se habla) lo pone cada video.
