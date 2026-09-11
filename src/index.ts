import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionCommandContext } from "@code-yeongyu/senpi";
import { CHROME_TOOL_NAMES, registerChromeTools } from "./chrome-tools";
import { ChromeRuntime } from "./chrome-runtime";
import { checkChromeStatus, formatChromeStatus } from "./chrome-status";
import { runChromeTrustProbe } from "./chrome-trust-probe";
import { clearPersistedAppServerVersions } from "./chrome-trust";
import { COMPUTER_USE_TOOL_NAMES, registerComputerUseTools } from "./computer-use-tools";
import { logDebug } from "./log";
import { ComputerUseRuntime } from "./runtime";
import { checkComputerUseStatus, formatComputerUseStatus } from "./status";

const SKILLS_DIR = fileURLToPath(new URL("../skills", import.meta.url));
const COMMAND_NAME = "codex-computer";
const COMMANDS = [
  "status",
  "diagnose",
  "trust",
  "enable",
  "disable",
  "restart",
  "hide-status",
  "show-status",
] as const;

export default function omoCodexComputer(pi: ExtensionAPI): void {
  const computerRuntime = new ComputerUseRuntime();
  const chromeRuntime = new ChromeRuntime();
  let toolsDisabled = false;

  registerComputerUseTools(pi, computerRuntime);
  registerChromeTools(pi, chromeRuntime);

  pi.on("resources_discover", () => ({ skillPaths: [SKILLS_DIR] }));

  pi.on("session_start", async (_event, ctx) => {
    try {
      await chromeRuntime.shutdown();
    } catch (error) {
      logDebug("chrome.session-start.shutdown-error", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    computerRuntime.setContext(ctx);
    computerRuntime.resetSession();
    if (toolsDisabled) setCodexAutomationToolsEnabled(pi, false);
  });

  pi.on("agent_start", async (_event, ctx) => {
    await chromeRuntime.beginAgent(ctx);
  });

  pi.on("agent_settled", async () => {
    await settleAll([computerRuntime.shutdown(), chromeRuntime.endAgent()]);
  });

  pi.on("session_shutdown", async () => {
    await settleAll([computerRuntime.shutdown(), chromeRuntime.shutdown()]);
  });

  pi.registerCommand(COMMAND_NAME, {
    description: "Manage Codex Computer Use and Chrome tools.",
    getArgumentCompletions: (argumentPrefix) => {
      const prefix = argumentPrefix.trimStart();
      return COMMANDS
        .filter((command) => command.startsWith(prefix))
        .map((command) => ({ value: `${command} `, label: command }));
    },
    async handler(args, ctx) {
      const command = args.trim().split(/\s+/, 1)[0] || "status";

      if (command === "status" || command === "diagnose") {
        const [computerStatus, chromeStatus] = await Promise.all([
          checkComputerUseStatus(ctx.cwd),
          checkChromeStatus(ctx.cwd),
        ]);
        sendCommandMessage(
          pi,
          ctx,
          `${formatComputerUseStatus(computerStatus)}\n\n${formatChromeStatus(chromeStatus)}`,
        );
        return;
      }

      if (command === "trust") {
        const argument = args.trim().slice(command.length).trim();
        if (argument === "clear") {
          const path = await clearPersistedAppServerVersions();
          sendCommandMessage(
            pi,
            ctx,
            path === undefined
              ? "No usable HOME or XDG_CONFIG_HOME; no persisted Chrome trust to clear."
              : `Cleared persisted Chrome app-server trust at ${path}.`,
          );
          return;
        }
        sendCommandMessage(pi, ctx, await runChromeTrustProbe(ctx.cwd));
        return;
      }

      if (command === "enable") {
        toolsDisabled = false;
        setCodexAutomationToolsEnabled(pi, true);
        sendCommandMessage(pi, ctx, "Codex Computer Use and Chrome tools enabled.");
        return;
      }

      if (command === "disable") {
        toolsDisabled = true;
        setCodexAutomationToolsEnabled(pi, false);
        await settleAll([computerRuntime.shutdown(), chromeRuntime.shutdown()]);
        sendCommandMessage(pi, ctx, "Codex Computer Use and Chrome tools disabled.");
        return;
      }

      if (command === "restart") {
        await settleAll([computerRuntime.shutdown(), chromeRuntime.restart()]);
        sendCommandMessage(
          pi,
          ctx,
          "Codex automation runtimes restarted. They will reconnect on the next tool call.",
        );
        return;
      }

      if (command === "hide-status") {
        computerRuntime.setStatusVisible(false);
        sendCommandMessage(
          pi,
          ctx,
          "Codex Computer Use footer status hidden. Run /codex-computer show-status to show it again.",
        );
        return;
      }

      if (command === "show-status") {
        computerRuntime.setStatusVisible(true);
        sendCommandMessage(pi, ctx, "Codex Computer Use footer status shown.");
        return;
      }

      sendCommandMessage(pi, ctx, `Usage: /${COMMAND_NAME} ${COMMANDS.join("|")}`);
    },
  });
}

export function setCodexAutomationToolsEnabled(pi: ExtensionAPI, enabled: boolean): void {
  const active = new Set(pi.getActiveTools());
  const before = [...active];
  const managedToolNames = [...COMPUTER_USE_TOOL_NAMES, ...CHROME_TOOL_NAMES];

  if (enabled) {
    for (const toolName of managedToolNames) active.add(toolName);
  } else {
    for (const toolName of managedToolNames) active.delete(toolName);
  }

  const after = [...active];
  if (!sameToolNames(before, after)) pi.setActiveTools(after);
}

function sendCommandMessage(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  content: string,
): void {
  if (ctx.hasUI) ctx.ui.notify(content, "info");
  pi.sendMessage({
    customType: "codex-computer",
    content,
    display: true,
  });
}

async function settleAll(operations: Array<Promise<unknown>>): Promise<void> {
  const results = await Promise.allSettled(operations);
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failure) throw failure.reason;
}

function sameToolNames(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((name, index) => right[index] === name);
}
