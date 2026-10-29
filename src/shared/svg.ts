/**
 * Saneo de los SVG que dibuja la app para objetos nuevos: solo formas, sin scripts, eventos, enlaces ni
 * contenido externo. Devuelve el CONTENIDO (lo de adentro del <svg>) o null si no queda nada usable.
 */
const PERMITIDOS = new Set(["g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "defs", "lineargradient", "radialgradient", "stop", "text", "tspan"]);

export const sanearSvg = (svg: string): string | null => {
  let s = svg.replace(/<!--[\s\S]*?-->/g, "").replace(/<\?xml[^>]*>/gi, "");
  // lo de adentro del <svg> (si vino entero)
  const m = /<svg[^>]*>([\s\S]*)<\/svg>/i.exec(s);
  if (m) s = m[1]!;
  // fuera todo lo que no sea una forma permitida (con su contenido si es un bloque peligroso)
  s = s.replace(/<(script|style|foreignObject|iframe|image|use|a|animate\w*|set)\b[\s\S]*?(<\/\1>|\/>)/gi, "");
  s = s.replace(/<\/?([a-zA-Z][\w:-]*)\b[^>]*>/g, (etiqueta, nombre: string) => (PERMITIDOS.has(nombre.toLowerCase()) ? etiqueta : ""));
  // atributos peligrosos: eventos, enlaces y url() que no sean a un id local
  s = s.replace(/\s(on\w+|href|xlink:href|style)\s*=\s*("[^"]*"|'[^']*')/gi, "");
  s = s.replace(/url\(\s*(['"]?)(?!#)[^)]*\)/gi, "none");
  s = s.trim();
  return /<(path|rect|circle|ellipse|polygon|polyline|line)\b/i.test(s) && s.length <= 60_000 ? s : null;
};
