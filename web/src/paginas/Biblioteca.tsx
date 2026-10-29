import { Check, Film, FolderInput, FolderPlus, Music, Pause, Pencil, Play, Save, Search, Sparkles, Trash2, Upload, Volume2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { coincideBusqueda, IDS_TIPOS_RECURSO, TIPOS_RECURSO, type EtiquetasClip } from "../../../src/shared/biblioteca";
import { MOODS, type Mood } from "../../../src/shared/opcionesCrudo";
import { api, type Categoria, type EstadoBiblioteca, type OpcionesSubida, type Recurso, type TipoRecurso } from "../api";
import { useAviso } from "../App";

export const urlRecurso = (r: Pick<Recurso, "archivo">) => `/biblioteca-medios/${r.archivo.split("/").map(encodeURIComponent).join("/")}`;
export const urlMiniatura = (r: Pick<Recurso, "id">) => `/biblioteca-mini/${r.id}.jpg`;

const seg = (s: number) => (s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
const ICONO_TIPO: Record<TipoRecurso, React.ReactNode> = { video: <Film size={16} />, musica: <Music size={16} />, sfx: <Volume2 size={16} /> };
const ETIQUETAS: { clave: keyof EtiquetasClip; nombre: string }[] = [
  { clave: "personas", nombre: "Personas" },
  { clave: "lugar", nombre: "Lugar" },
  { clave: "objetos", nombre: "Objetos" },
  { clave: "accion", nombre: "Acción" },
  { clave: "mood", nombre: "Mood" },
];
const ORDENES = { nuevos: "Más nuevos", nombre: "Nombre", duracion: "Duración" } as const;
const POR_PAGINA = 60;

/** Un solo audio sonando a la vez en toda la pantalla. */
const useReproductor = () => {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [sonando, setSonando] = useState<string | null>(null);
  useEffect(() => () => audio.current?.pause(), []);
  const alternar = (r: Recurso) => {
    audio.current?.pause();
    if (sonando === r.id) return setSonando(null);
    audio.current = new Audio(urlRecurso(r));
    audio.current.volume = 0.6;
    audio.current.onended = () => setSonando(null);
    void audio.current.play();
    setSonando(r.id);
  };
  return { sonando, alternar };
};

/** Editar nombre, descripción y etiquetas de un recurso. */
const Edicion: React.FC<{ r: Recurso; onGuardar: (cambio: Parameters<typeof api.editarRecurso>[1]) => void; onCancelar: () => void }> = ({ r, onGuardar, onCancelar }) => {
  const [nombre, setNombre] = useState(r.nombre);
  const [descripcion, setDescripcion] = useState(r.descripcion);
  const [etiquetas, setEtiquetas] = useState(() => Object.fromEntries(ETIQUETAS.map(({ clave }) => [clave, r.etiquetas[clave].join(", ")])) as Record<keyof EtiquetasClip, string>);
  const lista = (t: string) => t.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  return (
    <div className="edicion-recurso">
      <label className="campo">
        <span>Nombre</span>
        <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </label>
      {r.tipo === "video" ? (
        <>
          <label className="campo">
            <span>Descripción</span>
            <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} />
          </label>
          {ETIQUETAS.map(({ clave, nombre: n }) => (
            <label key={clave} className="campo">
              <span>{n} (separadas por coma)</span>
              <input type="text" value={etiquetas[clave]} onChange={(e) => setEtiquetas({ ...etiquetas, [clave]: e.target.value })} />
            </label>
          ))}
        </>
      ) : null}
      <div className="fila" style={{ gap: 6 }}>
        <button
          className="boton primario chico"
          onClick={() =>
            onGuardar(r.tipo === "video" ? { nombre, descripcion, etiquetas: Object.fromEntries(ETIQUETAS.map(({ clave }) => [clave, lista(etiquetas[clave])])) as EtiquetasClip } : { nombre })
          }
        >
          <Save size={14} /> Guardar
        </button>
        <button className="boton chico" onClick={onCancelar}>
          <X size={14} /> Cancelar
        </button>
      </div>
    </div>
  );
};

type AccionesRecurso = {
  categorias: Categoria[];
  elegido: boolean;
  onElegir: () => void;
  onCambio: (cambio: Parameters<typeof api.editarRecurso>[1]) => void;
  onBorrar: () => void;
};

/** Tarjeta de un clip: miniatura que se reproduce al pasar el mouse (o al tocarla), datos y acciones. */
const TarjetaVideo: React.FC<{ r: Recurso } & AccionesRecurso> = ({ r, categorias, elegido, onElegir, onCambio, onBorrar }) => {
  const [encima, setEncima] = useState(false);
  const [editando, setEditando] = useState(false);
  return (
    <article className={`clip ${elegido ? "elegido" : ""}`} onMouseEnter={() => setEncima(true)} onMouseLeave={() => setEncima(false)}>
      <div className={`clip-media ${r.orientacion ?? ""}`} onClick={() => setEncima((v) => !v)}>
        {encima ? <video src={urlRecurso(r)} autoPlay muted={false} loop playsInline controls /> : <img src={urlMiniatura(r)} alt="" loading="lazy" />}
        <span className="clip-dur">{seg(r.duracion)}</span>
        <label className="clip-check" onClick={(e) => e.stopPropagation()} title="Elegir para mover o borrar varios">
          <input type="checkbox" checked={elegido} onChange={onElegir} />
        </label>
      </div>
      <div className="clip-cuerpo">
        {editando ? (
          <Edicion
            r={r}
            onCancelar={() => setEditando(false)}
            onGuardar={(c) => {
              onCambio(c);
              setEditando(false);
            }}
          />
        ) : (
          <>
            <b title={r.origen}>{r.nombre}</b>
            <small className="ayuda">
              {r.ancho}×{r.alto} · {r.audio ? "con audio" : "sin audio"}
              {r.descripcionPor === "claude" ? " · descripto por Claude" : r.descripcionPor === "manual" ? " · editado a mano" : ""}
            </small>
            {r.descripcion ? <p className="clip-desc">{r.descripcion}</p> : null}
            {r.transcripcion ? <p className="clip-dice">«{r.transcripcion.length > 120 ? `${r.transcripcion.slice(0, 120)}…` : r.transcripcion}»</p> : null}
            <div className="chips">
              {ETIQUETAS.flatMap(({ clave }) => r.etiquetas[clave].map((t) => ({ clave, t })))
                .slice(0, 6)
                .map(({ clave, t }) => (
                  <span key={`${clave}-${t}`} className={`chip ${clave}`}>
                    {t}
                  </span>
                ))}
            </div>
            <div className="fila acciones-recurso">
              <select value={r.categoria} onChange={(e) => onCambio({ categoria: e.target.value })} aria-label="Mover a otra categoría">
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
              <button className="boton chico icono" onClick={() => setEditando(true)} title="Renombrar o editar la descripción" aria-label="Editar">
                <Pencil size={14} />
              </button>
              <button className="boton chico icono peligro" onClick={onBorrar} title="Borrar de la biblioteca" aria-label="Borrar">
                <Trash2 size={14} />
              </button>
            </div>
          </>
        )}
      </div>
    </article>
  );
};

/** Fila de un audio (música o efecto): escuchar, renombrar, mood, tipo, categoría y borrar. */
const FilaAudio: React.FC<{ r: Recurso; sonando: boolean; onEscuchar: () => void } & AccionesRecurso> = ({ r, sonando, onEscuchar, categorias, elegido, onElegir, onCambio, onBorrar }) => {
  const [editando, setEditando] = useState(false);
  return (
    <li className={elegido ? "activa" : ""}>
      <input type="checkbox" checked={elegido} onChange={onElegir} aria-label="Elegir" />
      <button className="boton-icono" onClick={onEscuchar} aria-label={sonando ? "Pausar" : "Escuchar"}>
        {sonando ? <Pause size={16} /> : <Play size={16} />}
      </button>
      {editando ? (
        <span>
          <Edicion
            r={r}
            onCancelar={() => setEditando(false)}
            onGuardar={(c) => {
              onCambio(c);
              setEditando(false);
            }}
          />
        </span>
      ) : (
        <span>
          {r.nombre}
          <small>
            {seg(r.duracion)} · {r.origen}
          </small>
        </span>
      )}
      {r.tipo === "musica" ? (
        <select value={r.mood ?? "chill"} onChange={(e) => onCambio({ mood: e.target.value as Mood })} aria-label="Ánimo" title="Ánimo: con este se elige automáticamente">
          {MOODS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </select>
      ) : null}
      <select value={r.tipo} onChange={(e) => onCambio({ tipo: e.target.value as "musica" | "sfx" })} aria-label="Tipo de audio">
        <option value="musica">Música</option>
        <option value="sfx">Efecto</option>
      </select>
      <select value={r.categoria} onChange={(e) => onCambio({ categoria: e.target.value })} aria-label="Categoría">
        {categorias.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
      <button className="boton chico icono" onClick={() => setEditando(true)} aria-label="Renombrar" title="Renombrar">
        <Pencil size={14} />
      </button>
      <button className="boton chico icono peligro" onClick={onBorrar} aria-label="Borrar" title="Borrar de la biblioteca">
        <Trash2 size={14} />
      </button>
    </li>
  );
};

/** Subir archivos o una carpeta (desde el navegador) o importar una carpeta de esta compu por su ruta. */
const Importar: React.FC<{ categorias: Categoria[]; categoria: string; onTerminado: () => void }> = ({ categorias, categoria, onTerminado }) => {
  const avisar = useAviso();
  const [op, setOp] = useState<OpcionesSubida>({ categoria: categoria || categorias[0]?.id || "", tipoAudio: "auto", describir: false });
  const [ruta, setRuta] = useState("");
  const [subiendo, setSubiendo] = useState<{ hechos: number; total: number; nuevos: number; repetidos: number } | null>(null);
  const archivos = useRef<HTMLInputElement>(null);
  const carpeta = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (categoria) setOp((o) => ({ ...o, categoria }));
  }, [categoria]);

  const subir = async (lista: FileList | null) => {
    const compatibles = [...(lista ?? [])].filter((f) => /\.(mp4|mov|m4v|webm|mkv|avi|mp3|m4a|wav|ogg|oga|flac|aac|opus)$/i.test(f.name));
    if (!compatibles.length) return avisar("No hay videos ni audios compatibles en lo que elegiste.", "error");
    const estado = { hechos: 0, total: compatibles.length, nuevos: 0, repetidos: 0 };
    setSubiendo({ ...estado });
    const errores: string[] = [];
    for (const f of compatibles) {
      try {
        // en una carpeta subida, la ruta relativa da las etiquetas (subcarpetas)
        const r = await api.subirABiblioteca(f, op, f.webkitRelativePath || f.name);
        if (r.estado === "importado") estado.nuevos++;
        else if (r.estado === "duplicado") estado.repetidos++;
        else errores.push(`${f.name}: ${r.error ?? r.estado}`);
      } catch (e) {
        errores.push(`${f.name}: ${(e as Error).message}`);
      }
      estado.hechos++;
      setSubiendo({ ...estado });
    }
    setSubiendo(null);
    avisar(`${estado.nuevos} importado(s)${estado.repetidos ? `, ${estado.repetidos} ya estaban (no se duplicaron)` : ""}${errores.length ? `, ${errores.length} con error` : ""}.`, errores.length ? "error" : "ok");
    onTerminado();
  };

  const importarRuta = async () => {
    try {
      await api.importarCarpeta(ruta, op);
      setRuta("");
      onTerminado();
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };

  return (
    <section className="tarjeta importar">
      <h2>Agregar a la biblioteca</h2>
      <div className="rejilla-2" style={{ marginTop: 10 }}>
        <label className="campo">
          <span>Categoría de destino</span>
          <select value={op.categoria} onChange={(e) => setOp({ ...op, categoria: e.target.value })}>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Los audios van como</span>
          <select value={op.tipoAudio} onChange={(e) => setOp({ ...op, tipoAudio: e.target.value as OpcionesSubida["tipoAudio"] })}>
            <option value="auto">Automático (menos de 20 s = efecto)</option>
            <option value="musica">Música</option>
            <option value="sfx">Efectos de sonido</option>
          </select>
        </label>
      </div>
      <label className="interruptor" style={{ marginBottom: 12 }}>
        <input type="checkbox" checked={op.describir} onChange={(e) => setOp({ ...op, describir: e.target.checked })} />
        Describir cada clip con Claude (mejor elección, pero un pedido por clip)
      </label>
      <div className="fila">
        <input ref={archivos} type="file" multiple hidden accept="video/*,audio/*" onChange={(e) => void subir(e.target.files).finally(() => (e.target.value = ""))} />
        <input
          ref={carpeta}
          type="file"
          hidden
          // @ts-expect-error: atributo no estándar para elegir una carpeta entera
          webkitdirectory=""
          onChange={(e) => void subir(e.target.files).finally(() => (e.target.value = ""))}
        />
        <button className="boton" disabled={Boolean(subiendo) || !op.categoria} onClick={() => archivos.current?.click()}>
          <Upload size={18} /> Subir videos o audios
        </button>
        <button className="boton" disabled={Boolean(subiendo) || !op.categoria} onClick={() => carpeta.current?.click()}>
          <FolderInput size={18} /> Subir una carpeta
        </button>
      </div>
      {subiendo ? (
        <div style={{ marginTop: 10 }}>
          <div className="progreso">
            <div style={{ width: `${(subiendo.hechos / subiendo.total) * 100}%` }} />
          </div>
          <span className="ayuda">
            {subiendo.hechos} de {subiendo.total} · {subiendo.nuevos} nuevos · {subiendo.repetidos} repetidos
          </span>
        </div>
      ) : null}
      <div className="fila" style={{ marginTop: 12 }}>
        <input className="crece" type="text" placeholder="O la ruta de una carpeta de esta compu (ej. ~/Descargas/memes)" value={ruta} onChange={(e) => setRuta(e.target.value)} />
        <button className="boton" disabled={!ruta.trim() || !op.categoria} onClick={() => void importarRuta()}>
          <FolderInput size={18} /> Importar carpeta
        </button>
      </div>
      <p className="ayuda">Todo se copia a la carpeta biblioteca/ del proyecto (el original no se toca). Los archivos repetidos se detectan por su contenido y no se importan dos veces.</p>
    </section>
  );
};

/** Biblioteca: clips, música y efectos en categorías propias. */
export const BibliotecaPagina: React.FC = () => {
  const avisar = useAviso();
  const [b, setB] = useState<EstadoBiblioteca | null>(null);
  const [tipo, setTipo] = useState<TipoRecurso>("video");
  const [categoria, setCategoria] = useState<string>("");
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<keyof typeof ORDENES>("nuevos");
  const [soloSinDescribir, setSoloSinDescribir] = useState(false);
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [mostrar, setMostrar] = useState(POR_PAGINA);
  const [nueva, setNueva] = useState<string | null>(null);
  const [renombrando, setRenombrando] = useState<string | null>(null);
  const [borrandoCat, setBorrandoCat] = useState<Categoria | null>(null);
  const reproductor = useReproductor();

  const cargar = useCallback(async () => setB(await api.biblioteca()), []);
  useEffect(() => {
    cargar().catch((e: Error) => avisar(e.message, "error"));
  }, [cargar, avisar]);
  const ocupada = b?.importacion.activa || b?.descripcion.activa;
  useEffect(() => {
    if (!ocupada) return;
    const i = setInterval(() => void cargar().catch(() => undefined), 2000);
    return () => clearInterval(i);
  }, [ocupada, cargar]);
  useEffect(() => setMostrar(POR_PAGINA), [tipo, categoria, busqueda, orden, soloSinDescribir]);

  const visibles = useMemo(() => {
    const lista = (b?.recursos ?? []).filter((r) => r.tipo === tipo && (!categoria || r.categoria === categoria) && coincideBusqueda(r, busqueda) && (!soloSinDescribir || r.descripcionPor === "nombre"));
    const cmp = { nuevos: (x: Recurso, y: Recurso) => y.importado.localeCompare(x.importado), nombre: (x: Recurso, y: Recurso) => x.nombre.localeCompare(y.nombre, "es"), duracion: (x: Recurso, y: Recurso) => x.duracion - y.duracion }[orden];
    return lista.sort(cmp);
  }, [b, tipo, categoria, busqueda, orden, soloSinDescribir]);

  if (!b) return <div className="vacio">Cargando…</div>;
  const cuenta = (t: TipoRecurso, c?: string) => b.recursos.filter((r) => r.tipo === t && (!c || r.categoria === c)).length;
  const nombreCat = (id: string) => b.categorias.find((c) => c.id === id)?.nombre ?? id;

  const correr = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) avisar(ok, "ok");
      await cargar();
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };
  const cambiar = (r: Recurso, cambio: Parameters<typeof api.editarRecurso>[1]) => void correr(() => api.editarRecurso(r.id, cambio), cambio.categoria ? `Movido a «${nombreCat(cambio.categoria)}».` : undefined);
  const borrar = (ids: string[]) => {
    if (!window.confirm(`¿Borrar ${ids.length === 1 ? "este archivo" : `${ids.length} archivos`} de la biblioteca? (El original de donde lo importaste no se toca.)`)) return;
    void correr(() => api.borrarRecursos(ids), "Borrado de la biblioteca.").then(() => setElegidos([]));
  };
  const alternar = (id: string) => setElegidos((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]));
  const acciones = (r: Recurso): AccionesRecurso => ({ categorias: b.categorias, elegido: elegidos.includes(r.id), onElegir: () => alternar(r.id), onCambio: (c) => cambiar(r, c), onBorrar: () => borrar([r.id]) });
  const sinDescribir = b.recursos.filter((r) => r.tipo === "video" && r.descripcionPor === "nombre" && (!categoria || r.categoria === categoria)).length;

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Biblioteca</h1>
          <p>Clips, música y efectos en tus propias categorías. Al crear o editar un video elegís de qué categorías se pueden sacar clips; el editor los usa solo cuando tienen que ver con lo que se dice.</p>
        </div>
      </div>

      {b.importacion.activa ? (
        <div className="aviso info" style={{ marginBottom: 14 }}>
          <b>
            Importando a «{nombreCat(b.importacion.categoria ?? "")}»: {b.importacion.hechos} de {b.importacion.total}
          </b>{" "}
          · {b.importacion.importados} nuevos · {b.importacion.duplicados} repetidos{b.importacion.errores.length ? ` · ${b.importacion.errores.length} con error` : ""}
          <div className="progreso" style={{ marginTop: 8 }}>
            <div style={{ width: `${(b.importacion.hechos / Math.max(1, b.importacion.total)) * 100}%` }} />
          </div>
          <button className="boton chico" style={{ marginTop: 8 }} onClick={() => void correr(() => api.cancelarImportacion())}>
            <X size={14} /> Detener
          </button>
        </div>
      ) : null}
      {b.descripcion.activa ? (
        <div className="aviso info" style={{ marginBottom: 14 }}>
          Claude está describiendo clips: {b.descripcion.hechos} de {b.descripcion.total}
          {b.descripcion.actual ? ` (${b.descripcion.actual})` : ""}.{" "}
          <button className="boton chico" onClick={() => void correr(() => api.cancelarImportacion())}>
            <X size={14} /> Detener
          </button>
        </div>
      ) : b.descripcion.error ? (
        <div className="aviso advertencia" style={{ marginBottom: 14 }}>
          {b.descripcion.error}
        </div>
      ) : null}

      <div className="segmentado" role="tablist" style={{ marginBottom: 14 }}>
        {IDS_TIPOS_RECURSO.map((t) => (
          <button key={t} role="tab" aria-selected={tipo === t} className={tipo === t ? "activo" : ""} onClick={() => (setTipo(t), setElegidos([]))}>
            {ICONO_TIPO[t]} {TIPOS_RECURSO.find((x) => x.id === t)!.nombre} <span className="contador">{cuenta(t)}</span>
          </button>
        ))}
      </div>

      <div className="chips-perfiles categorias" style={{ marginBottom: 14 }}>
        <button className={`chip-perfil ${categoria === "" ? "activo" : ""}`} onClick={() => setCategoria("")}>
          <span>Todas</span>
          <small>{cuenta(tipo)}</small>
        </button>
        {b.categorias.map((c) =>
          renombrando === c.id ? (
            <form
              key={c.id}
              className="chip-perfil activo"
              onSubmit={(e) => {
                e.preventDefault();
                const nombre = String(new FormData(e.currentTarget).get("nombre") ?? "");
                void correr(() => api.renombrarCategoria(c.id, nombre), "Categoría renombrada.").then(() => setRenombrando(null));
              }}
            >
              <input name="nombre" defaultValue={c.nombre} autoFocus aria-label="Nuevo nombre" />
              <button className="boton chico icono" type="submit" aria-label="Guardar">
                <Check size={14} />
              </button>
              <button className="boton chico icono" type="button" onClick={() => setRenombrando(null)} aria-label="Cancelar">
                <X size={14} />
              </button>
            </form>
          ) : (
            <button key={c.id} className={`chip-perfil ${categoria === c.id ? "activo" : ""}`} onClick={() => setCategoria(c.id)} onDoubleClick={() => setRenombrando(c.id)} title="Doble clic para renombrar">
              <span>{c.nombre}</span>
              <small>{cuenta(tipo, c.id)}</small>
            </button>
          ),
        )}
        {nueva === null ? (
          <button className="chip-perfil" onClick={() => setNueva("")}>
            <FolderPlus size={14} /> <span>Nueva categoría</span>
          </button>
        ) : (
          <form
            className="chip-perfil activo"
            onSubmit={(e) => {
              e.preventDefault();
              void correr(() => api.crearCategoria(nueva), `Categoría «${nueva.trim()}» creada.`).then(() => setNueva(null));
            }}
          >
            <input value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Ej. Frente Amplio" autoFocus aria-label="Nombre de la categoría" />
            <button className="boton chico icono" type="submit" disabled={!nueva.trim()} aria-label="Crear">
              <Check size={14} />
            </button>
            <button className="boton chico icono" type="button" onClick={() => setNueva(null)} aria-label="Cancelar">
              <X size={14} />
            </button>
          </form>
        )}
      </div>
      {categoria ? (
        <div className="fila" style={{ marginBottom: 14, gap: 8 }}>
          <button className="boton chico" onClick={() => setRenombrando(categoria)}>
            <Pencil size={14} /> Renombrar «{nombreCat(categoria)}»
          </button>
          <button className="boton chico peligro" onClick={() => setBorrandoCat(b.categorias.find((c) => c.id === categoria) ?? null)}>
            <Trash2 size={14} /> Borrar categoría
          </button>
          {tipo === "video" && sinDescribir ? (
            <button className="boton chico" disabled={Boolean(ocupada)} onClick={() => void correr(() => api.describirClips({ categoria }), "Arranqué a describir los clips.")} title="Claude mira 3 fotogramas de cada clip (un pedido por clip)">
              <Sparkles size={14} /> Describir {sinDescribir} con Claude
            </button>
          ) : null}
        </div>
      ) : null}
      {borrandoCat ? (
        <BorrarCategoria
          categoria={borrandoCat}
          otras={b.categorias.filter((c) => c.id !== borrandoCat.id)}
          archivos={b.recursos.filter((r) => r.categoria === borrandoCat.id).length}
          onCancelar={() => setBorrandoCat(null)}
          onBorrar={(moverA) =>
            void correr(() => api.borrarCategoria(borrandoCat.id, moverA), moverA ? `Categoría borrada; sus archivos pasaron a «${nombreCat(moverA)}».` : "Categoría y archivos borrados.").then(() => {
              setBorrandoCat(null);
              setCategoria("");
            })
          }
        />
      ) : null}

      <Importar categorias={b.categorias} categoria={categoria} onTerminado={() => void cargar()} />

      <div className="fila filtros-biblioteca" style={{ margin: "16px 0", gap: 10 }}>
        <label className="buscador crece" style={{ margin: 0 }}>
          <Search size={18} />
          <input type="search" placeholder="Buscar por nombre, descripción, etiquetas o lo que se dice…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          <span className="ayuda">{visibles.length}</span>
        </label>
        <select value={orden} onChange={(e) => setOrden(e.target.value as keyof typeof ORDENES)} style={{ width: "auto" }} aria-label="Ordenar">
          {Object.entries(ORDENES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        {tipo === "video" ? (
          <label className="interruptor">
            <input type="checkbox" checked={soloSinDescribir} onChange={(e) => setSoloSinDescribir(e.target.checked)} />
            Sin describir
          </label>
        ) : null}
      </div>

      {elegidos.length ? (
        <div className="barra-seleccion fila">
          <b>{elegidos.length} elegido(s)</b>
          <select defaultValue="" onChange={(e) => e.target.value && void correr(() => api.moverRecursos(elegidos, e.target.value), `Movidos a «${nombreCat(e.target.value)}».`).then(() => setElegidos([]))} style={{ width: "auto" }} aria-label="Mover a">
            <option value="">Mover a…</option>
            {b.categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          {tipo === "video" ? (
            <button className="boton chico" disabled={Boolean(ocupada)} onClick={() => void correr(() => api.describirClips({ ids: elegidos }), "Arranqué a describir los clips elegidos.").then(() => setElegidos([]))}>
              <Sparkles size={14} /> Describir con Claude
            </button>
          ) : null}
          <button className="boton chico peligro" onClick={() => borrar(elegidos)}>
            <Trash2 size={14} /> Borrar
          </button>
          <button className="boton chico" onClick={() => setElegidos(visibles.map((r) => r.id))}>
            Elegir los {visibles.length}
          </button>
          <button className="boton chico" onClick={() => setElegidos([])}>
            <X size={14} /> Ninguno
          </button>
        </div>
      ) : null}

      {visibles.length === 0 ? (
        <div className="tarjeta vacio">
          <p>{b.recursos.some((r) => r.tipo === tipo) ? "Nada coincide con la búsqueda." : `Todavía no hay ${TIPOS_RECURSO.find((x) => x.id === tipo)!.nombre.toLowerCase()}: subilos desde «Agregar a la biblioteca».`}</p>
        </div>
      ) : tipo === "video" ? (
        <div className="grilla-clips">
          {visibles.slice(0, mostrar).map((r) => (
            <TarjetaVideo key={r.id} r={r} {...acciones(r)} />
          ))}
        </div>
      ) : (
        <ul className="lista-pistas biblioteca-audios">
          {visibles.slice(0, mostrar).map((r) => (
            <FilaAudio key={r.id} r={r} sonando={reproductor.sonando === r.id} onEscuchar={() => reproductor.alternar(r)} {...acciones(r)} />
          ))}
        </ul>
      )}
      {visibles.length > mostrar ? (
        <div className="vacio">
          <button className="boton" onClick={() => setMostrar((m) => m + POR_PAGINA * 2)}>
            Mostrar más ({visibles.length - mostrar} restantes)
          </button>
        </div>
      ) : null}
    </>
  );
};

/** Confirmación al borrar una categoría con archivos: moverlos a otra o borrarlos. */
const BorrarCategoria: React.FC<{ categoria: Categoria; otras: Categoria[]; archivos: number; onCancelar: () => void; onBorrar: (moverA: string | null) => void }> = ({ categoria, otras, archivos, onCancelar, onBorrar }) => {
  const [moverA, setMoverA] = useState(otras[0]?.id ?? "");
  return (
    <div className="aviso advertencia" style={{ marginBottom: 14 }}>
      <b>¿Borrar la categoría «{categoria.nombre}»?</b>
      {archivos ? (
        <>
          {" "}
          Tiene {archivos} archivo(s).
          <div className="fila" style={{ marginTop: 8, gap: 8 }}>
            {otras.length ? (
              <>
                <select value={moverA} onChange={(e) => setMoverA(e.target.value)} style={{ width: "auto" }} aria-label="Mover sus archivos a">
                  {otras.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
                <button className="boton chico" onClick={() => onBorrar(moverA)}>
                  Mover los archivos y borrar la categoría
                </button>
              </>
            ) : null}
            <button className="boton chico peligro" onClick={() => onBorrar(null)}>
              <Trash2 size={14} /> Borrar todo
            </button>
            <button className="boton chico" onClick={onCancelar}>
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <div className="fila" style={{ marginTop: 8, gap: 8 }}>
          <button className="boton chico peligro" onClick={() => onBorrar(null)}>
            <Trash2 size={14} /> Borrar
          </button>
          <button className="boton chico" onClick={onCancelar}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
};
