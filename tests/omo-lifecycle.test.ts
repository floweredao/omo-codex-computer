import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHROME_TOOL_NAMES } from "../src/chrome-tools";
import { COMPUTER_USE_TOOL_NAMES } from "../src/computer-use-tools";
import omoCodexComputer from "../src/index";

const runtimeMock = vi.hoisted(() => {
  const computerInstances: FakeComputerRuntime[] = [];
  const chromeInstances: FakeChromeRuntime[] = [];

  class FakeComputerRuntime {
    setContext = vi.fn();
    resetSession = vi.fn();
    setStatusVisible = vi.fn();
    shutdown = vi.fn(async () => {});

    constructor() {
      computerInstances.push(this);
    }
  }

  class FakeChromeRuntime {
    beginAgent = vi.fn(async () => {});
    endAgent = vi.fn(async () => {});
    shutdown = vi.fn(async () => {});
    restart = vi.fn(async () => {});

    constructor() {
      chromeInstances.push(this);
    }
  }

  return {
    FakeComputerRuntime,
    FakeChromeRuntime,
    computerInstances,
    chromeInstances,
  };
});

vi.mock("../src/runtime", () => ({
  ComputerUseRuntime: runtimeMock.FakeComputerRuntime,
}));
vi.mock("../src/chrome-runtime", () => ({
  ChromeRuntime: runtimeMock.FakeChromeRuntime,
}));

function createFakePi() {
  const tools: unknown[] = [];
  const commands = new Map<string, unknown>();
  const handlers = new Map<string, Array<(event: unknown, ctx: unknown) => unknown>>();
  const flags = new Map<string, boolean | string>();
  let activeTools = ["read"];

  return {
    tools,
    commands,
    handlers,
    registerTool(tool: unknown): void {
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
    on(event: string, handler: (event: unknown, ctx: unknown) => unknown): void {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    getActiveTools(): string[] {
      return [...activeTools];
    },
    setActiveTools(names: string[]): void {
      activeTools = [...names];
    },
    sendMessage(): void {},
  };
}

function createContext() {
  return {
    cwd: "/tmp/project",
    mode: "tui",
    hasUI: true,
    ui: {
      confirm: vi.fn(async () => true),
      notify: vi.fn(),
    },
    sessionManager: {
      getSessionId: () => "omo-session-1",
    },
  };
}

beforeEach(() => {
  runtimeMock.computerInstances.length = 0;
  runtimeMock.chromeInstances.length = 0;
});

describe("OMO Chrome lifecycle", () => {
  it("keeps Chrome alive until agent_settled and cleans the session", async () => {
    // Given: a registered OMO extension and active session.
    const pi = createFakePi();
    const ctx = createContext();
    omoCodexComputer(pi as never);
    const computer = runtimeMock.computerInstances[0];
    const chrome = runtimeMock.chromeInstances[0];

    // When: a run starts, emits a retryable agent_end, then fully settles.
    await pi.handlers.get("session_start")?.[0]?.(
      { type: "session_start", reason: "startup" },
      ctx,
    );
    await pi.handlers.get("agent_start")?.[0]?.({ type: "agent_start" }, ctx);
    await pi.handlers.get("agent_end")?.[0]?.(
      { type: "agent_end", willRetry: true },
      ctx,
    );

    // Then: no terminal cleanup happens at agent_end.
    expect(chrome).toBeDefined();
    expect(pi.handlers.has("agent_end")).toBe(false);
    expect(computer?.shutdown).not.toHaveBeenCalled();
    expect(chrome?.endAgent).not.toHaveBeenCalled();

    await pi.handlers.get("agent_settled")?.[0]?.(
      { type: "agent_settled" },
      ctx,
    );
    expect(computer?.shutdown).toHaveBeenCalledOnce();
    expect(chrome?.endAgent).toHaveBeenCalledOnce();

    await pi.handlers.get("session_shutdown")?.[0]?.(
      { type: "session_shutdown", reason: "exit" },
      ctx,
    );
    expect(computer?.shutdown).toHaveBeenCalledTimes(2);
    expect(chrome?.shutdown).toHaveBeenCalledTimes(2);
  });

  it("registers all Chrome tools and the management command", () => {
    // Given: a fresh OMO extension host.
    const pi = createFakePi();

    // When: the extension registers.
    omoCodexComputer(pi as never);

    // Then: Chrome and management surfaces are present.
    const toolNames = pi.tools.flatMap((tool) => {
      if (typeof tool !== "object" || tool === null || !("name" in tool)) return [];
      return typeof tool.name === "string" ? [tool.name] : [];
    });
    expect(toolNames).toEqual(expect.arrayContaining([
      "chrome_open",
      "chrome_observe",
      "chrome_act",
    ]));
    expect(pi.commands.has("codex-computer")).toBe(true);
    expect(pi.handlers.has("agent_settled")).toBe(true);
  });

  it.each(["tui", "rpc", "print"])("does not prompt or block tool calls in %s mode", async (mode) => {
    // Given: the host owns permissions, and no plugin dialog is approved.
    const pi = createFakePi();
    omoCodexComputer(pi as never);
    const confirm = vi.fn(async () => false);
    const results: unknown[] = [];

    // When: each registered automation tool passes through plugin hooks.
    for (const toolName of [...CHROME_TOOL_NAMES, ...COMPUTER_USE_TOOL_NAMES]) {
      for (const handler of pi.handlers.get("tool_call") ?? []) {
        results.push(await handler(
          { type: "tool_call", toolCallId: "call-1", toolName, input: {} },
          { mode, hasUI: mode !== "print", ui: { confirm } },
        ));
      }
    }

    // Then: the plugin does not add a second confirmation gate.
    expect(confirm).not.toHaveBeenCalled();
    expect(results.every((result) => result === undefined)).toBe(true);
  });
});
