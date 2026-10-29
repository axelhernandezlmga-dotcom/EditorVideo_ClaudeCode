---
name: crear-perfil-de-marca
description: Crea un perfil NUEVO del editor (colores, tipografía, logos, subtítulos, narrador ilustrado y reglas de marca) a partir de una carpeta con la identidad gráfica de una marca (logos, paleta, fuentes, manual, referencias). Usala cuando el usuario pegue el prompt «Personalizar mi perfil con Claude Code», pida crear un perfil desde su identidad de marca o escriba /crear-perfil-de-marca <carpeta>.
---

# Crear un perfil desde una carpeta de identidad de marca

El resultado es un perfil nuevo en `config/perfiles/<slug>.json` con su kit en `config/perfiles/<slug>/kit/`, que se
elige en la app (Crear, Subir crudo y Perfiles) y controla: paleta, tipografía, logo y marca de agua, cierre
«Seguir», estilo de subtítulos, apertura y transiciones de marca, colores de gráficos y la paleta de las escenas
ilustradas (incluido el narrador dibujado). Nada de esto es privado del proyecto: queda solo en la compu del usuario
(git ignora `config/perfiles/*` salvo el predeterminado).

**Reglas que no se negocian**
- Nunca sobrescribas un perfil existente ni toques otro perfil, `config/perfiles/predeterminado.json` ni la marca de
  la app. `npm run perfil -- crear` ya elige un slug libre (agrega -2, -3…).
- La carpeta del usuario es SOLO LECTURA: no muevas, renombres ni borres nada ahí. Si hace falta renombrar archivos para
  que la app los reconozca, trabajá sobre una copia en `.cache/marca-<slug>/`.
- Fidelidad: usá los colores, logos y tipografías que vienen en la carpeta. No inventes una estética genérica cuando
  hay referencias. Solo completá lo que falte, y siempre coherente con lo que hay.

## 1. Inspeccionar la carpeta
1. Listá todo (`find <carpeta> -type f | head -300`) y mirá con Read los logos (SVG/PNG), las imágenes de referencia,
   fondos, patrones e íconos. Si hay un manual en PDF, leelo (Read con `pages`).
2. Anotá: variantes del logo (principal, negativo/sobre oscuro, monocromo, horizontal, sobre el color de acento),
   símbolo o isotipo, avatares o fotos de perfil, colores exactos (hex) y su función (fondo, texto, acento, secundario),
   tipografías (archivos .ttf/.otf/.woff2 y su licencia), íconos (grosor y estilo), recursos gráficos (separadores,
   marcadores, patrones), estilo de las composiciones (sobrio o enérgico, papel o tinta, bordes, sombras) y cualquier
   regla de uso (área de respeto, qué logo va en qué fondo, mayúsculas, etc.).
3. Si los colores no están escritos en ningún lado, sacalos de los SVG (atributos `fill`/`stroke`) o de las imágenes
   (`ffmpeg -i img.png -vf "scale=1:1" -f rawvideo -pix_fmt rgb24 - | xxd -p` da el promedio; mejor muestrear zonas).

## 2. Dejar la carpeta en el formato que reconoce la app
La importación (`src/pipeline/kit.ts → detectarKit`) reconoce por el NOMBRE del archivo. Si los nombres no sirven,
copiá a `.cache/marca-<slug>/` con estos nombres (svg y png del mismo recurso con el mismo nombre base):
- Logos: `logo-principal`, `logo-negativo` (para fondos oscuros), `logo-monocromo`, `logo-horizontal`,
  `logo-sobre_rojo` (sobre el color de acento), `logo-fondo_blanco`.
- Símbolo: `simbolo-principal`, `simbolo-negativo`… Avatares: `perfil-<algo>.png` (el primero con PNG va de foto).
- Colores: `colores.json` = `[{"nombre": "acento", "hex": "#E63946"}, {"nombre": "tinta", "hex": "#1D1D1B"}, {"nombre": "papel", "hex": "#F4F1EA"}, …]`
  (nombres que ayudan al rol: acento/rojo, tinta/texto/negro, papel/fondo2, blanco/fondo, gris/secundario).
- Fuentes: los .ttf/.otf/.woff2 tal cual (una con "Mono" en el nombre se usa para fechas y fuentes) + su licencia.
- Íconos: dentro de una carpeta `iconos/` (SVG). Recursos: `punto`, `separador`, `marcador`, `destacado`, `patron`.
- Manual: el PDF (si hay). Resumen visual: `resumen.png` (si hay).

## 3. Crear el perfil
```bash
npm run perfil -- crear --carpeta <carpeta o .cache/marca-slug> --nombre "Nombre visible" --usuario @usuario
```
Esto crea el perfil, copia e importa el kit, lee el manual con Claude (si hay PDF) para las reglas, pone la paleta de
la marca en el perfil y el primer avatar como foto. Anotá el slug que imprime.

## 4. Ajustar lo que el kit no dice (editando `config/perfiles/<slug>.json`)
- `tipografia`: la más parecida a la de la marca entre Montserrat, Anton, Poppins, Bebas Neue y Oswald (se usa donde
  no llega el kit; con kit, los títulos usan la fuente propia).
- `subtitulos.estilo` (`contorno`, `caja`, `resaltado`, `sombra`) y `tamano` según el estilo de la marca (una marca
  sobria: `sombra` o `caja`; una enérgica: `resaltado`). `colores.subtitulos` = el fondo de la caja.
- `narrador` (el personaje dibujado de las escenas situacionales): ropa con los colores de la marca, ej.
  `{"colorTorso": "#1D1D1B", "colorInterior": "#F4F1EA", "corbata": "#E63946"}` (también acepta tokens: `acento`, `texto`).
- `intensidadPorDefecto` (`sobria`, `dinamica`, `explosiva`), `moodsMusica` (ánimos permitidos), `lineaEditorial`
  (`hechos_contexto_opinion` si la marca separa hechos de opinión) y `verificado` (solo si la cuenta lo está).
- Si el manual tiene reglas que el kit no capturó, sumalas a `config/perfiles/<slug>/kit/marca.md` (el guionista
  las lee) sin borrar lo que hay.
Validá:
```bash
npx tsx -e "import { PerfilSchema } from './src/shared/perfiles.ts'; import { readFileSync } from 'node:fs'; console.log(PerfilSchema.parse(JSON.parse(readFileSync('config/perfiles/<slug>.json','utf8'))).slug)"
```

## 5. Verificar que se ve como la marca
1. `npm run marca -- --hoja <slug>` renderiza `out/marca/hoja-<slug>.mp4` y una tira de fotogramas: miralos (Read de
   la tira PNG) y compará con los logos y referencias. Revisá: logo correcto en cada fondo, colores exactos,
   tipografía, contraste de subtítulos, gráficos con la paleta de la marca y escenas ilustradas con sus colores.
2. Si algo no coincide, corregí el perfil o el kit (en la copia del proyecto) y volvé a renderizar.
3. Contale al usuario: el slug, qué se tomó de la carpeta, qué completaste vos y por qué, y que lo elija en
   Crear → «Se firma con el perfil» o en Subir crudo → «Perfil». Los cuatro modos de edición usan este perfil.
