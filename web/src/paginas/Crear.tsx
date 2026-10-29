import { Bot, Lightbulb, Mic, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { contarPalabras, esMaterial, separarLote, UMBRAL_MATERIAL } from "../../../src/shared/entrada";
import type { Idea, Marca, Tono } from "../../../src/shared/schemas";
import type { Perfil } from "../../../src/shared/perfiles";
import { api, type PedidoVideo } from "../api";
import { ir, useAviso } from "../App";
import { SelectorPerfil } from "../componentes/SelectorPerfil";
import { SelectorVoz } from "../componentes/SelectorVoz";
import { SelectorModo } from "../componentes/SelectorModo";
import { SelectorBiblioteca } from "../componentes/SelectorBiblioteca";
import type { ModoEdicion } from "../../../src/shared/modos";
import type { UsoBiblioteca } from "../../../src/shared/biblioteca";

export const Crear: React.FC = () => {
  const avisar = useAviso();
  const [marca, setMarca] = useState<Marca | null>(null);
  const [lote, setLote] = useState(false);
  const [texto, setTexto] = useState("");
  const [voz, setVoz] = useState("");
  const [tonos, setTonos] = useState<Tono[]>([]);
  const [tono, setTono] = useState("");
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [perfil, setPerfil] = useState("");
  const [cierre, setCierre] = useState(true);
  const [auto, setAuto] = useState(false);
  const [modo, setModo] = useState<"ia" | "mi_voz">("ia");
  const [estilo, setEstilo] = useState<NonNullable<PedidoVideo["estiloIlustracion"]>>("auto");
  const [cantidad, setCantidad] = useState<NonNullable<PedidoVideo["cantidadIlustracion"]>>("media");
  const [opinion, setOpinion] = useState("");
  const [modoEdicion, setModoEdicion] = useState<ModoEdicion>("normal");
  const [biblioteca, setBiblioteca] = useState<UsoBiblioteca>({ modo: "no", categorias: [], elegidos: [] });
  const [creando, setCreando] = useState(false);
  const [tema, setTema] = useState("");
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    api
      .config()
      .then(({ marca }) => {
        setMarca(marca);
        setVoz(marca.voz);
        setAuto(marca.modoAutomatico);
        setTono(marca.tonoPorDefecto);
      })
      .catch((e: Error) => avisar(e.message, "error"));
    api
      .tonos()
      .then(({ tonos }) => setTonos(tonos))
      .catch((e: Error) => avisar(e.message, "error"));
    api
      .perfiles()
      .then((r) => {
        setPerfiles(r.perfiles);
        // el último perfil que usaste en Videos animados (si todavía existe)
        setPerfil(r.ultimos?.idea || r.porDefecto || r.perfiles[0]?.slug || "");
      })
      .catch(() => undefined);
  }, [avisar]);

  const lista = lote ? separarLote(texto) : [texto.trim()].filter((l) => l.length > 0);
  // perfiles con línea editorial Hechos → Contexto → Opinión: la opinión es tuya (opcional), nunca de la IA
  const conLinea = perfiles.find((p) => p.slug === perfil)?.lineaEditorial === "hechos_contexto_opinion";
  const palabras = contarPalabras(texto);

  // el campo crece solo con el texto (sin límite de caracteres)
  const campo = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = campo.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [texto, lote]);

  const crear = async () => {
    if (lista.length === 0) return;
    setCreando(true);
    try {
      const { ids } = await api.crear(lista, { voz, auto, tono, perfil: perfil || undefined, cierre, modo, estiloIlustracion: estilo, cantidadIlustracion: cantidad, opinion: conLinea ? opinion.trim() || undefined : undefined, modoEdicion, biblioteca });
      avisar(
        modo === "mi_voz" ? "Escribo el guion y te aviso para que grabes. Te llevo a la cola." : ids.length > 1 ? `${ids.length} videos en la cola` : "¡Arrancó! Te llevo a la cola.",
        "ok",
      );
      setTexto("");
      ir("animados/cola");
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setCreando(false);
    }
  };

  const buscarIdeas = async () => {
    setBuscando(true);
    setIdeas(null);
    try {
      setIdeas((await api.ideas(tema)).ideas);
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setBuscando(false);
    }
  };

  const usarIdea = (i: Idea) => {
    if (lote) setTexto((t) => (t.trim() ? `${t.trimEnd()}\n---\n${i.titulo}` : i.titulo));
    else setTexto(i.titulo);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>¿De qué querés el video?</h1>
          <p>Escribí una idea (o pegá un artículo, tus notas o tu propio guion) y la fábrica investiga, escribe el guion, pone la voz, anima y renderiza.</p>
        </div>
      </div>

      <section className="tarjeta">
        <div className="tarjeta-titulo">
          <span className="etiqueta">{lote ? "Separá cada idea con una línea que diga ---" : "Tu idea o tu texto"}</span>
          <label className="interruptor">
            <input type="checkbox" checked={lote} onChange={(e) => setLote(e.target.checked)} />
            Varias ideas
          </label>
        </div>
        <textarea
          ref={campo}
          className="idea"
          placeholder={
            lote
              ? "¿Cómo funciona el balotaje?\n---\n¿Por qué votar es obligatorio en Uruguay?\n---\nPegá acá un artículo entero, también vale"
              : "Ej: ¿Cómo funciona el balotaje en Uruguay?\n\nTambién podés pegar un texto largo: un artículo, notas o un guion propio."
          }
          value={texto}
          rows={lote ? 6 : 3}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void crear();
          }}
        />
        <p className="ayuda contador-palabras">
          {palabras.toLocaleString("es-UY")} {palabras === 1 ? "palabra" : "palabras"}
          {lote && lista.length > 1 ? ` · ${lista.length} ideas → ${lista.length} videos` : ""}
          {!lote && esMaterial(texto) ? ` · más de ${UMBRAL_MATERIAL}: se usa como material principal del guion` : ""}
        </p>

        <div className="campo" style={{ marginTop: 14 }}>
          <span>¿Quién pone la voz?</span>
          <div className="tonos modos-voz" role="radiogroup" aria-label="Modo de voz">
            <button role="radio" aria-checked={modo === "ia"} className={`tono-opcion${modo === "ia" ? " activo" : ""}`} onClick={() => setModo("ia")}>
              <strong>
                <Bot size={16} style={{ verticalAlign: "-3px" }} /> Automático (voz IA)
              </strong>
              <small>Guion, voz, animación y render: todo solo.</small>
            </button>
            <button role="radio" aria-checked={modo === "mi_voz"} className={`tono-opcion${modo === "mi_voz" ? " activo" : ""}`} onClick={() => setModo("mi_voz")}>
              <strong>
                <Mic size={16} style={{ verticalAlign: "-3px" }} /> Mi voz
              </strong>
              <small>Te armo el guion, vos lo grabás (o subís una nota de voz) y yo corto silencios y muletillas.</small>
            </button>
          </div>
        </div>

        <div className="campo" style={{ marginTop: 14 }}>
          <span>Modo de edición</span>
          <SelectorModo valor={modoEdicion} onCambio={setModoEdicion} />
        </div>

        <div className="campo" style={{ marginTop: 14 }}>
          <span>Incluir clips de la biblioteca</span>
          <SelectorBiblioteca valor={biblioteca} onCambio={setBiblioteca} />
        </div>

        <div className="campo" style={{ marginTop: 14 }}>
          <span>Tono</span>
          <div className="tonos" role="radiogroup" aria-label="Tono del video">
            {tonos.map((t) => (
              <button key={t.id} role="radio" aria-checked={tono === t.id} className={`tono-opcion${tono === t.id ? " activo" : ""}`} onClick={() => setTono(t.id)} title={t.descripcion}>
                <strong>{t.nombre}</strong>
                <small>{t.descripcion}</small>
              </button>
            ))}
          </div>
          {tonos.length === 0 ? <span className="ayuda">No hay tonos en prompts/tonos/: se usa el guionista base.</span> : null}
        </div>

        <div className="rejilla-2" style={{ marginTop: 14 }}>
          <div className="campo" style={{ gridColumn: "1 / -1" }}>
            <span>Se firma con el perfil</span>
            <SelectorPerfil
              perfiles={perfiles}
              valor={perfil}
              onCambio={setPerfil}
              onCreado={(p) => {
                setPerfiles((l) => [...l, p]);
                setPerfil(p.slug);
              }}
              conVista
            />
            <span className="ayuda">Su @ y la insignia en el cierre «Seguir», la paleta (también de los dibujos), la letra, los subtítulos y la marca de agua.</span>
          </div>
          {conLinea ? (
            <label className="campo" style={{ gridColumn: "1 / -1" }}>
              <span>Tu opinión (opcional)</span>
              <textarea rows={3} value={opinion} maxLength={800} placeholder="Ej: Creo que el proyecto llega tarde y sin presupuesto. (Si lo dejás vacío, el video termina en el contexto o con una pregunta.)" onChange={(e) => setOpinion(e.target.value)} />
              <span className="ayuda">
                Este perfil usa la línea <b>Hechos → Contexto → Opinión</b>. Si escribís tu opinión, va al final en el bloque <b>OPINIÓN</b>, en tu voz y sin que la IA le agregue argumentos ni datos.
              </span>
            </label>
          ) : null}
          {modo === "ia" ? (
            <div className="campo">
              <span>Voz</span>
              {voz ? <SelectorVoz valor={voz} onCambio={setVoz} velocidad={marca?.velocidad ?? "+8%"} /> : <span className="ayuda">Cargando…</span>}
            </div>
          ) : (
            <div className="campo">
              <span>Voz</span>
              <span className="ayuda" style={{ minHeight: 46, display: "flex", alignItems: "center" }}>
                La tuya: cuando el guion esté listo, el trabajo queda «Esperando tu voz» en la cola.
              </span>
            </div>
          )}
          <label className="campo">
            <span>Estilo de ilustración</span>
            <select value={estilo} onChange={(e) => setEstilo(e.target.value as typeof estilo)}>
              <option value="auto">Automático (según el tono)</option>
              <option value="plano">Plano editorial</option>
              <option value="cartoon">Cartoon</option>
              <option value="documental">Documental</option>
            </select>
            <span className="ayuda">Personajes, objetos y escenarios dibujados. Las personas reales siempre van con foto.</span>
          </label>
          <label className="campo">
            <span>Cantidad de ilustración</span>
            <select value={modoEdicion === "normal" ? cantidad : ""} disabled={modoEdicion !== "normal"} onChange={(e) => setCantidad(e.target.value as typeof cantidad)}>
              {modoEdicion !== "normal" ? <option value="">La define el modo de edición</option> : null}
              <option value="poca">Poca (≈ 1 de cada 4 escenas)</option>
              <option value="media">Media (≈ la mitad)</option>
              <option value="mucha">Mucha (casi todo dibujado)</option>
            </select>
          </label>
          <div className="campo">
            <span>Revisión del guion</span>
            <label className="interruptor" style={{ minHeight: 46 }}>
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              Modo automático
            </label>
            <span className="ayuda">
              {modo === "mi_voz"
                ? auto
                  ? "Solo para a esperar tu voz; cuando la subís, sigue sola hasta el video."
                  : "Te pide revisar el guion y, después de grabar, los cortes de tu voz."
                : auto
                  ? "Hace todo de corrido, sin pedirte que revises el guion."
                  : "Te avisa cuando el guion esté listo para que lo revises."}
            </span>
          </div>
          <div className="campo">
            <span>Cierre</span>
            <label className="interruptor" style={{ minHeight: 46 }}>
              <input type="checkbox" checked={cierre} onChange={(e) => setCierre(e.target.checked)} />
              Placa final «Seguir»
            </label>
            <span className="ayuda">2,5 s al final con el @ del perfil y el botón «Seguir» animado.</span>
          </div>
        </div>

        <button className="boton primario grande" disabled={creando || lista.length === 0} onClick={() => void crear()}>
          {creando ? <span className="girando" /> : <Sparkles size={20} />}
          {lista.length > 1 ? `Crear ${lista.length} videos` : "Crear video"}
        </button>
      </section>

      <section className="tarjeta">
        <div className="tarjeta-titulo">
          <div>
            <h2>
              <Lightbulb size={20} style={{ verticalAlign: "-3px", color: "var(--acento)" }} /> ¿Sin ideas?
            </h2>
            <p className="ayuda" style={{ margin: "4px 0 0" }}>
              Claude busca qué está en conversación sobre {marca ? `«${marca.nicho}»` : "tu nicho"} y propone 10 videos. Tarda alrededor de un minuto.
            </p>
          </div>
        </div>
        <div className="fila">
          <input className="crece" type="text" placeholder="Enfoque opcional (ej. elecciones, economía, historia)" value={tema} onChange={(e) => setTema(e.target.value)} />
          <button className="boton" disabled={buscando} onClick={() => void buscarIdeas()}>
            {buscando ? <span className="girando" /> : <Wand2 size={18} />}
            {buscando ? "Buscando ideas…" : "Dame ideas"}
          </button>
        </div>
        {ideas ? (
          <div className="ideas" style={{ marginTop: 16 }}>
            {ideas.map((i, k) => (
              <button key={k} className="idea-tarjeta" onClick={() => usarIdea(i)} title="Usar esta idea">
                <strong>{i.titulo}</strong>
                <em>“{i.gancho}”</em>
                <small>{i.por_que}</small>
              </button>
            ))}
          </div>
        ) : null}
      </section>
    </>
  );
};
