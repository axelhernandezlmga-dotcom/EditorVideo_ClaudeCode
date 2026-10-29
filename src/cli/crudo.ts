import { IDS_MODELOS_TRANSCRIPCION, type IdModeloTranscripcion } from "../shared/transcripcion";
import { calcularTramos, CortesSchema, duracionTramos, resumirCortes, TranscripcionSchema } from "../shared/cortes";
import { importarArchivo } from "../pipeline/crudo/subida";
import { ejecutarTrabajo } from "../pipeline/runner";
import { Trabajo } from "../pipeline/trabajo";
import { colores as c, mostrarProgreso, parsearArgs } from "./comun";

const AYUDA = `
Uso:
  npm run crudo -- <video.mp4|video.mov>        (edita un video grabado de corrido)
  npm run crudo -- <video> --modelo small        (modelo de whisper: base, small, medium o large-v3; por defecto el de la configuración)
  npm run crudo -- --reanudar <id-del-trabajo>
  npm run crudo -- --aprobar <id-del-trabajo>   (renderiza con los cortes y el material revisados)
`;

/** Resumen de los cortes en la terminal. */
export const imprimirResumen = async (t: Trabajo) => {
  const tr = await t.leer("transcripcion.json", TranscripcionSchema);
  const cortes = await t.leer("cortes.json", CortesSchema);
  if (!tr || !cortes) return;
  const tramos = calcularTramos(tr.palabras, cortes, tr.duracionMs);
  const r = resumirCortes(tr.palabras, cortes, tr.duracionMs, tramos);
  console.log(c.negrita(`\nDuración: ${(tr.duracionMs / 1000).toFixed(1)} s → ${(duracionTramos(tramos) / 1000).toFixed(1)} s`));
  for (const [tipo, v] of Object.entries(r)) if (v.cantidad) console.log(`  ${tipo.padEnd(10)} ${String(v.cantidad).padStart(3)} cortes  ${(v.ms / 1000).toFixed(1)} s`);
};

const main = async () => {
  const { flags, posicionales } = parsearArgs(process.argv.slice(2));
  if (flags.ayuda || flags.help || (!posicionales.length && !flags.reanudar && !flags.aprobar)) {
    console.log(AYUDA);
    process.exit(posicionales.length ? 0 : 1);
  }
  let t: Trabajo;
  if (typeof flags.reanudar === "string" || typeof flags.aprobar === "string") {
    t = await Trabajo.abrir(String(flags.reanudar ?? flags.aprobar));
    if (flags.aprobar) await t.marcarPaso("revision", "hecho");
    console.log(c.negrita(`▶ Reanudando ${t.id}`));
  } else {
    const modelo = flags.modelo;
    if (modelo !== undefined && !(typeof modelo === "string" && (IDS_MODELOS_TRANSCRIPCION as readonly string[]).includes(modelo))) throw new Error(`--modelo tiene que ser ${IDS_MODELOS_TRANSCRIPCION.join(", ")}.`);
    t = await importarArchivo(posicionales[0]!, { modeloWhisper: modelo as IdModeloTranscripcion | undefined });
    console.log(c.negrita(`▶ Nuevo crudo: ${posicionales[0]}`));
    console.log(c.gris(`  Carpeta: ${t.dir}`));
  }
  mostrarProgreso();
  const control = new AbortController();
  process.on("SIGINT", () => {
    console.log(c.amarillo("\nCancelando… (podés reanudar después con --reanudar)"));
    control.abort();
  });
  const r = await ejecutarTrabajo(t, control.signal);
  await imprimirResumen(t);
  if (r === "listo") console.log(c.verde(`\n✔ Video listo: ${t.ruta("video.mp4")}`));
  else if (r === "esperando_revision") {
    console.log(c.amarillo(`\nEdición lista para revisar en la app (npm start → Cola → Revisar edición).`));
    console.log(`O renderizá directo: npm run crudo -- --aprobar ${t.id}`);
  } else {
    console.log(c.rojo(`\n✗ El trabajo quedó en estado "${r}": ${(await t.estado()).error ?? ""}`));
    process.exitCode = 1;
  }
};

main().catch((e: Error) => {
  console.error(c.rojo(`✗ ${e.message}`));
  process.exit(1);
});
