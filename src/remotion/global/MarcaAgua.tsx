import { ALTO, ZONA_SEGURA } from "../../shared/render";
import { useMarca } from "../contexto";
import { familia, pesoMedio } from "../fuentes";
import { MarcaAguaC } from "../marca/piezas";

export const MarcaAgua: React.FC = () => {
  const { usuario, colores, tipografia, kit, sobreVideo } = useMarca();
  // con kit: la «C.» de un solo color (símbolo de la marca, en vez del @ escrito); blanca sobre video
  if (kit) return <MarcaAguaC oscuro={sobreVideo} />;
  if (!usuario.trim()) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: ZONA_SEGURA.izquierda,
        top: ALTO - ZONA_SEGURA.abajo - 70,
        fontFamily: familia(tipografia),
        fontWeight: pesoMedio(tipografia),
        fontSize: 32,
        color: colores.texto,
        opacity: 0.55,
        letterSpacing: "0.02em",
        textShadow: "0 2px 8px rgba(0,0,0,0.6)",
      }}
    >
      {usuario}
    </div>
  );
};
