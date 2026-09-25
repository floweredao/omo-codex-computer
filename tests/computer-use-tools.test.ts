import { Value } from "typebox/value";
import { describe, expect, it, vi } from "vitest";
import type { ComputerUseRuntime } from "../src/runtime";
import {
  COMPUTER_USE_MCP_TOOL_NAMES,
  COMPUTER_USE_TOOL_NAMES,
  registerComputerUseTools,
} from "../src/computer-use-tools";

type RegisteredTool = {
  name: string;
  exposure?: string;
  allowLazyActivation?: boolean;
  executionMode?: string;
  parameters: Parameters<typeof Value.Check>[0];
  prepareArguments?: (args: unknown) => unknown;
  execute: (...args: unknown[]) => Promise<unknown>;
};

function createFakePi() {
  const tools: RegisteredTool[] = [];
  return {
    tools,
    registerTool(tool: RegisteredTool): void {
      tools.push(tool);
    },
  };
}

function getTool(pi: ReturnType<typeof createFakePi>, name: string): RegisteredTool {
  const tool = pi.tools.find((entry) => entry.name === name);
  if (!tool) throw new Error(`missing tool ${name}`);
  return tool;
}

describe("OMO Computer Use tools", () => {
  it("registers twelve searchable sequential tools", () => {
    // Given: an OMO ExtensionAPI registration seam.
    const pi = createFakePi();

    // When: Computer Use tools register.
    registerComputerUseTools(
      pi as never,
      { callTool: vi.fn() } as unknown as ComputerUseRuntime,
    );

    // Then: the public catalog and OMO exposure are exact.
    expect(COMPUTER_USE_TOOL_NAMES).toHaveLength(12);
    expect(pi.tools.map((tool) => tool.name)).toEqual(COMPUTER_USE_TOOL_NAMES);
    expect(pi.tools.every((tool) => tool.exposure === "search")).toBe(true);
    expect(pi.tools.every((tool) => tool.allowLazyActivation === true)).toBe(true);
    expect(pi.tools.every((tool) => tool.executionMode === "sequential")).toBe(true);
  });

  it("keeps the local resolver outside upstream MCP requirements", () => {
    expect(COMPUTER_USE_MCP_TOOL_NAMES).toEqual([
      "list_apps",
      "get_app_state",
      "click",
      "type_text",
      "press_key",
      "scroll",
      "drag",
      "set_value",
      "select_text",
      "perform_secondary_action",
      "paste",
    ]);
  });

  it("validates representative valid and malformed inputs with TypeBox", () => {
    // Given: registered TypeBox schemas.
    const pi = createFakePi();
    registerComputerUseTools(
      pi as never,
      { callTool: vi.fn() } as unknown as ComputerUseRuntime,
    );

    // When/Then: valid public inputs pass and malformed boundaries fail.
    expect(Value.Check(getTool(pi, "computer_use_list_apps").parameters, {})).toBe(true);

    const state = getTool(pi, "computer_use_get_app_state").parameters;
    expect(Value.Check(state, { app: "Finder", disableDiff: true })).toBe(true);
    expect(Value.Check(state, { disableDiff: true })).toBe(false);

    const click = getTool(pi, "computer_use_click").parameters;
    expect(Value.Check(click, { app: "Finder", element_index: "1" })).toBe(true);
    expect(Value.Check(click, { app: "Finder", x: 12, y: 34 })).toBe(true);
    expect(Value.Check(click, { app: "Finder", x: 12 })).toBe(false);
    expect(Value.Check(click, { app: "Finder" })).toBe(false);
    expect(Value.Check(click, { app: "Finder", element_index: "x" })).toBe(false);

    const paste = getTool(pi, "computer_use_paste").parameters;
    expect(Value.Check(paste, { app: "Notes", format: "md", text: "# hello" })).toBe(true);
    expect(Value.Check(paste, { app: "Notes", format: "rtf", text: "hello" })).toBe(false);
  });

  it("forwards one call with its abort signal", async () => {
    // Given: a runtime returning a safe result.
    const callTool = vi.fn(async () => ({
      content: [{ type: "text", text: "clicked" }],
      structuredContent: { ok: true },
    }));
    const pi = createFakePi();
    registerComputerUseTools(pi as never, { callTool } as unknown as ComputerUseRuntime);
    const signal = new AbortController().signal;
    const ctx = { cwd: "/tmp/project" };
    const params = { app: "Finder", x: 12, y: 34 };

    // When: OMO executes the registered click tool.
    const result = await getTool(pi, "computer_use_click")
      .execute("call-1", params, signal, undefined, ctx);

    // Then: exactly one matching runtime call occurs.
    expect(callTool).toHaveBeenCalledOnce();
    expect(callTool).toHaveBeenCalledWith(ctx, "click", params, signal);
    expect(result).toMatchObject({ details: { hasStructuredContent: true } });
  });

  it("reroutes non-ASCII type_text to clipboard paste before dispatch", async () => {
    // Given: a runtime returning a safe result.
    const callTool = vi.fn(async () => ({
      content: [{ type: "text", text: "ok" }],
      structuredContent: { ok: true },
    }));
    const pi = createFakePi();
    registerComputerUseTools(pi as never, { callTool } as unknown as ComputerUseRuntime);
    const ctx = { cwd: "/tmp/project" };

    // When: type_text receives text the key-injection path cannot produce.
    await getTool(pi, "computer_use_type_text")
      .execute("call-1", { app: "Notes", text: "안녕하세요" }, undefined, undefined, ctx);

    // Then: the call reroutes to the clipboard-based paste tool with the
    // format argument the upstream paste contract requires.
    expect(callTool).toHaveBeenCalledWith(ctx, "paste", { app: "Notes", text: "안녕하세요", format: "text" });

    // When: ASCII text still types normally.
    await getTool(pi, "computer_use_type_text")
      .execute("call-2", { app: "Notes", text: "hello\nworld" }, undefined, undefined, ctx);

    // Then: the upstream tool stays type_text.
    expect(callTool).toHaveBeenLastCalledWith(ctx, "type_text", { app: "Notes", text: "hello\nworld" });
  });

  it("keeps click pairing provider-compatible and validates before dispatch", () => {
    // Given: the model-visible click tool.
    const pi = createFakePi();
    registerComputerUseTools(
      pi as never,
      { callTool: vi.fn() } as unknown as ComputerUseRuntime,
    );
    const click = getTool(pi, "computer_use_click");

    // When/Then: the schema avoids unsupported `not`, while preparation
    // enforces the coordinate-pair invariant before runtime dispatch.
    expect(JSON.stringify(click.parameters)).not.toContain('"not"');
    expect(() => click.prepareArguments?.({
      app: "Finder",
      element_index: "1",
      x: 12,
    })).toThrow();
    expect(click.prepareArguments?.({
      app: "Finder",
      x: 12,
      y: 34,
    })).toEqual({ app: "Finder", x: 12, y: 34 });
  });
});
