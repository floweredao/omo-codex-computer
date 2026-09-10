import { afterEach, describe, expect, it, vi } from "vitest";
import { ComputerUseRuntime, shouldDevAutoAccept } from "../src/runtime";

const STATUS_ENV = "OMO_CODEX_COMPUTER_STATUS";
const AUTO_ACCEPT_ENV = "OMO_CODEX_COMPUTER_DEV_AUTO_ACCEPT_APPS";

afterEach(() => {
  delete process.env[STATUS_ENV];
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

describe("OMO Computer Use runtime configuration", () => {
  it("reads the OMO status namespace", () => {
    // Given: OMO disables the footer status before runtime creation.
    process.env[STATUS_ENV] = "off";
    const setStatus = vi.fn();
    const runtime = new ComputerUseRuntime();

    // When: the runtime receives its OMO context.
    runtime.setContext({
      hasUI: true,
      ui: { setStatus },
    } as never);

    // Then: it clears the status instead of rendering an OMO default.
    expect(setStatus).toHaveBeenCalledWith("codex-computer", undefined);
  });

  it("reads the OMO development permission namespace", () => {
    // Given: one explicitly allowed application in the OMO namespace.
    process.env[AUTO_ACCEPT_ENV] = "Finder";

    // When/Then: only the matching upstream permission is admitted.
    expect(shouldDevAutoAccept('Allow Computer Use to use "Finder"?')).toBe(true);
    expect(shouldDevAutoAccept('Allow Computer Use to use "Notes"?')).toBe(false);
  });
});
