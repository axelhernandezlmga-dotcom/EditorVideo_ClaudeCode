import type { EstadoClave, NombreClave } from "../../src/pipeline/claves";
import type { EstadoCredencial, SERVICIOS } from "../../src/pipeline/credenciales";
import type { AvisoConfig } from "../../src/pipeline/config";
import type { DetalleTrabajo, ResumenTrabajo } from "../../src/server/api";
import type { DetalleCrudo } from "../../src/server/crudo";
import type { DetalleVoz } from "../../src/server/vozPropia";
import type { Cortes } from "../../src/shared/cortes";
import type { UsoGemini } from "../../src/pipeline/usoGemini";
import type { Guion, Idea, Marca, Tono } from "../../src/shared/schemas";
import type { IdModeloTranscripcion, MODELOS_TRANSCRIPCION } from "../../src/shared/transcripcion";
import { completarPerfil, type Perfil } from "../../src/shared/perfiles";
import type { Kit, ReglasMarca } from "../../src/shared/kit";
import type { Mood, PedidoCrudo } from "../../src/shared/opcionesCrudo";
import type { Pista } from "../../src/shared/musica";
import type { Biblioteca, Categoria, EtiquetasClip, Recurso, TipoRecurso, UsoBiblioteca } from "../../src/shared/biblioteca";
import type { ModoEdicion } from "../../src/shared/modos";
import type { EstadoDescripcion, EstadoImportacion, ResultadoImportar } from "../../src/pipeline/biblioteca";

export type { DetalleCrudo, DetalleTrabajo, DetalleVoz, ResumenTrabajo };
const binario = { "Content-Type": "application/octet-stream" };
export type PedidoVideo = {
  voz: string;
  auto: boolean;
  tono: string;
  perfil?: string;
  cierre?: boolean;
  modo?: "ia" | "mi_voz";
  estiloIlustracion?: "auto" | "plano" | "cartoon" | "documental";
  cantidadIlustracion?: "poca" | "media" | "mucha";
  opinion?: string;
  modoEdicion?: ModoEdicion;
  biblioteca?: UsoBiblioteca;
};
export type Voz = { id: string; genero: string; locale: string; proveedor: "gemini" | "edge" | "kokoro"; descripcion?: string };
export type EstadoKokoro = { instalado: boolean; instalando: boolean; lineas: string[]; error?: string };
export type Muestra = { archivo: string; url: string; voz: string; tono: string; segundos: number; fecha: string };
export type { AvisoConfig, EstadoClave, EstadoCredencial, NombreClave, UsoGemini };
export type ServicioCredencial = (typeof SERVICIOS)[number] & { probable: boolean };
type PedidoCredencial = { nombre: string; servicio: string; servicioNombre?: string; clave?: string; baseUrl?: string; parametros?: Record<string, string> };
export type ModeloTranscripcion = (typeof MODELOS_TRANSCRIPCION)[number] & { bajado: boolean; aprobado: boolean };
export type EspacioTrabajo = { total: number; liberaDisco: number; liberaSoloFinal: number };
export type ModoBorrado = "lista" | "disco" | "soloFinal";
export type { Perfil, Biblioteca, Categoria, Recurso, TipoRecurso, EstadoImportacion, EstadoDescripcion, ResultadoImportar };
export type EstadoBiblioteca = Biblioteca & { importacion: EstadoImportacion; descripcion: EstadoDescripcion };
export type CambioRecurso = Partial<{ nombre: string; categoria: string; descripcion: string; etiquetas: EtiquetasClip; mood: Mood | null; tipo: "musica" | "sfx" }>;
export type OpcionesSubida = { categoria: string; tipoAudio: "auto" | "musica" | "sfx"; describir: boolean };

const pedir = async <T,>(url: string, opciones: RequestInit = {}): Promise<T> => {
  let r: Response;
  try {
    r = await fetch(url, { ...opciones, headers: { "Content-Type": "application/json", ...opciones.headers } });
  } catch {
    throw new Error("No hay conexión con la app. ¿Sigue abierta la terminal con `npm start`?");
  }
  const datos = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(datos.error ?? `Error ${r.status}`);
  return datos;
};

const post = <T,>(url: string, body?: unknown) => pedir<T>(url, { method: "POST", body: JSON.stringify(body ?? {}) });

/** Respuesta con un perfil adentro, completado con los valores por defecto. */
const conPerfilCompleto = (r: { perfil: unknown }): { perfil: Perfil } => {
  const perfil = completarPerfil(r.perfil);
  if (!perfil) throw new Error("La app devolvió un perfil que no se puede leer.");
  return { perfil };
};

export const api = {
  trabajos: () => pedir<ResumenTrabajo[]>("/api/trabajos"),
  trabajo: (id: string) => pedir<DetalleTrabajo>(`/api/trabajos/${id}`),
  crear: (ideas: string[], pedido: PedidoVideo) => post<{ ids: string[] }>("/api/trabajos", { ideas, cierre: true, ...pedido }),
  cancelar: (id: string) => post(`/api/trabajos/${id}/cancelar`),
  reanudar: (id: string) => post(`/api/trabajos/${id}/reanudar`),
  guardarGuion: (id: string, guion: Guion) => pedir<DetalleTrabajo>(`/api/trabajos/${id}/guion`, { method: "PUT", body: JSON.stringify(guion) }),
  aprobar: (id: string) => post(`/api/trabajos/${id}/aprobar`),
  regenerarGuion: (id: string, instruccion?: string) => post(`/api/trabajos/${id}/regenerar-guion`, { instruccion }),
  regenerarEscena: (id: string, n: number, instruccion?: string) => post<DetalleTrabajo>(`/api/trabajos/${id}/escenas/${n}/regenerar`, { instruccion }),
  rehacerVoz: (id: string, voz: string) => post(`/api/trabajos/${id}/rehacer-voz`, { voz }),
  abrirCarpeta: (id: string) => post(`/api/trabajos/${id}/abrir-carpeta`),
  ideas: (tema?: string) => post<{ ideas: Idea[] }>("/api/ideas", { tema }),
  tonos: () => pedir<{ tonos: Tono[] }>("/api/tonos"),
  guardarTono: (tono: Tono) => pedir<{ tono: Tono }>(`/api/tonos/${tono.id}`, { method: "PUT", body: JSON.stringify(tono) }),
  voces: () => pedir<{ voces: Voz[] }>("/api/voces"),
  muestraVoz: (voz: string, velocidad: string) => `/api/voces/muestra?voz=${encodeURIComponent(voz)}&velocidad=${encodeURIComponent(velocidad)}`,
  pruebasVoz: () => pedir<{ muestras: Muestra[]; textos: Record<string, string> }>("/api/pruebas-voz"),
  generarPruebasVoz: (tono: string, voces: string[], texto?: string) => post<{ muestras: Muestra[] }>("/api/pruebas-voz", { tono, voces, texto }),
  config: () => pedir<{ marca: Marca; avisos: AvisoConfig[] }>("/api/config"),
  guardarConfig: (marca: Marca) => pedir<{ marca: Marca; avisos: AvisoConfig[] }>("/api/config", { method: "PUT", body: JSON.stringify({ marca }) }),
  claves: () => pedir<{ claves: EstadoClave[] }>("/api/claves"),
  guardarClave: (nombre: NombreClave, valor: string | null) => pedir<{ claves: EstadoClave[] }>(`/api/claves/${nombre}`, { method: "PUT", body: JSON.stringify({ valor }) }),
  probarClave: (nombre: NombreClave) => post<{ claves: EstadoClave[] }>(`/api/claves/${nombre}/probar`),
  credenciales: () => pedir<{ propias: EstadoCredencial[]; servicios: ServicioCredencial[] }>("/api/credenciales"),
  agregarCredencial: (p: PedidoCredencial) => post<{ integrada: string | null }>("/api/credenciales", p),
  editarCredencial: (id: string, p: Partial<PedidoCredencial>) => pedir(`/api/credenciales/${id}`, { method: "PUT", body: JSON.stringify(p) }),
  borrarCredencial: (id: string) => pedir(`/api/credenciales/${id}`, { method: "DELETE" }),
  probarCredencial: (id: string) => post(`/api/credenciales/${id}/probar`),
  usoGemini: () => pedir<UsoGemini>("/api/uso-gemini"),
  kokoro: () => pedir<EstadoKokoro>("/api/kokoro"),
  instalarKokoro: () => post<EstadoKokoro>("/api/kokoro/instalar"),
  transcripcion: () => pedir<{ modelos: ModeloTranscripcion[]; fasterWhisper: boolean }>("/api/transcripcion"),
  aprobarModelo: (modelo: IdModeloTranscripcion) => post<{ retomados: string[] }>("/api/transcripcion/aprobar", { modelo }),
  modeloCrudo: (id: string, modelo: IdModeloTranscripcion) => post(`/api/crudos/${id}/modelo`, { modelo }),
  espacio: () => pedir<{ jobs: number; trabajos: Record<string, EspacioTrabajo> }>("/api/espacio"),
  borrar: (ids: string[], modo: ModoBorrado, cancelarEnCurso = false) =>
    post<{ borrados: string[]; errores: { id: string; error: string }[]; liberados: number; jobs: number }>("/api/trabajos/borrar", { ids, modo, cancelarEnCurso }),
  recuperar: (ids: string[]) => post("/api/trabajos/recuperar", { ids }),
  vaciarCola: (cancelarEnCurso: boolean) => post<{ cancelados: string[] }>("/api/cola/vaciar", { cancelarEnCurso }),
  musica: () => pedir<{ pistas: Pista[] }>("/api/musica"),
  cambiarMusica: (id: string, cambio: { activa?: boolean; mood?: Mood; pista?: string; volumen?: number }) =>
    pedir<DetalleCrudo>(`/api/crudos/${id}/musica`, { method: "PUT", body: JSON.stringify(cambio) }),
  // ---------- biblioteca ----------
  biblioteca: () => pedir<EstadoBiblioteca>("/api/biblioteca"),
  crearCategoria: (nombre: string) => post<{ categoria: Categoria }>("/api/biblioteca/categorias", { nombre }),
  renombrarCategoria: (id: string, nombre: string) => pedir<{ categoria: Categoria }>(`/api/biblioteca/categorias/${id}`, { method: "PUT", body: JSON.stringify({ nombre }) }),
  borrarCategoria: (id: string, moverA: string | null) => pedir<{ movidos: number; borrados: number }>(`/api/biblioteca/categorias/${id}${moverA ? `?moverA=${encodeURIComponent(moverA)}` : ""}`, { method: "DELETE" }),
  editarRecurso: (id: string, cambio: CambioRecurso) => pedir<{ recurso: Recurso }>(`/api/biblioteca/recursos/${id}`, { method: "PUT", body: JSON.stringify(cambio) }),
  moverRecursos: (ids: string[], categoria: string) => post<{ movidos: number }>("/api/biblioteca/recursos/mover", { ids, categoria }),
  borrarRecursos: (ids: string[]) => post<{ borrados: number }>("/api/biblioteca/recursos/borrar", { ids }),
  importarCarpeta: (carpeta: string, op: OpcionesSubida) => post<{ importacion: EstadoImportacion }>("/api/biblioteca/importar-carpeta", { carpeta, ...op }),
  cancelarImportacion: () => post("/api/biblioteca/importar/cancelar"),
  describirClips: (pedido: { ids?: string[]; categoria?: string }) => post<{ descripcion: EstadoDescripcion }>("/api/biblioteca/describir", pedido),
  subirABiblioteca: (archivo: File, op: OpcionesSubida, nombre = archivo.name) =>
    pedir<ResultadoImportar>(`/api/biblioteca/subir?categoria=${encodeURIComponent(op.categoria)}&nombre=${encodeURIComponent(nombre)}&tipoAudio=${op.tipoAudio}&describir=${op.describir ? "1" : "0"}`, {
      method: "POST",
      body: archivo,
      headers: binario,
    }),
  opcionesCrudo: () => pedir<PedidoCrudo>("/api/crudos/opciones"),
  // los perfiles se completan con los valores por defecto: un campo que falte (o uno nuevo) no rompe las pantallas
  perfiles: async () => {
    const r = await pedir<{ perfiles: unknown[]; porDefecto?: string; ultimos?: { idea?: string; crudo?: string } }>("/api/perfiles");
    const perfiles = (Array.isArray(r.perfiles) ? r.perfiles : []).map(completarPerfil).filter((p): p is Perfil => p !== null);
    return { perfiles, porDefecto: r.porDefecto ?? "", ultimos: { idea: r.ultimos?.idea ?? "", crudo: r.ultimos?.crudo ?? "" } };
  },
  guardarPerfil: async (p: Perfil, nuevo = false) => conPerfilCompleto(await pedir<{ perfil: unknown }>(`/api/perfiles/${p.slug}${nuevo ? "?nuevo=1" : ""}`, { method: "PUT", body: JSON.stringify(p) })),
  borrarPerfil: (slug: string) => pedir(`/api/perfiles/${slug}`, { method: "DELETE" }),
  fotoPerfil: async (slug: string, archivo: File) => conPerfilCompleto(await pedir<{ perfil: unknown }>(`/api/perfiles/${slug}/foto`, { method: "PUT", body: archivo, headers: { "Content-Type": "application/octet-stream" } })),
  urlFotoPerfil: (p: Perfil) => (p.foto ? `/api/perfiles/${p.slug}/foto?v=${encodeURIComponent(p.foto)}-${Date.now() >> 16}` : null),
  crudo: (id: string) => pedir<DetalleCrudo>(`/api/crudos/${id}`),
  guardarCortes: (id: string, c: Pick<Cortes, "automatico" | "manual">) => pedir<DetalleCrudo>(`/api/crudos/${id}/cortes`, { method: "PUT", body: JSON.stringify(c) }),
  renderizarCrudo: (id: string) => post(`/api/crudos/${id}/renderizar`),
  quitarMaterial: (id: string, mid: string, quitar: boolean) => post<DetalleCrudo>(`/api/crudos/${id}/material/${mid}/quitar`, { quitar }),
  urlMaterial: (id: string, mid: string, url: string) => post<DetalleCrudo>(`/api/crudos/${id}/material/${mid}/url`, { url }),
  chromeMaterial: (id: string, mid: string) => post<DetalleCrudo>(`/api/crudos/${id}/material/${mid}/chrome`),
  imagenUrlMaterial: (id: string, mid: string, url: string) => post<DetalleCrudo>(`/api/crudos/${id}/material/${mid}/imagen-url`, { url }),
  imagenMaterial: (id: string, mid: string, archivo: File) =>
    pedir<DetalleCrudo>(`/api/crudos/${id}/material/${mid}/imagen`, { method: "PUT", body: archivo, headers: { "Content-Type": "application/octet-stream" } }),
  cambiarClipMaterial: (id: string, mid: string, clip: string) => post<DetalleCrudo>(`/api/crudos/${id}/material/${mid}/clip`, { clip }),
  busquedaMaterial: (id: string, mid: string, busqueda: string) => post<DetalleCrudo>(`/api/crudos/${id}/material/${mid}/busqueda`, { busqueda }),
  capturaMaterial: (id: string, mid: string, archivo: File) =>
    pedir<DetalleCrudo>(`/api/crudos/${id}/material/${mid}/captura`, { method: "PUT", body: archivo, headers: { "Content-Type": "application/octet-stream" } }),
  // ---------- kit de marca ----------
  kit: (slug: string) => pedir<{ kit: Kit | null; reglas: ReglasMarca | null; marcaMd: string | null; resumen: string | null }>(`/api/perfiles/${slug}/kit`),
  kitPreviaCarpeta: (slug: string, carpeta: string) => post<{ kit: Kit; resumen: string }>(`/api/perfiles/${slug}/kit/previa`, { carpeta }),
  kitPreviaZip: (slug: string, zip: File) => pedir<{ kit: Kit; resumen: string }>(`/api/perfiles/${slug}/kit/previa?nombre=${encodeURIComponent(zip.name)}`, { method: "POST", body: zip, headers: binario }),
  kitConfirmar: (slug: string) => post<{ kit: Kit; reglas: ReglasMarca; desdeManual: boolean; resumen: string }>(`/api/perfiles/${slug}/kit/confirmar`),
  kitQuitar: (slug: string) => pedir(`/api/perfiles/${slug}/kit`, { method: "DELETE" }),
  kitFoto: async (slug: string, avatar: string) => conPerfilCompleto(await post<{ perfil: unknown }>(`/api/perfiles/${slug}/kit/foto`, { avatar })),
  renombrarPerfil: (slug: string, nuevo: string) => post<{ trabajos: string[] }>(`/api/perfiles/${slug}/renombrar`, { nuevo }),
  // ---------- Mi voz ----------
  voz: (id: string) => pedir<DetalleVoz>(`/api/voz/${id}`),
  subirVoz: (id: string, audio: Blob, nombre: string, forma: "archivo" | "navegador") =>
    pedir<DetalleVoz>(`/api/voz/${id}/archivo?nombre=${encodeURIComponent(nombre)}&forma=${forma}`, { method: "PUT", body: audio, headers: binario }),
  subirTomaEscena: (id: string, n: number, audio: Blob, nombre: string) => pedir<DetalleVoz>(`/api/voz/${id}/escenas/${n}?nombre=${encodeURIComponent(nombre)}`, { method: "PUT", body: audio, headers: binario }),
  tomasListas: (id: string) => post<DetalleVoz>(`/api/voz/${id}/escenas/listo`),
  guardarCortesVoz: (id: string, c: Pick<Cortes, "automatico" | "manual">) => pedir<DetalleVoz>(`/api/voz/${id}/cortes`, { method: "PUT", body: JSON.stringify(c) }),
  aprobarVoz: (id: string) => post(`/api/voz/${id}/aprobar`),
  regrabarVoz: (id: string) => post<DetalleVoz>(`/api/voz/${id}/regrabar`),
};

/** Nombre legible de la variante de una voz. */
export const PAISES: Record<string, string> = {
  gemini: "Gemini (principal, necesita clave)",
  "es-UY": "Uruguay",
  "es-AR": "Argentina",
  "es-ES": "España",
  "es-MX": "México",
  "es-CO": "Colombia",
  "es-CL": "Chile",
  "es-PE": "Perú",
  "es-US": "EE. UU.",
};

export const nombreVoz = (id: string) => {
  if (id.startsWith("gemini:")) return `${id.slice(7)} (Gemini)`;
  const m = /^es-[A-Z]{2}-(\w+?)(Multilingual)?Neural$/.exec(id);
  return m ? m[1]! : id;
};

/** Copia al portapapeles; funciona también por http desde el celular (donde no existe navigator.clipboard). */
export const copiar = async (texto: string) => {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(texto);
      return;
    } catch {
      // permiso denegado: probar el método clásico
    }
  }
  const area = document.createElement("textarea");
  area.value = texto;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  if (!ok) throw new Error("No se pudo copiar: seleccioná el texto y copialo a mano.");
};
