import { afterEach, describe, expect, it, vi } from "vitest";
import { ComputerUseRuntime, shouldDevAutoAccept } from "../src/runtime";

const AUTO_ACCEPT_ENV = "OMO_CODEX_COMPUTER_DEV_AUTO_ACCEPT_APPS";

afterEach(() => {
  delete process.env[AUTO_ACCEPT_ENV];
});

describe("OMO Computer Use runtime cancellation", () => {
  it.each(["callTool", "resolveAppTarget"] as const)(
    "%s uses the explicit signal even when the context has another signal",
    async (operation) => {
      const runtime = new ComputerUseRuntime();
      const contextController = new AbortController();
      const controller = new AbortController();
      const ctx = { cwd: "/tmp/project", hasUI: false, signal: contextController.signal };
      const dispatched = Promise.withResolvers<AbortSignal | undefined>();
      const response = Promise.withResolvers<{ content: [] }>();
      vi.spyOn(runtime, "initialize").mockResolvedValue({
        userAgent: "test", codexHome: "/tmp/codex", platformFamily: "unix", platformOs: "macos",
      });
      vi.spyOn(runtime.client, "stop").mockResolvedValue();
      const backend = operation === "callTool"
        ? vi.spyOn(runtime.backend, "callTool").mockImplementation((_cwd, _tool, _args, signal) => {
          dispatched.resolve(signal);
          return response.promise;
        })
        : vi.spyOn(runtime.backend, "resolveAppTarget").mockImplementation((_cwd, _app, signal) => {
          dispatched.resolve(signal);
          return response.promise;
        });
      const result = operation === "callTool"
        ? runtime.callTool(ctx as never, "list_apps", {}, controller.signal)
        : runtime.resolveAppTarget(ctx as never, "Finder", controller.signal);
      const settled = result.catch((error: unknown) => error);
      const receivedSignal = await dispatched.promise;
      controller.abort();
      const stoppedOnAbort = vi.mocked(runtime.client.stop).mock.calls.length;
      const error = new Error("cancelled");
      error.name = "AbortError";
      response.reject(error);
      await settled;
      await runtime.shutdown();

      expect(backend).toHaveBeenCalledOnce();
      expect(receivedSignal).toBe(controller.signal);
      expect(stoppedOnAbort).toBe(1);
    },
  );
});

describe("OMO Computer Use runtime footer", () => {
  it.each([
    ["succeeds", () => Promise.resolve({ content: [] })],
    ["fails", () => Promise.reject(new Error("upstream failure"))],
  ] as const)("never writes footer status when a tool call %s", async (_outcome, backendResult) => {
    // Given: an interactive host whose UI would render any footer status.
    const setStatus = vi.fn();
    const runtime = new ComputerUseRuntime();
    const ctx = { cwd: "/tmp/project", hasUI: true, ui: { setStatus } };
    vi.spyOn(runtime, "initialize").mockResolvedValue({
      userAgent: "test", codexHome: "/tmp/codex", platformFamily: "unix", platformOs: "macos",
    });
    vi.spyOn(runtime.client, "stop").mockResolvedValue();
    vi.spyOn(runtime.backend, "callTool").mockImplementation(backendResult);

    // When: a tool call runs to completion and the runtime shuts down.
    await runtime.callTool(ctx as never, "list_apps", { app: "Finder" }).catch(() => undefined);
    await runtime.shutdown();

    // Then: the plugin leaves the footer untouched.
    expect(setStatus).not.toHaveBeenCalled();
  });

  it("works with a host UI that has no footer status API", async () => {
    // Given: an interactive host that only offers confirmation dialogs.
    const confirm = vi.fn(async () => true);
    const runtime = new ComputerUseRuntime();
    const ctx = { cwd: "/tmp/project", hasUI: true, ui: { confirm } };
    vi.spyOn(runtime, "initialize").mockResolvedValue({
      userAgent: "test", codexHome: "/tmp/codex", platformFamily: "unix", platformOs: "macos",
    });
    vi.spyOn(runtime.client, "stop").mockResolvedValue();
    vi.spyOn(runtime.backend, "callTool").mockResolvedValue({ content: [] });
    const accept = vi.fn();

    // When: a tool call runs and Codex asks for app permission.
    const result = await runtime.callTool(ctx as never, "list_apps", {});
    await runtime.handleServerRequestForTest(
      { id: 1, method: "mcpServer/elicitation/request", params: { message: 'Allow Computer Use to use "Finder"?' } },
      { accept, reject: vi.fn() },
    );
    await runtime.shutdown();

    // Then: the call and the permission prompt both complete normally.
    expect(result).toEqual({ content: [] });
    expect(confirm).toHaveBeenCalledOnce();
    expect(accept).toHaveBeenCalledWith({ action: "accept", content: {} });
  });
});

describe("OMO Computer Use runtime configuration", () => {

  it("reads the OMO development permission namespace", () => {
    // Given: one explicitly allowed application in the OMO namespace.
    process.env[AUTO_ACCEPT_ENV] = "Finder";

    // When/Then: only the matching upstream permission is admitted.
    expect(shouldDevAutoAccept('Allow Computer Use to use "Finder"?')).toBe(true);
    expect(shouldDevAutoAccept('Allow Computer Use to use "Notes"?')).toBe(false);
  });
});
