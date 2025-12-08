import path from 'path';
import { generateAppId } from '@demo2apk/core';

/**
 * Normalize appName / appId from upload (ZIP / HTML file).
 *
 * - 优先使用用户传入的 appName，其次用上传文件名（去掉扩展）
 * - 如果最终没有名字则回落到 defaultName
 * - appId 若未显式指定，则根据最终 appName 调用 core 的 generateAppId
 */
export function resolveAppIdentityFromUpload(
    rawAppName: string | undefined,
    rawAppId: string | undefined,
    filename: string,
    defaultName: string
): { appName: string; appId: string } {
    const baseName = path.parse(filename).name;
    const appName = (rawAppName || baseName || defaultName || 'MyApp').trim() || defaultName || 'MyApp';
    const appId = (rawAppId && rawAppId.trim()) || generateAppId(appName);
    return { appName, appId };
}

/**
 * Normalize appName / appId when没有文件名（例如 /api/build/code 或 React 组件 wrap）。
 */
export function resolveAppIdentityFromCode(
    rawAppName: string | undefined,
    rawAppId: string | undefined,
    defaultName: string
): { appName: string; appId: string } {
    const appName = (rawAppName || defaultName || 'MyApp').trim() || defaultName || 'MyApp';
    const appId = (rawAppId && rawAppId.trim()) || generateAppId(appName);
    return { appName, appId };
}


