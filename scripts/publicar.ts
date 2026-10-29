/**
 * Publica una versión en el repositorio público, sin datos privados.
 *
 *   npm run publicar -- --destino ~/Proyectos/EditorVideo_ClaudeCode --mensaje "qué cambió"   prepara el commit (no sube)
 *   npm run publicar -- --mensaje "qué cambió" --subir                                       además lo sube (y la etiqueta vX.Y.Z)
 *
 * Pasos: (1) este repo sin cambios sin commitear; (2) typecheck y tests; (3) exporta SOLO lo que está en git
 * (`git archive HEAD`: nunca perfiles, .env, data/, jobs/, biblioteca/…); (4) audita la exportación: rutas privadas,
 * claves de tu .env, datos de tus perfiles personales y medios de terceros; si algo aparece, no publica nada;
 * (5) sincroniza el repo público (trae lo último con fast-forward, borra lo que ya no existe, copia lo nuevo);
 * (6) commit con autor Accelerandes (solo para ese commit: tu configuración de git no se toca) y sin coautores;
 * (7) con --subir: push normal (nunca force) y verifica que GitHub tenga el commit. La ruta del destino se recuerda
 * en data/publicacion.json (privado).
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { RAIZ } from "../src/pipeline/rutas";

const AUTOR = "Accelerandes";
const ARCHIVO_CONFIG = path.join(RAIZ, "data", "publicacion.json");

const c = { verde: (s: string) => `\x1b[32m${s}\x1b[0m`, rojo: (s: string) => `\x1b[31m${s}\x1b[0m`, gris: (s: string) => `\x1b[90m${s}\x1b[0m` };
const paso = (s: string) => console.log(c.gris(`· ${s}`));
const git = (cwd: string, args: string[], opts: { entrada?: Buffer } = {}) => execFileSync("git", args, { cwd, input: opts.entrada, maxBuffer: 1 << 30 }).toString().trim();
const fallar = (motivo: string): never => {
  console.error(c.rojo(`✗ No publiqué nada: ${motivo}`));
  process.exit(1);
};

const args = process.argv.slice(2);
const flag = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? (args[i + 1] && !args[i + 1]!.startsWith("--") ? args[i + 1]! : true) : undefined;
};
const expandir = (p: string) => path.resolve(p.replace(/^~(?=$|\/)/, os.homedir()));

// ---------- qué nunca puede salir ----------

/** Rutas que no pueden estar en la exportación (además de lo que .gitignore ya deja afuera). */
export const PROHIBIDO = [
  /^config\/marca\.json$/,
  /^config\/perfiles\/(?!predeterminado\.json$).+/,
  /^\.env(?!\.example$)/,
  /^data\//,
  /^jobs\/(?!\.gitkeep$).+/,
  /^out\//,
  /^biblioteca\/(?!LEEME\.md$).+/,
  /^pruebas-voz\//,
  /^\.claude\/settings\.local\.json$/,
  /\.local\./,
  /^\.cache\//,
  /^node_modules\//,
];
const EXT_VIDEO = /\.(mp4|mov|m4v|webm|mkv|avi)$/i;
const EXT_AUDIO = /\.(mp3|m4a|wav|ogg|oga|flac|aac|opus)$/i;
const PATRONES_SECRETOS = [/AIza[0-9A-Za-z_-]{30,}/, /sk-[A-Za-z0-9_-]{20,}/, /ghp_[A-Za-z0-9]{30,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /xox[bp]-[A-Za-z0-9-]{20,}/];

const listar = (dir: string, base = dir): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listar(p, base) : [path.relative(base, p).split(path.sep).join("/")];
  });

/** Lo que se busca en los textos exportados: claves del .env y datos de tus perfiles personales. */
const datosPrivados = () => {
  const out: { que: string; valor: string }[] = [];
  const env = path.join(RAIZ, ".env");
  if (existsSync(env)) {
    for (const l of readFileSync(env, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*['"]?(.+?)['"]?\s*$/.exec(l);
      if (m && m[2]!.length >= 8) out.push({ que: `la clave ${m[1]}`, valor: m[2]! });
    }
  }
  const dirPerfiles = path.join(RAIZ, "config", "perfiles");
  if (existsSync(dirPerfiles)) {
    for (const f of readdirSync(dirPerfiles).filter((x) => x.endsWith(".json") && x !== "predeterminado.json")) {
      try {
        const p = JSON.parse(readFileSync(path.join(dirPerfiles, f), "utf8")) as { usuario?: string; nombre?: string; slug?: string };
        for (const v of [p.usuario, p.nombre, p.slug]) if (v && v.length >= 6) out.push({ que: `tu perfil personal «${f}»`, valor: v });
      } catch {
        // perfil roto: no se puede leer, no hay nada que buscar
      }
    }
  }
  return out;
};

/** Revisa la exportación. Devuelve los problemas encontrados (vacío = se puede publicar). */
export const auditar = (dir: string): string[] => {
  const problemas: string[] = [];
  const archivos = listar(dir);
  for (const f of archivos) if (PROHIBIDO.some((re) => re.test(f))) problemas.push(`${f} es privado`);
  // medios: solo la música incluida (con licencia libre en su catálogo) y los efectos generados
  const catalogo = existsSync(path.join(dir, "assets", "musica", "catalogo.json")) ? (JSON.parse(readFileSync(path.join(dir, "assets", "musica", "catalogo.json"), "utf8")) as { pistas: { archivo: string; licencia: string }[] }).pistas : [];
  for (const f of archivos) {
    if (EXT_VIDEO.test(f)) problemas.push(`${f}: no se publican videos (pueden tener derechos de terceros)`);
    else if (EXT_AUDIO.test(f)) {
      const pista = f.startsWith("assets/musica/") ? catalogo.find((p) => `assets/musica/${p.archivo}` === f) : null;
      if (!pista) problemas.push(`${f}: audio sin licencia registrada en assets/musica/catalogo.json`);
      else if (!/CC0|public domain|dominio p[uú]blico/i.test(pista.licencia)) problemas.push(`${f}: la licencia «${pista.licencia}» no permite redistribuirlo con seguridad`);
    }
  }
  const privados = datosPrivados();
  for (const f of archivos) {
    const abs = path.join(dir, f);
    if (statSync(abs).size > 5 * 1024 * 1024 || /\.(png|jpe?g|webp|ogg|ico|woff2?|ttf|otf)$/i.test(f)) continue;
    const texto = readFileSync(abs, "utf8");
    for (const re of PATRONES_SECRETOS) if (re.test(texto)) problemas.push(`${f}: parece contener una clave (${re.source.slice(0, 12)}…)`);
    for (const p of privados) if (texto.includes(p.valor)) problemas.push(`${f}: contiene ${p.que}`);
  }
  return problemas;
};

// ---------- publicar ----------

/** Push normal (nunca force) de la rama y la etiqueta, y verificación de que el remoto tiene el commit. */
const subir = (destino: string, rama: string, etiqueta: string) => {
  paso("7. Subiendo (push normal, nunca force)");
  const commit = git(destino, ["rev-parse", "HEAD"]);
  try {
    git(destino, ["push", "--quiet", "origin", rama]);
    if (git(destino, ["tag", "--list", etiqueta]) && !git(destino, ["ls-remote", "--tags", "origin", etiqueta])) git(destino, ["push", "--quiet", "origin", etiqueta]);
  } catch (e) {
    fallar(`no pude subir (${(e as Error).message.split("\n")[0]}). El commit quedó listo en ${destino}.`);
  }
  const remoto = git(destino, ["ls-remote", "origin", `refs/heads/${rama}`]).split(/\s/)[0];
  if (remoto !== commit) fallar(`subí, pero el remoto tiene ${remoto} y no ${commit}.`);
  console.log(c.verde(`✓ Publicado: ${commit} en origin/${rama}.`));
};

const main = () => {
  const guardado = existsSync(ARCHIVO_CONFIG) ? (JSON.parse(readFileSync(ARCHIVO_CONFIG, "utf8")) as { destino?: string }) : {};
  const destino = typeof flag("destino") === "string" ? expandir(flag("destino") as string) : guardado.destino;
  if (!destino) fallar("decime la carpeta del repositorio público con --destino <ruta> (se recuerda para la próxima).");
  if (!existsSync(path.join(destino!, ".git"))) fallar(`${destino} no es un repositorio de git.`);
  mkdirSync(path.dirname(ARCHIVO_CONFIG), { recursive: true });
  writeFileSync(ARCHIVO_CONFIG, `${JSON.stringify({ ...guardado, destino }, null, 2)}\n`);
  const version = (JSON.parse(readFileSync(path.join(RAIZ, "package.json"), "utf8")) as { version: string }).version;
  const mensaje = typeof flag("mensaje") === "string" ? (flag("mensaje") as string) : "actualización";

  paso("1. Repositorio de trabajo sin cambios pendientes");
  if (git(RAIZ, ["status", "--porcelain", "--untracked-files=no"])) fallar("hay cambios sin commitear en este repositorio: commitealos primero (se publica lo que está en el último commit).");

  if (!flag("sin-pruebas")) {
    paso("2. Typecheck y tests");
    try {
      execFileSync("npm", ["run", "-s", "typecheck"], { cwd: RAIZ, stdio: "inherit" });
      execFileSync("npm", ["test", "--silent"], { cwd: RAIZ, stdio: "inherit" });
    } catch {
      fallar("fallaron el typecheck o los tests.");
    }
  }

  paso("3. Exportando solo lo que está en git (último commit)");
  const tmp = mkdtempSync(path.join(os.tmpdir(), "publicar-"));
  try {
    execFileSync("tar", ["-x", "-C", tmp], { input: execFileSync("git", ["archive", "HEAD"], { cwd: RAIZ, maxBuffer: 1 << 30 }) });

    paso("4. Auditando: rutas privadas, claves, datos de tus perfiles y medios de terceros");
    const problemas = auditar(tmp);
    if (problemas.length) fallar(`\n  - ${problemas.slice(0, 30).join("\n  - ")}`);

    paso("5. Sincronizando el repositorio público");
    if (git(destino!, ["status", "--porcelain"])) fallar(`${destino} tiene cambios sin commitear: revisalos antes de publicar.`);
    const rama = git(destino!, ["rev-parse", "--abbrev-ref", "HEAD"]);
    try {
      git(destino!, ["pull", "--ff-only", "--quiet"]);
    } catch {
      fallar("no pude traer lo último del repositorio público con fast-forward (¿alguien subió algo distinto?). No fuerzo nada: resolvelo a mano.");
    }
    const nuevos = new Set(listar(tmp));
    for (const f of git(destino!, ["ls-files"]).split("\n").filter(Boolean)) if (!nuevos.has(f)) rmSync(path.join(destino!, f), { force: true });
    cpSync(tmp, destino!, { recursive: true });
    git(destino!, ["add", "-A"]);
    if (!git(destino!, ["status", "--porcelain"])) {
      // nada nuevo; pero si quedó un commit preparado sin subir, --subir lo sube
      const pendientes = Number(git(destino!, ["rev-list", "--count", `origin/${rama}..HEAD`]));
      if (pendientes && flag("subir")) return subir(destino!, rama, `v${version}`);
      console.log(c.verde(`✓ El repositorio público ya tiene todo${pendientes ? ` (hay ${pendientes} commit(s) sin subir: --subir)` : ""}.`));
      return;
    }
    const resumen = git(destino!, ["diff", "--cached", "--shortstat"]);

    paso("6. Commit como Accelerandes (sin coautores; tu configuración de git no cambia)");
    const correo = git(destino!, ["config", "user.email"]) || git(RAIZ, ["config", "user.email"]);
    const texto = `v${version}: ${mensaje}`;
    if (/co-authored-by/i.test(texto)) fallar("el mensaje no puede incluir coautores.");
    git(destino!, ["-c", `user.name=${AUTOR}`, "-c", `user.email=${correo}`, "commit", "-q", "-F", "-"], { entrada: Buffer.from(`${texto}\n`) });
    const commit = git(destino!, ["rev-parse", "HEAD"]);
    const etiqueta = `v${version}`;
    const etiquetaNueva = !git(destino!, ["tag", "--list", etiqueta]);
    if (etiquetaNueva) git(destino!, ["-c", `user.name=${AUTOR}`, "-c", `user.email=${correo}`, "tag", "-a", etiqueta, "-m", `Versión ${version}`]);
    console.log(c.verde(`✓ Commit ${commit.slice(0, 7)} listo en ${destino} (${resumen})${etiquetaNueva ? `, etiqueta ${etiqueta}` : ""}.`));

    if (!flag("subir")) {
      console.log("  Para subirlo: npm run publicar -- --subir (o git push en esa carpeta).");
      return;
    }
    subir(destino!, rama, etiqueta);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
};

// se puede importar para los tests (auditar) sin publicar nada
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) main();
