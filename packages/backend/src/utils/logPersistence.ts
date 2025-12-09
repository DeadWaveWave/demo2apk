import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import type { LogEntry } from './logger.js';

// 使用 ESM 的 __dirname 等价物
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 进程级配置与状态
const LOG_PERSIST_ENABLED =
  process.env.LOG_PERSIST_ENABLED === undefined
    ? true
    : process.env.LOG_PERSIST_ENABLED !== 'false';

const LOGS_DIR =
  process.env.LOGS_DIR ||
  // 默认指向 monorepo 根目录下的 logs（backend/dist/utils 相对路径为 ../../..）
  path.resolve(__dirname, '../../../logs');

// 简单的错误节流，避免在磁盘出问题时刷爆 stdout
let lastErrorTime = 0;
const ERROR_THROTTLE_MS = 30_000;

function getComponentFromEntry(entry: LogEntry): string {
  const ctx = entry.context || {};
  const component = (ctx as { component?: unknown }).component;

  if (typeof component === 'string' && component.trim()) {
    return component;
  }

  // 默认归类到 api
  return 'api';
}

function getLogFilePath(entry: LogEntry): string {
  const component = getComponentFromEntry(entry);
  const date = new Date(entry.timestamp);

  // 以 UTC 日期做文件切分，避免时区混乱
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');

  const filename = `${component}-${yyyy}-${mm}-${dd}.jsonl`;
  return path.join(LOGS_DIR, filename);
}

/**
 * 将结构化日志追加写入本地 JSONL 文件。
 *
 * - 不会抛出异常影响主业务流程
 * - 在 LOG_PERSIST_ENABLED=false 时直接跳过
 */
export async function appendLog(entry: LogEntry): Promise<void> {
  if (!LOG_PERSIST_ENABLED) return;

  try {
    const filePath = getLogFilePath(entry);

    // 确保目录存在
    await fs.ensureDir(path.dirname(filePath));

    const line = JSON.stringify(entry) + '\n';
    await fs.appendFile(filePath, line, 'utf8');
  } catch (err) {
    const now = Date.now();
    if (now - lastErrorTime > ERROR_THROTTLE_MS) {
      lastErrorTime = now;
      // 使用 console.error，避免和 Logger 互相依赖
      console.error('[logPersistence] Failed to append log entry:', err);
    }
  }
}


