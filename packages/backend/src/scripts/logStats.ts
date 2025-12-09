import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import type { LogEntry } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOGS_DIR =
    process.env.LOGS_DIR ||
    // backend/dist/scripts 相对 monorepo 根目录的路径为 ../../..
    path.resolve(__dirname, '../../../logs');

interface BuildSummary {
    date: string;
    totalBuilds: number;
    successCount: number;
    failedCount: number;
    avgDurationMs: number;
    p50DurationMs: number;
    p95DurationMs: number;
}

interface BuildRecord {
    // 原始 ISO 时间戳（UTC）
    timestamp: string;
    // 仅日期部分（YYYY-MM-DD），用于汇总
    date: string;
    taskId?: string;
    appName?: string;
    buildType?: string;
    apkSize?: number;
    success: boolean;
    durationMs: number;
}

interface AppSummary {
    appName: string | null;
    totalBuilds: number;
    successCount: number;
    failedCount: number;
    avgDurationMs: number;
}

interface BuildTypeSummary {
    buildType: string | null;
    totalBuilds: number;
    successCount: number;
    failedCount: number;
    avgDurationMs: number;
    uniqueApps: number;
}

function parseArgs() {
    const args = process.argv.slice(2);
    const result: {
        date?: string;
        from?: string;
        to?: string;
        json?: boolean;
        types?: boolean;
        apps?: boolean;
    } = {};

    for (const arg of args) {
        if (arg.startsWith('--date=')) {
            result.date = arg.substring('--date='.length);
        } else if (arg.startsWith('--from=')) {
            result.from = arg.substring('--from='.length);
        } else if (arg.startsWith('--to=')) {
            result.to = arg.substring('--to='.length);
        } else if (arg === '--json') {
            result.json = true;
        } else if (arg === '--types') {
            result.types = true;
        } else if (arg === '--apps') {
            result.apps = true;
        }
    }

    return result;
}

function parseDateOnly(iso: string): string {
    return iso.slice(0, 10);
}

function isWithinRange(date: string, from?: string, to?: string): boolean {
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
}

async function readWorkerLogFiles(): Promise<string[]> {
    const exists = await fs.pathExists(LOGS_DIR);
    if (!exists) return [];

    const entries = await fs.readdir(LOGS_DIR);
    return entries
        .filter((name) => name.startsWith('worker-') && name.endsWith('.jsonl'))
        .map((name) => path.join(LOGS_DIR, name));
}

async function collectBuildRecords(from?: string, to?: string): Promise<BuildRecord[]> {
    const files = await readWorkerLogFiles();
    const rawRecords: BuildRecord[] = [];

    for (const file of files) {
        const content = await fs.readFile(file, 'utf8');
        const lines = content.split('\n').filter((line) => line.trim().length > 0);

        for (const line of lines) {
            let entry: LogEntry;
            try {
                entry = JSON.parse(line) as LogEntry;
            } catch {
                continue;
            }

            const message = entry.message;
            const ctx = (entry.context || {}) as {
                taskId?: string;
                appName?: string;
                buildType?: string;
                apkSize?: number;
                success?: unknown;
                durationMs?: unknown;
            };

            const hasSuccessFlag = typeof ctx.success === 'boolean';
            const success = hasSuccessFlag ? Boolean(ctx.success) : undefined;
            const durationMs = ctx.durationMs;

            if (
                (message === 'Build completed successfully' || message === 'Build failed' || hasSuccessFlag) &&
                typeof durationMs === 'number'
            ) {
                const dateOnly = parseDateOnly(entry.timestamp);
                if (!isWithinRange(dateOnly, from, to)) continue;

                rawRecords.push({
                    timestamp: entry.timestamp,
                    date: dateOnly,
                    taskId: ctx.taskId,
                    appName: ctx.appName,
                    buildType: typeof ctx.buildType === 'string' ? ctx.buildType : undefined,
                    apkSize: typeof ctx.apkSize === 'number' ? ctx.apkSize : undefined,
                    success: success ?? message === 'Build completed successfully',
                    durationMs: durationMs as number,
                });
            }
        }
    }

    // 以 taskId 去重：同一个任务即使有多条“完成”相关日志，只算一条构建记录
    const byTask = new Map<string, BuildRecord>();
    let anonymousCounter = 0;

    for (const rec of rawRecords) {
        const key = rec.taskId ?? `__anon_${anonymousCounter++}`;
        const existing = byTask.get(key);

        if (!existing) {
            byTask.set(key, rec);
        } else {
            // 合并信息：优先保留具有 buildType / apkSize 的记录
            const merged: BuildRecord = {
                ...existing,
                ...rec,
                buildType: rec.buildType ?? existing.buildType,
                apkSize: rec.apkSize ?? existing.apkSize,
            };
            byTask.set(key, merged);
        }
    }

    return Array.from(byTask.values());
}

function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.floor((p / 100) * (sorted.length - 1));
    return sorted[index];
}

function summarize(records: BuildRecord[]): BuildSummary[] {
    const byDate = new Map<string, BuildRecord[]>();

    for (const rec of records) {
        const list = byDate.get(rec.date);
        if (list) {
            list.push(rec);
        } else {
            byDate.set(rec.date, [rec]);
        }
    }

    const summaries: BuildSummary[] = [];

    for (const [date, list] of byDate.entries()) {
        const totalBuilds = list.length;
        const successCount = list.filter((r) => r.success).length;
        const failedCount = totalBuilds - successCount;
        const durations = list.map((r) => r.durationMs).sort((a, b) => a - b);
        const sum = durations.reduce((acc, v) => acc + v, 0);

        summaries.push({
            date,
            totalBuilds,
            successCount,
            failedCount,
            avgDurationMs: totalBuilds > 0 ? Math.round(sum / totalBuilds) : 0,
            p50DurationMs: percentile(durations, 50),
            p95DurationMs: percentile(durations, 95),
        });
    }

    // 按日期排序
    return summaries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function summarizeByApp(records: BuildRecord[]): AppSummary[] {
    const byApp = new Map<string | null, BuildRecord[]>();

    for (const rec of records) {
        const key = rec.appName ?? null;
        const list = byApp.get(key);
        if (list) {
            list.push(rec);
        } else {
            byApp.set(key, [rec]);
        }
    }

    const summaries: AppSummary[] = [];

    for (const [appName, list] of byApp.entries()) {
        const totalBuilds = list.length;
        const successCount = list.filter((r) => r.success).length;
        const failedCount = totalBuilds - successCount;
        const durations = list.map((r) => r.durationMs);
        const sum = durations.reduce((acc, v) => acc + v, 0);

        summaries.push({
            appName,
            totalBuilds,
            successCount,
            failedCount,
            avgDurationMs: totalBuilds > 0 ? Math.round(sum / totalBuilds) : 0,
        });
    }

    return summaries.sort((a, b) => {
        const aName = a.appName ?? '';
        const bName = b.appName ?? '';
        return aName.localeCompare(bName);
    });
}

function summarizeByBuildType(records: BuildRecord[]): BuildTypeSummary[] {
    const byType = new Map<string | null, BuildRecord[]>();

    for (const rec of records) {
        const key = rec.buildType ?? null;
        const list = byType.get(key);
        if (list) {
            list.push(rec);
        } else {
            byType.set(key, [rec]);
        }
    }

    const summaries: BuildTypeSummary[] = [];

    for (const [buildType, list] of byType.entries()) {
        const totalBuilds = list.length;
        const successCount = list.filter((r) => r.success).length;
        const failedCount = totalBuilds - successCount;
        const durations = list.map((r) => r.durationMs);
        const sum = durations.reduce((acc, v) => acc + v, 0);
        const appNames = new Set(list.map((r) => r.appName ?? null));

        summaries.push({
            buildType,
            totalBuilds,
            successCount,
            failedCount,
            avgDurationMs: totalBuilds > 0 ? Math.round(sum / totalBuilds) : 0,
            uniqueApps: appNames.size,
        });
    }

    return summaries.sort((a, b) => {
        const aType = a.buildType ?? '';
        const bType = b.buildType ?? '';
        return aType.localeCompare(bType);
    });
}

function printHumanReadable(summaries: BuildSummary[]): void {
    if (summaries.length === 0) {
        console.log('No build records found for the given range.');
        return;
    }

    console.log('Demo2APK Build Statistics');
    console.log('==========================');

    for (const s of summaries) {
        const successRate = s.totalBuilds > 0 ? ((s.successCount / s.totalBuilds) * 100).toFixed(1) : '0.0';
        console.log(
            [
                `Date: ${s.date}`,
                `Builds: ${s.totalBuilds}`,
                `Success: ${s.successCount}`,
                `Failed: ${s.failedCount}`,
                `SuccessRate: ${successRate}%`,
                `Avg: ${s.avgDurationMs}ms`,
                `P50: ${s.p50DurationMs}ms`,
                `P95: ${s.p95DurationMs}ms`,
            ].join(' | ')
        );
    }
}

function formatLocalTimestampCST(timestamp: string): string {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return timestamp;

    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');

    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss} CST`;
}

function printDetailedReport(records: BuildRecord[], summaries: BuildSummary[]): void {
    if (records.length === 0) {
        console.log('No build records found for the given range.');
        return;
    }

    const totalBuilds = records.length;
    const appNames = new Set<string | null>(records.map((r) => r.appName ?? null));
    const uniqueProjectNames = appNames.size;

    console.log(`Total builds: ${totalBuilds}`);
    console.log();
    console.log(`Unique project names: ${uniqueProjectNames}`);
    console.log();

    console.log('Daily counts:');
    for (const s of summaries) {
        console.log(`  ${s.date}: ${s.totalBuilds}`);
    }

    console.log();
    console.log('Timeline:');

    const sorted = [...records].sort((a, b) =>
        a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0
    );

    for (const r of sorted) {
        const time = formatLocalTimestampCST(r.timestamp);
        const name = r.appName ?? '<unknown>';
        const type = r.buildType ?? '<unknown>';
        console.log(`  ${time} | ${name} | ${type}`);
    }
}

function printTypeSummary(byBuildType: BuildTypeSummary[]): void {
    if (byBuildType.length === 0) {
        console.log('No build records found for the given range.');
        return;
    }

    console.log('Builds by type:');
    for (const t of byBuildType) {
        const type = t.buildType ?? '<unknown>';
        const successRate = t.totalBuilds > 0 ? ((t.successCount / t.totalBuilds) * 100).toFixed(1) : '0.0';
        console.log(
            [
                `  ${type}:`,
                `total=${t.totalBuilds}`,
                `success=${t.successCount}`,
                `failed=${t.failedCount}`,
                `successRate=${successRate}%`,
                `uniqueApps=${t.uniqueApps}`,
                `avgDuration=${t.avgDurationMs}ms`,
            ].join(' ')
        );
    }
}

function printAppSummary(byApp: AppSummary[]): void {
    if (byApp.length === 0) {
        console.log('No build records found for the given range.');
        return;
    }

    console.log('Builds by app:');
    for (const a of byApp) {
        const name = a.appName ?? '<unknown>';
        const successRate = a.totalBuilds > 0 ? ((a.successCount / a.totalBuilds) * 100).toFixed(1) : '0.0';
        console.log(
            [
                `  ${name}:`,
                `total=${a.totalBuilds}`,
                `success=${a.successCount}`,
                `failed=${a.failedCount}`,
                `successRate=${successRate}%`,
                `avgDuration=${a.avgDurationMs}ms`,
            ].join(' ')
        );
    }
}

async function main() {
    const { date, from, to, json, types, apps } = parseArgs();

    let rangeFrom = from;
    let rangeTo = to;

    if (date) {
        rangeFrom = date;
        rangeTo = date;
    }

    const records = await collectBuildRecords(rangeFrom, rangeTo);
    const summaries = summarize(records);
    const byApp = summarizeByApp(records);
    const byBuildType = summarizeByBuildType(records);

    if (json) {
        console.log(JSON.stringify({ summaries, records, byApp, byBuildType }, null, 2));
    } else if (types) {
        printTypeSummary(byBuildType);
    } else if (apps) {
        printAppSummary(byApp);
    } else {
        printDetailedReport(records, summaries);
    }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();


