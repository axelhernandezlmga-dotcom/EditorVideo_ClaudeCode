import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import tls from "node:tls";
import { ejecutar } from "../pipeline/proceso";
import { RAIZ } from "../pipeline/rutas";

/**
 * HTTPS para la red local: los navegadores solo dejan usar el micrófono en https (o en localhost), así que
 * desde el celular por http://192.168.x.x la grabación no anda. Con mkcert se crea una autoridad local (una
 * sola vez: el celular la acepta una vez) y un certificado para las IPs de ahora, que se rehace solo si
 * cambia la IP (Wi-Fi de casa, hotspot del iPhone…). El https es un túnel TLS delante del servidor http.
 */

// FABRICA_DIR_HTTPS: otra carpeta para los certificados (pruebas)
const DIR = process.env.FABRICA_DIR_HTTPS ?? path.join(RAIZ, "data", "https");

/** IPs de la red local (para entrar desde el celular). */
export const ipsLocales = () =>
  Object.values(os.networkInterfaces())
    .flat()
    .filter((i): i is os.NetworkInterfaceInfo => Boolean(i && i.family === "IPv4" && !i.internal))
    .map((i) => i.address);
export const PUERTO_HTTPS_POR_DEFECTO = 3443;

export type EstadoHttps = { activo: boolean; puerto: number | null; mkcert: boolean; ca: string | null; motivo?: string };
let estado: EstadoHttps = { activo: false, puerto: null, mkcert: false, ca: null, motivo: "No arrancó" };
export const estadoHttps = () => estado;

const mkcert = async (args: string[]) => ejecutar("mkcert", args);

/** Archivo de la autoridad local para instalar en el celular (rootCA.pem de mkcert). */
export const archivoCA = async (): Promise<string | null> => {
  try {
    const dir = (await mkcert(["-CAROOT"])).trim();
    const ca = path.join(dir, "rootCA.pem");
    return existsSync(ca) ? ca : null;
  } catch {
    return null;
  }
};

/** Certificado para localhost + las IPs de la red (se reutiliza si las IPs no cambiaron). */
const certificado = async (ips: string[]) => {
  await mkdir(DIR, { recursive: true });
  const nombres = ["localhost", "127.0.0.1", ...ips].sort();
  const cert = path.join(DIR, "cert.pem");
  const clave = path.join(DIR, "clave.pem");
  const registro = path.join(DIR, "nombres.txt");
  const previos = existsSync(registro) ? (await readFile(registro, "utf8")).trim() : "";
  if (previos !== nombres.join(" ") || !existsSync(cert) || !existsSync(clave)) {
    await mkcert(["-cert-file", cert, "-key-file", clave, ...nombres]);
    await writeFile(registro, nombres.join(" "), "utf8");
  }
  return { cert: await readFile(cert), key: await readFile(clave) };
};

/** Abre el túnel https → http (mismo host). Si mkcert no está, queda apagado con el motivo. */
export const iniciarHttps = async (puertoHttp: number, host: string, ips: string[], puerto = PUERTO_HTTPS_POR_DEFECTO): Promise<EstadoHttps> => {
  try {
    await mkcert(["-version"]);
  } catch {
    estado = { activo: false, puerto: null, mkcert: false, ca: null, motivo: "Falta mkcert (sudo pacman -S mkcert)" };
    return estado;
  }
  try {
    const { cert, key } = await certificado(ips);
    const servidor = tls.createServer({ cert, key }, (seguro) => {
      const plano = net.connect(puertoHttp, "127.0.0.1");
      seguro.pipe(plano).pipe(seguro);
      const cerrar = () => {
        seguro.destroy();
        plano.destroy();
      };
      seguro.on("error", cerrar);
      plano.on("error", cerrar);
    });
    // las conexiones que no completan el TLS (ej. un navegador que todavía no confía) no rompen nada
    servidor.on("tlsClientError", () => undefined);
    await new Promise<void>((ok, mal) => {
      servidor.once("error", mal);
      servidor.listen(puerto, host, () => ok());
    });
    estado = { activo: true, puerto, mkcert: true, ca: await archivoCA() };
  } catch (e) {
    estado = { activo: false, puerto: null, mkcert: true, ca: await archivoCA(), motivo: (e as Error).message };
  }
  return estado;
};
