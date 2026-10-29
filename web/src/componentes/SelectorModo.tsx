import { BarChart3, Images, LayoutTemplate, Users, type LucideIcon } from "lucide-react";
import { MODOS_EDICION, type ModoEdicion } from "../../../src/shared/modos";

const ICONOS: Record<ModoEdicion, LucideIcon> = { normal: LayoutTemplate, graficos: BarChart3, situacional: Users, imagenes: Images };

/** Los cuatro modos de edición, con su nombre y su descripción. */
export const SelectorModo: React.FC<{ valor: ModoEdicion; onCambio: (m: ModoEdicion) => void }> = ({ valor, onCambio }) => (
  <div className="tonos modos-edicion" role="radiogroup" aria-label="Modo de edición">
    {MODOS_EDICION.map((m) => {
      const Icono = ICONOS[m.id];
      return (
        <button key={m.id} role="radio" aria-checked={valor === m.id} className={`tono-opcion${valor === m.id ? " activo" : ""}`} onClick={() => onCambio(m.id)}>
          <strong>
            <Icono size={16} />
            {m.nombre}
          </strong>
          <small>{m.descripcion}</small>
        </button>
      );
    })}
  </div>
);
