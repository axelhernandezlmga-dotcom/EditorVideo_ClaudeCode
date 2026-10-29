import { Pause, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, nombreVoz, PAISES, type Voz } from "../api";
import { useAviso } from "../App";

let vocesCache: Promise<Voz[]> | null = null;
const cargarVoces = () => (vocesCache ??= api.voces().then((r) => r.voces));
/** Después de instalar Kokoro: la próxima vez se vuelven a pedir las voces. */
export const olvidarVoces = () => {
  vocesCache = null;
};

/** Selector de voz agrupado por país, con botón para escuchar una muestra. */
export const SelectorVoz: React.FC<{ valor: string; onCambio: (v: string) => void; velocidad: string; proveedor?: Voz["proveedor"] }> = ({ valor, onCambio, velocidad, proveedor }) => {
  const [voces, setVoces] = useState<Voz[]>([]);
  const [estado, setEstado] = useState<"quieto" | "cargando" | "sonando">("quieto");
  const audio = useRef<HTMLAudioElement | null>(null);
  const avisar = useAviso();

  useEffect(() => {
    cargarVoces()
      .then(setVoces)
      .catch((e: Error) => avisar(`No pude cargar las voces: ${e.message}`, "error"));
  }, [avisar]);

  useEffect(() => () => audio.current?.pause(), []);

  // si se cambia de proveedor, la voz pasa a la primera de ese proveedor (la recomendada va primera)
  useEffect(() => {
    if (!proveedor || voces.length === 0) return;
    const de = voces.filter((x) => x.proveedor === proveedor);
    if (de.length && !de.some((x) => x.id === valor)) onCambio(de[0]!.id);
  }, [proveedor, voces, valor, onCambio]);

  const escuchar = () => {
    if (estado === "sonando") {
      audio.current?.pause();
      setEstado("quieto");
      return;
    }
    audio.current?.pause();
    const a = new Audio(api.muestraVoz(valor, velocidad));
    audio.current = a;
    setEstado("cargando");
    a.oncanplay = () => setEstado("sonando");
    a.onended = () => setEstado("quieto");
    a.onerror = () => {
      setEstado("quieto");
      avisar(valor.startsWith("gemini:") ? "No se pudo generar la muestra con Gemini (¿clave o cupo de hoy?)." : "No se pudo generar la muestra (edge-tts necesita internet).", "error");
    };
    void a.play().catch(() => undefined);
  };

  const grupos = new Map<string, Voz[]>();
  const visibles = voces.filter((x) => !proveedor || x.proveedor === proveedor);
  for (const v of visibles) grupos.set(v.locale, [...(grupos.get(v.locale) ?? []), v]);
  const conocida = voces.some((v) => v.id === valor);

  return (
    <div className="fila">
      <select className="crece" value={valor} onChange={(e) => onCambio(e.target.value)} aria-label="Voz">
        {!conocida ? <option value={valor}>{nombreVoz(valor)}</option> : null}
        {[...grupos].map(([locale, vs]) => (
          <optgroup key={locale} label={`${PAISES[locale] ?? locale}${vs[0]?.proveedor === "kokoro" ? " · Kokoro (offline)" : ""}`}>
            {vs.map((v) => (
              <option key={v.id} value={v.id}>
                {nombreVoz(v.id)} · {v.genero === "Female" ? "mujer" : "hombre"}
                {v.descripcion ? ` · ${v.descripcion}` : ""}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <button type="button" className="boton" onClick={escuchar} disabled={estado === "cargando"} title="Escuchar esta voz">
        {estado === "cargando" ? <span className="girando" /> : estado === "sonando" ? <Pause size={18} /> : <Volume2 size={18} />}
        Escuchar
      </button>
    </div>
  );
};
