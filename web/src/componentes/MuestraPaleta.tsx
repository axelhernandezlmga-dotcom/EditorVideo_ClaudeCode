import type { ColoresPerfil } from "../../../src/shared/perfiles";

/** Muestra de una paleta: el fondo con una palabra de subtítulo en el color principal. */
export const MuestraPaleta: React.FC<{ c: ColoresPerfil }> = ({ c }) => (
  <span className="muestra-paleta" style={{ background: `linear-gradient(135deg, ${c.fondo} 0 55%, ${c.fondo2} 55% 100%)` }}>
    <b style={{ color: c.texto }}>AS</b>
    <b style={{ color: c.acento }}>Í</b>
    <i style={{ backgroundColor: c.acento2 }} />
  </span>
);
