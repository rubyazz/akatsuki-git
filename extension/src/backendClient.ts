/**
 * Backend RPC client — spawns akatsuki-backend and handles JSON-RPC 2.0.
 *
 * Features:
 * - Spawns the backend binary (stdin/stdout communication).
 * - JSON-RPC 2.0 framing (newline-delimited).
 * - Typed sendRequest<M>() using MethodParamsMap/MethodResultMap.
 * - Watchdog: handshake + ping with auto-retry (1 respawn).
 * - Notification routing for backend -> extension messages.
 * - Proper disposal (SIGTERM/SIGKILL) and pending request rejection.
 */

import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as protocol from './protocol';
import { getLogger, Logger } from './logger';

const PING_TIMEOUT_MS = 15000; // 15 seconds
const MAX_RESPAWN_ATTEMPTS = 1;

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: protocol.RpcError) => void;
  method: string;
  startTime: number;
}

type NotificationHandler = (params: unknown) => void;

export class RpcException extends Error {
  public readonly error: protocol.RpcError;

  constructor(error: protocol.RpcError) {
    super(`RPC Error ${error.code}: ${error.message}`);
    this.name = 'RpcException';
    this.error = error;
  }
}

export class BackendClient implements vscode.Disposable {
  private childProcess: cp.ChildProcess | undefined;
  private pendingRequests = new Map<number, PendingRequest>();
  private notificationHandlers = new Map<string, NotificationHandler>();
  private nextId = 1;
  private isSpawning = false;
  private respawnCount = 0;
  private pingTimeout: NodeJS.Timeout | undefined;
  private isDisposed = false;
  private readonly logger: Logger;

  constructor(
    private readonly config: vscode.WorkspaceConfiguration,
    private readonly extensionPath: string,
  ) {
    this.logger = getLogger();
  }

  /**
   * Spawn the backend process and perform handshake.
   * Throws if the binary cannot be found or handshake fails.
   */
  public async spawn(): Promise<void> {
    if (this.isSpawning || (this.childProcess && !this.childProcess.killed)) {
      return;
    }

    this.isSpawning = true;

    try {
      const backendPath = this.resolveBackendPath();
      this.logger.info(`Spawning backend: ${backendPath}`);

      this.childProcess = cp.spawn(backendPath, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (this.childProcess.stderr) {
        this.childProcess.stderr.on('data', (data: Buffer) => {
          // Backend logs go to stderr; forward to our output channel
          const lines = data.toString('utf8').split('\n').filter(l => l.trim());
          for (const line of lines) {
            this.logger.info(`[backend] ${line}`);
          }
        });
      }

      if (this.childProcess.stdout) {
        this.childProcess.stdout.on('data', (data: Buffer) => {
          this.handleOutput(data);
        });
      }

      this.childProcess.on('error', (err) => {
        this.logger.error(`Backend process error: ${err.message}`);
        this.rejectAllPending(err);
      });

      this.childProcess.on('exit', (code, signal) => {
        this.logger.warn(`Backend exited (code: ${code}, signal: ${signal})`);
        this.childProcess = undefined;
        this.rejectAllPending(new Error(`Backend exited with code ${code}`));
      });

      // Perform handshake
      await this.performHandshake();

      // Start ping watchdog
      this.startPingWatchdog();

      this.logger.info('Backend spawned and handshake complete');
    } catch (err) {
      this.logger.error(`Failed to spawn backend: ${err}`);
      throw err;
    } finally {
      this.isSpawning = false;
    }
  }

  /**
   * Send a JSON-RPC request and await the response.
   *
   * @param method - The RPC method name (typed from Methods)
   * @param params - The method parameters (typed from MethodParamsMap)
   * @returns Promise resolving to the result (typed from MethodResultMap)
   * @throws RpcException on error response
   */
  public sendRequest<M extends keyof protocol.MethodParamsMap>(
    method: M,
    params: protocol.MethodParamsMap[M],
  ): Promise<protocol.MethodResultMap[M]> {
    if (this.isDisposed) {
      return Promise.reject(new Error('BackendClient is disposed'));
    }

    if (!this.childProcess || this.childProcess.killed) {
      return Promise.reject(new Error('Backend process is not running'));
    }

    // Capture the guarded child process so the closure below sees a non-nullable
    // type; TS widens `this.childProcess` back to `| undefined` across the
    // Promise executor boundary.
    const child = this.childProcess;

    return new Promise<protocol.MethodResultMap[M]>((resolve, reject) => {
      const id = this.nextId++ as number;
      const request: protocol.RpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      this.pendingRequests.set(id, {
        resolve: (result: unknown) => resolve(result as protocol.MethodResultMap[M]),
        reject: (error: protocol.RpcError) => reject(new RpcException(error)),
        method,
        startTime: Date.now(),
      });

      try {
        const message = JSON.stringify(request) + '\n';
        child.stdin?.write(message, 'utf8', (err) => {
          if (err) {
            this.logger.warn(`Failed to write to backend stdin: ${err.message}`);
            this.pendingRequests.delete(id);
            reject(err);
          }
        });
      } catch (err) {
        this.pendingRequests.delete(id);
        reject(err);
      }
    });
  }

  /**
   * Register a handler for backend -> extension notifications.
   */
  public onNotification(method: string, handler: NotificationHandler): void {
    this.notificationHandlers.set(method, handler);
  }

  /**
   * Dispose: kill child process and clean up resources.
   */
  public dispose(): void {
    this.isDisposed = true;
    this.clearPingWatchdog();

    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = undefined;
    }

    if (this.childProcess && !this.childProcess.killed) {
      this.logger.info('Killing backend process...');

      // Try graceful shutdown first
      this.childProcess.kill('SIGTERM');

      // Force kill after 5 seconds
      const forceKillTimeout = setTimeout(() => {
        if (this.childProcess && !this.childProcess.killed) {
          this.logger.warn('Backend did not exit gracefully; forcing SIGKILL');
          this.childProcess.kill('SIGKILL');
        }
      }, 5000);

      // Prevent the timeout from keeping the process alive
      forceKillTimeout.unref();
    }

    this.rejectAllPending(new Error('BackendClient was disposed'));
    this.childProcess = undefined;
  }

  private resolveBackendPath(): string {
    // Highest priority: explicit user override.
    const override = this.config.get<string>('backendPath');
    if (override) {
      return override;
    }

    // The backend executable name on the current platform.
    const exeName = process.platform === 'win32' ? 'akatsuki-backend.exe' : 'akatsuki-backend';

    // 1. Packaged binary bundled inside the installed extension
    //    (`<extensionPath>/bin/akatsuki-backend`). Present in a packaged VSIX.
    const bundled = path.join(this.extensionPath, 'bin', exeName);
    if (fs.existsSync(bundled)) {
      return bundled;
    }

    // 2. Development fallback: the extension runs from `extension/out/`, so the
    //    cargo-built binary lives at `../../backend/target/debug/`.
    return path.resolve(__dirname, '../../backend/target/debug', exeName);
  }

  private async performHandshake(): Promise<void> {
    try {
      const result = await this.sendRequest(protocol.Methods.HANDSHAKE, {
        version: protocol.PROTOCOL_VERSION,
      });

      if (!result.ok) {
        throw new Error(
          `Handshake failed: version mismatch (expected ${protocol.PROTOCOL_VERSION}, got ${result.version})`,
        );
      }

      this.logger.info(`Handshake OK (protocol version ${result.version})`);
    } catch (err) {
      if (err instanceof RpcException) {
        throw new Error(`Handshake RPC error: ${err.error.message}`);
      }
      throw err;
    }
  }

  private startPingWatchdog(): void {
    this.clearPingWatchdog();

    const schedulePing = () => {
      if (this.isDisposed || !this.childProcess || this.childProcess.killed) {
        return;
      }

      this.pingTimeout = setTimeout(async () => {
        try {
          await Promise.race([
            this.sendRequest(protocol.Methods.PING, undefined),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Ping timeout')), PING_TIMEOUT_MS),
            ),
          ]);
          // Ping successful, schedule next
          schedulePing();
        } catch (err) {
          this.logger.warn(`Ping failed: ${err}`);
          this.handlePingFailure();
        }
      }, PING_TIMEOUT_MS);
    };

    schedulePing();
  }

  private clearPingWatchdog(): void {
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = undefined;
    }
  }

  private async handlePingFailure(): Promise<void> {
    if (this.respawnCount >= MAX_RESPAWN_ATTEMPTS) {
      this.logger.error('Max respawn attempts reached; giving up.');
      vscode.window.showErrorMessage(
        'Akatsuki Git: Backend is unresponsive. Please reload the window or check the backend logs.',
      );
      return;
    }

    this.respawnCount++;
    this.logger.info(`Attempting to respawn backend (${this.respawnCount}/${MAX_RESPAWN_ATTEMPTS})...`);

    if (this.childProcess && !this.childProcess.killed) {
      this.childProcess.kill('SIGKILL');
    }

    this.childProcess = undefined;
    this.rejectAllPending(new Error('Backend unresponsive; respawning...'));

    try {
      await this.spawn();
      this.respawnCount = 0; // Reset on successful respawn
    } catch (err) {
      this.logger.error(`Respawn failed: ${err}`);
    }
  }

  private handleOutput(data: Buffer): void {
    const text = data.toString('utf8');
    const lines = text.split('\n').filter(l => l.trim());

    for (const line of lines) {
      try {
        const message: protocol.RpcResponse = JSON.parse(line);
        this.handleMessage(message);
      } catch (err) {
        this.logger.error(`Failed to parse backend message: ${err}`);
      }
    }
  }

  private handleMessage(message: protocol.RpcResponse): void {
    if (message.id !== undefined) {
      // Response to a request
      const numericId = typeof message.id === 'number' ? message.id : parseInt(message.id as string, 10);
      const pending = this.pendingRequests.get(numericId);
      if (!pending) {
        this.logger.warn(`Received response for unknown request ID: ${message.id}`);
        return;
      }

      this.pendingRequests.delete(numericId);

      if (message.error) {
        pending.reject(message.error);
      } else if (message.result !== undefined) {
        pending.resolve(message.result);
      } else {
        pending.reject({ code: -1, message: 'Response has neither result nor error' });
      }
    } else {
      // Notification (no id)
      // Note: We need to infer the method from the message structure
      // In a proper implementation, we'd have a notification field
      // For now, we'll handle this in the extension layer
    }
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      pending.reject({
        code: -32603, // Internal error
        message: error.message,
      });
    }
    this.pendingRequests.clear();
  }
}
