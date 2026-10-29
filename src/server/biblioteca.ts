import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import {
  borrarCategoria,
  borrarRecursos,
  CambioRecursoSchema,
  crearCategoria,
  describirClips,
  descripcion,
  DIR_MEDIOS,
  DIR_MINIATURAS,
  editarRecurso,
  ErrorBiblioteca,
  importacion,
  importarCarpeta,
  importarSubida,
  leerBiblioteca,
  moverRecursos,
  renombrarCategoria,
  temporalSubida,
} from "../pipeline/biblioteca";

const TipoAudio = z.enum(["auto", "musica", "sfx"]).default("auto");

/** Biblioteca: categorías, importar (carpeta o archivos subidos), mover, renombrar, borrar y describir. */
export const registrarBiblioteca = async (app: FastifyInstance) => {
  await mkdir(DIR_MEDIOS, { recursive: true });
  await mkdir(DIR_MINIATURAS, { recursive: true });
  // los archivos se sirven con Range (el reproductor lo necesita); solo lo que está dentro de biblioteca/
  await app.register(fastifyStatic, { root: DIR_MEDIOS, prefix: "/biblioteca-medios/", decorateReply: false, index: false, dotfiles: "deny" });
  await app.register(fastifyStatic, { root: DIR_MINIATURAS, prefix: "/biblioteca-mini/", decorateReply: false, index: false });

  await app.register(async (r) => {
    r.setErrorHandler((err, _req, reply) => {
      const e = err as Error & { statusCode?: number };
      const codigo = e instanceof ErrorBiblioteca || e instanceof z.ZodError ? 400 : (e.statusCode ?? 500);
      const mensaje = e instanceof z.ZodError ? e.issues.map((i) => i.message).join("; ") : e.message;
      void reply.code(codigo).send({ error: mensaje });
    });

    r.get("/api/biblioteca", async () => ({ ...(await leerBiblioteca()), importacion, descripcion }));

    r.post("/api/biblioteca/categorias", async (req) => ({ categoria: await crearCategoria(z.object({ nombre: z.string() }).parse(req.body).nombre) }));

    r.put<{ Params: { id: string } }>("/api/biblioteca/categorias/:id", async (req) => ({ categoria: await renombrarCategoria(req.params.id, z.object({ nombre: z.string() }).parse(req.body).nombre) }));

    r.delete<{ Params: { id: string }; Querystring: { moverA?: string } }>("/api/biblioteca/categorias/:id", async (req) => borrarCategoria(req.params.id, req.query.moverA || null));

    r.put<{ Params: { id: string } }>("/api/biblioteca/recursos/:id", async (req) => ({ recurso: await editarRecurso(req.params.id, CambioRecursoSchema.parse(req.body)) }));

    r.post("/api/biblioteca/recursos/mover", async (req) => {
      const { ids, categoria } = z.object({ ids: z.array(z.string()).min(1).max(5000), categoria: z.string() }).parse(req.body);
      return { movidos: await moverRecursos(ids, categoria) };
    });

    r.post("/api/biblioteca/recursos/borrar", async (req) => {
      const { ids } = z.object({ ids: z.array(z.string()).min(1).max(5000) }).parse(req.body);
      return { borrados: await borrarRecursos(ids) };
    });

    /** Importar una carpeta de esta compu (en segundo plano: el progreso se ve en GET /api/biblioteca). */
    r.post("/api/biblioteca/importar-carpeta", async (req) => {
      const op = z
        .object({ carpeta: z.string().trim().min(1, "Escribí la ruta de la carpeta"), categoria: z.string(), tipoAudio: TipoAudio, describir: z.boolean().default(false), transcribir: z.boolean().default(false) })
        .parse(req.body);
      return { importacion: await importarCarpeta(op.carpeta, op) };
    });

    r.post("/api/biblioteca/importar/cancelar", async () => {
      importacion.cancelar = true;
      descripcion.cancelar = true;
      return { importacion, descripcion };
    });

    /** "Describir con Claude" los clips elegidos, o los de una categoría que solo tienen el nombre del archivo. */
    r.post("/api/biblioteca/describir", async (req) => {
      const { ids, categoria, transcribir } = z.object({ ids: z.array(z.string()).max(5000).optional(), categoria: z.string().optional(), transcribir: z.boolean().default(false) }).parse(req.body);
      const b = await leerBiblioteca();
      const lista = ids ?? b.recursos.filter((x) => x.tipo === "video" && x.categoria === categoria && x.descripcionPor === "nombre").map((x) => x.id);
      return { descripcion: await describirClips(lista, { transcribir }) };
    });

    /** Subir un archivo desde el navegador (cuerpo crudo, uno por pedido). */
    r.addContentTypeParser("application/octet-stream", (_req, payload, hecho) => hecho(null, payload));
    r.post<{ Querystring: { categoria?: string; nombre?: string; tipoAudio?: string; describir?: string } }>("/api/biblioteca/subir", { bodyLimit: 4 * 1024 ** 3 }, async (req) => {
      const q = z
        .object({ categoria: z.string().min(1), nombre: z.string().min(1).max(255), tipoAudio: TipoAudio, describir: z.enum(["0", "1"]).default("0") })
        .parse(req.query);
      const tmp = await temporalSubida(q.nombre);
      await pipeline(req.body as Readable, createWriteStream(tmp));
      const resultado = await importarSubida(tmp, q.nombre, { categoria: q.categoria, tipoAudio: q.tipoAudio, describir: q.describir === "1" });
      if (resultado.estado === "no_compatible") throw new ErrorBiblioteca(`${q.nombre}: no es un video ni un audio compatible.`);
      return resultado;
    });
  });
};
