// Extrae los trazos de todos los íconos de lucide-react a un JSON, para poder "dibujarlos" animados en Remotion.
// Uso: node scripts/generar-iconos.mjs   (correrlo de nuevo si se actualiza lucide-react)
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = path.join(raiz, "node_modules", "lucide-react", "dist", "esm", "icons");
const salida = path.join(raiz, "src", "remotion", "iconos", "lucide.json");

const iconos = {};
for (const archivo of (await readdir(dir)).filter((f) => f.endsWith(".mjs") && f !== "index.mjs")) {
  const m = await import(pathToFileURL(path.join(dir, archivo)).href);
  const datos = m.__iconData;
  if (!datos?.name) continue;
  // se descarta la "key" de React para achicar el archivo
  iconos[datos.name] = datos.node.map(([tag, { key: _key, ...attrs }]) => [tag, attrs]);
}
// alias: nombres viejos o alternativos (ej. circle-help → circle-question-mark), sacados de los exports del paquete
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([a-zA-Z])([0-9])/g, "$1-$2").replace(/([A-Z])([A-Z][a-z])/g, "$1-$2").toLowerCase();
const indice = await readFile(path.join(dir, "..", "lucide-react.mjs"), "utf8");
const alias = {};
for (const [, nombres, archivo] of indice.matchAll(/export \{([^}]+)\} from '\.\/icons\/([a-z0-9-]+)\.mjs'/g)) {
  if (!iconos[archivo]) continue;
  for (const [, n] of nombres.matchAll(/default as (\w+)/g)) {
    if (n.startsWith("Lucide") || n.endsWith("Icon")) continue;
    const k = kebab(n);
    if (k !== archivo && !iconos[k]) alias[k] = archivo;
  }
}
await writeFile(salida, JSON.stringify({ iconos, alias }));
console.log(`${Object.keys(iconos).length} íconos y ${Object.keys(alias).length} alias → ${path.relative(raiz, salida)}`);
