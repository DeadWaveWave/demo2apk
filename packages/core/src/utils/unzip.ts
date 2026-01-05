import type { Options } from 'execa';
import { execa } from 'execa';

type UnzipResult = Awaited<ReturnType<typeof execa>>;

/**
 * Run `unzip` but treat exit code 1 (warnings) as success.
 *
 * Info-ZIP `unzip` uses:
 * - 0: success
 * - 1: warnings (e.g. filename encoding mismatch) — extraction can still succeed
 * - 2+: errors
 */
export async function runUnzip(args: string[], options: Options = {}): Promise<UnzipResult> {
  const result = await execa('unzip', args, { ...options, reject: false });

  if (typeof result.exitCode === 'number' && result.exitCode > 1) {
    const error = new Error(`unzip failed with exit code ${result.exitCode}`);
    (error as any).exitCode = result.exitCode;
    (error as any).stdout = result.stdout;
    (error as any).stderr = result.stderr;
    throw error;
  }

  return result;
}

