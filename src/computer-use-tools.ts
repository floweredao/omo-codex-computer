import type { ExtensionAPI, ExtensionContext } from "@code-yeongyu/senpi";
import type { OmpContentBlock } from "./content";
import { createComputerUseParameterSchemas } from "./computer-use-tool-schemas";
import type { ComputerUseToolResult } from "./computer-use-backend";
import type { ComputerUseRuntime } from "./runtime";

const COMPUTER_USE_UPSTREAM_TOOL_NAMES = [
  "computer_use_list_apps",
  "computer_use_get_app_state",
  "computer_use_click",
  "computer_use_type_text",
  "computer_use_press_key",
  "computer_use_scroll",
  "computer_use_drag",
  "computer_use_set_value",
  "computer_use_select_text",
  "computer_use_perform_secondary_action",
  "computer_use_paste",
] as const;

const COMPUTER_USE_LOCAL_TOOL_NAMES = ["computer_use_resolve_app"] as const;

export const COMPUTER_USE_TOOL_NAMES = [
  ...COMPUTER_USE_UPSTREAM_TOOL_NAMES,
  ...COMPUTER_USE_LOCAL_TOOL_NAMES,
] as const;

export type ComputerUseToolName = (typeof COMPUTER_USE_TOOL_NAMES)[number];
type UpstreamComputerUseToolName = (typeof COMPUTER_USE_UPSTREAM_TOOL_NAMES)[number];
type LocalComputerUseToolName = (typeof COMPUTER_USE_LOCAL_TOOL_NAMES)[number];
type ComputerUseToolApproval = "read" | "write";

const COMPUTER_USE_UPSTREAM_TOOLS = [
  {
    name: "computer_use_list_apps",
    mcpToolName: "list_apps",
    label: "List Apps",
    description: "List applications currently known to Computer Use. This may omit unbundled macOS GUI processes launched as raw executables; use computer_use_resolve_app when a running local app is missing.",
    approval: "read",
  },
  {
    name: "computer_use_get_app_state",
    mcpToolName: "get_app_state",
    label: "Get App State",
    description: "Inspect the current state of an application for Computer Use. Prefer stable app targets such as bundle id or .app path over display name. Set disableDiff to true when a complete accessibility tree is needed instead of a diff. If this returns Invalid app for a local development GUI process, call computer_use_resolve_app; raw executables may have visible windows but be missing from the Computer Use app index.",
    approval: "read",
  },
  {
    name: "computer_use_click",
    mcpToolName: "click",
    label: "Click",
    description: "Click a target in an application through Computer Use. Provide element_index or both x and y; prefer element_index from the latest app state.",
    approval: "write",
  },
  {
    name: "computer_use_type_text",
    mcpToolName: "type_text",
    label: "Type Text",
    description: "Type text into an application through Computer Use. Key injection only supports ASCII; text containing non-ASCII characters (for example Korean, Japanese, Chinese, or emoji) is pasted via the clipboard instead, and when element_index targets a text field its value is set directly without touching the clipboard. Newlines in text simulate pressing Return, which submits the form or sends the message in many apps.",
    approval: "write",
  },
  {
    name: "computer_use_press_key",
    mcpToolName: "press_key",
    label: "Press Key",
    description: "Press a key or keyboard shortcut through Computer Use. Uses xdotool-style key names (for example a, Return, BackSpace, Delete, Tab, super+c, Up, KP_0).",
    approval: "write",
  },
  {
    name: "computer_use_scroll",
    mcpToolName: "scroll",
    label: "Scroll",
    description: "Scroll within an application through Computer Use.",
    approval: "write",
  },
  {
    name: "computer_use_drag",
    mcpToolName: "drag",
    label: "Drag",
    description: "Drag from one point to another through Computer Use.",
    approval: "write",
  },
  {
    name: "computer_use_set_value",
    mcpToolName: "set_value",
    label: "Set Value",
    description: "Set the value of a control through Computer Use.",
    approval: "write",
  },
  {
    name: "computer_use_select_text",
    mcpToolName: "select_text",
    label: "Select Text",
    description: "Select text in an application through Computer Use.",
    approval: "write",
  },
  {
    name: "computer_use_perform_secondary_action",
    mcpToolName: "perform_secondary_action",
    label: "Secondary Action",
    description: "Perform a secondary action such as a contextual click through Computer Use.",
    approval: "write",
  },
  {
    name: "computer_use_paste",
    mcpToolName: "paste",
    label: "Paste",
    description: "Paste text, Markdown, or HTML into the current focus in an application through Computer Use, then restore the previous clipboard contents. Prefer this over typing for large or formatted content.",
    approval: "write",
  },
] as const satisfies ReadonlyArray<{
  name: UpstreamComputerUseToolName;
  mcpToolName: string;
  label: string;
  description: string;
  approval: ComputerUseToolApproval;
}>;

const COMPUTER_USE_LOCAL_TOOLS = [
  {
    name: "computer_use_resolve_app",
    label: "Resolve App",
    description: "Resolve an application target before using Computer Use. Diagnoses missing registered apps, raw executable paths, PID targets, and bundle id/.app path recommendations without controlling the desktop.",
    approval: "read",
  },
] as const satisfies ReadonlyArray<{
  name: LocalComputerUseToolName;
  label: string;
  description: string;
  approval: ComputerUseToolApproval;
}>;

export const COMPUTER_USE_MCP_TOOL_NAMES = Object.freeze(COMPUTER_USE_UPSTREAM_TOOLS.map((tool) => tool.mcpToolName));
export const COMPUTER_USE_WRITE_TOOL_NAMES = Object.freeze(
  COMPUTER_USE_UPSTREAM_TOOLS
    .filter((tool) => tool.approval === "write")
    .map((tool) => tool.name),
);

export function registerComputerUseTools(pi: ExtensionAPI, runtime: ComputerUseRuntime): void {
  const parametersByTool = createComputerUseParameterSchemas();

  for (const tool of COMPUTER_USE_UPSTREAM_TOOLS) {
    const definition = {
      name: tool.name,
      label: tool.label,
      description: tool.description,
      parameters: parametersByTool[tool.name],
      exposure: "search",
      searchText: tool.description,
      searchKeywords: ["macOS", "desktop", "computer use", tool.mcpToolName],
      searchGroup: "codex-computer",
      allowLazyActivation: true,
      executionMode: "sequential",
      prepareArguments: (args: unknown) => prepareComputerUseArguments(tool.name, args),
      async execute(
        _toolCallId: string,
        params: Record<string, unknown>,
        signal: AbortSignal | undefined,
        _onUpdate: unknown,
        ctx: ExtensionContext,
      ) {
        // Text-input routing: a targeted text field gets set_value directly
        // (no key events, no clipboard), untargeted non-ASCII goes to the
        // clipboard-based paste path (key injection can't produce IME scripts),
        // and everything else keeps real key events via type_text.
        const reroute = tool.name === "computer_use_type_text" ? routeTypeText(params) : undefined;
        const upstreamTool = reroute?.tool ?? tool.mcpToolName;
        const upstreamParams = reroute?.params ?? params as Record<string, unknown>;
        try {
          const result = signal
            ? await runtime.callTool(ctx, upstreamTool, upstreamParams, signal)
            : await runtime.callTool(ctx, upstreamTool, upstreamParams);
          return {
            content: result.content,
            details: summarizeResult(result),
          };
        } catch (error) {
          // Upstream paste applies the text, then waits for the app to read the
          // clipboard and can report -10005 even though the paste landed. Verify
          // the text reached the app instead of reporting a false failure; the
          // no-replay invariant forbids a blind retry here either way.
          const pastedText = upstreamParams.text;
          if (upstreamTool === "paste"
            && typeof pastedText === "string"
            && typeof upstreamParams.app === "string"
            && isClipboardReadTimeout(error)) {
            const confirmed = await confirmPastedText(runtime, ctx, upstreamParams.app, pastedText, signal);
            if (confirmed) return confirmed;
          }
          throw error;
        }
      },
    };
    pi.registerTool(definition as Parameters<ExtensionAPI["registerTool"]>[0]);
  }

  for (const tool of COMPUTER_USE_LOCAL_TOOLS) {
    const definition = {
      name: tool.name,
      label: tool.label,
      description: tool.description,
      parameters: parametersByTool[tool.name],
      exposure: "search",
      searchText: tool.description,
      searchKeywords: ["macOS", "desktop", "computer use", "resolve app"],
      searchGroup: "codex-computer",
      allowLazyActivation: true,
      executionMode: "sequential",
      prepareArguments: (args: unknown) => prepareComputerUseArguments(tool.name, args),
      async execute(
        _toolCallId: string,
        params: Record<string, unknown>,
        signal: AbortSignal | undefined,
        _onUpdate: unknown,
        ctx: ExtensionContext,
      ) {
        return executeLocalTool(tool.name, runtime, params, signal, ctx);
      },
    };
    pi.registerTool(definition as Parameters<ExtensionAPI["registerTool"]>[0]);
  }
}

async function executeLocalTool(
  toolName: LocalComputerUseToolName,
  runtime: ComputerUseRuntime,
  params: Record<string, unknown>,
  signal: AbortSignal | undefined,
  ctx: ExtensionContext,
) {
  switch (toolName) {
    case "computer_use_resolve_app": {
      const app = typeof params.app === "string" ? params.app : "";
      const result = signal
        ? await runtime.resolveAppTarget(ctx, app, signal)
        : await runtime.resolveAppTarget(ctx, app);
      return {
        content: result.content,
        details: summarizeResult(result),
      };
    }
  }
}

interface ComputerUseToolSummary {
  contentTypes: string[];
  counts: Record<string, number>;
  hasStructuredContent: boolean;
  hasMeta: boolean;
}

function prepareComputerUseArguments(
  toolName: ComputerUseToolName,
  args: unknown,
): Record<string, unknown> {
  if (!isRecord(args)) throw new Error("Computer Use tool arguments must be an object");
  if (toolName !== "computer_use_click") return args;

  const hasElementIndex = typeof args.element_index === "string";
  const hasX = typeof args.x === "number", hasY = typeof args.y === "number";
  if (hasX !== hasY || (!hasElementIndex && !hasX)) {
    throw new Error("Provide element_index or both x and y");
  }
  return args;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Upstream key injection cannot produce characters outside the ASCII range
// (tab, newline, carriage return, and printable ASCII are key-representable).
// IME scripts such as Hangul lose jamo mid-composition, so such text is routed
// to the clipboard-based paste tool instead, before any dispatch.
function needsClipboardInput(text: unknown): boolean {
  return typeof text === "string" && !/^[\x09\x0A\x0D\x20-\x7E]*$/.test(text);
}

// Decides which upstream tool actually performs a computer_use_type_text call.
// element_index means a text field was targeted, so set_value replaces its
// contents — the most reliable input and it also handles IME text without the
// clipboard. Otherwise non-ASCII falls back to paste, ASCII keeps key events.
function routeTypeText(
  params: Record<string, unknown>,
): { tool: "set_value" | "paste"; params: Record<string, unknown> } | undefined {
  const elementIndex = params.element_index;
  if (typeof elementIndex === "string" && elementIndex !== "") {
    return { tool: "set_value", params: { app: params.app, element_index: elementIndex, value: params.text } };
  }
  if (needsClipboardInput(params.text)) {
    // Upstream paste requires an explicit format; type_text input is plain text.
    return { tool: "paste", params: { ...params, format: "text" } };
  }
  return undefined;
}

function summarizeResult(result: ComputerUseToolResult): ComputerUseToolSummary {
  const counts: Record<string, number> = {};
  const contentTypes: string[] = [];

  for (const block of result.content) {
    const type = getContentType(block);
    counts[type] = (counts[type] ?? 0) + 1;
    if (!contentTypes.includes(type)) contentTypes.push(type);
  }

  return {
    contentTypes,
    counts,
    hasStructuredContent: result.structuredContent !== undefined,
    hasMeta: result.meta !== undefined,
  };
}

function getContentType(block: OmpContentBlock): string {
  return typeof block.type === "string" ? block.type : "unknown";
}

const CLIPBOARD_READ_TIMEOUT_PATTERN = /-10005|timed out waiting.*clipboard/i;

function isClipboardReadTimeout(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return CLIPBOARD_READ_TIMEOUT_PATTERN.test(message);
}

// After a -10005 the clipboard write already happened, so the text may have
// landed anyway. Re-read the app state and look for the pasted text; a match
// converts the false failure into a success annotated with the upstream error.
async function confirmPastedText(
  runtime: ComputerUseRuntime,
  ctx: ExtensionContext,
  app: string,
  text: string,
  signal: AbortSignal | undefined,
): Promise<{ content: OmpContentBlock[]; details: ComputerUseToolSummary } | undefined> {
  if (text.length === 0) return undefined;
  try {
    const state = signal
      ? await runtime.callTool(ctx, "get_app_state", { app }, signal)
      : await runtime.callTool(ctx, "get_app_state", { app });
    const stateText = state.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("\n");
    if (!stateText.includes(text)) return undefined;
    const content: OmpContentBlock[] = [
      {
        type: "text",
        text: "Pasted (verified in app state; upstream reported a clipboard read timeout).",
      },
    ];
    return { content, details: summarizeResult({ content }) };
  } catch {
    return undefined;
  }
}

