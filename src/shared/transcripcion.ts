/**
 * Modelos para transcribir crudos. faster-whisper (CTranslate2, int8) es el motor principal: en una CPU de
 * notebook transcribe el modelo "medium" a la mitad del tiempo real, contra 2,3× de whisper.cpp 1.5.5.
 * whisper.cpp queda de respaldo si faster-whisper no está instalado.
 *
 * `factor` = segundos de proceso por segundo de audio, medido con un crudo de 113 s en un Core Ultra 5 135U
 * con 4 hilos (los de base y small son estimados a partir de esos). Sirve para mostrar el tiempo aproximado.
 */
export const MODELOS_TRANSCRIPCION = [
  { id: "base", nombre: "Base", mb: 145, factor: 0.12, detalle: "Muy rápido, se equivoca más con nombres propios." },
  { id: "small", nombre: "Small", mb: 484, factor: 0.25, detalle: "Rápido y bastante preciso." },
  { id: "medium", nombre: "Medium", mb: 1528, factor: 0.5, detalle: "El mejor equilibrio: preciso en español rioplatense." },
  { id: "large-v3", nombre: "Large v3", mb: 3087, factor: 0.91, detalle: "El más preciso, el doble de lento que medium." },
] as const;

export type IdModeloTranscripcion = (typeof MODELOS_TRANSCRIPCION)[number]["id"];
export const IDS_MODELOS_TRANSCRIPCION = MODELOS_TRANSCRIPCION.map((m) => m.id) as [IdModeloTranscripcion, ...IdModeloTranscripcion[]];

/** Arriba de esto se pregunta antes de bajar: a veces la compu está conectada al hotspot del celular. */
export const MB_PREGUNTAR_DESCARGA = 500;

export const infoModelo = (id: IdModeloTranscripcion) => MODELOS_TRANSCRIPCION.find((m) => m.id === id)!;

/** "1,5 GB" o "484 MB". */
export const textoMb = (mb: number) => (mb >= 1000 ? `${(mb / 1000).toLocaleString("es-UY", { maximumFractionDigits: 1 })} GB` : `${Math.round(mb)} MB`);

/** "~1 min" para transcribir `segundosAudio` con ese modelo. */
export const tiempoEstimado = (id: IdModeloTranscripcion, segundosAudio: number) => {
  const s = Math.max(5, Math.round(infoModelo(id).factor * segundosAudio + 3));
  return s < 60 ? `~${s} s` : `~${Math.round(s / 60)} min`;
};

/** Palabras sueltas de faster-whisper → palabras: las que no empiezan con espacio siguen a la anterior ("3" + ".000"). */
export const unirPalabrasFw = (crudas: { t: string; i: number; f: number; p: number | null }[]) => {
  const out: { texto: string; inicioMs: number; finMs: number; prob: number | null }[] = [];
  for (const w of crudas) {
    const previa = out.at(-1);
    if (previa && !/^\s/.test(w.t) && w.t.trim()) {
      previa.texto += w.t.trim();
      previa.finMs = Math.max(previa.finMs, Math.round(w.f * 1000));
      if (w.p !== null && previa.prob !== null) previa.prob = Math.min(previa.prob, w.p);
    } else if (w.t.trim()) {
      out.push({ texto: w.t.trim(), inicioMs: Math.round(w.i * 1000), finMs: Math.round(w.f * 1000), prob: w.p });
    }
  }
  return out;
};
