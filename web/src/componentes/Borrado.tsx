import { CheckSquare, ListX, Square, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, type EspacioTrabajo, type ModoBorrado, type ResumenTrabajo } from "../api";
import { useAviso } from "../App";
import { useMotor } from "../motor";

export const megas = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toLocaleString("es-UY", { maximumFractionDigits: 1 })} GB` : `${Math.round(b / 1024 ** 2).toLocaleString("es-UY")} MB`);

/** Filtros rápidos para elegir qué borrar. */
export const FILTROS_BORRADO = [
  { id: "fallidos", texto: "Fallidos", cumple: (t: ResumenTrabajo) => t.estado === "error" },
  { id: "cancelados", texto: "Cancelados", cumple: (t: ResumenTrabajo) => t.estado === "cancelado" },
  { id: "terminados", texto: "Terminados", cumple: (t: ResumenTrabajo) => t.estado === "listo" },
  { id: "prueba", texto: "De prueba", cumple: (t: ResumenTrabajo) => /prueba|test/i.test(`${t.id} ${t.idea}`) },
] as const;
export type IdFiltro = (typeof FILTROS_BORRADO)[number]["id"];

/** Selección de trabajos con filtros (incluido "más viejos que X días"). */
export const useSeleccion = (trabajos: ResumenTrabajo[]) => {
  const [activa, setActiva] = useState(false);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [filtros, setFiltros] = useState<Set<IdFiltro>>(new Set());
  const [dias, setDias] = useState<number | null>(null);
  const visibles = useMemo(
    () =>
      trabajos.filter(
        (t) => (filtros.size === 0 || FILTROS_BORRADO.some((f) => filtros.has(f.id) && f.cumple(t))) && (dias === null || Date.now() - Date.parse(t.creado) > dias * 86_400_000),
      ),
    [trabajos, filtros, dias],
  );
  // si un trabajo desaparece (se borró), sale de la selección
  useEffect(() => setElegidos((e) => new Set([...e].filter((id) => trabajos.some((t) => t.id === id)))), [trabajos]);
  return {
    activa,
    empezar: () => setActiva(true),
    terminar: () => {
      setActiva(false);
      setElegidos(new Set());
      setFiltros(new Set());
      setDias(null);
    },
    visibles,
    elegidos,
    alternar: (id: string) => setElegidos((e) => (e.has(id) ? new Set([...e].filter((x) => x !== id)) : new Set([...e, id]))),
    todos: () => setElegidos(new Set(visibles.map((t) => t.id))),
    ninguno: () => setElegidos(new Set()),
    filtros,
    alternarFiltro: (f: IdFiltro) => setFiltros((s) => (s.has(f) ? new Set([...s].filter((x) => x !== f)) : new Set([...s, f]))),
    dias,
    setDias,
  };
};
export type Seleccion = ReturnType<typeof useSeleccion>;

/** Barra de selección: filtros, seleccionar todos, borrar y (en la cola) vaciar. */
export const BarraSeleccion: React.FC<{ s: Seleccion; enCola?: boolean; onBorrar: () => void; onVaciar?: () => void }> = ({ s, enCola, onBorrar, onVaciar }) => {
  if (!s.activa)
    return (
      <div className="fila" style={{ gap: 8 }}>
        <button className="boton chico" onClick={s.empezar}>
          <CheckSquare size={16} /> Seleccionar
        </button>
        {enCola && onVaciar ? (
          <button className="boton chico peligro" onClick={onVaciar}>
            <ListX size={16} /> Vaciar cola
          </button>
        ) : null}
      </div>
    );
  const todos = s.visibles.length > 0 && s.visibles.every((t) => s.elegidos.has(t.id));
  return (
    <div className="barra-seleccion">
      <div className="fila" style={{ gap: 6 }}>
        {FILTROS_BORRADO.map((f) => (
          <button key={f.id} className={`chip-filtro ${s.filtros.has(f.id) ? "activo" : ""}`} onClick={() => s.alternarFiltro(f.id)}>
            {f.texto}
          </button>
        ))}
        <label className="chip-filtro" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          Más viejos que
          <input type="number" min={1} max={365} value={s.dias ?? ""} placeholder="—" onChange={(e) => s.setDias(e.target.value ? Math.max(1, Number(e.target.value)) : null)} style={{ width: 54, padding: "2px 6px" }} />
          días
        </label>
      </div>
      <div className="fila" style={{ gap: 8 }}>
        <button className="boton chico" onClick={todos ? s.ninguno : s.todos}>
          {todos ? <Square size={16} /> : <CheckSquare size={16} />} {todos ? "Ninguno" : `Seleccionar todos (${s.visibles.length})`}
        </button>
        <button className="boton chico peligro" disabled={s.elegidos.size === 0} onClick={onBorrar}>
          <Trash2 size={16} /> Borrar seleccionados ({s.elegidos.size})
        </button>
        {enCola && onVaciar ? (
          <button className="boton chico peligro" onClick={onVaciar}>
            <ListX size={16} /> Vaciar cola
          </button>
        ) : null}
        <button className="boton chico" onClick={s.terminar}>
          <X size={16} /> Listo
        </button>
      </div>
    </div>
  );
};

/** Casilla de selección sobre una tarjeta o miniatura. */
export const Casilla: React.FC<{ marcada: boolean; onCambio: () => void }> = ({ marcada, onCambio }) => (
  <label className="casilla" onClick={(e) => e.stopPropagation()}>
    <input type="checkbox" checked={marcada} onChange={onCambio} />
  </label>
);

/**
 * "¿Borrar también los archivos del disco?": quitar de la lista (recuperable), borrar la carpeta, o conservar solo
 * el video final. Muestra cuánto ocupa jobs/ y cuánto se libera con cada opción antes de confirmar.
 */
export const DialogoBorrar: React.FC<{ ids: string[]; onCerrar: (borrados: boolean) => void }> = ({ ids, onCerrar }) => {
  const avisar = useAviso();
  const { cola, recargar } = useMotor();
  const [espacio, setEspacio] = useState<{ jobs: number; trabajos: Record<string, EspacioTrabajo> } | null>(null);
  const [modo, setModo] = useState<ModoBorrado>("disco");
  const [cancelarEnCurso, setCancelarEnCurso] = useState(false);
  const [borrando, setBorrando] = useState(false);
  useEffect(() => {
    api
      .espacio()
      .then(setEspacio)
      .catch(() => setEspacio({ jobs: 0, trabajos: {} }));
  }, []);
  const suma = (k: keyof EspacioTrabajo) => ids.reduce((n, id) => n + (espacio?.trabajos[id]?.[k] ?? 0), 0);
  const libera = { lista: 0, disco: suma("liberaDisco"), soloFinal: suma("liberaSoloFinal") };
  const enCurso = cola.enCurso && ids.includes(cola.enCurso) ? cola.enCurso : null;
  const confirmar = async () => {
    setBorrando(true);
    try {
      const r = await api.borrar(ids, modo, cancelarEnCurso);
      await recargar();
      avisar(
        r.errores.length
          ? `Borré ${r.borrados.length}; ${r.errores.length} no se pudieron (${r.errores.map((e) => e.error).join("; ")}).`
          : `Listo: ${r.borrados.length} trabajo(s)${modo === "lista" ? " quitados de la lista" : `, ${megas(r.liberados)} liberados`}. jobs/ ocupa ${megas(r.jobs)}.`,
        r.errores.length ? "error" : "ok",
      );
      onCerrar(true);
    } catch (e) {
      avisar((e as Error).message, "error");
      setBorrando(false);
    }
  };
  const opciones: { m: ModoBorrado; titulo: string; detalle: string }[] = [
    { m: "lista", titulo: "No: solo quitarlos de la lista", detalle: "Los archivos quedan en el disco y se pueden recuperar." },
    { m: "disco", titulo: "Sí: borrar las carpetas del disco", detalle: "Se borra todo lo de esos trabajos en jobs/. No se puede deshacer." },
    { m: "soloFinal", titulo: "Conservar solo el video final", detalle: "Quedan video.mp4, la portada y fuentes.md; se borran proxy, audios y temporales." },
  ];
  return (
    <div className="modal-fondo" role="dialog" aria-modal="true" onClick={() => !borrando && onCerrar(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>
          Borrar {ids.length} trabajo{ids.length === 1 ? "" : "s"}
        </h2>
        <p className="ayuda">{espacio ? `jobs/ ocupa ${megas(espacio.jobs)} en total.` : "Calculando espacio…"} Nunca se borra nada fuera de jobs/ (ni tus clips, ni la música, ni Descargas).</p>
        <p style={{ margin: "14px 0 8px", fontWeight: 700 }}>¿Borrar también los archivos del disco?</p>
        <div className="opciones-borrado">
          {opciones.map((o) => (
            <label key={o.m} className={`opcion-borrado ${modo === o.m ? "activa" : ""}`}>
              <input type="radio" name="modo" checked={modo === o.m} onChange={() => setModo(o.m)} />
              <span>
                <b>{o.titulo}</b>
                <small>{o.detalle}</small>
              </span>
              <em>{espacio ? (o.m === "lista" ? "libera 0 MB" : `libera ${megas(libera[o.m])}`) : "…"}</em>
            </label>
          ))}
        </div>
        {enCurso ? (
          <label className="interruptor" style={{ marginTop: 12 }}>
            <input type="checkbox" checked={cancelarEnCurso} onChange={(e) => setCancelarEnCurso(e.target.checked)} />
            Hay uno procesándose ahora: cancelarlo también
          </label>
        ) : null}
        <div className="fila" style={{ gap: 8, marginTop: 18, justifyContent: "flex-end" }}>
          <button className="boton" disabled={borrando} onClick={() => onCerrar(false)}>
            Cancelar
          </button>
          <button className="boton peligro-lleno" disabled={borrando || !espacio} onClick={() => void confirmar()}>
            {borrando ? <span className="girando" /> : <Trash2 size={16} />}{" "}
            {modo === "lista" ? "Quitar de la lista" : modo === "disco" ? `Borrar ${espacio ? megas(libera.disco) : ""}` : `Liberar ${espacio ? megas(libera.soloFinal) : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
};

/** "Vaciar cola": cancela lo pendiente; pregunta si cancelar también el que se está procesando. */
export const DialogoVaciar: React.FC<{ onCerrar: () => void }> = ({ onCerrar }) => {
  const avisar = useAviso();
  const { cola, trabajos } = useMotor();
  const [cancelarEnCurso, setCancelarEnCurso] = useState(false);
  const pendientes = cola.pendientes.length;
  const actual = trabajos.find((t) => t.id === cola.enCurso);
  const vaciar = async () => {
    try {
      const r = await api.vaciarCola(cancelarEnCurso);
      avisar(r.cancelados.length ? `Cancelé ${r.cancelados.length} trabajo(s) de la cola.` : "No había nada en la cola.", "ok");
      onCerrar();
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };
  return (
    <div className="modal-fondo" role="dialog" aria-modal="true" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Vaciar cola</h2>
        <p>
          {pendientes ? `Cancelo ${pendientes} trabajo(s) que esperan su turno.` : "No hay trabajos esperando su turno."} Quedan como «Cancelado»: podés reanudarlos o borrarlos después.
        </p>
        {actual ? (
          <label className="interruptor">
            <input type="checkbox" checked={cancelarEnCurso} onChange={(e) => setCancelarEnCurso(e.target.checked)} />
            Cancelar también «{actual.idea}», que se está procesando ahora
          </label>
        ) : null}
        <div className="fila" style={{ gap: 8, marginTop: 18, justifyContent: "flex-end" }}>
          <button className="boton" onClick={onCerrar}>
            No
          </button>
          <button className="boton peligro-lleno" disabled={!pendientes && !cancelarEnCurso} onClick={() => void vaciar()}>
            <ListX size={16} /> Vaciar
          </button>
        </div>
      </div>
    </div>
  );
};
