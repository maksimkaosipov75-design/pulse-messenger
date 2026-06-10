import { invoke, InvokeArgs } from '@tauri-apps/api/core';
import i18n from '@/i18n';
import { toast } from '@/stores/toastStore';

interface RetryOptions {
  /** Number of attempts in total (default 3) */
  attempts?: number;
  /** Base delay between attempts, doubled each retry (default 500ms) */
  baseDelayMs?: number;
  /** Show an error toast when all attempts fail (default true) */
  notify?: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * invoke() with exponential-backoff retries for transient failures.
 * Rethrows the last error so callers can still handle it.
 */
export async function invokeWithRetry<T>(
  command: string,
  args?: InvokeArgs,
  options: RetryOptions = {}
): Promise<T> {
  const { attempts = 3, baseDelayMs = 500, notify = true } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await invoke<T>(command, args);
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await sleep(baseDelayMs * 2 ** attempt);
      }
    }
  }

  if (notify) {
    toast.error(formatError(lastError));
  }
  throw lastError;
}

/** Turn a backend error into a user-facing message */
export function formatError(error: unknown): string {
  const raw = String(error ?? '');
  if (!raw || raw === 'undefined' || raw === 'null') {
    return i18n.t('error.generic');
  }
  // Backend errors are plain strings; cap the length so the toast stays readable
  return raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
}
