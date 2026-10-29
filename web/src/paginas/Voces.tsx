import { AudioLines, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Marca, Tono } from "../../../src/shared/schemas";
import { api, nombreVoz, type Muestra, type Voz } from "../api";
import { useAviso } from "../App";

const MAX_VOCES = 4;

/** Comparar voces: cada voz lee el texto de prueba de un tono, con las notas de dirección de ese tono. */
export const Voces: React.FC = () => {
  const avisar = useAviso();
  const [tonos, setTonos] = useState<Tono[]>([]);
  const [voces, setVoces] = useState<Voz[]>([]);
  const [marca, setMarca] = useState<Marca | null>(null);
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [muestras, setMuestras] = useState<Muestra[]>([]);
  const [tono, setTono] = useState("");
  const [texto, setTexto] = useState("");
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [generando, setGenerando] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    Promise.all([api.tonos(), api.voces(), api.config(), api.pruebasVoz()])
      .then(([t, v, c, p]) => {
        setTonos(t.tonos);
        setVoces(v.voces);
        setMarca(c.marca);
        setTextos(p.textos);
        setMuestras(p.muestras);
        const inicial = t.tonos.find((x) => x.id === c.marca.tonoPorDefecto)?.id ?? t.tonos[0]?.id ?? "";
        setTono(inicial);
        setTexto(p.textos[inicial] ?? "");
        setElegidas([c.marca.voz, c.marca.vozRespaldo].filter((x, i, a) => a.indexOf(x) === i));
      })
      .catch((e: Error) => avisar(e.message, "error"));
  }, [avisar]);

  const elegirTono = (id: string) => {
    setTono(id);
    setTexto(textos[id] ?? "");
  };

  const alternar = (id: string) =>
    setElegidas((v) => (v.includes(id) ? v.filter((x) => x !== id) : v.length >= MAX_VOCES ? v : [...v, id]));

  const generar = async () => {
    setGenerando(true);
    try {
      const propio = texto.trim() !== (textos[tono] ?? "").trim() ? texto : undefined;
      await api.generarPruebasVoz(tono, elegidas, propio);
      setMuestras((await api.pruebasVoz()).muestras);
      setVersion((n) => n + 1);
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setGenerando(false);
    }
  };

  const usarComoPrincipal = async (voz: string) => {
    if (!marca) return;
    try {
      const proveedorVoz = voces.find((v) => v.id === voz)?.proveedor ?? marca.proveedorVoz;
      const { marca: nueva } = await api.guardarConfig({ ...marca, voz, proveedorVoz });
      setMarca(nueva);
      avisar(`Listo: ${nombreVoz(voz)} es la voz por defecto.`, "ok");
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };

  const porTono = useMemo(() => {
    const m = new Map<string, Muestra[]>();
    for (const x of muestras) m.set(x.tono, [...(m.get(x.tono) ?? []), x]);
    return [...m];
  }, [muestras]);

  const gemini = voces.filter((v) => v.proveedor === "gemini");
  const edge = voces.filter((v) => v.proveedor === "edge" && /^es-(UY|AR)/.test(v.locale));
  const gastaGemini = elegidas.filter((v) => v.startsWith("gemini:")).length;
  const nombreTono = (id: string) => tonos.find((t) => t.id === id)?.nombre ?? id;

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Comparar voces</h1>
          <p>Elegí un tono y hasta {MAX_VOCES} voces: cada una lee el mismo texto actuando según ese tono. Los audios quedan en la carpeta pruebas-voz/.</p>
        </div>
      </div>

      <section className="tarjeta">
        <div className="campo">
          <span>Tono</span>
          <div className="fila" style={{ flexWrap: "wrap" }}>
            {tonos.map((t) => (
              <button key={t.id} type="button" className={`boton chico ${tono === t.id ? "primario" : ""}`} onClick={() => elegirTono(t.id)}>
                {t.nombre}
              </button>
            ))}
          </div>
        </div>
        <label className="campo">
          <span>Texto de prueba</span>
          <textarea rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={600} />
        </label>
        <div className="campo">
          <span>
            Voces ({elegidas.length}/{MAX_VOCES})
          </span>
          <div className="fila" style={{ flexWrap: "wrap", gap: 6 }}>
            {[...gemini, ...edge].map((v) => (
              <button key={v.id} type="button" className={`boton chico ${elegidas.includes(v.id) ? "primario" : ""}`} onClick={() => alternar(v.id)} title={v.descripcion}>
                {nombreVoz(v.id)}
                {v.descripcion ? <small style={{ opacity: 0.7 }}>{v.descripcion}</small> : null}
              </button>
            ))}
          </div>
          {gastaGemini ? <span className="ayuda">Cada voz de Gemini gasta 1 pedido del plan gratis de hoy (las muestras ya hechas con el texto de siempre no se regeneran).</span> : null}
        </div>
        <button type="button" className="boton primario" disabled={generando || !tono || elegidas.length === 0 || !texto.trim()} onClick={() => void generar()}>
          {generando ? <span className="girando" /> : <AudioLines size={18} />}
          {generando ? "Generando…" : "Generar y comparar"}
        </button>
      </section>

      {porTono.map(([t, lista]) => (
        <section key={t} className="tarjeta">
          <h2 style={{ marginBottom: 12 }}>{nombreTono(t)}</h2>
          <div className="lista-muestras">
            {lista.map((m) => (
              <div key={m.archivo} className="muestra">
                <div className="fila">
                  <strong className="crece">{nombreVoz(m.voz)}</strong>
                  <small>{m.segundos} s</small>
                  <button
                    type="button"
                    className="boton chico"
                    disabled={marca?.voz === m.voz}
                    onClick={() => void usarComoPrincipal(m.voz)}
                    title="Usar como voz por defecto"
                  >
                    <Star size={14} /> {marca?.voz === m.voz ? "Por defecto" : "Usar"}
                  </button>
                </div>
                <audio controls preload="none" src={`${m.url}?v=${encodeURIComponent(m.fecha)}-${version}`} style={{ width: "100%" }} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
};
