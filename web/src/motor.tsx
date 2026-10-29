import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Evento } from "../../src/pipeline/eventos";
import { api, type ResumenTrabajo, type UsoGemini } from "./api";

type EventoCola = { tipo: "cola"; enCurso: string | null; pendientes: string[] };

type Motor = {
  trabajos: ResumenTrabajo[];
  actividad: Record<string, string>;
  progreso: Record<string, number>;
  logs: Record<string, { linea: string; nivel: "info" | "error" }[]>;
  cola: { enCurso: string | null; pendientes: string[] };
  conectado: boolean;
  usoGemini: UsoGemini | null;
  recargar: () => Promise<void>;
};

const Ctx = createContext<Motor | null>(null);

/** Estado en vivo del motor: lista de trabajos + eventos por SSE (progreso, actividad, logs). */
export const MotorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [trabajos, setTrabajos] = useState<ResumenTrabajo[]>([]);
  const [actividad, setActividad] = useState<Record<string, string>>({});
  const [progreso, setProgreso] = useState<Record<string, number>>({});
  const [logs, setLogs] = useState<Motor["logs"]>({});
  const [cola, setCola] = useState<Motor["cola"]>({ enCurso: null, pendientes: [] });
  const [conectado, setConectado] = useState(false);
  const [usoGemini, setUsoGemini] = useState<UsoGemini | null>(null);
  const recargaPendiente = useRef<number | null>(null);

  const recargar = useCallback(async () => {
    try {
      setTrabajos(await api.trabajos());
      setUsoGemini(await api.usoGemini());
    } catch {
      // sin conexión: el indicador lo muestra
    }
  }, []);

  useEffect(() => {
    void recargar();
    const es = new EventSource("/api/eventos");
    es.onopen = () => {
      setConectado(true);
      void recargar();
    };
    es.onerror = () => setConectado(false);
    es.onmessage = (m) => {
      const e = JSON.parse(m.data as string) as Evento | EventoCola;
      if (e.tipo === "uso-gemini") setUsoGemini(e.uso);
      else if (e.tipo === "cola") setCola({ enCurso: e.enCurso, pendientes: e.pendientes });
      else if (e.tipo === "estado") {
        setTrabajos((ts) => {
          const i = ts.findIndex((t) => t.id === e.id);
          if (i < 0) {
            // trabajo nuevo: pedir la lista (trae portada/video)
            if (recargaPendiente.current === null) {
              recargaPendiente.current = window.setTimeout(() => {
                recargaPendiente.current = null;
                void recargar();
              }, 300);
            }
            return ts;
          }
          const copia = [...ts];
          copia[i] = { ...copia[i]!, ...e.estado };
          // al terminar el render aparecen video y portada
          if (e.estado.estado === "listo") void recargar();
          return copia;
        });
      } else if (e.tipo === "actividad") setActividad((a) => ({ ...a, [e.id]: e.texto }));
      else if (e.tipo === "progreso") setProgreso((p) => ({ ...p, [e.id]: e.progreso }));
      else if (e.tipo === "log") setLogs((l) => ({ ...l, [e.id]: [...(l[e.id] ?? []), { linea: e.linea, nivel: e.nivel }].slice(-60) }));
    };
    return () => es.close();
  }, [recargar]);

  const valor = useMemo(
    () => ({ trabajos, actividad, progreso, logs, cola, conectado, usoGemini, recargar }),
    [trabajos, actividad, progreso, logs, cola, conectado, usoGemini, recargar],
  );
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
};

export const useMotor = () => {
  const m = useContext(Ctx);
  if (!m) throw new Error("Falta <MotorProvider>");
  return m;
};
