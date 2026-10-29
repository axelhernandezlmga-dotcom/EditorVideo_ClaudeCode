import { Plus, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { ANIMACIONES, TonoSchema, type Marca, type Tono } from "../../../src/shared/schemas";
import { api } from "../api";
import { useAviso } from "../App";

const NOMBRE_ANIMACION: Record<Tono["animacion"], string> = {
  tranquila: "Tranquila (sin rebote)",
  normal: "Normal",
  rebote: "Con rebote",
};

const slugTono = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/**
 * Edita los tonos (prompts/tonos/<id>.md) y crea tonos nuevos. Se guardan aparte de la configuración.
 * `onElegido` avisa qué tono se está mirando, para que la vista previa use sus colores y animación.
 */
export const EditorTonos: React.FC<{ marca: Marca; onElegido: (t: Tono | null) => void }> = ({ marca, onElegido }) => {
  const avisar = useAviso();
  const [tonos, setTonos] = useState<Tono[]>([]);
  const [actual, setActual] = useState<Tono | null>(null);
  const [original, setOriginal] = useState("");
  const [nuevo, setNuevo] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const elegir = (t: Tono | null) => {
    setActual(t);
    setOriginal(JSON.stringify(t));
    onElegido(t);
  };

  useEffect(() => {
    api
      .tonos()
      .then(({ tonos }) => {
        setTonos(tonos);
        const t = tonos.find((t) => t.id === marca.tonoPorDefecto) ?? tonos[0] ?? null;
        setActual(t);
        setOriginal(JSON.stringify(t));
        onElegido(t);
      })
      .catch((e: Error) => avisar(e.message, "error"));
  }, [avisar]); // solo al abrir la página

  const cambiar = <K extends keyof Tono>(k: K, v: Tono[K]) => {
    if (!actual) return;
    const t = { ...actual, [k]: v };
    setActual(t);
    onElegido(t);
  };
  const sinGuardar = actual !== null && JSON.stringify(actual) !== original;

  const guardar = async () => {
    if (!actual) return;
    const v = TonoSchema.safeParse(actual);
    if (!v.success) return avisar(v.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), "error");
    setGuardando(true);
    try {
      const { tono } = await api.guardarTono(v.data);
      const lista = tonos.some((t) => t.id === tono.id) ? tonos.map((t) => (t.id === tono.id ? tono : t)) : [...tonos, tono];
      setTonos(lista);
      elegir(tono);
      avisar(`Tono «${tono.nombre}» guardado en prompts/tonos/${tono.id}.md`, "ok");
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setGuardando(false);
    }
  };

  const crear = () => {
    const nombre = nuevo?.trim() ?? "";
    const id = slugTono(nombre);
    if (id.length < 2) return avisar("Poné un nombre de al menos 2 letras.", "error");
    if (tonos.some((t) => t.id === id)) return avisar(`Ya existe un tono con id «${id}».`, "error");
    setNuevo(null);
    elegir(null);
    // queda sin guardar hasta que se toque "Guardar tono"
    const t: Tono = { id, nombre, descripcion: "", animacion: "normal", incluye: [], instrucciones: "" };
    setActual(t);
    onElegido(t);
  };

  return (
    <section className="tarjeta">
      <div className="tarjeta-titulo">
        <div>
          <h2>Tonos</h2>
          <p className="ayuda" style={{ margin: "4px 0 0" }}>
            Cada tono es un archivo en <span className="mono">prompts/tonos/</span> que se suma a las instrucciones del guionista. Datos verificados, neutralidad, gancho en 2 s y
            límite de palabras se mantienen siempre.
          </p>
        </div>
      </div>

      <div className="tonos" style={{ marginBottom: 14 }}>
        {tonos.map((t) => (
          <button
            key={t.id}
            className={`tono-opcion${actual?.id === t.id ? " activo" : ""}`}
            onClick={() => {
              if (sinGuardar) avisar(`Se descartaron los cambios sin guardar de «${actual?.nombre}».`, "info");
              elegir(t);
            }}
          >
            <strong>
              {t.nombre}
              {t.id === marca.tonoPorDefecto ? " · por defecto" : ""}
            </strong>
            <small className="mono">{t.id}.md</small>
          </button>
        ))}
        {nuevo === null ? (
          <button className="tono-opcion" onClick={() => setNuevo("")}>
            <strong>
              <Plus size={16} style={{ verticalAlign: "-3px" }} /> Nuevo tono
            </strong>
            <small>Creá un estilo propio</small>
          </button>
        ) : (
          <div className="tono-opcion activo">
            <input
              type="text"
              autoFocus
              placeholder="Nombre del tono"
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") crear();
                if (e.key === "Escape") setNuevo(null);
              }}
            />
            <div className="fila">
              <button className="boton chico primario" onClick={crear}>
                Crear
              </button>
              <button className="boton chico" onClick={() => setNuevo(null)}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {actual ? (
        <>
          <div className="rejilla-2">
            <label className="campo">
              <span>Nombre</span>
              <input type="text" value={actual.nombre} onChange={(e) => cambiar("nombre", e.target.value)} />
            </label>
            <label className="campo">
              <span>Descripción corta</span>
              <input type="text" value={actual.descripcion} onChange={(e) => cambiar("descripcion", e.target.value)} />
            </label>
          </div>
          <div className="rejilla-2">
            <label className="campo">
              <span>Velocidad de la voz: {actual.velocidad ?? `la de la configuración (${marca.velocidad})`}</span>
              <div className="fila">
                <input
                  className="crece"
                  type="range"
                  min={-20}
                  max={40}
                  step={1}
                  value={Number.parseInt(actual.velocidad ?? marca.velocidad, 10) || 0}
                  onChange={(e) => cambiar("velocidad", `${Number(e.target.value) >= 0 ? "+" : ""}${e.target.value}%`)}
                />
                {actual.velocidad ? (
                  <button className="boton chico" onClick={() => cambiar("velocidad", undefined)}>
                    Usar la general
                  </button>
                ) : null}
              </div>
            </label>
            <label className="campo">
              <span>Animaciones</span>
              <select value={actual.animacion} onChange={(e) => cambiar("animacion", e.target.value as Tono["animacion"])}>
                {ANIMACIONES.map((a) => (
                  <option key={a} value={a}>
                    {NOMBRE_ANIMACION[a]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <span className="etiqueta">Colores de acento</span>
          <div className="colores" style={{ marginTop: 8, marginBottom: 14 }}>
            {(["acento", "acento2"] as const).map((c) => (
              <label key={c} className="color">
                <input type="color" value={actual[c] ?? marca.colores[c]} onChange={(e) => cambiar(c, e.target.value.toUpperCase())} />
                <span>
                  {c === "acento" ? "Acento" : "Acento 2"}
                  <br />
                  {actual[c] ? (
                    <button className="boton chico" style={{ marginTop: 4 }} onClick={(e) => (e.preventDefault(), cambiar(c, undefined))}>
                      Usar el de la marca
                    </button>
                  ) : (
                    <small style={{ color: "var(--tenue)" }}>el de la marca</small>
                  )}
                </span>
              </label>
            ))}
          </div>
          {tonos.filter((t) => t.id !== actual.id).length ? (
            <div className="campo">
              <span>Incluir también las reglas de</span>
              <div className="fila">
                {tonos
                  .filter((t) => t.id !== actual.id)
                  .map((t) => (
                    <label key={t.id} className="interruptor">
                      <input
                        type="checkbox"
                        checked={actual.incluye.includes(t.id)}
                        onChange={(e) => cambiar("incluye", e.target.checked ? [...actual.incluye, t.id] : actual.incluye.filter((i) => i !== t.id))}
                      />
                      {t.nombre}
                    </label>
                  ))}
              </div>
            </div>
          ) : null}
          <label className="campo">
            <span>Instrucciones para el guionista (Markdown): gancho, vocabulario, emojis, texto de la publicación y hashtags</span>
            <textarea className="instrucciones-tono" value={actual.instrucciones} onChange={(e) => cambiar("instrucciones", e.target.value)} />
          </label>
          <button className="boton primario" disabled={!sinGuardar || guardando} onClick={() => void guardar()}>
            {guardando ? <span className="girando" /> : <Save size={18} />} {sinGuardar ? "Guardar tono" : "Tono guardado"}
          </button>
        </>
      ) : null}
    </section>
  );
};
