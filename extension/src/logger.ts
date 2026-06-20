/**
 * OutputChannel-based logger for the Akatsuki Git extension.
 *
 * All logs are prefixed with [Akatsuki] and a timestamp.
 * No console.log is used in shipped code.
 */

import * as vscode from 'vscode';

export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  dispose(): void;
}

class OutputChannelLogger implements Logger {
  private readonly channel: vscode.OutputChannel;

  constructor() {
    this.channel = vscode.window.createOutputChannel('Akatsuki Git');
  }

  private formatMessage(level: string, message: string): string {
    const now = new Date();
    const timestamp = now.toISOString().replace('T', ' ').slice(0, 19);
    return `[${timestamp}] [Akatsuki] [${level}] ${message}`;
  }

  private log(level: string, message: string, ...args: unknown[]): void {
    const formatted = this.formatMessage(level, message);
    this.channel.appendLine(formatted);
    if (args.length > 0) {
      this.channel.append(JSON.stringify(args, null, 2));
    }
  }

  info(message: string, ...args: unknown[]): void {
    this.log('INFO', message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.log('WARN', message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.log('ERROR', message, ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    this.log('DEBUG', message, ...args);
  }

  dispose(): void {
    this.channel.dispose();
  }
}

let loggerInstance: Logger | undefined;

export function createLogger(): Logger {
  if (loggerInstance) {
    return loggerInstance;
  }
  loggerInstance = new OutputChannelLogger();
  return loggerInstance;
}

export function getLogger(): Logger {
  if (!loggerInstance) {
    loggerInstance = createLogger();
  }
  return loggerInstance;
}
