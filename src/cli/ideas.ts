import { leerMarca } from "../pipeline/config";
import { pedirIdeas } from "../pipeline/pasos/guion";
import { colores as c, parsearArgs } from "./comun";

const main = async () => {
  const { flags, posicionales } = parsearArgs(process.argv.slice(2));
  const marca = await leerMarca();
  const tema = typeof flags.tema === "string" ? flags.tema : posicionales.join(" ") || undefined;
  console.log(c.gris(`Buscando ideas para "${marca.nicho}"${tema ? ` (enfoque: ${tema})` : ""}…`));
  const ideas = await pedirIdeas(marca, {
    tema,
    cantidad: typeof flags.cantidad === "string" ? Number(flags.cantidad) : 10,
    onActividad: (a) => console.log(c.gris(`  · ${a}`)),
  });
  if (flags.json) {
    console.log(JSON.stringify(ideas, null, 2));
    return;
  }
  ideas.forEach((idea, i) => {
    console.log(`\n${c.negrita(`${i + 1}. ${idea.titulo}`)}\n   Gancho: "${idea.gancho}"\n   ${c.gris(idea.por_que)}`);
  });
  console.log(c.gris('\nPara hacer una: npm run video -- "<título>" --auto'));
};

main().catch((e: Error) => {
  console.error(c.rojo(`✗ ${e.message}`));
  process.exit(1);
});
