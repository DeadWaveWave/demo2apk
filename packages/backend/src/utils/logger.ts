import { FastifyBaseLogger } from 'fastify';
import { nanoid } from 'nanoid';

/**
 * 常用 HTTP 状态码描述
 */
const HTTP_STATUS_TEXT: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  400: 'Bad Request',
  401: 'Unauthorized',
  404: 'Not Found',
  429: 'Rate Limited',
  500: 'Server Error',
};

/**
 * 日志级别枚举
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * 日志上下文接口
 */
export interface LogContext {
  // 追踪信息
  traceId?: string;
  taskId?: string;
  jobId?: string;

  // 请求信息
  method?: string;
  path?: string;
  ip?: string;
  userAgent?: string;

  // 构建信息
  appName?: string;
  appId?: string;
  buildType?: 'html' | 'zip';
  fileSize?: number;
  fileName?: string;

  // 性能信息
  durationMs?: number;
  progress?: number;

  // 结果信息
  success?: boolean;
  apkPath?: string;
  apkSize?: number;

  // 其他
  [key: string]: unknown;
}

/**
 * 日志条目接口
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * Logger 类 - 提供结构化日志能力
 */
export class Logger {
  private context: LogContext;
  private fastifyLogger?: FastifyBaseLogger;

  constructor(context: LogContext = {}, fastifyLogger?: FastifyBaseLogger) {
    this.context = context;
    this.fastifyLogger = fastifyLogger;
  }

  /**
   * 创建子 Logger，继承父级上下文
   */
  child(additionalContext: LogContext): Logger {
    return new Logger(
      { ...this.context, ...additionalContext },
      this.fastifyLogger
    );
  }

  /**
   * 生成追踪 ID
   */
  static generateTraceId(): string {
    return nanoid(16);
  }

  /**
   * 格式化日志输出
   */
  private formatLog(level: LogLevel, message: string, extra?: LogContext, error?: Error): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: { ...this.context, ...extra },
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    return entry;
  }

  /**
   * 输出日志
   */
  private log(level: LogLevel, message: string, extra?: LogContext, error?: Error): void {
    const entry = this.formatLog(level, message, extra, error);
    const logLine = this.toLogLine(entry);

    // 如果有 Fastify logger，使用它（用于 API 服务）
    if (this.fastifyLogger) {
      // 只保留关键字段，避免冗余
      const logObj: Record<string, unknown> = { msg: message };
      
      // 选择性添加重要上下文
      const ctx = entry.context;
      if (ctx.traceId) logObj.trace = ctx.traceId;
      if (ctx.taskId) logObj.task = ctx.taskId;
      if (ctx.appName) logObj.app = ctx.appName;
      if (ctx.buildType) logObj.type = ctx.buildType;
      if (ctx.success !== undefined) logObj.success = ctx.success;
      if (ctx.durationMs !== undefined) logObj.duration = `${ctx.durationMs}ms`;
      if (ctx.fileSize !== undefined) logObj.size = formatBytes(ctx.fileSize);
      if (ctx.apkSize !== undefined) logObj.apkSize = formatBytes(ctx.apkSize);
      
      if (error) {
        logObj.error = entry.error?.message;
      }

      switch (level) {
        case LogLevel.DEBUG:
          this.fastifyLogger.debug(logObj);
          break;
        case LogLevel.INFO:
          this.fastifyLogger.info(logObj);
          break;
        case LogLevel.WARN:
          this.fastifyLogger.warn(logObj);
          break;
        case LogLevel.ERROR:
          this.fastifyLogger.error(logObj);
          break;
      }
    } else {
      // Worker 环境使用 console
      switch (level) {
        case LogLevel.DEBUG:
          console.debug(logLine);
          break;
        case LogLevel.INFO:
          console.info(logLine);
          break;
        case LogLevel.WARN:
          console.warn(logLine);
          break;
        case LogLevel.ERROR:
          console.error(logLine);
          break;
      }
    }
  }

  /**
   * 转换为可读的日志行（用于 console 输出）
   */
  private toLogLine(entry: LogEntry): string {
    const time = entry.timestamp.substring(11, 23); // HH:mm:ss.SSS
    const level = entry.level.toUpperCase().padEnd(5);
    const ctx = this.formatContext(entry.context);
    const errInfo = entry.error ? ` | ERROR: ${entry.error.message}` : '';
    
    return `[${time}] ${level} ${entry.message}${ctx}${errInfo}`;
  }

  /**
   * 格式化上下文为可读字符串
   */
  private formatContext(context: LogContext): string {
    const parts: string[] = [];

    // 优先显示追踪信息
    if (context.traceId) parts.push(`trace=${context.traceId}`);
    if (context.taskId) parts.push(`task=${context.taskId}`);
    if (context.jobId) parts.push(`job=${context.jobId}`);

    // 构建信息
    if (context.appName) parts.push(`app=${context.appName}`);
    if (context.buildType) parts.push(`type=${context.buildType}`);

    // 性能信息
    if (context.durationMs !== undefined) parts.push(`duration=${context.durationMs}ms`);
    if (context.progress !== undefined) parts.push(`progress=${context.progress}%`);

    // 文件信息
    if (context.fileSize !== undefined) parts.push(`size=${formatBytes(context.fileSize)}`);

    // 其他重要信息
    if (context.success !== undefined) parts.push(`success=${context.success}`);

    return parts.length > 0 ? ` | ${parts.join(' ')}` : '';
  }

  // 日志方法
  debug(message: string, extra?: LogContext): void {
    this.log(LogLevel.DEBUG, message, extra);
  }

  info(message: string, extra?: LogContext): void {
    this.log(LogLevel.INFO, message, extra);
  }

  warn(message: string, extra?: LogContext): void {
    this.log(LogLevel.WARN, message, extra);
  }

  error(message: string, error?: Error | unknown, extra?: LogContext): void {
    const err = error instanceof Error ? error : error ? new Error(String(error)) : undefined;
    this.log(LogLevel.ERROR, message, extra, err);
  }

  // 便捷方法
  
  /**
   * 记录请求开始
   */
  requestStart(method: string, path: string, extra?: LogContext): void {
    this.info(`${method} ${path}`, { method, path, ...extra });
  }

  /**
   * 记录请求结束
   */
  requestEnd(method: string, path: string, statusCode: number, durationMs: number, extra?: LogContext): void {
    const level = statusCode >= 500 ? LogLevel.ERROR : statusCode >= 400 ? LogLevel.WARN : LogLevel.INFO;
    // 根据状态码添加描述
    const statusText = HTTP_STATUS_TEXT[statusCode] || '';
    const message = statusText 
      ? `${method} ${path} ${statusCode} ${statusText} (${durationMs}ms)`
      : `${method} ${path} ${statusCode} (${durationMs}ms)`;
    this.log(level, message, { ...extra });
  }

  /**
   * 记录构建任务创建
   */
  buildCreated(taskId: string, appName: string, buildType: 'html' | 'zip', extra?: LogContext): void {
    this.info('Build task created', { taskId, appName, buildType, ...extra });
  }

  /**
   * 记录构建开始
   */
  buildStart(taskId: string, appName: string, buildType: 'html' | 'zip', extra?: LogContext): void {
    this.info('Build started', { taskId, appName, buildType, ...extra });
  }

  /**
   * 记录构建进度
   */
  buildProgress(taskId: string, message: string, progress: number, extra?: LogContext): void {
    this.debug(`Build progress: ${message}`, { taskId, progress, ...extra });
  }

  /**
   * 记录构建完成
   */
  buildComplete(taskId: string, appName: string, success: boolean, durationMs: number, extra?: LogContext): void {
    const level = success ? LogLevel.INFO : LogLevel.ERROR;
    this.log(level, success ? 'Build completed successfully' : 'Build failed', {
      taskId,
      appName,
      success,
      durationMs,
      ...extra,
    });
  }

  /**
   * 记录文件操作
   */
  fileOperation(operation: 'upload' | 'download' | 'delete' | 'cleanup', fileName: string, extra?: LogContext): void {
    this.info(`File ${operation}: ${fileName}`, { operation, fileName, ...extra });
  }
}

/**
 * 格式化字节数为可读字符串
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * 创建根 Logger 实例
 */
export function createLogger(context?: LogContext, fastifyLogger?: FastifyBaseLogger): Logger {
  return new Logger(context, fastifyLogger);
}

/**
 * Worker 专用 Logger
 */
export const workerLogger = createLogger({ component: 'worker' });

/**
 * 为请求创建带追踪 ID 的 Logger
 */
export function createRequestLogger(
  fastifyLogger: FastifyBaseLogger,
  request: { ip: string; method: string; url: string; headers: Record<string, string | string[] | undefined> }
): Logger {
  const traceId = Logger.generateTraceId();
  const ip = request.headers['x-forwarded-for']?.toString().split(',')[0] || request.ip;
  const userAgent = request.headers['user-agent']?.toString();

  return createLogger(
    {
      traceId,
      ip,
      userAgent,
      method: request.method,
      path: request.url,
    },
    fastifyLogger
  );
}

