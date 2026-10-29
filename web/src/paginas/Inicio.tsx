import { ArrowRight, Clapperboard, LayoutGrid, Library, Scissors, Settings } from "lucide-react";
import type { TipoTrabajo } from "../../../src/shared/schemas";
import { BLOQUES } from "../bloques";
import { useMotor } from "../motor";

/** Cuántos videos de un tipo hay en marcha, para revisar y terminados. */
const useResumen = (tipo: TipoTrabajo) => {
  const { trabajos } = useMotor();
  const mios = trabajos.filter((t) => t.tipo === tipo && !t.oculto);
  return {
    enMarcha: mios.filter((t) => t.estado === "trabajando" || t.estado === "en_cola").length,
    paraRevisar: mios.filter((t) => t.estado === "esperando_revision" || t.estado === "esperando_voz" || t.estado === "pausado").length,
    listos: mios.filter((t) => t.estado === "listo").length,
  };
};

const TarjetaBloque: React.FC<{ id: keyof typeof BLOQUES; Icono: typeof Clapperboard; titulo: string; texto: string; accion: { href: string; texto: string } }> = ({
  id,
  Icono,
  titulo,
  texto,
  accion,
}) => {
  const b = BLOQUES[id];
  const r = useResumen(b.tipo);
  return (
    <a className="tarjeta-bloque" href={accion.href} style={{ "--acento-bloque": b.color, "--acento-bloque-texto": b.colorTexto } as React.CSSProperties}>
      <span className="tarjeta-bloque-icono">
        <Icono size={40} />
      </span>
      <h2>{titulo}</h2>
      <p>{texto}</p>
      <div className="tarjeta-bloque-numeros">
        <span>
          <b>{r.enMarcha}</b> en marcha
        </span>
        <span>
          <b>{r.paraRevisar}</b> para revisar
        </span>
        <span>
          <b>{r.listos}</b> terminados
        </span>
      </div>
      <span className="boton primario grande">
        {accion.texto} <ArrowRight size={18} />
      </span>
    </a>
  );
};

/** Inicio: elegís en qué bloque trabajar. */
export const Inicio: React.FC = () => (
  <>
    <div className="encabezado">
      <div>
        <h1>¿Qué hacemos hoy?</h1>
        <p>Dos fábricas en una: videos animados desde una idea, o tu video grabado convertido en reel.</p>
      </div>
    </div>
    <div className="bloques">
      <TarjetaBloque id="animados" Icono={Clapperboard} titulo="Videos animados" texto="Escribís una idea o pegás un texto y sale un video con guion, voz IA, animaciones y subtítulos." accion={{ href: "#/animados/crear", texto: "Crear un video" }} />
      <TarjetaBloque id="crudos" Icono={Scissors} titulo="Edición de crudos" texto="Subís un video grabado de corrido y te lo devuelvo cortado, con subtítulos, noticias, música y efectos." accion={{ href: "#/crudos/subir", texto: "Subir un crudo" }} />
    </div>
    <div className="fila" style={{ gap: 10, marginTop: 20 }}>
      <a className="boton" href="#/todos">
        <LayoutGrid size={18} /> Todos los videos
      </a>
      <a className="boton" href="#/biblioteca">
        <Library size={18} /> Biblioteca
      </a>
      <a className="boton" href="#/config">
        <Settings size={18} /> Configuración general
      </a>
    </div>
  </>
);
