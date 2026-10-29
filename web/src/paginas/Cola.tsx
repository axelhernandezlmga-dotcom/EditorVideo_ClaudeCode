import { Scissors, Sparkles } from "lucide-react";
import { useState } from "react";
import type { TipoTrabajo } from "../../../src/shared/schemas";
import { BarraSeleccion, DialogoBorrar, DialogoVaciar, useSeleccion } from "../componentes/Borrado";
import { TarjetaTrabajo } from "../componentes/TarjetaTrabajo";
import { useMotor } from "../motor";

/**
 * Cola y progreso en vivo de un bloque (animados o crudos): lo que está en marcha arriba, lo que necesita
 * atención después. La cola de la compu es una sola: si hay un video del otro bloque procesándose, se avisa.
 */
export const Cola: React.FC<{ tipo: TipoTrabajo }> = ({ tipo }) => {
  const { trabajos: todos, cola } = useMotor();
  const trabajos = todos.filter((t) => t.tipo === tipo && !t.oculto);
  const delOtro = todos.find((t) => t.id === cola.enCurso && t.tipo !== tipo);
  const sel = useSeleccion(trabajos);
  const [borrando, setBorrando] = useState(false);
  const [vaciando, setVaciando] = useState(false);
  const elegible = (id: string) => sel.visibles.some((t) => t.id === id);
  // en modo selección, cada tarjeta lleva su casilla (y lo que no cumple los filtros no se muestra)
  const tarjeta = (t: (typeof trabajos)[number]) =>
    sel.activa && !elegible(t.id) ? null : <TarjetaTrabajo key={t.id} t={t} seleccion={sel.activa ? { marcada: sel.elegidos.has(t.id), alternar: () => sel.alternar(t.id) } : undefined} />;
  const nuevo = tipo === "crudo" ? { href: "#/crudos/subir", texto: "Subir un crudo", Icono: Scissors } : { href: "#/animados/crear", texto: "Nuevo video", Icono: Sparkles };
  const orden = (id: string) => (cola.enCurso === id ? -1 : cola.pendientes.indexOf(id) >= 0 ? cola.pendientes.indexOf(id) : 999);
  const activos = trabajos
    .filter((t) => t.estado === "trabajando" || t.estado === "en_cola" || t.estado === "esperando_revision" || t.estado === "esperando_voz")
    .sort((a, b) => orden(a.id) - orden(b.id));
  const problemas = trabajos.filter((t) => t.estado === "error" || t.estado === "pausado" || t.estado === "cancelado");
  const recientes = trabajos.filter((t) => t.estado === "listo");

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Cola</h1>
          <p>Se procesa un video a la vez (el render usa casi toda la compu); los demás esperan su turno.</p>
        </div>
        <a className="boton primario" href={nuevo.href}>
          <nuevo.Icono size={18} /> {nuevo.texto}
        </a>
      </div>

      <div style={{ marginBottom: 16 }}>
        <BarraSeleccion s={sel} enCola onBorrar={() => setBorrando(true)} onVaciar={() => setVaciando(true)} />
      </div>
      {borrando ? <DialogoBorrar ids={[...sel.elegidos]} onCerrar={(ok) => (setBorrando(false), ok && sel.terminar())} /> : null}
      {vaciando ? <DialogoVaciar onCerrar={() => setVaciando(false)} /> : null}

      {delOtro ? (
        <div className="aviso info" style={{ marginBottom: 16 }}>
          Ahora la compu está procesando «{delOtro.idea}» ({delOtro.tipo === "crudo" ? "edición de crudos" : "videos animados"}). Lo de acá arranca cuando termine.
        </div>
      ) : null}

      {activos.length === 0 ? (
        <div className="tarjeta vacio">
          <p>No hay nada en marcha.</p>
          <a className="boton primario" href={nuevo.href}>
            {nuevo.texto}
          </a>
        </div>
      ) : (
        activos.map(tarjeta)
      )}

      {problemas.length ? (
        <>
          <h2 style={{ margin: "32px 0 14px" }}>Necesitan atención</h2>
          {(sel.activa ? problemas : problemas.slice(0, 10)).map(tarjeta)}
        </>
      ) : null}

      {recientes.length ? (
        <>
          <h2 style={{ margin: "32px 0 14px" }}>Terminados hace poco</h2>
          {(sel.activa ? recientes : recientes.slice(0, 3)).map(tarjeta)}
        </>
      ) : null}
    </>
  );
};
