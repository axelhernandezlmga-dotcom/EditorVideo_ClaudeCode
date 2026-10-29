import { Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Marca, Tono } from "../../../src/shared/schemas";
import { coloresDe } from "../../../src/shared/tonos";
import { escenasDemo } from "../../../src/remotion/ejemplo";
import { api, type Perfil } from "../api";
import { useAviso } from "../App";
import { EditorTonos } from "../componentes/EditorTonos";
import { VistaPrevia } from "../componentes/VistaPrevia";
import { visualDePerfil } from "../componentes/VistaPerfil";
import { NOMBRE_PLANTILLA } from "./Revision";

const MUESTRAS = ["dato_numero", "titular", "comparacion", "lista", "mapa", "grafico", "icono_texto", "cierre_cta"] as const;

const MODELOS = [
  { id: "sonnet", nombre: "Sonnet (recomendado: rápido y bueno)" },
  { id: "opus", nombre: "Opus (más cuidadoso, usa más cupo)" },
  { id: "haiku", nombre: "Haiku (el más rápido)" },
];

/** Videos animados → Tonos: cómo se escriben los guiones y el estilo de cada tono, con vista previa en vivo. */
export const Tonos: React.FC = () => {
  const avisar = useAviso();
  const [marca, setMarca] = useState<Marca | null>(null);
  const [original, setOriginal] = useState("");
  const [tonos, setTonos] = useState<Tono[]>([]);
  const [tonoVista, setTonoVista] = useState<Tono | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [muestra, setMuestra] = useState<(typeof MUESTRAS)[number]>("dato_numero");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api
      .config()
      .then(({ marca }) => {
        setMarca(marca);
        setOriginal(JSON.stringify(marca));
      })
      .catch((e: Error) => avisar(e.message, "error"));
    api
      .tonos()
      .then((r) => setTonos(r.tonos))
      .catch(() => undefined);
    api
      .perfiles()
      .then((r) => setPerfil(r.perfiles.find((p) => p.slug === r.porDefecto) ?? r.perfiles[0] ?? null))
      .catch(() => undefined);
  }, [avisar]);

  // la vista previa usa el perfil por defecto con los acentos y la animación del tono abierto
  const visual = useMemo(() => {
    if (!marca || !perfil) return null;
    const base = visualDePerfil(perfil, perfil.foto ? `/api/perfiles/${perfil.slug}/foto` : null);
    return { ...base, colores: coloresDe({ ...marca, colores: base.colores }, tonoVista), animacion: tonoVista?.animacion ?? "normal" };
  }, [marca, perfil, tonoVista]);
  const escenas = useMemo(() => [escenasDemo[muestra]!], [muestra]);

  if (!marca || !visual) return <div className="vacio">Cargando…</div>;
  const cambiar = <K extends keyof Marca>(k: K, v: Marca[K]) => setMarca({ ...marca, [k]: v });
  const sinGuardar = JSON.stringify(marca) !== original;

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await api.guardarConfig(marca);
      setMarca(r.marca);
      setOriginal(JSON.stringify(r.marca));
      avisar("Guardado. Se usa en los próximos videos.", "ok");
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Tonos y guiones</h1>
          <p>Cómo escribe el guionista y el estilo de cada tono. La vista previa usa tu perfil por defecto ({perfil?.usuario}).</p>
        </div>
        <button className="boton primario" disabled={!sinGuardar || guardando} onClick={() => void guardar()}>
          {guardando ? <span className="girando" /> : <Save size={18} />} {sinGuardar ? "Guardar" : "Guardado"}
        </button>
      </div>

      <div className="dos-columnas">
        <div>
          <section className="tarjeta">
            <h2 style={{ marginBottom: 14 }}>Guiones</h2>
            <label className="campo">
              <span>Nicho / temas de la cuenta</span>
              <input type="text" value={marca.nicho} onChange={(e) => cambiar("nicho", e.target.value)} />
            </label>
            <div className="rejilla-2">
              <label className="campo">
                <span>Duración mínima: {marca.duracionMin} s</span>
                <input type="range" min={15} max={60} value={marca.duracionMin} onChange={(e) => cambiar("duracionMin", Math.min(Number(e.target.value), marca.duracionMax - 5))} />
              </label>
              <label className="campo">
                <span>Duración máxima: {marca.duracionMax} s</span>
                <input type="range" min={20} max={90} value={marca.duracionMax} onChange={(e) => cambiar("duracionMax", Math.max(Number(e.target.value), marca.duracionMin + 5))} />
              </label>
            </div>
            <div className="rejilla-2">
              <label className="campo">
                <span>Modelo de Claude</span>
                <select value={MODELOS.some((m) => m.id === marca.modeloClaude) ? marca.modeloClaude : "otro"} onChange={(e) => e.target.value !== "otro" && cambiar("modeloClaude", e.target.value)}>
                  {MODELOS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                  {!MODELOS.some((m) => m.id === marca.modeloClaude) ? <option value="otro">{marca.modeloClaude}</option> : null}
                </select>
              </label>
              <label className="campo">
                <span>Tono por defecto</span>
                <select value={marca.tonoPorDefecto} onChange={(e) => cambiar("tonoPorDefecto", e.target.value)}>
                  {tonos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                  {!tonos.some((t) => t.id === marca.tonoPorDefecto) ? <option value={marca.tonoPorDefecto}>{marca.tonoPorDefecto} (no existe)</option> : null}
                </select>
              </label>
            </div>
            <label className="interruptor">
              <input type="checkbox" checked={marca.modoAutomatico} onChange={(e) => cambiar("modoAutomatico", e.target.checked)} />
              Modo automático por defecto (saltear la revisión del guion)
            </label>
            <label className="interruptor">
              <input type="checkbox" checked={marca.censurarSubtitulos} onChange={(e) => cambiar("censurarSubtitulos", e.target.checked)} />
              Censurar malas palabras en subtítulos y textos en pantalla (el audio no cambia)
            </label>
            <label className="interruptor">
              <input type="checkbox" checked={marca.publicacionSinPuteadas} onChange={(e) => cambiar("publicacionSinPuteadas", e.target.checked)} />
              Texto de la publicación sin malas palabras
            </label>
          </section>

          <EditorTonos marca={marca} onElegido={setTonoVista} />
        </div>

        <aside className="columna-fija">
          <section className="tarjeta">
            <div className="tarjeta-titulo">
              <span className="etiqueta">Vista previa{tonoVista ? ` · tono ${tonoVista.nombre}` : ""}</span>
              <select value={muestra} onChange={(e) => setMuestra(e.target.value as (typeof MUESTRAS)[number])} style={{ width: "auto", padding: "6px 10px" }} aria-label="Escena de ejemplo">
                {MUESTRAS.map((m) => (
                  <option key={m} value={m}>
                    {NOMBRE_PLANTILLA[escenasDemo[m]!.plantilla]}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ maxWidth: 300, marginInline: "auto" }}>
              <VistaPrevia escenas={escenas} marca={visual} />
            </div>
          </section>
        </aside>
      </div>
    </>
  );
};
