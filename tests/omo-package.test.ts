import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("OMO package contract", () => {
  it("loads the extension and skills from the pi manifest", async () => {
    // Given: the published package root.
    const packageJson = JSON.parse(
      await readFile(resolve(ROOT, "package.json"), "utf8"),
    ) as {
      name?: unknown;
      pi?: {
        extensions?: unknown;
        skills?: unknown;
      };
    };

    // When: OMO resolves the declared package resources.
    const extensionEntries = packageJson.pi?.extensions;
    const skillEntries = packageJson.pi?.skills;

    // Then: the package exposes one executable extension and its skills.
    expect(packageJson.name).toBe("@floweredao/omo-codex-computer");
    expect(extensionEntries).toEqual(["./src/index.ts"]);
    expect(skillEntries).toEqual(["./skills"]);

    const [extensionEntry] = extensionEntries as [string];
    const extension = await import(
      pathToFileURL(resolve(ROOT, extensionEntry)).href
    ) as { default?: unknown };
    expect(typeof extension.default).toBe("function");
  });
});
