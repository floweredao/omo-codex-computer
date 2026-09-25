import { createRequire } from "node:module";

// The name is protocol identity: Codex app-server echoes it in the userAgent
// that capability checks parse. Only the version tracks package.json, so
// release automation bumps propagate without touching source.
const packageJson = createRequire(import.meta.url)("../package.json") as { version?: unknown };

export const CLIENT_INFO = Object.freeze({
  name: "omo-codex-computer",
  version: typeof packageJson.version === "string" ? packageJson.version : "0.0.0",
});
