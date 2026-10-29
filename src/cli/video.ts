import { readFile } from "node:fs/promises";
import { leerMarca } from "../pipeline/config";
import { leerTono, listarTonos } from "../pipeline/tonos";
import { ejecutarTrabajo } from "../pipeline/runner";
import { Trabajo } from "../pipeline/trabajo";
import { colores as c, mostrarProgreso, parsearArgs } from "./comun";

const AYUDA = `
Uso:
  npm run video -- "<idea>" [--voz es-UY-MateoNeural] [--auto]
  npm run video -- --archivo entrada.md [--auto]   (un texto largo: artículo, notas, guion propio)
  npm run video -- "<idea>" --tono academico        (tonos: prompts/tonos/*.md; sin --tono, el de la configuración)
  npm run video -- --tonos                         (lista los tonos)
  npm run video -- --reanudar <id-del-trabajo>
  npm run video -- --aprobar <id-del-trabajo>      (aprueba el guion revisado y sigue)

  --auto   saltea la revisión del guion y hace todo de corrido
`;

const main = async () => {
  const { flags, posicionales } = parsearArgs(process.argv.slice(2));
  if (flags.ayuda || flags.help || (!posicionales.length && !flags.archivo && !flags.tonos && !flags.reanudar && !flags.aprobar)) {
    console.log(AYUDA);
    process.exit(posicionales.length ? 0 : 1);
  }
  if (flags.tonos) {
    for (const t of await listarTonos()) console.log(`${c.negrita(t.id.padEnd(16))} ${t.nombre} — ${c.gris(t.descripcion)}`);
    return;
  }
  const marca = await leerMarca(); // valida config/marca.json antes de arrancar
  let t: Trabajo;
  if (typeof flags.reanudar === "string" || typeof flags.aprobar === "string") {
    t = await Trabajo.abrir(String(flags.reanudar ?? flags.aprobar));
    if (flags.aprobar) await t.marcarPaso("revision", "hecho");
    console.log(c.negrita(`▶ Reanudando ${t.id}`));
  } else {
    if (flags.archivo === true) throw new Error("Falta la ruta: --archivo entrada.md");
    const idea = typeof flags.archivo === "string" ? (await readFile(flags.archivo, "utf8")).trim() : posicionales.join(" ").trim();
    if (!idea) throw new Error("La idea está vacía.");
    if (flags.tono === true) throw new Error("Falta el tono: --tono academico (ver npm run video -- --tonos)");
    const tono = await leerTono(typeof flags.tono === "string" ? flags.tono : marca.tonoPorDefecto);
    t = await Trabajo.crear(idea, {
      tono: typeof flags.tono === "string" ? tono.id : undefined,
      voz: typeof flags.voz === "string" ? flags.voz : undefined,
      auto: flags.auto === true ? true : undefined,
    });
    console.log(c.negrita(`▶ Nuevo video: "${(await t.estado()).idea}"`) + c.gris(` · tono ${tono.nombre}`));
    console.log(c.gris(`  Carpeta: ${t.dir}`));
  }
  mostrarProgreso();
  const control = new AbortController();
  process.on("SIGINT", () => {
    console.log(c.amarillo("\nCancelando… (podés reanudar después con --reanudar)"));
    control.abort();
  });
  const r = await ejecutarTrabajo(t, control.signal);
  const estado = await t.estado();
  if (r === "listo") {
    console.log(c.verde(`\n✔ Video listo: ${t.ruta("video.mp4")}`));
    console.log(c.gris(`  Portada: ${t.ruta("portada.png")}\n  Texto:   ${t.ruta("publicacion.txt")}`));
  } else if (r === "esperando_revision") {
    console.log(c.amarillo(`\nGuion listo para revisar: ${t.ruta("guion.json")}`));
    console.log(`Editalo si querés (o usá la app web: npm start) y después corré:\n  npm run video -- --aprobar ${t.id}`);
  } else {
    console.log(c.rojo(`\n✗ El trabajo quedó en estado "${r}": ${estado.error ?? ""}`));
    console.log(`Para reanudar: npm run video -- --reanudar ${t.id}`);
    process.exitCode = 1;
  }
};

main().catch((e: Error) => {
  console.error(c.rojo(`✗ ${e.message}`));
  process.exit(1);
});
