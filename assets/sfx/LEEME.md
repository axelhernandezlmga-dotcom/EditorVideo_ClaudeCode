# Efectos de sonido

## Los que vienen (sintetizados)
La app genera sola estos efectos la primera vez que los necesita, **por código** (`src/pipeline/sfx.ts`): no son
grabaciones de nadie, así que no tienen derechos de terceros y se pueden usar en cualquier video.

| Archivo                     | Se usa en                                   |
|-----------------------------|---------------------------------------------|
| `whoosh-sintetizado.wav`    | al entrar cada captura de noticia o foto    |
| `pop-sintetizado.wav`       | al aparecer un dato o gráfico               |
| `golpe-sintetizado.wav`     | en las palabras de énfasis                  |
| `ding-sintetizado.wav`      | en las cifras                               |
| `riser-sintetizado.wav`     | antes del remate (termina justo en él)      |

## Usar los tuyos
Poné en esta carpeta un archivo `.wav`, `.mp3`, `.ogg` o `.m4a` cuyo nombre contenga la palabra del efecto y la app
lo usa en vez del sintetizado: `whoosh` (o `swoosh`), `pop` (o `click`), `golpe` (o `hit`, `impact`), `ding` (o
`bell`, `campana`), `riser` (o `build`). El volumen se ajusta en `config/marca.json` → `crudo.volumenSfx`.

Fuentes con licencia clara para bajar efectos:
- **Pixabay Sound Effects** (https://pixabay.com/sound-effects/): Licencia de contenido de Pixabay, uso comercial
  sin atribución obligatoria.
- **Freesound** (https://freesound.org/): filtrá por licencia **Creative Commons 0** (dominio público). Evitá los
  "Attribution NonCommercial" si el video es para una cuenta con fines comerciales.
- **Mixkit** (https://mixkit.co/free-sound-effects/): Mixkit Sound Effects Free License, uso en videos sin atribución.

Guardá el enlace de dónde bajaste cada uno: si alguna vez te reclaman, es tu prueba de la licencia.
