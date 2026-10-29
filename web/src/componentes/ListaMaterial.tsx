import { AlertTriangle, BarChart3, Check, ExternalLink, Film, Users, Globe, Image as Imagen, Link2, Newspaper, Search, Trash2, Undo2, Upload } from "lucide-react";
import { coincideBusqueda } from "../../../src/shared/biblioteca";
import { useState } from "react";
import { api, type DetalleCrudo, type Recurso } from "../api";
import { urlMiniatura } from "../paginas/Biblioteca";
import { useAviso } from "../App";

type Item = NonNullable<DetalleCrudo["material"]>[number];

const NOMBRE: Record<Item["tipo"], string> = { noticia: "Noticia", dato: "Dato", persona: "Persona", lugar: "Lugar", concepto: "Concepto", clip: "Clip", escena: "Escena animada" };
const ICONO: Record<Item["tipo"], React.ReactNode> = {
  noticia: <Newspaper size={16} />,
  dato: <BarChart3 size={16} />,
  persona: <Imagen size={16} />,
  lugar: <Imagen size={16} />,
  concepto: <Imagen size={16} />,
  clip: <Film size={16} />,
  escena: <Users size={16} />,
};

/** "Cambiar clip": buscador sobre los clips de la biblioteca (sin los que ya están en el video). */
const CambiarClip: React.FC<{ actual: string; usados: string[]; onElegir: (clip: string) => void }> = ({ actual, usados, onElegir }) => {
  const [clips, setClips] = useState<Recurso[] | null>(null);
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);
  const abrir = () => {
    setAbierto(true);
    if (!clips) void api.biblioteca().then((b) => setClips(b.recursos.filter((r) => r.tipo === "video")));
  };
  if (!abierto)
    return (
      <button className="boton chico" onClick={abrir}>
        <Search size={14} /> Cambiar clip
      </button>
    );
  const opciones = (clips ?? []).filter((c) => c.id !== actual && !usados.includes(c.id) && coincideBusqueda(c, q)).slice(0, 8);
  return (
    <div className="cambiar-clip">
      <input placeholder="Buscar en la biblioteca…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      {clips === null ? <span className="ayuda">Cargando…</span> : null}
      {opciones.map((c) => (
        <button key={c.id} className="opcion-clip" onClick={() => onElegir(c.id)}>
          <img src={urlMiniatura(c)} alt="" />
          <span>
            <b>{c.nombre}</b>
            <small>{c.descripcion.slice(0, 90)}</small>
          </span>
        </button>
      ))}
    </div>
  );
};

/** De dónde salió cada imagen, con su color (en la revisión se ve de un vistazo qué es real y qué es stock). */
const ORIGEN: Record<string, { texto: string; clase: string }> = {
  noticia: { texto: "Foto de la noticia", clase: "noticia" },
  oficial: { texto: "Sitio oficial", clase: "oficial" },
  wikimedia: { texto: "Wikimedia", clase: "wikimedia" },
  prensa: { texto: "Otra nota de prensa", clase: "prensa" },
  stock: { texto: "Stock (ilustrativa)", clase: "stock" },
  manual: { texto: "Elegida por vos", clase: "manual" },
  clip: { texto: "Biblioteca", clase: "clip" },
};

const reloj = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

/** Resumen corto de un dato para la lista (sin renderizar la plantilla). */
const resumenDato = (d: NonNullable<Item["dato"]>) => {
  const p = d.props as Record<string, unknown>;
  if (d.plantilla === "dato_numero") return `${String(p.prefijo ?? "")}${String(p.numero)}${p.unidad ? ` ${String(p.unidad)}` : ""} · ${String(p.contexto ?? "")}`;
  const datos = (p.datos as { etiqueta: string; valor: number }[] | undefined) ?? [];
  return `${String(p.titulo ?? "Gráfico")}: ${datos.map((x) => `${x.etiqueta} ${x.valor}`).join(", ")}`;
};

/** Material que aparece en pantalla: cambiar o quitar cada cosa, y resolver lo que quedó PENDIENTE. */
export const ListaMaterial: React.FC<{ id: string; items: Item[]; onCambio: (d: DetalleCrudo) => void; onIr: (ms: number) => void }> = ({ id, items, onCambio, onIr }) => {
  const avisar = useAviso();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [textos, setTextos] = useState<Record<string, string>>({});

  const hacer = async (mid: string, fn: () => Promise<DetalleCrudo>, ok?: string) => {
    setOcupado(mid);
    try {
      onCambio(await fn());
      if (ok) avisar(ok, "ok");
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setOcupado(null);
    }
  };

  if (!items.length) return <p className="ayuda">No encontré noticias, datos ni personas para mostrar en pantalla.</p>;

  return (
    <div className="lista-material">
      {items.map((it) => {
        const quitado = it.estado === "quitado";
        const pendiente = it.estado === "pendiente";
        const texto = textos[it.id] ?? "";
        const cargando = ocupado === it.id;
        return (
          <article key={it.id} className={`item-material ${it.estado}`}>
            <div className="fila" style={{ justifyContent: "space-between", gap: 8 }}>
              <div className="fila" style={{ gap: 8 }}>
                <span className="chip-tipo">
                  {ICONO[it.tipo]} {NOMBRE[it.tipo]}
                </span>
                <button className="enlace" onClick={() => onIr(it.origenMs)} title="Ir a ese momento">
                  {reloj(it.origenMs)}
                </button>
                {pendiente ? <span className="insignia pendiente">PENDIENTE</span> : null}
                {quitado ? <span className="insignia">Quitado</span> : null}
              </div>
              <button className="boton chico" disabled={cargando} onClick={() => void hacer(it.id, () => api.quitarMaterial(id, it.id, !quitado))}>
                {quitado ? <Undo2 size={14} /> : <Trash2 size={14} />} {quitado ? "Restaurar" : "Quitar"}
              </button>
            </div>

            <p className="frase-material">“{it.frase}”</p>

            {it.discrepancia ? (
              <div className="aviso-rojo" role="alert">
                <AlertTriangle size={16} /> <span>{it.discrepancia}</span>
              </div>
            ) : null}

            {it.noticia ? (
              <div className="material-noticia">
                {it.capturaUrl ? <img src={`${it.capturaUrl}?v=${encodeURIComponent(it.noticia.captura ?? "")}`} alt={it.noticia.titulo} loading="lazy" /> : null}
                <div className="ayuda" style={{ overflowWrap: "anywhere" }}>
                  <b style={{ color: "var(--texto)" }}>{it.noticia.titulo}</b>
                  <br />
                  {it.noticia.medio}
                  {it.noticia.fecha ? ` · ${it.noticia.fecha}` : ""} ·{" "}
                  <a href={it.noticia.url} target="_blank" rel="noreferrer">
                    abrir <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            ) : null}
            {it.dato ? <p className="ayuda">{resumenDato(it.dato)}{it.dato.fuente ? <> · <a href={it.dato.fuente.url} target="_blank" rel="noreferrer">fuente</a></> : null}</p> : null}
            {it.imagen ? (
              <div className="material-noticia">
                {it.imagenUrl ? <img src={it.imagenUrl} alt={it.imagen.busqueda} loading="lazy" /> : it.tarjeta ? <div className="tarjeta-mini">{it.tarjeta.titulo}</div> : null}
                <div className="ayuda">
                  {it.imagen.etiqueta ? <b style={{ color: "var(--texto)" }}>{it.imagen.etiqueta}</b> : null}
                  {it.imagenUrl && it.imagen.origen ? <span className={`origen-imagen ${ORIGEN[it.imagen.origen]?.clase ?? ""}`}>{ORIGEN[it.imagen.origen]?.texto}</span> : null}
                  {it.imagen.credito ? <div>{it.imagen.credito}</div> : null}
                  {it.imagenUrl && it.imagen.verificacion ? (
                    <div>
                      <Check size={13} style={{ verticalAlign: "-2px" }} /> {it.imagen.verificacion}
                    </div>
                  ) : null}
                  {!it.imagenUrl && it.tarjeta && !quitado ? (
                    <div style={{ color: "var(--acento)" }}>Sin imagen real verificada: va una tarjeta de texto{it.tarjeta.texto ? ` («${it.tarjeta.texto}»)` : ""}. Pegá una URL o subí una imagen.</div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {it.clip ? (
              <div className="material-noticia">
                {it.clipUrl ? <video src={it.clipUrl} muted loop playsInline onMouseEnter={(e) => void e.currentTarget.play()} onMouseLeave={(e) => e.currentTarget.pause()} /> : null}
                <div className="ayuda">
                  <b style={{ color: "var(--texto)" }}>{it.clip.nombre}</b>
                  <div>
                    {it.clip.desdeS.toFixed(1)}–{(it.clip.desdeS + it.clip.duracionS).toFixed(1)} s del clip · {it.clip.motivo}
                  </div>
                </div>
              </div>
            ) : null}
            {it.clip && !quitado ? (
              <div className="acciones-material">
                <CambiarClip actual={it.clip.id} usados={items.flatMap((x) => (x.clip && x.estado !== "quitado" ? [x.clip.id] : []))} onElegir={(clip) => void hacer(it.id, () => api.cambiarClipMaterial(id, it.id, clip), "Clip cambiado")} />
              </div>
            ) : null}

            {pendiente && it.motivo ? <p className="ayuda" style={{ color: "var(--acento)" }}>{it.motivo}</p> : null}

            {/* resolver una noticia pendiente: otra URL, una captura propia, o tu Chrome */}
            {it.noticia && !quitado ? (
              <div className="acciones-material">
                <div className="fila" style={{ gap: 6, flexWrap: "nowrap" }}>
                  <input
                    className="campo-texto"
                    placeholder="Pegar otra URL de la nota…"
                    value={texto}
                    onChange={(e) => setTextos((t) => ({ ...t, [it.id]: e.target.value }))}
                  />
                  <button className="boton chico" disabled={cargando || !texto.trim()} onClick={() => void hacer(it.id, () => api.urlMaterial(id, it.id, texto.trim()), "Capturada de nuevo")}>
                    <Link2 size={14} /> Capturar
                  </button>
                </div>
                {pendiente ? (
                  <div className="fila" style={{ gap: 6 }}>
                    <label className="boton chico">
                      <Upload size={14} /> Subir mi captura
                      <input
                        type="file"
                        accept="image/png,image/jpeg"
                        hidden
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void hacer(it.id, () => api.capturaMaterial(id, it.id, f), "Captura guardada");
                        }}
                      />
                    </label>
                    <button className="boton chico" disabled={cargando || it.noticia.pedirChrome} onClick={() => void hacer(it.id, () => api.chromeMaterial(id, it.id))}>
                      <Globe size={14} /> {it.noticia.pedirChrome ? "Esperando a Chrome" : "Capturar con Chrome"}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
            {it.imagen && !quitado ? (
              <div className="acciones-material">
                <div className="fila" style={{ gap: 6, flexWrap: "nowrap" }}>
                  <input
                    className="campo-texto"
                    placeholder={/^https?:\/\//.test(texto) ? "URL de la imagen o de la página" : it.tipo === "concepto" ? `Otra búsqueda de stock (ahora: ${it.imagen.busqueda}) o una URL…` : "Pegá la URL de una imagen real (o de la página que la tiene)…"}
                    value={texto}
                    onChange={(e) => setTextos((t) => ({ ...t, [it.id]: e.target.value }))}
                  />
                  {/^https?:\/\//.test(texto.trim()) ? (
                    <button className="boton chico" disabled={cargando} onClick={() => void hacer(it.id, () => api.imagenUrlMaterial(id, it.id, texto.trim()), "Imagen cambiada")}>
                      <Link2 size={14} /> Usar
                    </button>
                  ) : (
                    <button className="boton chico" disabled={cargando || texto.trim().length < 2} onClick={() => void hacer(it.id, () => api.busquedaMaterial(id, it.id, texto.trim()), "Busqué de nuevo")}>
                      <Search size={14} /> Buscar
                    </button>
                  )}
                </div>
                <label className="boton chico" style={{ alignSelf: "flex-start" }}>
                  <Upload size={14} /> Subir imagen
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void hacer(it.id, () => api.imagenMaterial(id, it.id, f), "Imagen subida");
                    }}
                  />
                </label>
              </div>
            ) : null}
            {cargando ? (
              <div className="actividad">
                <span className="girando" /> Trabajando…
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
};
