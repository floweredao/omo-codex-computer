import type { ExtensionAPI } from "@code-yeongyu/senpi";
import omoCodexComputer from "../src/index";

type Handler = (event: unknown, ctx: unknown) => unknown | Promise<unknown>;

const tools: Array<{ name?: unknown }> = [];
const commands = new Map<string, unknown>();
const handlers = new Map<string, Handler[]>();
const flags = new Map<string, boolean | string>();
let activeTools: string[] = ["read"];

const api = {
  registerTool(tool: { name?: unknown }): void {
    tools.push(tool);
  },
  registerCommand(name: string, options: unknown): void {
    commands.set(name, options);
  },
  registerFlag(
    name: string,
    options: { default?: boolean | string },
  ): void {
    if (options.default !== undefined) flags.set(name, options.default);
  },
  getFlag(name: string): boolean | string | undefined {
    return flags.get(name);
  },
  on(event: string, handler: Handler): void {
    handlers.set(event, [...(handlers.get(event) ?? []), handler]);
  },
  getActiveTools(): string[] {
    return [...activeTools];
  },
  getAllTools(): Array<{ name: string }> {
    return tools.flatMap((tool) =>
      typeof tool.name === "string" ? [{ name: tool.name }] : []
    );
  },
  setActiveTools(names: string[]): void {
    activeTools = [...names];
  },
  sendMessage(): void {},
};

omoCodexComputer(api as unknown as ExtensionAPI);

const toolNames = tools.flatMap((tool) =>
  typeof tool.name === "string" ? [tool.name] : []
);
const requiredEvents = [
  "agent_settled",
  "resources_discover",
  "session_shutdown",
  "session_start",
];

if (toolNames.length !== 12) {
  throw new Error(`Expected 12 tools, received ${toolNames.length}`);
}
if (!commands.has("codex-computer")) {
  throw new Error("Missing /codex-computer command");
}
for (const event of requiredEvents) {
  if (!handlers.has(event)) throw new Error(`Missing ${event} handler`);
}

const resources = await handlers.get("resources_discover")?.[0]?.(
  { type: "resources_discover", cwd: process.cwd(), reason: "startup" },
  {},
);
if (
  !resources
  || typeof resources !== "object"
  || !("skillPaths" in resources)
  || !Array.isArray(resources.skillPaths)
  || !resources.skillPaths.some(
    (entry) => typeof entry === "string" && entry.endsWith("/skills"),
  )
) {
  throw new Error("Missing packaged skill discovery");
}

console.log("OMO_HOST_QA_PASS");
