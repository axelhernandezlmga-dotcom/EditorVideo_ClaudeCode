import { AlertTriangle, BadgeCheck, Check, Wrench } from "lucide-react";
import type { ReporteMarca as Reporte } from "../../../src/pipeline/marca/verificador";

/** Resultado del verificador de marca: «Marca: OK» o la lista de avisos (con el momento del video). */
export const ReporteMarca: React.FC<{ r: Reporte | null }> = ({ r }) => {
  if (!r) return null;
  const avisos = r.chequeos.filter((c) => c.estado === "aviso");
  return (
    <section className={`tarjeta reporte-marca ${r.ok ? "ok" : "avisos"}`}>
      <div className="tarjeta-titulo">
        <h2>
          {r.ok ? <BadgeCheck size={20} style={{ verticalAlign: "-3px", color: "var(--ok)" }} /> : <AlertTriangle size={20} style={{ verticalAlign: "-3px", color: "#ffa94d" }} />} Marca: {r.ok ? "✅" : `${avisos.length} aviso${avisos.length === 1 ? "" : "s"}`}
        </h2>
        <span className="ayuda">{new Date(r.revisado).toLocaleString("es-UY", { dateStyle: "short", timeStyle: "short" })}</span>
      </div>
      <ul className="chequeos">
        {r.chequeos.map((c) => (
          <li key={c.regla} className={c.estado}>
            <b>
              {c.estado === "ok" ? <Check size={14} /> : c.estado === "corregido" ? <Wrench size={14} /> : <AlertTriangle size={14} />} {c.regla}
            </b>
            <span>
              {c.detalle}
              {c.momento !== undefined ? ` (en ${c.momento.toFixed(1)} s)` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
};
