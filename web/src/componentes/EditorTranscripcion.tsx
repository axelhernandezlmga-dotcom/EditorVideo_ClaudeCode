import { Fragment } from "react";
import { motivoQuitar, pausaCortada, type Cortes, type PalabraCrudo, type TipoCorte } from "../../../src/shared/cortes";

const ETIQUETA: Record<TipoCorte, string> = { pausa: "Pausa", muletilla: "Muletilla", toma: "Toma repetida o tropiezo", largo: "Recorte por duración", manual: "Cortada a mano" };

/** Pausas que vale la pena mostrar (las más cortas no se ven ni se oyen). */
const PAUSA_VISIBLE_MS = 200;

type Props = {
  palabras: PalabraCrudo[];
  cortes: Cortes;
  duracionMs: number;
  /** Palabra que se está reproduciendo (se resalta). */
  actual: number | null;
  onCambiar: (c: Cortes) => void;
  onIr: (ms: number) => void;
};

const alternar = (lista: number[], x: number, poner: boolean) => (poner ? [...new Set([...lista, x])] : lista.filter((y) => y !== x));

/**
 * Editor por transcripción: lo cortado aparece tachado. Un clic en una palabra o en una pausa la recupera o la
 * corta; con Alt + clic (o el botón ▶ al pasar) salta la vista previa a ese momento.
 */
export const EditorTranscripcion: React.FC<Props> = ({ palabras, cortes, duracionMs, actual, onCambiar, onIr }) => {
  const cambiar = (manual: Cortes["manual"]) => onCambiar({ ...cortes, automatico: false, manual });

  const tocarPalabra = (i: number) => {
    const m = cortes.manual;
    const quitada = motivoQuitar(cortes, i) !== null;
    const sugerida = cortes.sugeridos.palabras.some((p) => p.i === i);
    if (quitada) {
      // recuperar: si la sacaste vos se deshace; si era sugerida se marca para conservar
      cambiar({ ...m, quitar: alternar(m.quitar, i, false), conservar: alternar(m.conservar, i, sugerida) });
    } else {
      cambiar({ ...m, conservar: alternar(m.conservar, i, false), quitar: alternar(m.quitar, i, !sugerida) });
    }
  };

  const tocarPausa = (i: number) => {
    const m = cortes.manual;
    const cortada = pausaCortada(cortes, palabras, i, duracionMs);
    const desde = i < 0 ? 0 : palabras[i]!.finMs;
    const hasta = palabras[i + 1]?.inicioMs ?? duracionMs;
    const larga = hasta - desde > cortes.pausaMaxMs;
    cambiar({
      ...m,
      pausasConservadas: alternar(m.pausasConservadas, i, cortada && larga),
      pausasCortadas: alternar(m.pausasCortadas, i, !cortada && !larga),
    });
  };

  const pausa = (i: number) => {
    const desde = i < 0 ? 0 : palabras[i]!.finMs;
    const hasta = palabras[i + 1]?.inicioMs ?? duracionMs;
    const ms = hasta - desde;
    if (ms < PAUSA_VISIBLE_MS) return null;
    const cortada = pausaCortada(cortes, palabras, i, duracionMs);
    return (
      <button
        type="button"
        className={`pausa ${cortada ? "cortada" : ""}`}
        onClick={(e) => (e.altKey ? onIr(desde) : tocarPausa(i))}
        title={`${cortada ? "Pausa cortada" : "Pausa que queda"} de ${(ms / 1000).toFixed(2)} s. Clic para ${cortada ? "dejarla" : "cortarla"}.`}
      >
        {(ms / 1000).toFixed(1)} s
      </button>
    );
  };

  return (
    <div className="transcripcion" role="group" aria-label="Transcripción editable">
      {pausa(-1)}
      {palabras.map((p, i) => {
        const motivo = motivoQuitar(cortes, i);
        const sugerencia = cortes.sugeridos.palabras.find((s) => s.i === i);
        const titulo = motivo
          ? `${ETIQUETA[motivo]}${motivo !== "manual" && sugerencia ? `: ${sugerencia.motivo}` : ""}. Clic para recuperarla.`
          : sugerencia
            ? `Recuperada (${ETIQUETA[sugerencia.tipo].toLowerCase()}: ${sugerencia.motivo}). Clic para cortarla.`
            : "Clic para cortarla. Alt + clic: ir a este momento.";
        return (
          <Fragment key={i}>
            <span
              role="button"
              tabIndex={0}
              className={`palabra ${motivo ? `quitada ${motivo}` : ""} ${p.sinTranscribir ? "sonido" : ""} ${actual === i ? "actual" : ""}`}
              title={titulo}
              onClick={(e) => (e.altKey ? onIr(p.inicioMs) : tocarPalabra(i))}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  tocarPalabra(i);
                }
              }}
            >
              {p.sinTranscribir ? "eh…" : p.texto}
            </span>
            {pausa(i)}
          </Fragment>
        );
      })}
    </div>
  );
};

export const LEYENDA: { tipo: TipoCorte; texto: string }[] = [
  { tipo: "pausa", texto: "Pausa cortada" },
  { tipo: "muletilla", texto: "Muletilla" },
  { tipo: "toma", texto: "Toma o tropiezo" },
  { tipo: "largo", texto: "Por duración" },
  { tipo: "manual", texto: "A mano" },
];
