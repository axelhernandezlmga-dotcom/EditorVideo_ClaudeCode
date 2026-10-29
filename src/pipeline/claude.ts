import { mkdir } from "node:fs/promises";
import { z } from "zod";
import { ejecutar, ErrorProceso } from "./proceso";

export class ErrorClaude extends Error {
  constructor(
    message: string,
    readonly tipo: "auth" | "limite" | "salida" | "proceso" | "no_instalado",
  ) {
    super(message);
  }
}

type MensajeStream =
  | { type: "assistant"; message: { content: { type: string; name?: string; input?: Record<string, unknown>; text?: string }[] } }
  | { type: "result"; subtype: string; is_error: boolean; result?: string; structured_output?: unknown; total_cost_usd?: number; num_turns?: number }
  | { type: string; [k: string]: unknown };

const describirHerramienta = (name: string, input: Record<string, unknown> = {}) => {
  if (name === "WebSearch") return `Buscando en la web: "${String(input.query ?? "")}"`;
  if (name === "WebFetch") {
    try {
      return `Leyendo ${new URL(String(input.url)).hostname}`;
    } catch {
      return "Leyendo una página";
    }
  }
  if (name === "StructuredOutput") return "Escribiendo el guion…";
  return `Usando ${name}`;
};

const MSJ_AUTH =
  "Claude Code no está logueado. Abrí una terminal, ejecutá `claude`, iniciá sesión con tu suscripción y volvé a intentar.";
const MSJ_LIMITE = "Llegaste al límite de uso de tu suscripción de Claude. El trabajo quedó en pausa: reanudalo más tarde.";

export const clasificar = (texto: string): ErrorClaude | null => {
  if (/not logged in|please run \/login|invalid api key|authentication|unauthorized|oauth|401/i.test(texto)) return new ErrorClaude(MSJ_AUTH, "auth");
  // "You've hit your session limit · resets 1:10pm" también es un límite (pausa, no error)
  if (/usage limit|rate limit|session limit|limit reached|hit your .*limit|quota|429|resets? (at |\d)/i.test(texto)) return new ErrorClaude(MSJ_LIMITE, "limite");
  return null;
};

/** En Windows el instalador nativo deja `claude.exe` (spawn sin shell no ejecuta .cmd). Se puede forzar con FABRICA_CLAUDE_BIN. */
export const CLAUDE_BIN = process.env.FABRICA_CLAUDE_BIN || (process.platform === "win32" ? "claude.exe" : "claude");

let versionCache: string | null | undefined;
export const versionClaude = async (): Promise<string | null> => {
  if (versionCache !== undefined) return versionCache;
  try {
    versionCache = /(\d+\.\d+\.\d+)/.exec(await ejecutar(CLAUDE_BIN, ["--version"]))?.[1] ?? null;
  } catch {
    versionCache = null;
  }
  return versionCache;
};

export const compararVersiones = (a: string, b: string) => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
};

/** `--permission-prompts` existe desde Claude Code 2.1.259. */
export const VERSION_PERMISSION_PROMPTS = "2.1.259";

export type OpcionesClaude<T extends z.ZodType> = {
  prompt: string;
  schema: T;
  cwd: string;
  systemPromptFile?: string;
  model?: string;
  herramientas?: string[];
  signal?: AbortSignal;
  onActividad?: (texto: string) => void;
  onLog?: (texto: string) => void;
};

export class ErrorEsquema extends Error {}

/**
 * `--json-schema` se manda como `input_schema` de una herramienta: la raíz tiene que ser
 * `{"type":"object","properties":{...},"required":[...]}`, sin `$ref`/`$defs`/`definitions`/`oneOf` ni `$schema`.
 * Si no, la API responde "400 tools.0.custom.input_schema.type: Field required".
 */
export const validarEsquemaRaiz = (esquema: unknown): void => {
  if (!esquema || typeof esquema !== "object" || Array.isArray(esquema)) throw new ErrorEsquema("El esquema JSON tiene que ser un objeto.");
  const e = esquema as Record<string, unknown>;
  if (e.type !== "object") throw new ErrorEsquema(`La raíz del esquema tiene que tener "type":"object" (tiene ${JSON.stringify(e.type)}). Si la respuesta es una lista o una unión, envolvela en un objeto.`);
  if (!e.properties || typeof e.properties !== "object") throw new ErrorEsquema('La raíz del esquema no tiene "properties".');
  if (!Array.isArray(e.required)) throw new ErrorEsquema('La raíz del esquema no tiene "required".');
  for (const k of ["$schema", "$ref", "$defs", "definitions", "oneOf", "anyOf", "allOf"]) {
    if (k in e) throw new ErrorEsquema(`La raíz del esquema no puede tener "${k}".`);
  }
};

/** Convierte un esquema zod al JSON Schema que acepta `claude -p --json-schema`. */
export const esquemaParaClaude = (schema: z.ZodType): Record<string, unknown> => {
  const { $schema: _, ...jsonSchema } = z.toJSONSchema(schema, { target: "draft-7", io: "input" }) as Record<string, unknown>;
  validarEsquemaRaiz(jsonSchema);
  return jsonSchema;
};

const UNA_VEZ = async <T extends z.ZodType>(o: OpcionesClaude<T>, prompt: string): Promise<{ crudo: unknown; costo?: number }> => {
  const herramientas = o.herramientas ?? ["WebSearch", "WebFetch"];
  const jsonSchema = esquemaParaClaude(o.schema);
  const args = [
    // el prompt va por stdin: como argumento, Windows lo corta a ~8.000 caracteres
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--json-schema",
    JSON.stringify(jsonSchema),
    // solo las herramientas necesarias, sin preguntar permisos
    "--tools",
    herramientas.join(","),
    "--allowedTools",
    herramientas.join(","),
    // aislado de la config personal (plugins, hooks, MCP) para que sea rápido y predecible
    "--strict-mcp-config",
    "--disable-slash-commands",
    "--setting-sources",
    "project,local",
    "--no-session-persistence",
    // OJO: nunca --bare (en modo bare no usa el login de la suscripción)
  ];
  const version = await versionClaude();
  if (version && compararVersiones(version, VERSION_PERMISSION_PROMPTS) >= 0) args.push("--permission-prompts", "none");
  if (o.systemPromptFile) args.push("--append-system-prompt-file", o.systemPromptFile);
  if (o.model) args.push("--model", o.model);

  let resultado: Extract<MensajeStream, { type: "result" }> | null = null;
  let textoError = "";
  await mkdir(o.cwd, { recursive: true });
  try {
    await ejecutar(CLAUDE_BIN, args, {
      cwd: o.cwd,
      stdin: prompt,
      signal: o.signal,
      onStdoutLinea: (linea) => {
        let m: MensajeStream;
        try {
          m = JSON.parse(linea) as MensajeStream;
        } catch {
          return;
        }
        if (m.type === "assistant") {
          for (const c of (m as Extract<MensajeStream, { type: "assistant" }>).message.content) {
            if (c.type === "tool_use" && c.name) o.onActividad?.(describirHerramienta(c.name, c.input));
          }
        } else if (m.type === "result") {
          resultado = m as Extract<MensajeStream, { type: "result" }>;
          if (resultado.is_error) textoError = resultado.result ?? resultado.subtype;
        }
      },
    });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      throw new ErrorClaude("No encuentro el comando `claude`. Instalá Claude Code (https://claude.com/claude-code) y corré `npm run setup`.", "no_instalado");
    }
    if (e instanceof ErrorProceso) {
      const r = resultado as Extract<MensajeStream, { type: "result" }> | null;
      const detalle = `${textoError} ${r?.result ?? ""} ${e.stderr}`;
      throw clasificar(detalle) ?? new ErrorClaude(`claude -p falló (código ${e.codigo}): ${detalle.trim().slice(0, 400)}`, "proceso");
    }
    throw e;
  }
  const r = resultado as Extract<MensajeStream, { type: "result" }> | null;
  if (!r) throw new ErrorClaude("claude -p terminó sin devolver resultado.", "salida");
  if (r.is_error) throw clasificar(textoError) ?? new ErrorClaude(`claude -p devolvió un error: ${textoError.slice(0, 400)}`, "proceso");
  if (r.structured_output === undefined) throw new ErrorClaude("claude -p no devolvió `structured_output`.", "salida");
  o.onLog?.(`claude -p: ${r.num_turns ?? "?"} turnos${r.total_cost_usd ? `, costo equivalente US$ ${r.total_cost_usd.toFixed(3)} (cubierto por tu suscripción)` : ""}`);
  return { crudo: r.structured_output, costo: r.total_cost_usd };
};

/**
 * Llama a Claude Code en modo no interactivo y devuelve la salida estructurada validada con zod.
 * Si falta `structured_output` o no valida, reintenta una vez contándole el error.
 */
export const pedirAClaude = async <T extends z.ZodType>(o: OpcionesClaude<T>): Promise<z.infer<T>> => {
  let prompt = o.prompt;
  for (let intento = 1; intento <= 2; intento++) {
    try {
      const { crudo } = await UNA_VEZ(o, prompt);
      const v = o.schema.safeParse(crudo);
      if (v.success) return v.data;
      const errores = v.error.issues.slice(0, 12).map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n");
      o.onLog?.(`La salida de Claude no pasó la validación (intento ${intento}):\n${errores}`);
      prompt = `${o.prompt}\n\nIMPORTANTE: tu respuesta anterior no cumplía el esquema. Corregí estos errores:\n${errores}`;
    } catch (e) {
      if (!(e instanceof ErrorClaude) || e.tipo !== "salida" || intento === 2) throw e;
      o.onLog?.(`${e.message} Reintento…`);
    }
  }
  throw new ErrorClaude("Claude no pudo generar una salida válida después de 2 intentos. Probá con \"Regenerar guion\" o cambiá la idea.", "salida");
};
