import { customAlphabet } from 'nanoid';
import { generateAppId } from '@demo2apk/core';

const nanoidDns = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8);

export function generatePwaSiteId(appName: string): string {
  const appId = generateAppId(appName || 'app');
  const base = appId.split('.').pop() || 'app';
  return `${base}-${nanoidDns()}`;
}

export function buildPwaUrl(params: {
  siteId: string;
  hostSuffix?: string;
  scheme?: string;
}): string | null {
  const hostSuffix = (params.hostSuffix || '').trim().replace(/^\.+/, '');
  if (!hostSuffix) return null;
  const scheme = (params.scheme || 'https').trim() || 'https';
  return `${scheme}://${params.siteId}.${hostSuffix}/`;
}

