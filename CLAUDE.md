# Fábrica de Videos — guía para Claude Code

Editor de video vertical con IA: una idea (o un video grabado) entra y sale un reel con guion, voz, animaciones,
subtítulos, imágenes reales, música y efectos. Interfaz web local en español rioplatense.

## Cómo se corre
- `npm start` — app en http://localhost:3000 (compila la interfaz si cambió). `npm run dev` recarga el servidor.
- `npm test` (vitest) y `npm run typecheck` antes de dar algo por terminado.
- `npm run setup` instala/verifica lo que falta (ffmpeg, Python, whisper); `npm run claves` pide las API keys.
- `npm run biblioteca`, `npm run perfil`, `npm run marca`, `npm run video`, `npm run crudo`: el uso está al principio de cada `src/cli/*.ts`.
- Para probar sin tocar los datos reales: `FABRICA_PUERTO=3077 FABRICA_ENV=<tmp>/.env FABRICA_BIBLIOTECA=<tmp> FABRICA_PERFILES=<tmp> FABRICA_JOBS=<tmp>`.
  Una app nueva retoma los trabajos "trabajando" de `jobs/`: no la levantes mientras corre otro trabajo.

## Mapa
- `src/server/` Fastify (API + estáticos). `web/src/` React (Vite), íconos de `lucide-react`, sin emojis.
- `src/pipeline/` motor: `pasos/` (animados: guion → revisión → voz → visuales → render → entrega), `crudo/`
  (videos grabados: limpieza, transcripción, cortes, material, sfx, render), `biblioteca.ts`, `credenciales.ts`,
  `perfiles.ts`, `kit.ts` (kit de marca), `musica.ts`, `tts/`, `ilustracion/`.
- `src/remotion/` composiciones y plantillas (`plantillas/registry.tsx`), ilustración SVG propia (`ilustracion/`),
  piezas de marca (`marca/`). `src/shared/` esquemas zod compartidos (`schemas.ts`, `modos.ts`, `biblioteca.ts`…).
- `prompts/` instrucciones de Claude: `guionista.md`, `material.md`, `tonos/` (solo `academico.md`), `modos/`.
- Claude se llama con `claude -p` y salida estructurada (`src/pipeline/claude.ts`): usa la sesión de Claude Code.

## Modos de edición
`normal`, `graficos`, `situacional`, `imagenes` (`src/shared/modos.ts`). Cambian las instrucciones
(`prompts/modos/<id>.md` y `<id>.crudo.md`), las plantillas permitidas, la cantidad de ilustración y la densidad de
material. Un modo nuevo necesita: entrada en `MODOS_EDICION`, sus dos prompts y, si hace falta, reglas en `faltaDelModo`.

## Datos: qué es público y qué es privado
- Públicos (en git): código, prompts, `config/perfiles/predeterminado.json`, `assets/` (música CC0, ilustración).
- Privados (git los ignora; nunca los agregues): `config/marca.json`, `config/perfiles/*` (salvo el predeterminado),
  `.env`, `data/`, `jobs/`, `out/`, `biblioteca/*` (clips de terceros), `pruebas-voz/`.
- Nunca imprimas ni loguees una API key: se guardan en `.env` y la app muestra los últimos 4 caracteres.

## Skills de este proyecto (`.claude/skills/`)
- `/crear-perfil-de-marca <carpeta>`: perfil nuevo desde una carpeta de identidad visual.
- `/capturar-noticias`: captura con tu Chrome las noticias que quedaron pendientes (necesita `claude --chrome`).
- Plugin de Remotion (recomendado): `.claude/settings.json` lo propone al abrir el proyecto.

## Convenciones
- Textos de la interfaz y comentarios en español rioplatense (voseo), cortos y concretos.
- Validá todo lo que entra con zod; los errores para el usuario van en español.
- Imágenes de personas o hechos reales: siempre reales y verificadas (`elegirImagenReal`), nunca generadas ni stock.
- Nunca más de 0,5 s sin movimiento en un video (`npm run movimiento` lo mide).
