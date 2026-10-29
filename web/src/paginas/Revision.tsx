import { ArrowLeft, Check, RefreshCw, Save, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GuionSchema, MAX_TITULARES, NOMBRES_PLANTILLAS, PropsPorPlantilla, type Escena, type Guion, type Marca, type NombrePlantilla, type Tono } from "../../../src/shared/schemas";
import { velocidadDe, visualDe } from "../../../src/shared/tonos";
import { api, type DetalleTrabajo } from "../api";
import { ir, useAviso } from "../App";
import { Insignia } from "../componentes/TarjetaTrabajo";
import { VistaPrevia } from "../componentes/VistaPrevia";
import { useMotor } from "../motor";

export const NOMBRE_PLANTILLA: Record<NombrePlantilla, string> = {
  titular: "Titular",
  dato_numero: "Dato con número",
  lista: "Lista",
  comparacion: "Comparación A vs B",
  cita: "Cita",
  linea_tiempo: "Línea de tiempo",
  grafico: "Gráfico",
  mapa: "Mapa",
  icono_texto: "Ícono + texto",
  stock_video: "Video de stock",
  cierre_cta: "Cierre (seguime)",
  foto_real: "Foto real",
  escena_ilustrada: "Escena ilustrada",
  clip_biblioteca: "Clip de la biblioteca",
};

const contarPalabras = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Palabras por segundo de la voz a una velocidad dada (medido con edge-tts: ~2,7 a +0 %). */
const palabrasPorSegundo = (velocidad: string) => 2.7 * (1 + (Number.parseInt(velocidad, 10) || 0) / 100);

/** Props mínimas válidas al cambiar de plantilla (para que la escena no quede rota). */
const propsPorDefecto = (p: NombrePlantilla, e: Escena): Escena["props"] => {
  const corto = e.narracion.split(/[.!?]/)[0]!.split(/\s+/).slice(0, 8).join(" ") || "Texto";
  const previo = e.props as Record<string, unknown>;
  const texto = typeof previo.texto === "string" ? previo.texto : corto;
  const numero = Number(/\d+([.,]\d+)?/.exec(e.narracion)?.[0]?.replace(",", ".") ?? 100);
  const base: Record<NombrePlantilla, Escena["props"]> = {
    titular: { texto },
    dato_numero: { numero, contexto: texto },
    lista: { items: ["Primer punto", "Segundo punto"] },
    comparacion: { a: { etiqueta: "A" }, b: { etiqueta: "B" } },
    cita: { texto, autor: "Autor" },
    linea_tiempo: { eventos: [{ fecha: "2000", texto: "Primer hecho" }, { fecha: "2024", texto: "Hoy" }] },
    grafico: { tipo: "barras", datos: [{ etiqueta: "A", valor: 60 }, { etiqueta: "B", valor: 40 }], unidad: "%" },
    mapa: { pais: "URY", etiqueta: "Uruguay" },
    icono_texto: { icono: "sparkles", texto },
    stock_video: { texto },
    cierre_cta: { remate: texto },
    foto_real: { texto, que_debe_verse: texto, imagenes: [] },
    clip_biblioteca: { clip: typeof previo.clip === "string" ? previo.clip : "", texto },
    escena_ilustrada: { escenario: "ciudad_dia", personajes: [{ id: "narrador", lugar: "centro", accion: "hablar", habla: true }], objetos: [], camara: "parallax", beats: [] },
  };
  return base[p];
};

/** Error de validación de las props de una escena (o null). */
const errorProps = (e: Escena) => {
  const r = PropsPorPlantilla[e.plantilla].safeParse(e.props);
  return r.success ? null : r.error.issues.map((i) => `${i.path.join(".") || "datos"}: ${i.message}`).join(" · ");
};

export const Revision: React.FC<{ id: string }> = ({ id }) => {
  const avisar = useAviso();
  const { trabajos } = useMotor();
  const [detalle, setDetalle] = useState<DetalleTrabajo | null>(null);
  const [guion, setGuion] = useState<Guion | null>(null);
  const [marca, setMarca] = useState<Marca | null>(null);
  const [tonos, setTonos] = useState<Tono[]>([]);
  const [cambios, setCambios] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [instruccion, setInstruccion] = useState("");
  const estadoVivo = trabajos.find((t) => t.id === id);

  const cargar = useCallback(async () => {
    try {
      const d = await api.trabajo(id);
      setDetalle(d);
      setGuion(d.guion);
      setCambios(false);
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  }, [id, avisar]);

  useEffect(() => {
    void cargar();
    api
      .config()
      .then((c) => setMarca(c.marca))
      .catch(() => undefined);
    api
      .tonos()
      .then((r) => setTonos(r.tonos))
      .catch(() => undefined);
  }, [cargar]);
  const tono = marca ? (tonos.find((t) => t.id === (detalle?.estado.opciones.tono ?? marca.tonoPorDefecto)) ?? null) : null;
  const visual = useMemo(() => (marca ? visualDe(marca, tono) : null), [marca, tono]);

  // cuando el guion termina de (re)generarse, recargar
  useEffect(() => {
    if (estadoVivo?.estado === "esperando_revision" && detalle && detalle.estado.estado !== "esperando_revision" && !cambios) void cargar();
  }, [estadoVivo?.estado, detalle, cambios, cargar]);

  const escenas = guion?.escenas ?? [];
  const pps = palabrasPorSegundo(marca ? velocidadDe(marca, tono) : "+8%");
  const palabras = escenas.reduce((n, e) => n + contarPalabras(e.narracion), 0);
  const segundos = palabras / pps + escenas.length * 0.38;
  const fueraDeRango = marca ? segundos < marca.duracionMin || segundos > marca.duracionMax : false;
  const titulares = escenas.filter((e) => e.plantilla === "titular").length;
  const valido = useMemo(() => (guion ? GuionSchema.safeParse(guion) : null), [guion]);

  const editar = (fn: (g: Guion) => Guion) => {
    setGuion((g) => (g ? fn(g) : g));
    setCambios(true);
  };
  const editarEscena = (i: number, fn: (e: Escena) => Escena) => editar((g) => ({ ...g, escenas: g.escenas.map((e, k) => (k === i ? fn(e) : e)) }));

  const guardar = async () => {
    if (!guion) return false;
    if (valido && !valido.success) {
      avisar(`Hay errores en el guion: ${valido.error.issues[0]?.message ?? ""}`, "error");
      return false;
    }
    setOcupado("guardar");
    try {
      const d = await api.guardarGuion(id, guion);
      setDetalle(d);
      setGuion(d.guion);
      setCambios(false);
      return true;
    } catch (e) {
      avisar((e as Error).message, "error");
      return false;
    } finally {
      setOcupado(null);
    }
  };

  const aprobar = async () => {
    if (cambios && !(await guardar())) return;
    setOcupado("aprobar");
    try {
      await api.aprobar(id);
      avisar("¡Aprobado! Ahora vienen la voz, las animaciones y el render.", "ok");
      ir("animados/cola");
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setOcupado(null);
    }
  };

  const regenerarTodo = async () => {
    if (cambios && !window.confirm("Tenés cambios sin guardar que se van a perder. ¿Regenerar igual?")) return;
    setOcupado("regenerar");
    try {
      await api.regenerarGuion(id, instruccion || undefined);
      avisar("Escribiendo un guion nuevo (tarda alrededor de un minuto)…", "info");
      setCambios(false);
      await cargar();
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setOcupado(null);
    }
  };

  const regenerarEscena = async (i: number, indicacion: string) => {
    if (cambios && !(await guardar())) return;
    setOcupado(`escena-${i}`);
    try {
      const d = await api.regenerarEscena(id, i, indicacion || undefined);
      setDetalle(d);
      setGuion(d.guion);
      setCambios(false);
      avisar(`Escena ${i + 1} reescrita.`, "ok");
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setOcupado(null);
    }
  };

  if (!detalle) return <div className="vacio">Cargando…</div>;
  const estado = estadoVivo?.estado ?? detalle.estado.estado;
  const generando = estado === "trabajando" && estadoVivo?.pasos.guion === "en_curso";

  return (
    <>
      <a className="boton chico" href="#/animados/cola" style={{ marginBottom: 16 }}>
        <ArrowLeft size={16} /> Volver a la cola
      </a>
      <div className="encabezado">
        <div style={{ minWidth: 0 }}>
          <h1 style={{ overflowWrap: "anywhere" }}>Revisá el guion</h1>
          <p>
            {detalle.estado.idea}
            {tono ? ` · Tono ${tono.nombre}` : ""} · <Insignia estado={estado} />
          </p>
        </div>
      </div>

      {generando || !guion ? (
        <div className="tarjeta vacio">
          <span className="girando" style={{ width: 28, height: 28 }} />
          <p>{generando ? "Claude está investigando y escribiendo el guion…" : "Este trabajo todavía no tiene guion."}</p>
        </div>
      ) : (
        <div className="dos-columnas">
          <div>
            <section className="tarjeta">
              <div className="metricas">
                <span>
                  <b>{escenas.length}</b> escenas
                </span>
                <span>
                  <b>{palabras}</b> palabras
                </span>
                <span className={fueraDeRango ? "fuera" : ""}>
                  ≈ <b>{Math.round(segundos)} s</b> {marca ? `(objetivo ${marca.duracionMin}–${marca.duracionMax} s)` : ""}
                </span>
                <span className={titulares > MAX_TITULARES ? "fuera" : ""}>
                  <b>{titulares}</b> de {MAX_TITULARES} titulares
                </span>
              </div>
              {valido && !valido.success ? <div className="aviso">{valido.error.issues.map((i) => i.message).slice(0, 3).join(" · ")}</div> : null}
              <div className="rejilla-2" style={{ marginTop: 16 }}>
                <label className="campo">
                  <span>Título de la portada</span>
                  <input type="text" value={guion.titulo_portada} onChange={(e) => editar((g) => ({ ...g, titulo_portada: e.target.value }))} />
                </label>
                <label className="campo">
                  <span>Título interno</span>
                  <input type="text" value={guion.titulo} onChange={(e) => editar((g) => ({ ...g, titulo: e.target.value }))} />
                </label>
              </div>
            </section>

            {escenas.map((e, i) => (
              <EditorEscena
                key={i}
                i={i}
                e={e}
                pps={pps}
                ocupado={ocupado === `escena-${i}`}
                bloqueado={ocupado !== null}
                onCambio={(fn) => editarEscena(i, fn)}
                onRegenerar={(ind) => void regenerarEscena(i, ind)}
              />
            ))}

            <section className="tarjeta">
              <label className="campo">
                <span>Texto de la publicación</span>
                <textarea rows={4} value={guion.texto_publicacion} onChange={(e) => editar((g) => ({ ...g, texto_publicacion: e.target.value }))} />
              </label>
              <span className="etiqueta">Fuentes ({guion.fuentes.length})</span>
              <ul className="fuentes" style={{ marginTop: 8 }}>
                {guion.fuentes.map((f, k) => (
                  <li key={k}>
                    <a href={f.url} target="_blank" rel="noreferrer">
                      {f.titulo}
                    </a>
                  </li>
                ))}
              </ul>
              {guion.referencia_gancho ? (
                <p className="ayuda">
                  Gancho: {guion.referencia_gancho.referencia} —{" "}
                  <a href={guion.referencia_gancho.fuente.url} target="_blank" rel="noreferrer">
                    {guion.referencia_gancho.fuente.titulo}
                  </a>
                </p>
              ) : null}
            </section>
          </div>

          <aside className="columna-fija">
            <section className="tarjeta">
              <div className="fila" style={{ flexDirection: "column", alignItems: "stretch" }}>
                <button className="boton primario grande" disabled={ocupado !== null || (valido ? !valido.success : true)} onClick={() => void aprobar()}>
                  {ocupado === "aprobar" ? <span className="girando" /> : <Check size={20} />}
                  {estado === "listo" ? "Guardar y rehacer video" : "Aprobar y crear video"}
                </button>
                <button className="boton" disabled={!cambios || ocupado !== null} onClick={() => void guardar()}>
                  {ocupado === "guardar" ? <span className="girando" /> : <Save size={18} />} {cambios ? "Guardar cambios" : "Sin cambios"}
                </button>
              </div>
              <details style={{ marginTop: 12 }}>
                <summary>Regenerar todo el guion</summary>
                <input type="text" placeholder="Indicación opcional (ej. más corto, más humor)" value={instruccion} onChange={(e) => setInstruccion(e.target.value)} style={{ margin: "8px 0" }} />
                <button className="boton chico" disabled={ocupado !== null} onClick={() => void regenerarTodo()}>
                  {ocupado === "regenerar" ? <span className="girando" /> : <RefreshCw size={16} />} Regenerar guion
                </button>
              </details>
            </section>
            {visual ? (
              <section className="tarjeta">
                <span className="etiqueta">Vista previa (sin voz: los tiempos son aproximados)</span>
                <div style={{ marginTop: 10, maxWidth: 300, marginInline: "auto" }}>
                  <VistaPrevia escenas={escenas} marca={visual} autoPlay={false} />
                </div>
              </section>
            ) : null}
          </aside>
        </div>
      )}
    </>
  );
};

const CAMPOS_TEXTO: Record<string, string> = {
  texto: "Texto en pantalla",
  subtitulo: "Subtítulo",
  contexto: "Contexto",
  titulo: "Título",
  remate: "Remate",
  pregunta: "Pregunta",
  autor: "Autor",
  fecha: "Fecha",
  unidad: "Unidad",
  prefijo: "Prefijo",
  icono: "Ícono (nombre de Lucide, ej. landmark)",
  etiqueta: "Etiqueta",
  dato: "Dato",
  pais: "País (ISO, ej. URY)",
  numero: "Número",
};

const EditorEscena: React.FC<{
  i: number;
  e: Escena;
  pps: number;
  ocupado: boolean;
  bloqueado: boolean;
  onCambio: (fn: (e: Escena) => Escena) => void;
  onRegenerar: (indicacion: string) => void;
}> = ({ i, e, pps, ocupado, bloqueado, onCambio, onRegenerar }) => {
  const [json, setJson] = useState(() => JSON.stringify(e.props, null, 2));
  const [errorJson, setErrorJson] = useState<string | null>(null);
  const [indicacion, setIndicacion] = useState("");
  useEffect(() => setJson(JSON.stringify(e.props, null, 2)), [e.props]);
  const n = contarPalabras(e.narracion);
  const props = e.props as Record<string, unknown>;
  const simples = Object.entries(props).filter(([k, v]) => k in CAMPOS_TEXTO && (typeof v === "string" || typeof v === "number"));
  const error = errorProps(e);

  const cambiarProp = (k: string, v: string) =>
    onCambio((esc) => ({ ...esc, props: { ...(esc.props as Record<string, unknown>), [k]: typeof props[k] === "number" ? Number(v.replace(",", ".")) : v } }) as Escena);

  return (
    <section className="tarjeta escena">
      <div className="escena-numero">{i + 1}</div>
      <div style={{ minWidth: 0 }}>
        <div className="fila" style={{ marginBottom: 12 }}>
          <select
            className="crece"
            value={e.plantilla}
            aria-label="Plantilla"
            onChange={(ev) => {
              const p = ev.target.value as NombrePlantilla;
              onCambio((esc) => ({ ...esc, plantilla: p, props: propsPorDefecto(p, esc) }) as Escena);
            }}
          >
            {NOMBRES_PLANTILLAS.map((p) => (
              <option key={p} value={p}>
                {NOMBRE_PLANTILLA[p]}
              </option>
            ))}
          </select>
          <span className="metricas">
            <span>
              <b>{n}</b> palabras · ≈ <b>{(n / pps + 0.38).toFixed(1)} s</b>
            </span>
          </span>
        </div>
        <label className="campo">
          <span>Lo que dice la voz</span>
          <textarea rows={3} value={e.narracion} onChange={(ev) => onCambio((esc) => ({ ...esc, narracion: ev.target.value }))} />
        </label>
        {simples.length ? (
          <div className="rejilla-2">
            {simples.map(([k, v]) => (
              <label key={k} className="campo">
                <span>{CAMPOS_TEXTO[k]}</span>
                <input type="text" value={String(v)} onChange={(ev) => cambiarProp(k, ev.target.value)} />
              </label>
            ))}
          </div>
        ) : null}
        <label className="campo">
          <span>Palabras a resaltar (separadas por coma)</span>
          <input
            type="text"
            value={e.palabras_enfasis.join(", ")}
            onChange={(ev) => onCambio((esc) => ({ ...esc, palabras_enfasis: ev.target.value.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 6) }))}
          />
        </label>
        <details>
          <summary>Datos de la animación (avanzado)</summary>
          <textarea
            className="mono"
            rows={Math.min(14, json.split("\n").length + 1)}
            value={json}
            onChange={(ev) => setJson(ev.target.value)}
            onBlur={() => {
              try {
                const p = JSON.parse(json) as Escena["props"];
                setErrorJson(null);
                onCambio((esc) => ({ ...esc, props: p }) as Escena);
              } catch {
                setErrorJson("No es un JSON válido: revisá comas y comillas.");
              }
            }}
          />
          {errorJson ? <div className="aviso">{errorJson}</div> : null}
        </details>
        {error ? <div className="aviso">Esta escena tiene datos inválidos para «{NOMBRE_PLANTILLA[e.plantilla]}»: {error}</div> : null}
        <div className="fila" style={{ marginTop: 12 }}>
          <input className="crece" type="text" placeholder="Indicación para reescribirla (opcional)" value={indicacion} onChange={(ev) => setIndicacion(ev.target.value)} />
          <button className="boton chico" disabled={bloqueado} onClick={() => onRegenerar(indicacion)}>
            {ocupado ? <span className="girando" /> : <Wand2 size={16} />} {ocupado ? "Reescribiendo…" : "Regenerar esta escena"}
          </button>
        </div>
      </div>
    </section>
  );
};
