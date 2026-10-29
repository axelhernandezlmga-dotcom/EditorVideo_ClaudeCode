# Fábrica de Videos — editor de video con IA

De una idea (o de un video que grabaste) a un reel vertical listo para subir: guion investigado, voz, animaciones,
imágenes reales, subtítulos, música y efectos. Funciona en tu compu, con Claude Code y Remotion.

**Autor:** Accelerandes

## Requisitos

- [Node.js](https://nodejs.org) 20 o más nuevo y Git.
- Python 3.10 o más nuevo, `make` y un compilador de C++ (Linux: `build-essential`; Mac: `xcode-select --install`).
- [FFmpeg](https://ffmpeg.org) con `ffprobe` en el PATH.
- [Claude Code](https://claude.com/claude-code) instalado y con tu cuenta iniciada (el editor lo usa para investigar, escribir y elegir material).
- Google Chrome o Chromium (para capturar noticias).

## Instalación

```bash
git clone https://github.com/axelhernandezlmga-dotcom/EditorVideo_ClaudeCode.git
cd EditorVideo_ClaudeCode
npm install
npm run setup
```

`npm run setup` crea el entorno de Python (voz de respaldo y transcripción) y compila whisper.cpp. Para la voz sin
internet (Kokoro): `npm run setup -- --kokoro`.

## Configuración inicial y API keys

Todas son opcionales: sin claves, la app usa la voz gratuita de edge-tts y no busca fotos de stock.

| Variable | Para qué | Dónde se saca |
|---|---|---|
| `GEMINI_API_KEY` | Voz principal (Gemini TTS, plan gratis con cupo diario) | https://aistudio.google.com/apikey |
| `PIXABAY_API_KEY` | Fotos de stock para ideas abstractas | https://pixabay.com/api/docs/ |
| `PEXELS_API_KEY` | Clips de stock | https://www.pexels.com/api/ |

Cargalas desde la app (**Configuración → API Keys**, donde también podés guardar claves de otros servicios) o desde
la terminal con `npm run claves`. Se guardan solo en `.env`, que no se sube a git.

## Iniciar la aplicación

```bash
npm start
```

Se abre http://localhost:3000. La primera vez compila la interfaz (tarda un poco más).

## Claude Code y sus skills

Abrí Claude Code en la carpeta del proyecto (`claude`). Lee `CLAUDE.md` para entender el proyecto y tiene estas
skills propias, incluidas en el repositorio:

- `/crear-perfil-de-marca <carpeta>`: crea un perfil nuevo desde tu identidad visual.
- `/capturar-noticias`: captura con tu Chrome las noticias que la app no pudo (abrí Claude Code con `claude --chrome`).

Plugin de Remotion (recomendado para trabajar en las animaciones): al abrir el proyecto, Claude Code ofrece
instalarlo. Si no, dentro de Claude Code:

```
/plugin marketplace add remotion-dev/claude-code-plugin
/plugin install remotion@remotion
```

## Biblioteca de clips y perfiles

**Biblioteca** (menú superior): creá categorías y subí clips, música y efectos (archivos sueltos o una carpeta
entera). Los archivos se copian a `biblioteca/` y los repetidos se detectan solos. También desde la terminal:

```bash
npm run biblioteca -- importar ~/Videos/mis-clips --categoria "Colorados"
```

Al crear un video elegís **Incluir clips de la biblioteca: Sí / No** y de qué categorías. La biblioteca no se sube a
git: cada persona carga su propio material (los clips de noticieros y memes suelen tener derechos de terceros).

**Perfiles** (Videos animados → Perfiles): cada perfil define el @, colores, tipografía, foto, subtítulos y kit de
marca con que se firma el video. El repositorio trae un perfil predeterminado; los tuyos quedan solo en tu compu.

## Personalizar la identidad gráfica con Claude Code

Juntá en una carpeta los recursos de tu marca (logos, paleta, tipografías, manual, imágenes de referencia), abrí
Claude Code en el proyecto y pegá este prompt:

### Personalizar mi perfil con Claude Code

```text
Quiero crear un perfil nuevo para mis videos a partir de mi identidad de marca.
Carpeta con los recursos: [PEGAR AQUÍ LA RUTA DE MI CARPETA DE IDENTIDAD DE MARCA]

1. Inspeccioná todos los archivos de esa carpeta (logos y sus versiones, colores, tipografías, imágenes de
   referencia, elementos gráficos, íconos, fondos y el manual si hay) y analizá la identidad visual.
2. Leé CLAUDE.md y cómo funcionan los perfiles de este proyecto, y usá la skill crear-perfil-de-marca.
3. Creá un perfil NUEVO, fiel a los recursos originales: mismos colores, logos y tipografías, con coherencia entre
   logo, paleta, tipografía, composiciones, subtítulos, gráficos y las escenas ilustradas de los cuatro modos de
   edición. Si falta información, completala de forma coherente con la marca y contame qué completaste.
4. No sobrescribas ni modifiques perfiles existentes, el perfil predeterminado ni la marca de la aplicación, y no
   toques mi carpeta original.
5. Dejá el perfil guardado localmente, verificá cómo se ve (npm run marca -- --hoja <slug>) y decime cómo elegirlo
   en la aplicación.
```

El perfil queda en `config/perfiles/` y aparece en el selector de perfiles de la app.
