import { Clapperboard, Download, Scissors } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { calcularTramos, duracionTramos, resumirCortes, type Cortes } from "../../../src/shared/cortes";
import { api, type DetalleCrudo } from "../api";
import { useAviso } from "../App";
import { EditorTranscripcion, LEYENDA } from "../componentes/EditorTranscripcion";
import { ListaMaterial } from "../componentes/ListaMaterial";
import { ReporteMarca } from "../componentes/ReporteMarca";
import { PanelMusica } from "../componentes/PanelMusica";
import { Insignia } from "../componentes/TarjetaTrabajo";
import { VistaCrudo } from "../componentes/VistaCrudo";
import { useMotor } from "../motor";

const seg = (ms: number) => {
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")} min`;
};

/** Revisión de un crudo: vista previa (Remotion), editor por transcripción, material y render. */
export const CrudoRevision: React.FC<{ id: string }> = ({ id }) => {
  const avisar = useAviso();
  const { trabajos, progreso, actividad } = useMotor();
  const [d, setD] = useState<DetalleCrudo | null>(null);
  const [cortes, setCortes] = useState<Cortes | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [origMs, setOrigMs] = useState<number | null>(null);
  const irA = useRef<(ms: number) => void>(() => undefined);
  const vivo = trabajos.find((t) => t.id === id);

  const cargar = useCallback(() => {
    api
      .crudo(id)
      .then((r) => {
        setD(r);
        setCortes(r.cortes);
      })
      .catch((e: Error) => avisar(e.message, "error"));
  }, [id, avisar]);

  // recargar cuando el motor avanza (termina un paso, queda para revisar, termina el render)
  useEffect(cargar, [cargar, vivo?.estado, vivo?.pasos.cortes, vivo?.pasos.material, vivo?.pasos.sfx, vivo?.pasos.render]);

  // guardado diferido: cada clic se ve al instante en la transcripción y se guarda a los 600 ms
  const pendiente = useRef<number | null>(null);
  const cambiar = (c: Cortes) => {
    setCortes(c);
    if (pendiente.current) window.clearTimeout(pendiente.current);
    pendiente.current = window.setTimeout(() => {
      pendiente.current = null;
      setGuardando(true);
      api
        .guardarCortes(id, { automatico: c.automatico, manual: c.manual })
        // la vista previa se actualiza con lo guardado (si no hubo otro cambio mientras tanto)
        .then((r) => pendiente.current === null && setD(r))
        .catch((e: Error) => avisar(e.message, "error"))
        .finally(() => setGuardando(false));
    }, 600);
  };

  const renderizar = async () => {
    try {
      await api.renderizarCrudo(id);
      avisar("Renderizando en 1080×1920. Te aviso acá cuando esté.", "ok");
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };

  const tr = d?.transcripcion;
  const tramos = useMemo(() => (tr && cortes ? calcularTramos(tr.palabras, cortes, tr.duracionMs) : []), [tr, cortes]);
  const resumen = useMemo(() => (tr && cortes ? resumirCortes(tr.palabras, cortes, tr.duracionMs, tramos) : null), [tr, cortes, tramos]);
  const actual = useMemo(() => (tr && origMs !== null ? tr.palabras.findIndex((p) => origMs >= p.inicioMs && origMs < p.finMs) : -1), [tr, origMs]);

  if (!d) return <div className="tarjeta vacio">Cargando…</div>;
  const estado = vivo?.estado ?? d.estado.estado;
  const pasos = vivo?.pasos ?? d.estado.pasos;
  const renderizando = pasos.render === "en_curso";
  const pendientes = d.material?.filter((m) => m.estado === "pendiente").length ?? 0;
  const listaParaRender = Boolean(tr && cortes && pasos.sfx === "hecho") && estado !== "trabajando" && estado !== "en_cola";

  return (
    <>
      <div className="encabezado">
        <div style={{ minWidth: 0 }}>
          <h1 style={{ overflowWrap: "anywhere" }}>{d.estado.idea}</h1>
          <div className="fila" style={{ marginTop: 8, gap: 8 }}>
            <Insignia estado={estado} />
            {tr ? (
              <span className="ayuda">
                {seg(tr.duracionMs)} → <b style={{ color: "var(--texto)" }}>{seg(duracionTramos(tramos))}</b> ({Math.round((1 - duracionTramos(tramos) / tr.duracionMs) * 100)} % menos)
              </span>
            ) : null}
            {guardando ? <span className="ayuda">Guardando…</span> : null}
          </div>
        </div>
        <button className="boton primario" disabled={!listaParaRender || renderizando} onClick={() => void renderizar()} title={pendientes ? `${pendientes} material(es) pendiente(s) quedan afuera del video` : undefined}>
          <Clapperboard size={18} /> {d.final ? "Renderizar de nuevo" : "Renderizar"}
        </button>
      </div>

      {renderizando || (estado === "trabajando" && actividad[id]) ? (
        <div className="tarjeta" style={{ marginBottom: 16 }}>
          <div className="actividad" style={{ marginTop: 0 }}>
            <span className="girando" />
            {actividad[id] ?? "Trabajando…"}
          </div>
          {renderizando ? (
            <div className="progreso" style={{ marginTop: 10 }}>
              <div style={{ width: `${(progreso[id] ?? 0) * 100}%` }} />
            </div>
          ) : null}
        </div>
      ) : null}

      {estado === "error" && d.estado.error ? <div className="aviso" style={{ marginBottom: 16 }}>{d.estado.error}</div> : null}

      <ReporteMarca r={d.marcaReporte} />

      {d.final ? (
        <div className="tarjeta final-crudo" style={{ marginBottom: 16 }}>
          <video src={`${d.final}?v=${encodeURIComponent(d.estado.actualizado)}`} controls playsInline poster={d.portada ?? undefined} />
          <div>
            <h3>Video listo</h3>
            <p className="ayuda">1080×1920 con el video original. Las fuentes y los créditos de las fotos están en fuentes.md, en la carpeta del trabajo.</p>
            <div className="fila" style={{ gap: 8 }}>
              <a className="boton primario" href={d.final} download={`${d.estado.id}.mp4`}>
                <Download size={18} /> Descargar
              </a>
              <button className="boton" onClick={() => void api.abrirCarpeta(id)}>
                Abrir carpeta
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {!tr || !cortes || !d.video ? (
        <div className="tarjeta vacio">
          <span className="girando" />
          <p>Todavía estoy preparando el video{actividad[id] ? `: ${actividad[id]}` : ""}. Esta página se actualiza sola.</p>
        </div>
      ) : (
        <div className="crudo-revision">
          {d.props ? (
            <VistaCrudo props={d.props} onTiempo={setOrigMs} irA={irA} />
          ) : (
            <div className="tarjeta vacio">
              <p>La vista previa aparece cuando termine de preparar el material.</p>
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <div className="tarjeta">
              <div className="fila" style={{ justifyContent: "space-between", gap: 12 }}>
                <h3>
                  <Scissors size={18} style={{ verticalAlign: "-3px" }} /> Cortes
                </h3>
                <label className="interruptor" title="Usar los cortes sugeridos (descarta lo que cambiaste a mano)">
                  <input
                    type="checkbox"
                    checked={cortes.automatico}
                    onChange={(e) => e.target.checked && cambiar({ ...cortes, automatico: true, manual: { quitar: [], conservar: [], pausasConservadas: [], pausasCortadas: [] } })}
                  />
                  <span>Automático</span>
                </label>
              </div>
              {resumen ? (
                <div className="resumen-cortes">
                  {LEYENDA.map(({ tipo, texto }) => (
                    <span key={tipo} className={`chip-corte ${tipo}`}>
                      {texto}: <b>{resumen[tipo].cantidad}</b> ({seg(resumen[tipo].ms)})
                    </span>
                  ))}
                </div>
              ) : null}
              <p className="ayuda" style={{ margin: "8px 0 12px" }}>
                Tocá una palabra o una pausa para cortarla o recuperarla. Alt + clic para verla en la vista previa.
              </p>
              <EditorTranscripcion palabras={tr.palabras} cortes={cortes} duracionMs={tr.duracionMs} actual={actual >= 0 ? actual : null} onCambiar={cambiar} onIr={(ms) => irA.current(ms)} />
            </div>
            <div className="tarjeta" style={{ marginTop: 16 }}>
              <h3 style={{ marginBottom: 12 }}>
                Noticias y material
                {d.material ? (
                  <span className="ayuda" style={{ fontWeight: 400 }}>
                    {" "}
                    · {d.material.filter((m) => m.estado === "listo").length} en pantalla{pendientes ? `, ${pendientes} pendiente(s)` : ""}
                  </span>
                ) : null}
              </h3>
              {d.material ? (
                <ListaMaterial id={id} items={d.material} onCambio={setD} onIr={(ms) => irA.current(ms)} />
              ) : (
                <p className="ayuda">{pasos.material === "en_curso" ? "Buscando noticias, datos e imágenes…" : "Todavía no busqué material."}</p>
              )}
            </div>
            <div className="tarjeta" style={{ marginTop: 16 }}>
              <h3 style={{ marginBottom: 12 }}>Música</h3>
              <PanelMusica id={id} musica={d.musica} onCambio={setD} />
            </div>
          </div>
        </div>
      )}
    </>
  );
};
