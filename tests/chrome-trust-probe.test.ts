import { beforeEach, describe, expect, it, vi } from "vitest";
import { runChromeTrustProbe } from "../src/chrome-trust-probe";

const mocks = vi.hoisted(() => ({
  checkChromeStatus: vi.fn(),
  evaluateChromeCapabilities: vi.fn(),
  persistTrustedAppServerVersion: vi.fn(),
  calls: [] as string[],
}));

vi.mock("../src/chrome-status", () => ({
  checkChromeStatus: mocks.checkChromeStatus,
  formatChromeStatus: vi.fn(),
}));
vi.mock("../src/chrome-capabilities", () => ({
  evaluateChromeCapabilities: mocks.evaluateChromeCapabilities,
}));
vi.mock("../src/chrome-trust", () => ({
  persistTrustedAppServerVersion: mocks.persistTrustedAppServerVersion,
}));
vi.mock("../src/app-server-client", () => ({
  AppServerClient: class {
    private running = false;
    isRunning() { return this.running; }
    onServerRequest() {}
    async stop() { this.running = false; }
    async requestWithNotification() {
      this.running = true;
      return { userAgent: "omo-codex-computer/0.151.0" };
    }
    async request(method: string, params?: { arguments?: { code?: string } }) {
      mocks.calls.push(method);
      if (method === "thread/start") return { thread: { id: "thread", sessionId: "session" } };
      if (method !== "mcpServer/tool/call") return {};
      const encoded = /Buffer\.from\(("[A-Za-z0-9+/=]+"), "base64"\)/u.exec(params?.arguments?.code ?? "")?.[1];
      if (!encoded) throw new Error("Missing Chrome program payload");
      const { operation } = JSON.parse(Buffer.from(JSON.parse(encoded), "base64").toString("utf8"));
      const result = operation.kind === "cleanup" || operation.action?.kind === "close"
        ? { kind: "closed" }
        : { kind: "snapshot", text: "page", truncated: false, byteLength: 4 };
      return { content: [{ type: "text", text: JSON.stringify({
        protocol: "omo-codex-computer/chrome-v1", ok: true, result,
      }) }] };
    }
  },
}));

beforeEach(() => {
  mocks.calls.length = 0;
  vi.clearAllMocks();
  mocks.checkChromeStatus.mockResolvedValue({
    status: "unavailable",
    reason: "unsupported_app_server_version",
    observedAppServerVersion: "0.150.0",
    trustedAppServerVersions: ["0.151.0"],
  });
  mocks.evaluateChromeCapabilities.mockResolvedValue({
    status: "ready",
    pluginVersion: "26.818.31338",
    appServerVersion: "0.151.0",
    clientPath: "/trusted/chrome/scripts/browser-client.mjs",
    nodeReplServerName: "node_repl",
  });
  mocks.persistTrustedAppServerVersion.mockResolvedValue("/unused/mocked-trust.json");
});

describe("Chrome trust probe version binding", () => {
  it("does not trust a candidate when the live process uses another trusted version", async () => {
    await runChromeTrustProbe("/work");

    expect(mocks.persistTrustedAppServerVersion).not.toHaveBeenCalled();
    expect(mocks.calls).not.toContain("mcpServer/tool/call");
  });

  it("persists the candidate only after its own live operations and cleanup pass", async () => {
    mocks.checkChromeStatus.mockResolvedValue({
      status: "unavailable",
      reason: "unsupported_app_server_version",
      observedAppServerVersion: "0.151.0",
      trustedAppServerVersions: [],
    });
    mocks.persistTrustedAppServerVersion.mockImplementation(async () => {
      expect(mocks.calls.filter((method) => method === "mcpServer/tool/call")).toHaveLength(5);
      return "/unused/mocked-trust.json";
    });

    await runChromeTrustProbe("/work");

    expect(mocks.persistTrustedAppServerVersion).toHaveBeenCalledExactlyOnceWith("0.151.0");
  });
});
