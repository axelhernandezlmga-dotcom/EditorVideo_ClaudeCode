/**
 * npm run claves — carga las claves de Pixabay y Gemini en .env.
 * Se escriben con entrada oculta, se validan con un pedido real y se guardan directo en .env:
 * nunca se imprimen (solo los últimos 4 caracteres).
 */
import { claveDe, finalDe, guardarClave, INFO_CLAVES, probarClave, recordarPrueba, type NombreClave } from "../src/pipeline/claves";

const c = {
  gris: (s: string) => `\x1b[90m${s}\x1b[0m`,
  verde: (s: string) => `\x1b[32m${s}\x1b[0m`,
  rojo: (s: string) => `\x1b[31m${s}\x1b[0m`,
  amarillo: (s: string) => `\x1b[33m${s}\x1b[0m`,
  negrita: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

const A_CARGAR: NombreClave[] = ["PIXABAY_API_KEY", "GEMINI_API_KEY"];

// Si la entrada no es una terminal (ej. `echo … | npm run claves`), se leen líneas de stdin.
let lineasStdin: string[] | null = null;
const leerLineaStdin = async (): Promise<string> => {
  if (!lineasStdin) {
    let todo = "";
    for await (const trozo of process.stdin) todo += trozo;
    lineasStdin = todo.split(/\r?\n/);
  }
  return lineasStdin.shift() ?? "";
};

/** Lee una línea sin mostrarla: cada carácter se ve como • (también al pegar). */
const leerOculto = (pregunta: string): Promise<string> => {
  process.stdout.write(pregunta);
  if (!process.stdin.isTTY) return leerLineaStdin().then((l) => (process.stdout.write("\n"), l));
  return new Promise((resolve) => {
    let valor = "";
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const alTeclear = (datos: string) => {
      for (const ch of datos) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", alTeclear);
          process.stdout.write("\n");
          resolve(valor);
          return;
        }
        if (ch === "\u0003") {
          // Ctrl+C
          stdin.setRawMode(false);
          process.stdout.write("\nCancelado. No se guardó nada más.\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") {
          if (valor.length) {
            valor = valor.slice(0, -1);
            process.stdout.write("\b \b");
          }
          continue;
        }
        if (ch >= " ") {
          valor += ch;
          process.stdout.write("•");
        }
      }
    };
    stdin.on("data", alTeclear);
  });
};

const preguntar = async (pregunta: string): Promise<string> => {
  process.stdout.write(pregunta);
  if (!process.stdin.isTTY) return leerLineaStdin();
  return new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    process.stdin.once("data", (d: string) => {
      process.stdin.pause();
      resolve(d.trim());
    });
  });
};

const si = (r: string) => /^(s|si|sí|y|yes)$/i.test(r.trim());

const cargar = async (nombre: NombreClave) => {
  const info = INFO_CLAVES[nombre];
  console.log(`\n${c.negrita(`${info.servicio}`)} ${c.gris(`(${nombre}, para ${info.para})`)}`);
  console.log(c.gris(`  Conseguila en: ${info.dondeSacarla}`));
  const actual = claveDe(nombre);
  if (actual) {
    console.log(`  Ya hay una guardada (termina en …${finalDe(actual)}).`);
    if (!si(await preguntar("  ¿La querés reemplazar? (s/N) "))) {
      process.stdout.write("  Pruebo la que está… ");
      const r = await probarClave(nombre);
      console.log(r?.ok ? c.verde(`✅ ${r.motivo}`) : c.rojo(`❌ ${r?.motivo ?? ""}`));
      return;
    }
  }
  const nueva = (await leerOculto("  Pegá la clave (no se va a ver) y apretá Enter, o Enter vacío para saltear: ")).trim();
  if (!nueva) {
    console.log(c.gris("  Salteada."));
    return;
  }
  process.stdout.write(`  Recibí ${nueva.length} caracteres (termina en …${finalDe(nueva)}). Probándola… `);
  const r = await probarClave(nombre, nueva);
  if (!r) return;
  console.log(r.ok ? c.verde(`✅ ${r.motivo}`) : c.rojo(`❌ ${r.motivo}`));
  if (!r.ok && !si(await preguntar("  ¿La guardo igual? (s/N) "))) {
    console.log(c.gris("  No la guardé."));
    return;
  }
  await guardarClave(nombre, nueva);
  await recordarPrueba(nombre, r);
  console.log(c.verde("  Guardada en .env."));
};

const main = async () => {
  console.log(c.negrita("Claves de Fábrica de Videos"));
  console.log(c.gris("Se guardan solo en .env (que no se sube a git). Nunca se muestran enteras."));
  for (const nombre of A_CARGAR) await cargar(nombre);
  console.log(`\n${c.gris("Listo. La app toma las claves nuevas sin reiniciar. También podés cambiarlas en Configuración.")}`);
  process.exit(0);
};

main().catch((e: Error) => {
  console.error(c.rojo(`✗ ${e.message}`));
  process.exit(1);
});
