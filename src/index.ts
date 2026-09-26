import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionCommandContext } from "@code-yeongyu/senpi";
import { COMPUTER_USE_TOOL_NAMES, registerComputerUseTools } from "./computer-use-tools";
import { ComputerUseRuntime } from "./runtime";
import { checkComputerUseStatus, formatComputerUseStatus } from "./status";

const SKILLS_DIR = fileURLToPath(new URL("../skills", import.meta.url));
const COMMAND_NAME = "codex-computer";
const COMMANDS = [
  "status",
  "diagnose",
  "enable",
  "disable",
  "restart",
] as const;

export default function omoCodexComputer(pi: ExtensionAPI): void {
  const computerRuntime = new ComputerUseRuntime();
  let toolsDisabled = false;

  registerComputerUseTools(pi, computerRuntime);

  pi.on("resources_discover", () => ({ skillPaths: [SKILLS_DIR] }));

  pi.on("session_start", async (_event, ctx) => {
    computerRuntime.setContext(ctx);
    computerRuntime.resetSession();
    if (toolsDisabled) setCodexAutomationToolsEnabled(pi, false);
  });

  pi.on("agent_settled", async () => {
    await computerRuntime.shutdown();
  });

  pi.on("session_shutdown", async () => {
    await computerRuntime.shutdown();
  });

  pi.registerCommand(COMMAND_NAME, {
    description: "Manage Codex Computer Use tools.",
    getArgumentCompletions: (argumentPrefix) => {
      const prefix = argumentPrefix.trimStart();
      return COMMANDS
        .filter((command) => command.startsWith(prefix))
        .map((command) => ({ value: `${command} `, label: command }));
    },
    async handler(args, ctx) {
      const command = args.trim().split(/\s+/, 1)[0] || "status";

      if (command === "status" || command === "diagnose") {
        const computerStatus = await checkComputerUseStatus(ctx.cwd);
        sendCommandMessage(pi, ctx, formatComputerUseStatus(computerStatus));
        return;
      }

      if (command === "enable") {
        toolsDisabled = false;
        setCodexAutomationToolsEnabled(pi, true);
        sendCommandMessage(pi, ctx, "Codex Computer Use tools enabled.");
        return;
      }

      if (command === "disable") {
        toolsDisabled = true;
        setCodexAutomationToolsEnabled(pi, false);
        await computerRuntime.shutdown();
        sendCommandMessage(pi, ctx, "Codex Computer Use tools disabled.");
        return;
      }

      if (command === "restart") {
        await computerRuntime.shutdown();
        sendCommandMessage(
          pi,
          ctx,
          "Codex automation runtime restarted. It will reconnect on the next tool call.",
        );
        return;
      }

      sendCommandMessage(pi, ctx, `Usage: /${COMMAND_NAME} ${COMMANDS.join("|")}`);
    },
  });
}

export function setCodexAutomationToolsEnabled(pi: ExtensionAPI, enabled: boolean): void {
  const active = new Set(pi.getActiveTools());
  const before = [...active];

  if (enabled) {
    for (const toolName of COMPUTER_USE_TOOL_NAMES) active.add(toolName);
  } else {
    for (const toolName of COMPUTER_USE_TOOL_NAMES) active.delete(toolName);
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

function sameToolNames(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((name, index) => right[index] === name);
}
