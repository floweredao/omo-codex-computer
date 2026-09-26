import type { ExtensionContext } from "@code-yeongyu/senpi";
import { AppServerClient, type ServerRequestResponder } from "./app-server-client";
import { ComputerUseBackend, type ComputerUseToolResult } from "./computer-use-backend";
import { logDebug } from "./log";
import type { AppServerRequest, InitializeResponse } from "./protocol";
import { SerialQueue } from "./queue";
import { CodexThreadManager } from "./thread-manager";
import { CLIENT_INFO } from "./client-info";

const DEFAULT_IDLE_TIMEOUT_MS = 600_000;
const PERMISSION_FALLBACK_MESSAGE = "Codex requests permission to continue.";

type ContextWithSignal = ExtensionContext & { signal?: AbortSignal };

export class ComputerUseRuntime {
  readonly client = new AppServerClient({ requestTimeoutMs: 120_000 });
  readonly threads = new CodexThreadManager(this.client);
  readonly backend = new ComputerUseBackend(this.client, this.threads);
  private readonly callToolQueue = new SerialQueue();

  private latestContext: ExtensionContext | undefined;
  private initializePromise: Promise<InitializeResponse> | undefined;
  private idleTimer: NodeJS.Timeout | undefined;
  private shutdownPromise: Promise<void> | undefined;
  /** Bumped by shutdown: stale queued calls must not resurrect the child. */
  private epoch = 0;

  constructor() {
    this.client.onServerRequest((request, responder) => this.handleServerRequest(request, responder));
  }

  setContext(ctx: ExtensionContext): void {
    this.latestContext = ctx;
  }

  resetSession(): void {
    this.backend.reset();
  }

  async shutdown(): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise;

    const shutdownPromise = this.shutdownOnce();
    this.shutdownPromise = shutdownPromise;
    try {
      await shutdownPromise;
    } finally {
      if (this.shutdownPromise === shutdownPromise) this.shutdownPromise = undefined;
    }
  }

  private async shutdownOnce(): Promise<void> {
    logDebug("runtime.shutdown");
    this.epoch += 1;
    this.clearIdleTimer();
    this.initializePromise = undefined;
    this.backend.reset();
    await this.client.stop();
  }

  async initialize(): Promise<InitializeResponse> {
    const shutdownPromise = this.shutdownPromise;
    if (shutdownPromise) await shutdownPromise;

    if (!this.client.isRunning()) {
      this.initializePromise = undefined;
      this.backend.reset();
    }
    if (this.initializePromise) return this.initializePromise;

    const initializePromise = this.client.requestWithNotification<InitializeResponse>(
      "initialize",
      {
        clientInfo: CLIENT_INFO,
        capabilities: { experimentalApi: true },
      },
      "initialized",
    ).catch((error: unknown) => {
      if (this.initializePromise === initializePromise) this.initializePromise = undefined;
      throw error;
    });

    this.initializePromise = initializePromise;
    return initializePromise;
  }

  callTool(
    ctx: ExtensionContext,
    tool: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ComputerUseToolResult> {
    const contextSignal = signal ?? (ctx as ContextWithSignal).signal;
    if (contextSignal?.aborted) return Promise.reject(createAbortError(`Aborted Computer Use tool call ${tool}`));

    const runtimeContext = contextSignal && (ctx as ContextWithSignal).signal !== contextSignal
      ? ({ ...ctx, signal: contextSignal } as ExtensionContext)
      : ctx;

    this.clearIdleTimer();
    const epoch = this.epoch;
    return this.callToolQueue.enqueue(() => this.callToolOnce(runtimeContext, tool, args, epoch), contextSignal);
  }

  resolveAppTarget(ctx: ExtensionContext, app: string, signal?: AbortSignal): Promise<ComputerUseToolResult> {
    const contextSignal = signal ?? (ctx as ContextWithSignal).signal;
    if (contextSignal?.aborted) return Promise.reject(createAbortError(`Aborted Computer Use app target resolution for ${app}`));

    const runtimeContext = contextSignal && (ctx as ContextWithSignal).signal !== contextSignal
      ? ({ ...ctx, signal: contextSignal } as ExtensionContext)
      : ctx;

    this.clearIdleTimer();
    const epoch = this.epoch;
    return this.callToolQueue.enqueue(() => this.resolveAppTargetOnce(runtimeContext, app, epoch), contextSignal);
  }

  private async resolveAppTargetOnce(ctx: ExtensionContext, app: string, epoch: number): Promise<ComputerUseToolResult> {
    if (epoch !== this.epoch) {
      throw createAbortError(`Aborted Computer Use app target resolution for ${app}: the runtime was shut down`);
    }
    const signal = (ctx as ContextWithSignal).signal;
    this.setContext(ctx);

    const abortShutdown = () => {
      void this.shutdown().catch((error: unknown) => {
        logDebug("runtime.shutdown.abort-error", { message: error instanceof Error ? error.message : String(error) });
      });
    };
    signal?.addEventListener("abort", abortShutdown, { once: true });

    if (signal?.aborted) {
      abortShutdown();
      throw createAbortError(`Aborted Computer Use app target resolution for ${app}`);
    }

    this.clearIdleTimer();

    try {
      await this.initialize();
      if (signal?.aborted) throw createAbortError(`Aborted Computer Use app target resolution for ${app}`);
      return await this.backend.resolveAppTarget(ctx.cwd, app, signal);
    } catch (error) {
      if (signal?.aborted) {
        if (error instanceof Error && error.name === "AbortError") throw error;
        throw createAbortError(`Aborted Computer Use app target resolution for ${app}`);
      }

      throw error;
    } finally {
      signal?.removeEventListener("abort", abortShutdown);
      if (!signal?.aborted) this.scheduleIdleShutdown();
    }
  }

  private async callToolOnce(
    ctx: ExtensionContext,
    tool: string,
    args: Record<string, unknown>,
    epoch: number,
  ): Promise<ComputerUseToolResult> {
    if (epoch !== this.epoch) {
      throw createAbortError(`Aborted Computer Use tool call ${tool}: the runtime was shut down`);
    }
    const signal = (ctx as ContextWithSignal).signal;
    this.setContext(ctx);

    const abortShutdown = () => {
      void this.shutdown().catch((error: unknown) => {
        logDebug("runtime.shutdown.abort-error", { message: error instanceof Error ? error.message : String(error) });
      });
    };
    signal?.addEventListener("abort", abortShutdown, { once: true });

    if (signal?.aborted) {
      abortShutdown();
      throw createAbortError(`Aborted Computer Use tool call ${tool}`);
    }

    this.clearIdleTimer();

    try {
      await this.initialize();
      if (signal?.aborted) throw createAbortError(`Aborted Computer Use tool call ${tool}`);
      return await this.backend.callTool(ctx.cwd, tool, args, signal);
    } catch (error) {
      if (signal?.aborted) {
        if (error instanceof Error && error.name === "AbortError") throw error;
        throw createAbortError(`Aborted Computer Use tool call ${tool}`);
      }

      throw error;
    } finally {
      signal?.removeEventListener("abort", abortShutdown);
      if (!signal?.aborted) this.scheduleIdleShutdown();
    }
  }

  async handleServerRequestForTest(request: AppServerRequest, responder: ServerRequestResponder): Promise<void> {
    await this.handleServerRequest(request, responder);
  }

  private async handleServerRequest(request: AppServerRequest, responder: ServerRequestResponder): Promise<void> {
    if (request.method !== "mcpServer/elicitation/request") {
      responder.reject({
        code: -32601,
        message: `Unsupported Codex app-server request: ${request.method}`,
      });
      return;
    }

    const params = getElicitationParams(request.params);
    const message = params.message ?? PERMISSION_FALLBACK_MESSAGE;
    logDebug("elicitation.request", {
      method: request.method,
      serverName: params.serverName,
      hasMessage: params.message !== undefined,
    });

    if (shouldDevAutoAccept(message)) {
      logDebug("elicitation.accept.dev", { serverName: params.serverName });
      responder.accept({ action: "accept", content: {} });
      return;
    }

    const ctx = this.latestContext;
    if (!ctx?.hasUI) {
      logDebug("elicitation.decline.no-ui", { serverName: params.serverName });
      responder.accept({ action: "decline", content: null });
      return;
    }

    const confirmationMessage = params.subtitle ? `${message}\n\n${params.subtitle}` : message;

    const signal = (ctx as ContextWithSignal).signal;
    let approved: boolean;
    try {
      approved = await ctx.ui.confirm(
        "Codex permission",
        confirmationMessage,
        signal ? { signal } : undefined,
      );
    } catch {
      logDebug("elicitation.decline.confirm-error", { serverName: params.serverName });
      responder.accept({ action: "decline", content: null });
      return;
    }

    logDebug(approved ? "elicitation.accept.user" : "elicitation.decline.user", { serverName: params.serverName });
    responder.accept({ action: approved ? "accept" : "decline", content: approved ? {} : null });
  }

  private clearIdleTimer(): void {
    if (!this.idleTimer) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }

  private scheduleIdleShutdown(): void {
    this.clearIdleTimer();
    const timeoutMs = getIdleTimeoutMs();
    if (timeoutMs === undefined) return;

    this.idleTimer = setTimeout(() => {
      void this.shutdown().catch((error: unknown) => {
        logDebug("runtime.shutdown.idle-error", { message: error instanceof Error ? error.message : String(error) });
      });
    }, timeoutMs);
    this.idleTimer.unref();
  }
}

export function shouldDevAutoAccept(message: string): boolean {
  const apps = (process.env.OMO_CODEX_COMPUTER_DEV_AUTO_ACCEPT_APPS ?? "")
    .split(",")
    .map((app) => app.trim())
    .filter(Boolean);
  if (apps.length === 0) return false;

  const currentPrefix = 'Allow Computer Use to use "';
  const currentSuffix = '"?';
  const legacyPrefix = "Allow Codex to use ";
  const legacySuffix = "?";
  let requestedApp: string | undefined;

  if (message.startsWith(currentPrefix) && message.endsWith(currentSuffix)) {
    const candidate = message.slice(currentPrefix.length, -currentSuffix.length);
    if (candidate.length > 0 && !candidate.includes('"')) requestedApp = candidate;
  } else if (message.startsWith(legacyPrefix) && message.endsWith(legacySuffix)) {
    const candidate = message.slice(legacyPrefix.length, -legacySuffix.length);
    if (candidate.length > 0) requestedApp = candidate;
  }

  if (requestedApp === undefined) return false;
  return apps.includes(requestedApp);
}

function getElicitationParams(params: unknown): { message?: string; serverName?: string; subtitle?: string } {
  if (!params || typeof params !== "object") return {};

  const record = params as Record<string, unknown>;
  const meta = record.meta && typeof record.meta === "object"
    ? record.meta as Record<string, unknown>
    : undefined;
  const subtitle = meta?.subtitle;
  return {
    message: typeof record.message === "string" ? record.message : undefined,
    serverName: typeof record.serverName === "string" ? record.serverName : undefined,
    subtitle: typeof subtitle === "string" ? subtitle : undefined,
  };
}

function getIdleTimeoutMs(): number | undefined {
  const raw = process.env.OMO_CODEX_COMPUTER_IDLE_TIMEOUT_MS;
  if (raw === undefined) return DEFAULT_IDLE_TIMEOUT_MS;

  const normalized = raw.trim();
  if (!/^\d+$/.test(normalized)) return undefined;

  const parsed = Number.parseInt(normalized, 10);
  if (parsed <= 0) return undefined;
  return parsed;
}

function createAbortError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}
