import type { FastifyInstance } from "fastify";
import { rm } from "node:fs/promises";
import type { Readable } from "node:stream";
import { z } from "zod";
import { calcularTramos, CortesSchema, duracionTramos, resumirCortes, TranscripcionSchema } from "../shared/cortes";
import { GuionSchema } from "../shared/schemas";
import { cola } from "../pipeline/cola";
import { Trabajo } from "../pipeline/trabajo";
import { alineacionActual, ErrorVoz, EXTENSIONES_VOZ, leerGrabacion, MAX_BYTES_VOZ, recibirArchivoVoz, recibirTomaEscena, tomasGrabadas, unirTomas } from "../pipeline/vozPropia";

const http = (codigo: number, mensaje: string) => Object.assign(new Error(mensaje), { statusCode: codigo });

const abrirMiVoz = async (id: string) => {
  try {
    const t = await Trabajo.abrir(id);
    if ((await t.estado()).opciones.modo === "mi_voz") return t;
  } catch {
    // cae al 404
  }
  throw http(404, `No existe un trabajo "Mi voz" con id ${id}`);
};

const libre = (t: Trabajo) => {
  if (cola.enCurso === t.id) throw http(409, "El trabajo se está procesando: esperá a que termine.");
};

/** Todo lo que necesitan las pantallas Grabar y Revisar tu voz. */
const detalleVoz = async (t: Trabajo) => {
  const estado = await t.estado();
  const guion = await t.leer("guion.json", GuionSchema);
  const grabacion = await leerGrabacion(t);
  const transcripcion = await t.leer("transcripcion.json", TranscripcionSchema);
  const cortes = await t.leer("cortes.json", CortesSchema);
  const tramos = transcripcion && cortes ? calcularTramos(transcripcion.palabras, cortes, transcripcion.duracionMs) : null;
  const alineacion = guion && transcripcion && cortes ? alineacionActual(guion, transcripcion, cortes, grabacion) : null;
  return {
    estado,
    escenas: guion?.escenas.map((e) => e.narracion) ?? [],
    titulo: guion?.titulo ?? estado.idea,
    grabacion: grabacion ? { ...grabacion, url: `/jobs/${t.id}/${grabacion.archivo}` } : null,
    tomas: await tomasGrabadas(t),
    transcripcion,
    cortes,
    tramos,
    duracionFinalMs: tramos ? duracionTramos(tramos) : null,
    resumen: transcripcion && cortes && tramos ? resumirCortes(transcripcion.palabras, cortes, transcripcion.duracionMs, tramos) : null,
    alineacion,
    limpioUrl: t.existe("audio", "limpio.wav") ? `/jobs/${t.id}/audio/limpio.wav` : null,
    extensiones: EXTENSIONES_VOZ,
  };
};
export type DetalleVoz = Awaited<ReturnType<typeof detalleVoz>>;

/** Rutas de "Mi voz". Plugin aparte: el audio llega en bytes crudos y se escribe a disco en streaming. */
export const registrarVozPropia = async (app: FastifyInstance) => {
  await app.register(async (r) => {
    r.addContentTypeParser("application/octet-stream", (_req, payload, hecho) => hecho(null, payload));
    const error = (e: unknown) => (e instanceof ErrorVoz ? http(400, e.message) : e);

    r.get<{ Params: { id: string } }>("/api/voz/:id", async (req) => detalleVoz(await abrirMiVoz(req.params.id)));

    /** Un archivo con toda la narración (subido, o grabado de corrido en el navegador). */
    r.put<{ Params: { id: string }; Querystring: { nombre?: string; forma?: string } }>("/api/voz/:id/archivo", { bodyLimit: MAX_BYTES_VOZ }, async (req) => {
      const t = await abrirMiVoz(req.params.id);
      libre(t);
      try {
        await recibirArchivoVoz(t, req.body as Readable, req.query.nombre ?? "grabacion.webm", req.query.forma === "navegador" ? "navegador" : "archivo");
      } catch (e) {
        throw error(e);
      }
      await cola.encolar(t.id);
      return detalleVoz(t);
    });

    /** La toma de una escena (grabación escena por escena). Se puede volver a grabar cuantas veces quieras. */
    r.put<{ Params: { id: string; n: string }; Querystring: { nombre?: string } }>("/api/voz/:id/escenas/:n", { bodyLimit: MAX_BYTES_VOZ }, async (req) => {
      const t = await abrirMiVoz(req.params.id);
      libre(t);
      const guion = await t.leer("guion.json", GuionSchema);
      const n = Number(req.params.n);
      if (!guion || !Number.isInteger(n) || n < 0 || n >= guion.escenas.length) throw http(404, "Esa escena no existe.");
      try {
        await recibirTomaEscena(t, n, req.body as Readable, req.query.nombre ?? "toma.webm");
      } catch (e) {
        throw error(e);
      }
      return detalleVoz(t);
    });

    /** Terminaste de grabar escena por escena: se unen las tomas y sigue el trabajo. */
    r.post<{ Params: { id: string } }>("/api/voz/:id/escenas/listo", async (req) => {
      const t = await abrirMiVoz(req.params.id);
      libre(t);
      try {
        await unirTomas(t);
      } catch (e) {
        throw error(e);
      }
      await cola.encolar(t.id);
      return detalleVoz(t);
    });

    /** Cortes tocados en la revisión (mismo formato que en los crudos). */
    r.put<{ Params: { id: string } }>("/api/voz/:id/cortes", async (req) => {
      const t = await abrirMiVoz(req.params.id);
      libre(t);
      const tr = await t.leer("transcripcion.json", TranscripcionSchema);
      const cortes = await t.leer("cortes.json", CortesSchema);
      if (!tr || !cortes) throw http(409, "Todavía no están los cortes.");
      const n = tr.palabras.length;
      const indice = z.number().int().min(0).max(n - 1);
      const pausa = z.number().int().min(-1).max(n - 1);
      const body = z
        .object({ automatico: z.boolean(), manual: z.object({ quitar: z.array(indice), conservar: z.array(indice), pausasConservadas: z.array(pausa), pausasCortadas: z.array(pausa) }) })
        .safeParse(req.body);
      if (!body.success) throw http(400, body.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      const unicos = (a: number[]) => [...new Set(a)].sort((x, y) => x - y);
      const m = body.data.manual;
      await t.escribir("cortes.json", {
        ...cortes,
        automatico: body.data.automatico,
        manual: body.data.automatico
          ? { quitar: [], conservar: [], pausasConservadas: [], pausasCortadas: [] }
          : { quitar: unicos(m.quitar), conservar: unicos(m.conservar), pausasConservadas: unicos(m.pausasConservadas), pausasCortadas: unicos(m.pausasCortadas) },
      });
      // la voz por escena y lo que sigue se rehacen con los cortes nuevos
      if ((await t.estado()).pasos.voz !== "pendiente") await t.invalidarDesde("voz");
      return detalleVoz(t);
    });

    /** Aprobás los cortes: se arma la voz por escena y sigue hasta el video. */
    r.post<{ Params: { id: string } }>("/api/voz/:id/aprobar", async (req) => {
      const t = await abrirMiVoz(req.params.id);
      if (!t.existe("cortes.json")) throw http(409, "Todavía no están los cortes de tu voz.");
      await t.marcarPaso("revision_voz", "hecho");
      await t.log("Cortes de tu voz aprobados.");
      await cola.encolar(t.id);
      return { ok: true };
    });

    /** Volver a grabar: se descarta lo grabado y el trabajo vuelve a esperar tu voz. */
    r.post<{ Params: { id: string } }>("/api/voz/:id/regrabar", async (req) => {
      const t = await abrirMiVoz(req.params.id);
      libre(t);
      await t.invalidarDesde("grabacion");
      await rm(t.ruta("voz", "grabacion.json"), { force: true });
      await t.actualizar((e) => {
        e.estado = "esperando_voz";
        e.pasos.grabacion = "en_curso";
      });
      await t.log("Volvés a grabar tu voz.");
      return detalleVoz(t);
    });
  });
};
