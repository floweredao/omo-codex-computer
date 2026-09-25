import { afterEach, describe, expect, it, vi } from "vitest";
import { CLIENT_INFO } from "../src/client-info";
import { logDebug } from "../src/log";

afterEach(() => {
  delete process.env.OMO_CODEX_COMPUTER_DEBUG;
  vi.restoreAllMocks();
});

describe("OMO plugin identity", () => {
  it("uses OMO names for protocol identity", () => {
    // Given: the OMO-only package boundary.
    // When/Then: public identity is OMO-native.
    expect(CLIENT_INFO.name).toBe("omo-codex-computer");
  });

  it("reads and renders the OMO debug namespace", () => {
    // Given: OMO debug logging is explicitly enabled.
    process.env.OMO_CODEX_COMPUTER_DEBUG = "1";
    const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    // When: a redacted diagnostic is emitted.
    logDebug("identity.probe", { token: "secret" });

    // Then: the OMO logger writes one redacted record under its own prefix.
    expect(write).toHaveBeenCalledOnce();
    expect(String(write.mock.calls[0]?.[0])).toContain("[omo-codex-computer]");
    expect(String(write.mock.calls[0]?.[0])).not.toContain("secret");
  });
});
