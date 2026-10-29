import { Download } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, type EstadoKokoro } from "../api";
import { useAviso } from "../App";
import { olvidarVoces } from "./SelectorVoz";

/** Estado de Kokoro (voz offline). Mientras se instala, consulta cada 2 s. */
export const useKokoro = () => {
  const [estado, setEstado] = useState<EstadoKokoro | null>(null);
  const avisar = useAviso();

  useEffect(() => {
    void api.kokoro().then(setEstado, () => undefined);
  }, []);

  useEffect(() => {
    if (!estado?.instalando) return;
    const id = window.setInterval(() => {
      void api.kokoro().then((e) => {
        setEstado(e);
        if (e.instalando) return;
        if (e.instalado) {
          olvidarVoces();
          avisar("Kokoro instalado: ya podés elegir sus voces.", "ok");
        } else if (e.error) avisar(`No se pudo instalar Kokoro: ${e.error}`, "error");
      }, () => undefined);
    }, 2000);
    return () => window.clearInterval(id);
  }, [estado?.instalando, avisar]);

  const instalar = useCallback(() => {
    api.instalarKokoro().then(setEstado, (e: Error) => avisar(e.message, "error"));
  }, [avisar]);

  return { estado, instalar };
};

/** Aviso "Kokoro no está instalado" con botón Instalar y el avance de la instalación. */
export const InstalarKokoro: React.FC<{ estado: EstadoKokoro; instalar: () => void }> = ({ estado, instalar }) => {
  if (estado.instalado) return null;
  return (
    <div className="aviso info" style={{ marginBottom: 14 }}>
      <div className="fila" style={{ justifyContent: "space-between" }}>
        <span>Kokoro (voz offline) no está instalado: baja unos 350 MB.</span>
        <button type="button" className="boton" onClick={instalar} disabled={estado.instalando}>
          {estado.instalando ? <span className="girando" /> : <Download size={16} />}
          {estado.instalando ? "Instalando…" : "Instalar"}
        </button>
      </div>
      {estado.instalando && estado.lineas.length ? <div className="ayuda">{estado.lineas.at(-1)}</div> : null}
      {estado.error ? <div className="ayuda">Falló: {estado.error}. También podés correr `npm run setup -- --kokoro` en la terminal.</div> : null}
    </div>
  );
};
