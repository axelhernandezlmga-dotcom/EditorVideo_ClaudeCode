import { AlertTriangle, Check, Mic, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { calcularTramos, duracionTramos, resumirCortes, type Cortes } from "../../../src/shared/cortes";
import { api, type DetalleVoz } from "../api";
import { ir, useAviso } from "../App";
import { EditorTranscripcion, LEYENDA } from "../componentes/EditorTranscripcion";
import { Insignia } from "../componentes/TarjetaTrabajo";
import { useMotor } from "../motor";

const seg = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/**
 * Revisión de "Mi voz": la transcripción de tu grabación con los cortes (un toque recupera o corta), qué
 * escenas del guion se encontraron y cuáles te salteaste. Al aprobar se arma la voz por escena y sigue el video.
 */
export const VozRevision: React.FC<{ id: string }> = ({ id }) => {
  const avisar = useAviso();
  const { trabajos } = useMotor();
  const [d, setD] = useState<DetalleVoz | null>(null);
  const [cortes, setCortes] = useState<Cortes | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [msActual, setMsActual] = useState<number | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const vivo = trabajos.find((t) => t.id === id);

  const cargar = useCallback(() => {
    api
      .voz(id)
      .then((r) => {
        setD(r);
        setCortes(r.cortes);
      })
      .catch((e: Error) => avisar(e.message, "error"));
  }, [id, avisar]);
  useEffect(cargar, [cargar, vivo?.estado, vivo?.pasos.cortes]);

  const pendiente = useRef<number | null>(null);
  const cambiar = (c: Cortes) => {
    setCortes(c);
    if (pendiente.current) window.clearTimeout(pendiente.current);
    pendiente.current = window.setTimeout(() => {
      pendiente.current = null;
      setGuardando(true);
      api
        .guardarCortesVoz(id, { automatico: c.automatico, manual: c.manual })
        .then((r) => pendiente.current === null && setD(r))
        .catch((e: Error) => avisar(e.message, "error"))
        .finally(() => setGuardando(false));
    }, 500);
  };

  const irA = (ms: number) => {
    const a = audio.current;
    if (!a) return;
    a.currentTime = ms / 1000;
    void a.play();
  };

  const tr = d?.transcripcion;
  const tramos = useMemo(() => (tr && cortes ? calcularTramos(tr.palabras, cortes, tr.duracionMs) : []), [tr, cortes]);
  const resumen = useMemo(() => (tr && cortes ? resumirCortes(tr.palabras, cortes, tr.duracionMs, tramos) : null), [tr, cortes, tramos]);
  const actual = useMemo(() => (tr && msActual !== null ? tr.palabras.findIndex((p) => msActual >= p.inicioMs && msActual < p.finMs) : -1), [tr, msActual]);

  if (!d) return <div className="tarjeta vacio">Cargando…</div>;
  const estado = vivo?.estado ?? d.estado.estado;
  const salteadas = d.alineacion?.filter((a) => a.salteada) ?? [];
  const listo = Boolean(tr && cortes) && estado !== "trabajando" && estado !== "en_cola";

  const aprobar = async () => {
    try {
      await api.aprobarVoz(id);
      avisar("Armo tu voz por escena y sigo con el video.", "ok");
      ir("animados/cola");
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };
  const regrabar = async () => {
    try {
      await api.regrabarVoz(id);
      ir(`grabar/${id}`);
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };

  return (
    <>
      <div className="encabezado">
        <div style={{ minWidth: 0 }}>
          <h1 style={{ overflowWrap: "anywhere" }}>
            <Mic size={26} style={{ verticalAlign: "-4px", color: "var(--voz)" }} /> Revisá tu voz
          </h1>
          <div className="fila" style={{ marginTop: 8, gap: 8 }}>
            <Insignia estado={estado} />
            <span className="ayuda">{d.titulo}</span>
            {tr ? (
              <span className="ayuda">
                {seg(tr.duracionMs)} → <b style={{ color: "var(--texto)" }}>{seg(duracionTramos(tramos))}</b>
              </span>
            ) : null}
            {guardando ? <span className="ayuda">Guardando…</span> : null}
          </div>
        </div>
        <div className="fila" style={{ gap: 8 }}>
          <button className="boton" onClick={() => void regrabar()}>
            <RotateCcw size={16} /> Volver a grabar
          </button>
          <button className="boton primario" disabled={!listo} onClick={() => void aprobar()}>
            <Check size={16} /> Aprobar y armar el video
          </button>
        </div>
      </div>

      {salteadas.length ? (
        <div className="aviso advertencia">
          <AlertTriangle size={16} style={{ verticalAlign: "-3px" }} /> <strong>Te salteaste {salteadas.length === 1 ? "una escena" : `${salteadas.length} escenas`}:</strong>{" "}
          {salteadas.map((a) => `${a.escena + 1} («${d.escenas[a.escena]?.slice(0, 60)}…»)`).join(" · ")}. {salteadas.length === 1 ? "Sale" : "Salen"} del video, salvo que vuelvas a grabar.
        </div>
      ) : null}

      <section className="tarjeta">
        <div className="tarjeta-titulo">
          <h2>Tu grabación, palabra por palabra</h2>
          {resumen ? (
            <span className="ayuda">
              Se cortan {resumen.pausa.cantidad} pausas, {resumen.muletilla.cantidad} muletillas y {resumen.toma.cantidad} tomas o tropiezos
            </span>
          ) : null}
        </div>
        {d.limpioUrl ? <audio ref={audio} src={d.limpioUrl} controls style={{ width: "100%", marginBottom: 12 }} onTimeUpdate={(e) => setMsActual(e.currentTarget.currentTime * 1000)} /> : null}
        <div className="leyenda fila" style={{ gap: 12, marginBottom: 10 }}>
          {LEYENDA.map((l) => (
            <span key={l.tipo} className={`palabra quitada ${l.tipo}`} style={{ cursor: "default" }}>
              {l.texto}
            </span>
          ))}
          <span className="ayuda">Tocá una palabra o pausa para cortarla o recuperarla · Alt + clic: escuchar desde ahí</span>
        </div>
        {tr && cortes ? <EditorTranscripcion palabras={tr.palabras} cortes={cortes} duracionMs={tr.duracionMs} actual={actual >= 0 ? actual : null} onCambiar={cambiar} onIr={irA} /> : <p className="ayuda">Todavía estoy transcribiendo…</p>}
      </section>

      {d.alineacion && tr ? (
        <section className="tarjeta">
          <h2>Así queda en cada escena</h2>
          <p className="ayuda">Los subtítulos usan lo que dijiste de verdad. Si improvisaste, queda lo tuyo.</p>
          <ol className="alineacion">
            {d.alineacion.map((a) => (
              <li key={a.escena} className={a.salteada ? "salteada" : ""}>
                <div className="fila" style={{ gap: 8 }}>
                  <b>Escena {a.escena + 1}</b>
                  {a.salteada ? <span className="insignia error">salteada</span> : <span className="insignia listo">{Math.round(a.cobertura * 100)} % del guion</span>}
                </div>
                <p className="ayuda" style={{ margin: "6px 0 2px" }}>
                  Guion: {d.escenas[a.escena]}
                </p>
                {!a.salteada ? <p style={{ margin: 0 }}>Dijiste: {a.palabras.map((i) => tr.palabras[i]!.texto).join(" ")}</p> : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </>
  );
};
