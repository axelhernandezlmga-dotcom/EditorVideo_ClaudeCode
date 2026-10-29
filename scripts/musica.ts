/**
 * npm run musica [-- <carpeta con zips>]   (por defecto ~/Descargas o ~/Downloads)
 *
 * Arma la biblioteca de música de fondo a partir de los .zip de música:
 *  1. descomprime cada zip en una carpeta temporal aparte, SOLO audio y textos de licencia (no ejecuta nada);
 *  2. analiza cada pista (duración, silencio al inicio, BPM, energía, tonalidad, brillo);
 *  3. descarta las que no sirven para un reel y clasifica el resto por mood;
 *  4. se queda con las mejores de cada mood, las normaliza a -14 LUFS (como la voz) y las copia a
 *     assets/musica/<mood>/, con assets/musica/catalogo.json y las licencias en assets/musica/licencias/.
 * Los zips no se tocan.
 */
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { clasificarMood, motivoDescarte, POR_MOOD, puntajeFondo, slugPista, type AnalisisPista, type Pista } from "../src/shared/musica";
import { MOODS, type Mood } from "../src/shared/opcionesCrudo";
import { ejecutar } from "../src/pipeline/proceso";
import { DIR_ASSETS, PYTHON_VENV, RAIZ } from "../src/pipeline/rutas";

const AUDIO = /\.(ogg|mp3|wav|m4a|flac)$/i;
const TEXTO = /\.(txt|pdf|md)$/i;
const DIR_MUSICA = path.join(DIR_ASSETS, "musica");

const carpetaZips = () => {
  const pedida = process.argv.slice(2).find((a) => !a.startsWith("-"));
  if (pedida) return path.resolve(pedida);
  for (const d of ["Descargas", "Downloads"]) if (existsSync(path.join(os.homedir(), d))) return path.join(os.homedir(), d);
  throw new Error("No encontré ~/Descargas ni ~/Downloads: pasá la carpeta con los zips.");
};

/** Archivos dentro de un zip (unzip -Z1), sin extraer nada. */
const listarZip = async (zip: string) => (await ejecutar("unzip", ["-Z1", zip])).split("\n").map((l) => l.trim()).filter(Boolean);

/** Recorre una carpeta y devuelve los archivos que cumplen `re`. */
const buscar = async (dir: string, re: RegExp): Promise<string[]> => {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await buscar(p, re)));
    else if (e.isFile() && re.test(e.name)) out.push(p);
  }
  return out;
};

/** Loudness integrada en LUFS (ebur128). */
const lufs = async (archivo: string) => {
  const out = await ejecutar("ffmpeg", ["-hide_banner", "-nostats", "-i", archivo, "-af", "ebur128=framelog=quiet", "-f", "null", "-"], { devolverStderr: true });
  return Number(/Integrated loudness:\s*I:\s*(-?[\d.]+)/.exec(out)?.[1] ?? NaN);
};

const main = async () => {
  const carpeta = carpetaZips();
  const zips = (await readdir(carpeta)).filter((n) => /\.zip$/i.test(n)).map((n) => path.join(carpeta, n));
  if (!zips.length) throw new Error(`No hay .zip en ${carpeta}.`);
  const tmp = await mkdtemp(path.join(os.tmpdir(), "fabrica-musica-"));
  try {
    const analizadas: (AnalisisPista & { zip: string; licencia: string })[] = [];
    const licencias = new Map<string, string>();
    for (const zip of zips) {
      const nombreZip = path.basename(zip, ".zip");
      const contenido = await listarZip(zip).catch(() => [] as string[]);
      const audios = contenido.filter((f) => AUDIO.test(f));
      if (!audios.length) {
        console.log(`· ${nombreZip}: sin audio (se ignora)`);
        continue;
      }
      // cada zip en su propia carpeta y solo audio + textos: nada que se pueda ejecutar
      const destino = path.join(tmp, nombreZip);
      await mkdir(destino);
      const patrones = ["*.ogg", "*.OGG", "*.mp3", "*.MP3", "*.wav", "*.WAV", "*.m4a", "*.flac", "*.txt", "*.pdf", "*.md"];
      await ejecutar("unzip", ["-q", "-o", zip, ...patrones, "-d", destino]).catch(() => "");
      const textos = await buscar(destino, TEXTO);
      const licencia = textos.find((t) => /licen[cs]e/i.test(path.basename(t)));
      const textoLicencia = licencia ? (await readFile(licencia, "utf8")).trim() : "";
      licencias.set(nombreZip, textoLicencia);
      const tipo = /CC-?0|Public Domain/i.test(textoLicencia) ? "CC0 (dominio público)" : textoLicencia ? "ver licencias/" : "sin licencia en el zip";
      const archivos = await buscar(destino, AUDIO);
      console.log(`· ${nombreZip}: ${archivos.length} pistas · licencia: ${tipo}`);
      for (let i = 0; i < archivos.length; i += 8) {
        const out = await ejecutar(PYTHON_VENV, ["-I", path.join(RAIZ, "scripts", "analizar_musica.py"), ...archivos.slice(i, i + 8)]);
        for (const l of out.trim().split("\n")) {
          const a = JSON.parse(l) as AnalisisPista & { error?: string };
          if (!a.error) analizadas.push({ ...a, zip: nombreZip, licencia: tipo });
        }
      }
    }

    // descartes por calidad, después mood y las mejores de cada uno
    const descartes: { archivo: string; zip: string; motivo: string }[] = [];
    const porMood = new Map<Mood, typeof analizadas>();
    for (const a of analizadas) {
      const motivo = motivoDescarte(a);
      if (motivo) descartes.push({ archivo: path.basename(a.archivo), zip: a.zip, motivo });
      else {
        const m = clasificarMood(a, a.zip);
        porMood.set(m, [...(porMood.get(m) ?? []), a]);
      }
    }
    const elegidas: (typeof analizadas[number] & { mood: Mood })[] = [];
    for (const { id: mood } of MOODS) {
      const candidatas = (porMood.get(mood) ?? []).sort((a, b) => puntajeFondo(b) - puntajeFondo(a));
      const porZip = new Map<string, number>();
      for (const c of candidatas) {
        // el troubadeck son 54 variaciones del mismo arreglo: pocas de ahí; del resto, variedad de zips
        // (el chiptune es justamente el que suena a "cómica": ahí puede llenar el mood)
        const tope = /troubadeck/i.test(c.zip) ? 1 : mood === "comica" && /chiptune/i.test(c.zip) ? POR_MOOD : 3;
        const usadas = porZip.get(c.zip) ?? 0;
        if (elegidas.filter((e) => e.mood === mood).length >= POR_MOOD) descartes.push({ archivo: path.basename(c.archivo), zip: c.zip, motivo: `sobraba: ya había ${POR_MOOD} mejores de "${mood}"` });
        else if (usadas >= tope) descartes.push({ archivo: path.basename(c.archivo), zip: c.zip, motivo: `muy parecida a otras ${/troubadeck/i.test(c.zip) ? "del troubadeck (mismo arreglo)" : `del mismo zip para "${mood}"`}` });
        else {
          elegidas.push({ ...c, mood });
          porZip.set(c.zip, usadas + 1);
        }
      }
    }

    // copiar normalizadas a -14 LUFS (el volumen final lo pone el video) y armar el catálogo
    const energias = elegidas.map((e) => e.energiaDb);
    const [emin, emax] = [Math.min(...energias), Math.max(...energias)];
    await rm(DIR_MUSICA, { recursive: true, force: true });
    await mkdir(path.join(DIR_MUSICA, "licencias"), { recursive: true });
    const pistas: Pista[] = [];
    for (const e of elegidas) {
      const nombre = `${slugPista(e.zip.replace(/^music-loop-bundle-/, "abstraction-"))}-${slugPista(path.basename(e.archivo))}.ogg`;
      const rel = `${e.mood}/${nombre}`;
      await mkdir(path.join(DIR_MUSICA, e.mood), { recursive: true });
      const ganancia = -14 - (await lufs(e.archivo));
      await ejecutar("ffmpeg", ["-v", "error", "-y", "-i", e.archivo, "-af", `volume=${ganancia.toFixed(2)}dB,alimiter=limit=0.89:level=false`, "-c:a", "libvorbis", "-q:a", "5", path.join(DIR_MUSICA, rel)]);
      pistas.push({
        archivo: rel,
        mood: e.mood,
        bpm: e.bpm,
        energia: Math.round(((e.energiaDb - emin) / Math.max(1, emax - emin)) * 100) / 100,
        duracion: e.duracion,
        tonalidad: e.tonalidad,
        zip: `${e.zip}.zip`,
        original: path.basename(e.archivo),
        licencia: e.licencia,
        autor: "Abstraction (abstractionmusic.com)",
      });
      process.stdout.write(".");
    }
    for (const [zip, texto] of licencias) if (texto) await writeFile(path.join(DIR_MUSICA, "licencias", `${zip}.txt`), `${texto}\n`);
    await writeFile(path.join(DIR_MUSICA, "catalogo.json"), `${JSON.stringify({ pistas }, null, 2)}\n`);
    await writeFile(path.join(DIR_MUSICA, "descartes.json"), `${JSON.stringify(descartes, null, 2)}\n`);
    await copyFile(path.join(RAIZ, "scripts", "LEEME-musica.md"), path.join(DIR_MUSICA, "LEEME.md")).catch(() => undefined);

    console.log(`\n\nAnalizadas: ${analizadas.length} · elegidas: ${pistas.length} · descartadas: ${descartes.length}`);
    for (const { id, nombre } of MOODS) console.log(`  ${nombre.padEnd(13)} ${pistas.filter((p) => p.mood === id).length}`);
    const motivos = new Map<string, number>();
    for (const d of descartes) {
      const clave = d.motivo.replace(/"[^"]+"/, "<mood>").replace(/\d+(\.\d+)? s de/, "N s de");
      motivos.set(clave, (motivos.get(clave) ?? 0) + 1);
    }
    console.log("\nDescartes por motivo:");
    for (const [m, n] of [...motivos].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)} · ${m}`);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
};

main().catch((e: Error) => {
  console.error(`✗ ${e.message}`);
  process.exit(1);
});
