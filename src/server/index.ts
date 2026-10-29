import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import open from "open";
import { cola } from "../pipeline/cola";
import { limpiarSubidasViejas } from "../pipeline/crudo/subida";
import { leerMarca } from "../pipeline/config";
import { DIR_MUSICA } from "../pipeline/musica";
import { DIR_JOBS, RAIZ } from "../pipeline/rutas";
import { registrarApi } from "./api";
import { iniciarHttps, ipsLocales, PUERTO_HTTPS_POR_DEFECTO } from "./https";

const DIR_WEB = path.join(RAIZ, "web");
const DIST = path.join(DIR_WEB, "dist");

const ultimoCambio = async (dir: string): Promise<number> => {
  if (!existsSync(dir)) return 0;
  let max = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    max = Math.max(max, e.isDirectory() ? await ultimoCambio(p) : (await stat(p)).mtimeMs);
  }
  return max;
};

/** Compila la interfaz con Vite si no está compilada o si cambió el código desde la última vez. */
const prepararWeb = async () => {
  const indice = path.join(DIST, "index.html");
  const compilada = existsSync(indice) ? (await stat(indice)).mtimeMs : 0;
  const fuentes = Math.max(
    ...(await Promise.all([path.join(DIR_WEB, "src"), path.join(RAIZ, "src", "remotion"), path.join(RAIZ, "src", "shared")].map(ultimoCambio))),
    (await stat(path.join(DIR_WEB, "index.html"))).mtimeMs,
  );
  if (compilada >= fuentes) return;
  console.log("Preparando la interfaz (solo la primera vez o después de cambios)…");
  const { build } = await import("vite");
  await build({ configFile: path.join(RAIZ, "vite.config.ts"), logLevel: "warn" });
};

const main = async () => {
  const args = process.argv.slice(2);
  const marca = await leerMarca();
  await prepararWeb();

  const app = Fastify({ logger: { level: "warn" }, bodyLimit: 10 * 1024 * 1024 }); // 10 MB: se pueden pegar textos largos
  await registrarApi(app);
  // archivos de cada trabajo (video, portada…); fastify-static soporta Range, que el reproductor necesita
  await app.register(fastifyStatic, { root: DIR_JOBS, prefix: "/jobs/", decorateReply: false, index: false });
  // pistas de la biblioteca de música (para escucharlas en la revisión)
  if (existsSync(DIR_MUSICA)) await app.register(fastifyStatic, { root: DIR_MUSICA, prefix: "/musica/", decorateReply: false, index: false });
  await app.register(fastifyStatic, { root: DIST, prefix: "/", wildcard: true });

  const host = marca.redLocal ? "0.0.0.0" : "127.0.0.1";
  const puerto = Number(process.env.FABRICA_PUERTO) || marca.puerto;
  try {
    await app.listen({ port: puerto, host });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EADDRINUSE") {
      console.error(`✗ El puerto ${puerto} está ocupado. ¿Ya tenés la app abierta en otra terminal? Si no, cambiá "puerto" en config/marca.json.`);
      process.exit(1);
    }
    throw e;
  }

  const url = `http://localhost:${puerto}`;
  console.log(`\n  Fábrica de Videos lista en ${url}`);
  if (marca.redLocal) {
    for (const ip of ipsLocales()) console.log(`  Desde el celular (misma Wi-Fi): http://${ip}:${puerto}`);
    // https para poder grabar con el micrófono del celular (los navegadores no lo dejan por http)
    const https = await iniciarHttps(puerto, host, ipsLocales(), Number(process.env.FABRICA_PUERTO_HTTPS) || PUERTO_HTTPS_POR_DEFECTO);
    if (https.activo) for (const ip of ipsLocales()) console.log(`  Para grabar desde el celular (https): https://${ip}:${https.puerto}`);
    else console.log(`  (Sin https para el celular: ${https.motivo}. Desde el celular igual podés subir notas de voz.)`);
  } else console.log('  (Para entrar desde el celular, activá "Acceso desde el celular" en Configuración y reiniciá.)');
  console.log("  Para cerrar: Ctrl+C\n");

  await limpiarSubidasViejas();
  const recuperados = await cola.recuperar();
  if (recuperados.length) console.log(`  Retomando ${recuperados.length} trabajo(s) que habían quedado en la cola.`);
  if (args.includes("--abrir")) await open(url).catch(() => undefined);
};

main().catch((e: Error) => {
  console.error(`✗ No se pudo iniciar la app: ${e.message}`);
  process.exit(1);
});
