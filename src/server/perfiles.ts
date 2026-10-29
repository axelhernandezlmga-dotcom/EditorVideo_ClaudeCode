import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { leerMarca } from "../pipeline/config";
import { borrarPerfil, guardarFotoPerfil, guardarPerfil, leerPerfil, leerUltimoPerfilAnimados, listarPerfiles, rutaFotoPerfil, slugPorDefecto } from "../pipeline/perfiles";
import { leerUltimasOpciones } from "../pipeline/crudo/opciones";
import { confirmarKit, dirKit, leerKit, leerReglas, previsualizarKit, rutaEnKit } from "../pipeline/kit";
import { renombrarPerfil } from "../pipeline/renombrarPerfil";
import { textoResumenKit } from "../shared/kit";
import { rm } from "node:fs/promises";
import path from "node:path";
import { PerfilSchema, SLUG_PERFIL } from "../shared/perfiles";

const malo = (mensaje: string, statusCode = 400) => Object.assign(new Error(mensaje), { statusCode });

/** Rutas de Perfiles (Crudos → Perfiles). Plugin aparte: el parser binario de la foto solo aplica acá. */
export const registrarPerfiles = async (app: FastifyInstance) => {
  await app.register(async (r) => {
    r.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: 200 * 1024 * 1024 }, (_req, cuerpo, hecho) => hecho(null, cuerpo));

    // ---------- kit de marca ----------

    const existe = async (slug: string) => {
      if (!SLUG_PERFIL.test(slug) || !(await leerPerfil(slug))) throw malo(`No existe el perfil ${slug}`, 404);
    };

    r.get<{ Params: { slug: string } }>("/api/perfiles/:slug/kit", async (req) => {
      await existe(req.params.slug);
      const kit = await leerKit(req.params.slug);
      if (!kit) return { kit: null, reglas: null, marcaMd: null, resumen: null };
      const md = path.join(dirKit(req.params.slug), "marca.md");
      return { kit, reglas: await leerReglas(req.params.slug), marcaMd: existsSync(md) ? await readFile(md, "utf8") : null, resumen: textoResumenKit(kit) };
    });

    /** Paso 1: el kit (carpeta de esta compu o zip) se copia aparte y se clasifica, para que confirmes. */
    r.post<{ Params: { slug: string }; Querystring: { nombre?: string } }>("/api/perfiles/:slug/kit/previa", { bodyLimit: 200 * 1024 * 1024 }, async (req) => {
      await existe(req.params.slug);
      try {
        const kit = Buffer.isBuffer(req.body)
          ? await previsualizarKit(req.params.slug, { zip: req.body, nombre: req.query.nombre ?? "kit.zip" })
          : await previsualizarKit(req.params.slug, { carpeta: String((req.body as { carpeta?: string })?.carpeta ?? "") });
        return { kit, resumen: textoResumenKit(kit) };
      } catch (e) {
        throw malo((e as Error).message);
      }
    });

    /** Paso 2: se confirma, se lee el manual (puede tardar un minuto) y queda como kit del perfil. */
    r.post<{ Params: { slug: string } }>("/api/perfiles/:slug/kit/confirmar", async (req) => {
      await existe(req.params.slug);
      const marca = await leerMarca();
      try {
        const r2 = await confirmarKit(req.params.slug, marca.modeloClaude);
        return { ...r2, resumen: textoResumenKit(r2.kit) };
      } catch (e) {
        throw malo((e as Error).message);
      }
    });

    r.delete<{ Params: { slug: string } }>("/api/perfiles/:slug/kit", async (req) => {
      await existe(req.params.slug);
      await rm(dirKit(req.params.slug), { recursive: true, force: true });
      return { ok: true };
    });

    /** Un archivo del kit (logos, fuentes, íconos…) para la pantalla del perfil. */
    r.get<{ Params: { slug: string; "*": string } }>("/api/perfiles/:slug/kit/archivo/*", async (req, reply) => {
      let ruta: string;
      try {
        ruta = rutaEnKit(req.params.slug, req.params["*"]);
      } catch {
        throw malo("Ruta inválida");
      }
      if (!existsSync(ruta)) throw malo("No existe ese archivo del kit", 404);
      const tipos: Record<string, string> = { ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ttf": "font/ttf", ".otf": "font/otf", ".woff2": "font/woff2", ".pdf": "application/pdf", ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".json": "application/json" };
      return reply.type(tipos[path.extname(ruta).toLowerCase()] ?? "application/octet-stream").header("Cache-Control", "no-cache").send(await readFile(ruta));
    });

    /** Usar un avatar del kit como foto del perfil. */
    r.post<{ Params: { slug: string } }>("/api/perfiles/:slug/kit/foto", async (req) => {
      await existe(req.params.slug);
      const kit = await leerKit(req.params.slug);
      const nombre = String((req.body as { avatar?: string })?.avatar ?? "");
      const av = kit?.avatares.find((a) => a.nombre === nombre);
      if (!av?.png) throw malo("Ese avatar no tiene PNG en el kit.");
      return { perfil: await guardarFotoPerfil(req.params.slug, await readFile(rutaEnKit(req.params.slug, av.png))) };
    });

    /** Cambiar el slug (nombre interno) sin romper nada: se actualizan las referencias. */
    r.post<{ Params: { slug: string } }>("/api/perfiles/:slug/renombrar", async (req) => {
      await existe(req.params.slug);
      try {
        return await renombrarPerfil(req.params.slug, String((req.body as { nuevo?: string })?.nuevo ?? ""));
      } catch (e) {
        throw malo((e as Error).message);
      }
    });

    r.get("/api/perfiles", async () => {
      const marca = await leerMarca();
      const perfiles = await listarPerfiles(marca);
      const porDefecto = slugPorDefecto(marca, perfiles);
      const existe = (s: string | null | undefined) => (s && perfiles.some((p) => p.slug === s) ? s : porDefecto);
      // el último usado en cada bloque (si todavía existe)
      const ultimos = { idea: existe(await leerUltimoPerfilAnimados()), crudo: existe((await leerUltimasOpciones(porDefecto)).perfil) };
      return { perfiles, porDefecto, ultimos };
    });

    /** Crea o edita un perfil. `nuevo: true` falla si el slug ya existe (para no pisar otro perfil). */
    r.put<{ Params: { slug: string }; Querystring: { nuevo?: string } }>("/api/perfiles/:slug", async (req) => {
      const datos = PerfilSchema.safeParse({ ...(req.body as object), slug: req.params.slug });
      if (!datos.success) throw malo(datos.error.issues.map((i) => i.message).join("; "));
      const previo = await leerPerfil(req.params.slug);
      if (req.query.nuevo && previo) throw malo(`Ya hay un perfil "${req.params.slug}": elegí otro nombre.`, 409);
      // la foto se cambia solo con su propia ruta
      return { perfil: await guardarPerfil({ ...datos.data, foto: previo?.foto ?? null }) };
    });

    r.delete<{ Params: { slug: string } }>("/api/perfiles/:slug", async (req) => {
      const perfiles = await listarPerfiles(await leerMarca());
      if (perfiles.length <= 1) throw malo("Es el único perfil: creá otro antes de borrarlo.", 409);
      await borrarPerfil(req.params.slug).catch((e: Error) => Promise.reject(malo(e.message, 404)));
      return { ok: true };
    });

    r.put<{ Params: { slug: string } }>("/api/perfiles/:slug/foto", async (req) => {
      try {
        return { perfil: await guardarFotoPerfil(req.params.slug, req.body as Buffer) };
      } catch (e) {
        throw malo((e as Error).message);
      }
    });

    r.get<{ Params: { slug: string } }>("/api/perfiles/:slug/foto", async (req, reply) => {
      if (!SLUG_PERFIL.test(req.params.slug)) throw malo("Perfil inválido");
      const p = await leerPerfil(req.params.slug);
      const ruta = p && rutaFotoPerfil(p);
      if (!ruta || !existsSync(ruta)) throw malo("Ese perfil no tiene foto", 404);
      const tipo = ruta.endsWith(".png") ? "image/png" : ruta.endsWith(".webp") ? "image/webp" : "image/jpeg";
      return reply.type(tipo).header("Cache-Control", "no-cache").send(await readFile(ruta));
    });
  });
};
