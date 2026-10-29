import { existsSync } from "node:fs";
import { appendFile, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";
import { contarPalabras, etiquetaDe } from "../shared/entrada";
import { EstadoSchema, pasosDe, type Estado, type Paso, type TipoTrabajo } from "../shared/schemas";
import { bus } from "./eventos";
import { DIR_JOBS } from "./rutas";

export const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "") || "video";

const fechaLocal = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const ahora = () => new Date().toISOString();

/** Escritura atómica: primero a un temporal y después rename (si se corta la luz no queda un JSON a medias). */
export const escribirAtomico = async (archivo: string, contenido: string) => {
  const tmp = `${archivo}.${process.pid}.tmp`;
  await writeFile(tmp, contenido, "utf8");
  await rename(tmp, archivo);
};

export class Trabajo {
  private constructor(
    readonly id: string,
    readonly dir: string,
  ) {}

  /** `entrada` es lo que escribió el usuario: una idea o un texto largo. Se guarda entero en entrada.md. */
  static async crear(entrada: string, opciones: Estado["opciones"] = {}): Promise<Trabajo> {
    const idea = etiquetaDe(entrada);
    const t = await Trabajo.nuevo(idea, "idea", opciones);
    await writeFile(t.ruta("entrada.md"), `${entrada.trim()}\n`, "utf8");
    const palabras = contarPalabras(entrada);
    await t.log(`Trabajo creado para la idea: "${idea}"${palabras > 30 ? ` (texto de ${palabras} palabras en entrada.md)` : ""}`);
    return t;
  }

  /** Trabajo de "Editar crudo": `titulo` sale del nombre del archivo subido. Queda en cola cuando se encola. */
  static async crearCrudo(titulo: string, opciones: Estado["opciones"] = {}): Promise<Trabajo> {
    const t = await Trabajo.nuevo(titulo, "crudo", opciones);
    await t.log(`Crudo recibido: "${opciones.archivo ?? titulo}"`);
    return t;
  }

  private static async nuevo(idea: string, tipo: TipoTrabajo, opciones: Estado["opciones"]): Promise<Trabajo> {
    await mkdir(DIR_JOBS, { recursive: true });
    const base = `${fechaLocal()}-${tipo === "crudo" ? "crudo-" : ""}${slug(idea)}`;
    let id = base;
    for (let n = 2; existsSync(path.join(DIR_JOBS, id)); n++) id = `${base}-${n}`;
    const dir = path.join(DIR_JOBS, id);
    await mkdir(path.join(dir, "audio"), { recursive: true });
    const t = new Trabajo(id, dir);
    await t.guardarEstado({
      id,
      tipo,
      idea,
      creado: ahora(),
      actualizado: ahora(),
      estado: "en_cola",
      pasos: Object.fromEntries(pasosDe(tipo, opciones.modo).map((p) => [p, "pendiente"])) as Estado["pasos"],
      opciones,
    });
    return t;
  }

  static async abrir(id: string): Promise<Trabajo> {
    if (!/^[\w.-]+$/.test(id)) throw new Error(`Id de trabajo inválido: ${id}`);
    const dir = path.join(DIR_JOBS, id);
    if (!existsSync(path.join(dir, "estado.json"))) throw new Error(`No existe el trabajo ${id}`);
    return new Trabajo(id, dir);
  }

  static async listar(): Promise<Estado[]> {
    if (!existsSync(DIR_JOBS)) return [];
    const ids = (await readdir(DIR_JOBS, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
    const estados: Estado[] = [];
    for (const id of ids) {
      try {
        estados.push(await (await Trabajo.abrir(id)).estado());
      } catch {
        // carpeta sin estado válido: la ignoramos
      }
    }
    return estados.sort((a, b) => b.creado.localeCompare(a.creado));
  }

  ruta(...partes: string[]) {
    return path.join(this.dir, ...partes);
  }

  existe(...partes: string[]) {
    return existsSync(this.ruta(...partes));
  }

  /** Texto completo que escribió el usuario (los trabajos viejos no tienen entrada.md: se usa la idea). */
  async entrada(): Promise<string> {
    return this.existe("entrada.md") ? (await readFile(this.ruta("entrada.md"), "utf8")).trim() : (await this.estado()).idea;
  }

  async estado(): Promise<Estado> {
    return EstadoSchema.parse(JSON.parse(await readFile(this.ruta("estado.json"), "utf8")));
  }

  private async guardarEstado(e: Estado) {
    await escribirAtomico(this.ruta("estado.json"), `${JSON.stringify(e, null, 2)}\n`);
    bus.emitir({ tipo: "estado", id: this.id, estado: e });
  }

  // serializa las actualizaciones de estado para que no se pisen entre sí
  private cola: Promise<unknown> = Promise.resolve();
  actualizar(fn: (e: Estado) => void | Estado): Promise<Estado> {
    const p = this.cola.then(async () => {
      const e = await this.estado();
      const nuevo = fn(e) ?? e;
      nuevo.actualizado = ahora();
      await this.guardarEstado(nuevo);
      return nuevo;
    });
    this.cola = p.catch(() => undefined);
    return p;
  }

  marcarPaso(paso: Paso, valor: Estado["pasos"][Paso]) {
    return this.actualizar((e) => {
      e.pasos[paso] = valor;
      const tiempos = (e.tiempos ??= {});
      if (valor === "en_curso") tiempos[paso] = { inicio: ahora() };
      else if (valor === "pendiente") delete tiempos[paso];
      else tiempos[paso] = { ...tiempos[paso], fin: ahora() };
    });
  }

  /** Vuelve a "pendiente" el paso indicado y todos los siguientes. */
  invalidarDesde(paso: Paso) {
    return this.actualizar((e) => {
      const pasos = pasosDe(e.tipo, e.opciones.modo);
      for (const p of pasos.slice(Math.max(0, pasos.indexOf(paso)))) {
        e.pasos[p] = "pendiente";
        if (e.tiempos) delete e.tiempos[p];
      }
    });
  }

  async log(linea: string, nivel: "info" | "error" = "info") {
    const marca = new Date().toLocaleTimeString("es-UY", { hour12: false });
    await appendFile(this.ruta("log.txt"), `[${marca}] ${nivel === "error" ? "ERROR " : ""}${linea}\n`, "utf8");
    bus.emitir({ tipo: "log", id: this.id, linea, nivel });
  }

  actividad(texto: string) {
    bus.emitir({ tipo: "actividad", id: this.id, texto });
  }

  progreso(paso: string, progreso: number) {
    bus.emitir({ tipo: "progreso", id: this.id, paso, progreso });
  }

  async leer<T extends z.ZodType>(archivo: string, schema: T): Promise<z.infer<T> | null> {
    if (!this.existe(archivo)) return null;
    try {
      const r = schema.safeParse(JSON.parse(await readFile(this.ruta(archivo), "utf8")));
      return r.success ? r.data : null;
    } catch {
      return null;
    }
  }

  escribir(archivo: string, data: unknown) {
    return escribirAtomico(this.ruta(archivo), `${JSON.stringify(data, null, 2)}\n`);
  }

  escribirTexto(archivo: string, texto: string) {
    return escribirAtomico(this.ruta(archivo), texto);
  }
}
