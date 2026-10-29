import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import { analisis, analizarClips, CLIPS_POR_PEDIDO, pendientesAnalisis } from "../pipeline/analisis";
import {
  borrarCategoria,
  borrarRecursos,
  CambioRecursoSchema,
  crearCategoria,
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

    r.get("/api/biblioteca", async () => ({ ...(await leerBiblioteca()), importacion, analisis, pendientes: await pendientesAnalisis(), clipsPorPedido: CLIPS_POR_PEDIDO }));

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
        .object({ carpeta: z.string().trim().min(1, "Escribí la ruta de la carpeta"), categoria: z.string(), tipoAudio: TipoAudio })
        .parse(req.body);
      return { importacion: await importarCarpeta(op.carpeta, op) };
    });

    r.post("/api/biblioteca/importar/cancelar", async () => {
      importacion.cancelar = true;
      analisis.cancelar = true;
      return { importacion, analisis };
    });

    /**
     * Analizar clips: fase "local" (gratis: fotogramas, volumen y transcripción) o "claude" (usa tu cuenta: un pedido
     * cada 6 clips). Por categoría (solo los pendientes) o los elegidos; `limite` para probar con pocos.
     */
    r.post("/api/biblioteca/analizar", async (req) => {
      const p = z.object({ fase: z.enum(["local", "claude"]), categoria: z.string().optional(), ids: z.array(z.string()).max(5000).optional(), limite: z.number().int().min(1).max(5000).optional() }).parse(req.body);
      if (!p.categoria && !p.ids) throw new ErrorBiblioteca("Elegí una categoría o clips.");
      return { analisis: await analizarClips(p) };
    });

    /** Subir un archivo desde el navegador (cuerpo crudo, uno por pedido). */
    r.addContentTypeParser("application/octet-stream", (_req, payload, hecho) => hecho(null, payload));
    r.post<{ Querystring: { categoria?: string; nombre?: string; tipoAudio?: string; describir?: string } }>("/api/biblioteca/subir", { bodyLimit: 4 * 1024 ** 3 }, async (req) => {
      const q = z.object({ categoria: z.string().min(1), nombre: z.string().min(1).max(255), tipoAudio: TipoAudio }).parse(req.query);
      const tmp = await temporalSubida(q.nombre);
      await pipeline(req.body as Readable, createWriteStream(tmp));
      const resultado = await importarSubida(tmp, q.nombre, { categoria: q.categoria, tipoAudio: q.tipoAudio });
      if (resultado.estado === "no_compatible") throw new ErrorBiblioteca(`${q.nombre}: no es un video ni un audio compatible.`);
      return resultado;
    });
  });
};
