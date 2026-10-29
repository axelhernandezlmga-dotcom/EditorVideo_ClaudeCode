import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright-core";

/** Resultado de capturar una nota: la imagen del titular + bajada y dónde quedó la frase a resaltar. */
export type Captura = {
  titulo: string;
  bajada: string | null;
  fecha: string | null;
  ancho: number;
  alto: number;
  /** Rectángulos (0–1) de la frase resaltada dentro de la captura. */
  rects: { x: number; y: number; w: number; h: number }[];
};

export class CapturaFallida extends Error {
  /** Fallas de carga (timeout, red): vale la pena probar de nuevo. Un muro de pago o un anti-bots, no. */
  constructor(mensaje: string, readonly reintentable = false) {
    super(mensaje);
  }
}

/** Corre `intento` y, si falla por algo que se puede reintentar, lo prueba una vez más antes de rendirse. */
export const conReintento = async <T>(intento: () => Promise<T>, pausaMs = 2000): Promise<T> => {
  try {
    return await intento();
  } catch (e) {
    if (e instanceof CapturaFallida && !e.reintentable) throw e;
    await new Promise((r) => setTimeout(r, pausaMs));
    return intento();
  }
};

/** Chrome del sistema primero (no hay que bajar nada); si no, el Chromium que haya dejado Playwright. */
export const buscarNavegador = (): string | null => {
  const candidatos = [
    process.env.FABRICA_CHROME,
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];
  for (const c of candidatos) if (c && existsSync(c)) return c;
  const cache = path.join(os.homedir(), ".cache", "ms-playwright");
  if (existsSync(cache)) {
    try {
      const dir = readdirSync(cache).filter((d) => d.startsWith("chromium-")).sort().at(-1);
      const bin = dir && path.join(cache, dir, "chrome-linux", "chrome");
      if (bin && existsSync(bin)) return bin;
    } catch {
      // sin caché usable
    }
  }
  return null;
};

let navegador: Promise<Browser> | null = null;
const abrirNavegador = () => {
  navegador ??= (async () => {
    const executablePath = buscarNavegador();
    if (!executablePath) throw new CapturaFallida("No encontré Chrome ni Chromium para capturar las noticias.");
    return chromium.launch({ executablePath, headless: true, args: ["--disable-blink-features=AutomationControlled", "--lang=es-UY"] });
  })();
  return navegador;
};

export const cerrarNavegador = async () => {
  const n = navegador;
  navegador = null;
  if (n) await (await n).close().catch(() => undefined);
};

/** Textos típicos de los botones de cookies en medios en español e inglés. */
const BOTONES_COOKIES = /^(aceptar|acepto|aceptar todo|aceptar todas|aceptar y cerrar|aceptar cookies|entendido|de acuerdo|ok|continuar|accept|accept all|i agree|agree|got it|allow all)$/i;

/** Dominios de publicidad y medición: se bloquean al capturar. */
const ANUNCIOS = /(doubleclick|googlesyndication|googletagservices|googletagmanager|google-analytics|adservice|amazon-adsystem|taboola|outbrain|criteo|facebook\.net|connect\.facebook|hotjar|scorecardresearch|chartbeat|teads|smartadserver|pubmatic|rubiconproject|adnxs|onesignal)/i;

/** Señales de que la nota no se puede leer (muro de pago o anti-bots). */
const BLOQUEO = /(just a moment|attention required|access denied|acceso denegado|verify you are human|captcha|are you a robot)/i;
const MURO = /(suscrib[ií]te para (seguir|continuar) leyendo|contenido exclusivo para suscriptores|solo para suscriptores|this content is for subscribers|subscribe to continue|ya sos suscriptor)/i;

/**
 * Captura titular + bajada de una nota con Chrome sin ventana. Antes de sacar la foto acepta o quita el cartel
 * de cookies y saca la publicidad y todo lo que flota encima. Falla con `CapturaFallida` si hay un muro de
 * pago, un anti-bots o no encuentra el titular: la noticia queda PENDIENTE para resolverla a mano. Si la
 * página no cargó, reintenta una vez antes.
 */
export const capturarNoticia = (url: string, salida: string, resaltado: string | null): Promise<Captura> =>
  conReintento(() => capturarUnaVez(url, salida, resaltado));

const capturarUnaVez = async (url: string, salida: string, resaltado: string | null): Promise<Captura> => {
  const b = await abrirNavegador();
  const ctx = await b.newContext({
    viewport: { width: 900, height: 1400 },
    deviceScaleFactor: 2,
    locale: "es-UY",
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  });
  // tsx/esbuild agrega un helper `__name` a las funciones; adentro de la página no existe y el evaluate falla
  await ctx.addInitScript({ content: "globalThis.__name = (f) => f;" });
  const pagina = await ctx.newPage();
  try {
    // para recortar titular y bajada no hacen falta imágenes, video ni publicidad: sin eso carga mucho más rápido
    await pagina.route("**/*", (ruta) => {
      const req = ruta.request();
      const tipo = req.resourceType();
      if (tipo === "image" || tipo === "media" || ANUNCIOS.test(req.url())) return ruta.abort();
      return ruta.continue();
    });
    let respuesta;
    try {
      respuesta = await pagina.goto(url, { waitUntil: "commit", timeout: 60_000 });
      // alcanza con que aparezca el titular (no hace falta esperar a que cargue todo)
      await pagina.waitForSelector("h1", { timeout: 60_000 });
    } catch (e) {
      throw new CapturaFallida(`La página no cargó (${(e as Error).message.split("\n")[0]}).`, true);
    }
    if (respuesta && respuesta.status() >= 400) throw new CapturaFallida(`La página respondió ${respuesta.status()}${respuesta.status() === 403 ? " (bloqueo anti-bots)" : ""}.`);
    await pagina.waitForLoadState("domcontentloaded", { timeout: 20_000 }).catch(() => undefined);
    await pagina.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => undefined);

    // cartel de cookies: primero intentar aceptarlo (también dentro de iframes de consentimiento)
    for (const frame of pagina.frames()) {
      const botones = frame.locator("button, a[role=button], [role=button]");
      const n = Math.min(await botones.count().catch(() => 0), 60);
      for (let i = 0; i < n; i++) {
        const boton = botones.nth(i);
        const texto = ((await boton.innerText({ timeout: 300 }).catch(() => "")) || "").trim();
        if (BOTONES_COOKIES.test(texto) && (await boton.isVisible().catch(() => false))) {
          await boton.click({ timeout: 1500 }).catch(() => undefined);
          break;
        }
      }
    }
    await pagina.waitForTimeout(600);

    const textoPagina = (await pagina.title()) + " " + ((await pagina.locator("body").innerText({ timeout: 3000 }).catch(() => "")) || "").slice(0, 6000);
    if (BLOQUEO.test(textoPagina)) throw new CapturaFallida("El sitio pidió verificar que no soy un robot.");

    // publicidad, carteles flotantes y popups fuera; después buscar titular y bajada
    const datos = await pagina.evaluate((resaltar: string | null) => {
      const ocultar = (el: Element) => (el as HTMLElement).style.setProperty("display", "none", "important");
      const anuncios = '[id*="google_ads"], [id^="div-gpt"], ins.adsbygoogle, iframe[src*="doubleclick"], iframe[src*="googlesyndication"], [class*="publicidad"], [class*="advert"], [id*="publicidad"], [class*="banner-ad"], [class^="ad-"], [class*=" ad-"], [id^="ad-"], [class*="cookie"], [id*="cookie"], [class*="consent"], [id*="consent"], [class*="paywall"], [class*="newsletter"]';
      document.querySelectorAll(anuncios).forEach(ocultar);
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
        const cs = getComputedStyle(el);
        if ((cs.position === "fixed" || cs.position === "sticky") && el.getBoundingClientRect().height > 0) ocultar(el);
      }
      document.documentElement.style.setProperty("overflow", "visible", "important");
      document.body.style.setProperty("overflow", "visible", "important");

      const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        return r.width > 200 && r.height > 20 && getComputedStyle(el).visibility !== "hidden";
      };
      const h1 = Array.from(document.querySelectorAll("h1")).filter(visible).sort((a, b) => parseFloat(getComputedStyle(b).fontSize) - parseFloat(getComputedStyle(a).fontSize))[0];
      if (!h1) return null;
      // bajada: lo primero con pinta de copete después del titular
      const selBajada = '[class*="bajada"], [class*="copete"], [class*="subtit"], [class*="summary"], [class*="lead"], [class*="excerpt"], [class*="description"], h2, p';
      const despues = Array.from(document.querySelectorAll(selBajada)).filter(
        (el) => visible(el) && h1.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING && !h1.contains(el) && (el.textContent ?? "").trim().length > 40,
      );
      const bajada = despues.find((el) => el.getBoundingClientRect().top - h1.getBoundingClientRect().bottom < 400) ?? null;

      const r1 = h1.getBoundingClientRect();
      const r2 = bajada?.getBoundingClientRect();
      // volanta (el texto corto pegado arriba del titular, ej. "MERCADO DE TRABAJO"): entra entera o no entra
      const volanta = Array.from(document.querySelectorAll("body *")).find((el) => {
        const r = el.getBoundingClientRect();
        const texto = (el.textContent ?? "").trim();
        return el.children.length === 0 && texto.length > 2 && texto.length < 60 && r.height > 8 && r.bottom <= r1.top + 2 && r.bottom > r1.top - 50 && r.left < r1.right && r.right > r1.left;
      });
      const arribaVolanta = volanta ? volanta.getBoundingClientRect().top : r1.top;
      // margen chico abajo: con más, asoma el renglón del párrafo siguiente
      const pad = 24;
      const x = Math.max(0, Math.min(r1.left, r2?.left ?? r1.left) - pad);
      const y = Math.max(0, arribaVolanta + window.scrollY - 16);
      const derecha = Math.max(r1.right, r2?.right ?? r1.right) + pad;
      const abajo = Math.max(r1.bottom, r2?.bottom ?? r1.bottom) + window.scrollY + 10;
      const caja = { x, y, width: Math.min(document.documentElement.scrollWidth, derecha) - x, height: Math.min(abajo - y, 1100) };

      // frase a resaltar: buscarla en el texto del titular o la bajada y medir sus renglones
      const rects: { x: number; y: number; w: number; h: number }[] = [];
      if (resaltar) {
        const objetivo = resaltar.toLowerCase().replace(/\s+/g, " ").trim();
        for (const el of [h1, bajada].filter(Boolean) as Element[]) {
          const nodos: Text[] = [];
          const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          while (w.nextNode()) nodos.push(w.currentNode as Text);
          let todo = "";
          const inicios: number[] = [];
          for (const n of nodos) {
            inicios.push(todo.length);
            todo += n.data;
          }
          const plano = todo.toLowerCase().replace(/\s+/g, " ");
          // índice en el texto con espacios normalizados → índice real
          const mapa: number[] = [];
          let prevEsp = false;
          for (let i = 0; i < todo.length; i++) {
            const esp = /\s/.test(todo[i]!);
            if (esp && prevEsp) continue;
            mapa.push(i);
            prevEsp = esp;
          }
          const k = plano.indexOf(objetivo);
          if (k < 0) continue;
          const ini = mapa[k]!;
          const fin = mapa[Math.min(mapa.length - 1, k + objetivo.length - 1)]! + 1;
          const ubicar = (pos: number) => {
            let j = inicios.length - 1;
            while (j > 0 && inicios[j]! > pos) j--;
            return { nodo: nodos[j]!, off: Math.min(nodos[j]!.length, pos - inicios[j]!) };
          };
          const a = ubicar(ini);
          const z = ubicar(fin);
          const rango = document.createRange();
          rango.setStart(a.nodo, a.off);
          rango.setEnd(z.nodo, z.off);
          for (const r of Array.from(rango.getClientRects())) {
            if (r.width < 4) continue;
            rects.push({ x: (r.left - caja.x) / caja.width, y: (r.top + window.scrollY - caja.y) / caja.height, w: r.width / caja.width, h: r.height / caja.height });
          }
          break;
        }
      }
      const fecha =
        document.querySelector('meta[property="article:published_time"]')?.getAttribute("content") ??
        document.querySelector("time[datetime]")?.getAttribute("datetime") ??
        null;
      return { caja, titulo: (h1.textContent ?? "").trim(), bajada: bajada ? (bajada.textContent ?? "").trim().slice(0, 400) : null, fecha, rects };
    }, resaltado);

    if (!datos) throw new CapturaFallida("No encontré el titular de la nota.");
    if (MURO.test(textoPagina) && !datos.bajada) throw new CapturaFallida("La nota está detrás de un muro de pago.");
    await pagina.screenshot({ path: salida, clip: datos.caja, type: "png" });
    return {
      titulo: datos.titulo,
      bajada: datos.bajada,
      fecha: datos.fecha ? datos.fecha.slice(0, 10) : null,
      ancho: Math.round(datos.caja.width),
      alto: Math.round(datos.caja.height),
      rects: datos.rects,
    };
  } finally {
    await ctx.close().catch(() => undefined);
  }
};
