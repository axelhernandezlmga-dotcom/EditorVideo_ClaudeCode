---
name: capturar-noticias
description: Captura con tu propio Chrome (sesiones iniciadas, sin muros de pago) las noticias que quedaron PENDIENTES en los crudos de la Fábrica de Videos y las marca como listas. Usala cuando el usuario escriba /capturar-noticias o pida capturar las noticias pendientes. Necesita Claude Code abierto con `claude --chrome`.
---

# Capturar noticias pendientes con tu Chrome

Las noticias que la app no pudo capturar sola (muro de pago, anti-bots, cartel que no se fue) quedan **PENDIENTES** en
`jobs/<trabajo>/material.json`. Esta skill las abre en el Chrome del usuario con la extensión Claude in Chrome (que usa
sus sesiones iniciadas: suscripciones, cookies ya aceptadas), saca la captura del titular + bajada, la guarda en la
carpeta del trabajo y la marca como lista.

## 0. Antes de empezar
- Las herramientas `mcp__claude-in-chrome__*` tienen que estar disponibles. Si no están, decile al usuario que cierre y
  abra Claude Code con `claude --chrome` (y que tenga instalada la extensión Claude in Chrome), y terminá.
- Si el sistema es WSL (`grep -qi microsoft /proc/version`), avisá que la integración con Chrome no funciona en WSL y terminá.
- Cargá de una sola vez las herramientas que vas a usar: `tabs_context_mcp`, `tabs_create_mcp`, `navigate`, `computer`,
  `javascript_tool`, `find`, `tabs_close_mcp`.

## 1. Ver qué hay pendiente
Desde la raíz del proyecto:
```bash
npm run -s capturas -- pendientes
```
Devuelve un JSON con `trabajo`, `id`, `url`, `titulo`, `medio`, `resaltado` y `nombreSugerido` de cada noticia.
Si la lista está vacía, decilo y terminá. Si hay varias, hacelas todas, una por una.

## 2. Por cada noticia
1. `tabs_context_mcp` y después abrí una pestaña nueva con `tabs_create_mcp` (no uses pestañas que ya tenía el usuario).
2. `navigate` a la `url`. Esperá a que cargue.
3. Si aparece un cartel de cookies o de suscripción que se pueda cerrar, cerralo (botón "Aceptar", "Entendido", la X).
   No inicies sesión ni aceptes pagos: si la nota no se ve igual, salteala y avisá al final.
4. Con `javascript_tool`, ejecutá este código (cambiá `NOMBRE` por el `nombreSugerido` y `RESALTAR` por el `resaltado`
   entre comillas, o `null`). Esconde publicidad y elementos flotantes, recorta titular + bajada y descarga el PNG:
```js
(async () => {
  const NOMBRE = "captura-TRABAJO-ID.png";
  const RESALTAR = null; // o "frase textual del titular o la bajada"
  const ocultar = (el) => el.style.setProperty("display", "none", "important");
  document.querySelectorAll('[id*="google_ads"], [id^="div-gpt"], ins.adsbygoogle, iframe[src*="doubleclick"], [class*="publicidad"], [class*="advert"], [class*="cookie"], [id*="cookie"], [class*="consent"], [class*="newsletter"]').forEach(ocultar);
  for (const el of document.querySelectorAll("body *")) { const cs = getComputedStyle(el); if (cs.position === "fixed" || cs.position === "sticky") ocultar(el); }
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 200 && r.height > 20; };
  const h1 = [...document.querySelectorAll("h1")].filter(visible).sort((a, b) => parseFloat(getComputedStyle(b).fontSize) - parseFloat(getComputedStyle(a).fontSize))[0];
  if (!h1) return "SIN_TITULAR";
  const bajada = [...document.querySelectorAll('[class*="bajada"], [class*="copete"], [class*="subtit"], [class*="summary"], [class*="lead"], [class*="excerpt"], h2, p')]
    .find((el) => visible(el) && (h1.compareDocumentPosition(el) & 4) && !h1.contains(el) && el.textContent.trim().length > 40 && el.getBoundingClientRect().top - h1.getBoundingClientRect().bottom < 400);
  h1.scrollIntoView({ block: "start" });
  await new Promise((r) => setTimeout(r, 300));
  const r1 = h1.getBoundingClientRect(), r2 = bajada ? bajada.getBoundingClientRect() : r1, pad = 28;
  const x = Math.max(0, Math.min(r1.left, r2.left) - pad), y = Math.max(0, r1.top - pad);
  const w = Math.max(r1.right, r2.right) + pad - x, h = Math.min(Math.max(r1.bottom, r2.bottom) + pad - y, 1100);
  const rects = [];
  if (RESALTAR) {
    for (const el of [h1, bajada].filter(Boolean)) {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let nodo;
      while ((nodo = walker.nextNode())) {
        const k = nodo.data.toLowerCase().indexOf(RESALTAR.toLowerCase());
        if (k < 0) continue;
        const rango = document.createRange(); rango.setStart(nodo, k); rango.setEnd(nodo, Math.min(nodo.length, k + RESALTAR.length));
        for (const r of rango.getClientRects()) rects.push({ x: (r.left - x) / w, y: (r.top - y) / h, w: r.width / w, h: r.height / h });
      }
    }
  }
  if (!window.html2canvas) await new Promise((ok, mal) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"; s.onload = ok; s.onerror = () => mal(new Error("CSP")); document.head.appendChild(s); });
  const canvas = await window.html2canvas(document.body, { x: x + window.scrollX, y: y + window.scrollY, width: w, height: h, scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false });
  const a = document.createElement("a"); a.href = canvas.toDataURL("image/png"); a.download = NOMBRE; a.click();
  return JSON.stringify(rects);
})();
```
5. El resultado es el JSON con los rectángulos del resaltado (puede ser `[]`). Si devuelve `SIN_TITULAR`, mirá la
   página con una captura de pantalla y avisá al usuario. Si falla por `CSP` (el sitio no deja cargar html2canvas),
   avisá: el usuario puede subir una captura propia desde la revisión.
6. Esperá un par de segundos a que termine la descarga y marcá la noticia como lista (el archivo se busca solo en
   Descargas/Downloads):
```bash
npm run -s capturas -- listo <trabajo> <id> <nombreSugerido> '<JSON de rects>'
```
7. Cerrá la pestaña con `tabs_close_mcp`.

## 3. Al terminar
Resumí: cuántas noticias se capturaron, cuáles no y por qué (muro de pago, sin titular, CSP). Recordale al usuario
que vuelva a la revisión del crudo en la app (se actualiza sola) para ver las capturas y renderizar.

## Reglas
- No inicies sesión, no aceptes pagos, no completes formularios, no cambies nada de la cuenta del usuario.
- Solo abrí las URLs de la lista. No navegues a otros sitios.
- Si algo falla dos veces seguidas con la misma noticia, salteala y seguí con la próxima.
