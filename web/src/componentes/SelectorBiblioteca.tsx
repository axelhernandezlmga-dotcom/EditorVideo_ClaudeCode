import { Check, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { coincideBusqueda, type UsoBiblioteca } from "../../../src/shared/biblioteca";
import { AUDIOS_CLIPS, FRECUENCIAS_CLIPS } from "../../../src/shared/opcionesCrudo";

const AYUDA_AUDIO: Record<UsoBiblioteca["audio"], string> = {
  auto: "El editor decide: suena cuando el audio es parte de la gracia y entra en una pausa; la voz y la música bajan mientras tanto.",
  si: "Los clips con audio suenan siempre (la voz y la música bajan mientras tanto).",
  no: "Los clips van sin su audio, como imagen.",
};
import { api, type Categoria, type Recurso } from "../api";
import { urlMiniatura } from "../paginas/Biblioteca";

/**
 * "Incluir clips de la biblioteca: Sí / No" + de qué categorías (varias; "Todas" incluye las que crees después)
 * + opcionalmente elegir clips a mano. Lo elegido llega al motor: solo se ofrecen esos clips al editar.
 */
export const SelectorBiblioteca: React.FC<{ valor: UsoBiblioteca; onCambio: (v: UsoBiblioteca) => void }> = ({ valor, onCambio }) => {
  const [categorias, setCategorias] = useState<Categoria[] | null>(null);
  const [clips, setClips] = useState<Recurso[]>([]);
  const [q, setQ] = useState("");
  useEffect(() => {
    api
      .biblioteca()
      .then((b) => {
        setCategorias(b.categorias);
        setClips(b.recursos.filter((r) => r.tipo === "video"));
      })
      .catch(() => setCategorias([]));
  }, []);
  const incluir = valor.modo !== "no";
  const todas = valor.categorias.length === 0;
  const enUso = (c: string) => todas || valor.categorias.includes(c);
  const alternarCategoria = (id: string) => {
    if (!categorias) return;
    // desde "Todas": tocar una la saca (quedan las demás)
    const actuales = todas ? categorias.map((c) => c.id) : valor.categorias;
    const nuevas = actuales.includes(id) ? actuales.filter((x) => x !== id) : [...actuales, id];
    onCambio({ ...valor, categorias: nuevas.length === categorias.length ? [] : nuevas });
  };
  const disponibles = useMemo(() => clips.filter((c) => enUso(c.categoria)), [clips, valor.categorias]); // eslint-disable-line react-hooks/exhaustive-deps
  const visibles = useMemo(() => disponibles.filter((c) => coincideBusqueda(c, q)).slice(0, 60), [disponibles, q]);

  return (
    <div className="selector-biblioteca">
      <div className="segmentado" role="radiogroup" aria-label="Incluir clips de la biblioteca">
        <button role="radio" aria-checked={incluir} className={incluir ? "activo" : ""} onClick={() => onCambio({ ...valor, modo: valor.modo === "no" ? "auto" : valor.modo })}>
          Sí
        </button>
        <button role="radio" aria-checked={!incluir} className={!incluir ? "activo" : ""} onClick={() => onCambio({ ...valor, modo: "no" })}>
          No
        </button>
      </div>
      {incluir ? (
        categorias === null ? (
          <span className="ayuda">Cargando categorías…</span>
        ) : categorias.length === 0 ? (
          <span className="ayuda">
            La biblioteca no tiene categorías todavía: <a href="#/biblioteca">creá una y subí clips</a>.
          </span>
        ) : (
          <>
            <div className="chips-perfiles" role="group" aria-label="Categorías">
              <button className={`chip-perfil ${todas ? "activo" : ""}`} onClick={() => onCambio({ ...valor, categorias: [] })} title="También las categorías que crees después">
                {todas ? <Check size={14} /> : null}
                <span>Todas</span>
              </button>
              {categorias.map((c) => (
                <button key={c.id} className={`chip-perfil ${!todas && enUso(c.id) ? "activo" : ""}`} onClick={() => alternarCategoria(c.id)} aria-pressed={enUso(c.id)}>
                  {!todas && enUso(c.id) ? <Check size={14} /> : null}
                  <span>{c.nombre}</span>
                  <small>{clips.filter((x) => x.categoria === c.id).length}</small>
                </button>
              ))}
            </div>
            <div className="fila controles-clips" style={{ gap: 16 }}>
              <div>
                <span className="ayuda">Audio original de los clips</span>
                <div className="segmentado" role="radiogroup" aria-label="Audio original de los clips">
                  {(Object.keys(AUDIOS_CLIPS) as UsoBiblioteca["audio"][]).map((k) => (
                    <button key={k} role="radio" aria-checked={valor.audio === k} className={valor.audio === k ? "activo" : ""} onClick={() => onCambio({ ...valor, audio: k })} title={AYUDA_AUDIO[k]}>
                      {AUDIOS_CLIPS[k]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="ayuda">Frecuencia de memes</span>
                <div className="segmentado" role="radiogroup" aria-label="Frecuencia de memes">
                  {(Object.keys(FRECUENCIAS_CLIPS) as UsoBiblioteca["frecuencia"][]).map((k) => (
                    <button key={k} role="radio" aria-checked={valor.frecuencia === k} className={valor.frecuencia === k ? "activo" : ""} onClick={() => onCambio({ ...valor, frecuencia: k })} title={`Como mucho uno cada ~${FRECUENCIAS_CLIPS[k].cadaS} s`}>
                      {FRECUENCIAS_CLIPS[k].nombre}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <span className="ayuda">{AYUDA_AUDIO[valor.audio]}</span>
            <label className="interruptor">
              <input type="checkbox" checked={valor.modo === "manual"} onChange={(e) => onCambio({ ...valor, modo: e.target.checked ? "manual" : "auto" })} />
              Elegir los clips a mano (si no, el editor elige los que tienen que ver con lo que se dice)
            </label>
            {valor.modo === "manual" ? (
              <div className="selector-clips">
                <label className="buscador" style={{ marginBottom: 8 }}>
                  <Search size={16} />
                  <input type="search" placeholder="Buscar en las categorías elegidas…" value={q} onChange={(e) => setQ(e.target.value)} />
                  <span className="ayuda">{valor.elegidos.length} elegido(s)</span>
                </label>
                <div className="selector-clips-grilla">
                  {visibles.map((c) => {
                    const activo = valor.elegidos.includes(c.id);
                    return (
                      <button key={c.id} className={`opcion-clip ${activo ? "activo" : ""}`} onClick={() => onCambio({ ...valor, elegidos: activo ? valor.elegidos.filter((x) => x !== c.id) : [...valor.elegidos, c.id] })} title={c.descripcion}>
                        <img src={urlMiniatura(c)} alt="" loading="lazy" />
                        <span>
                          <b>{c.nombre}</b>
                          <small>{c.duracion.toFixed(1)} s</small>
                        </span>
                        {activo ? <Check size={16} /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </>
        )
      ) : null}
    </div>
  );
};
