export const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  onRetry?: (attempt: number, error: unknown) => void;
}

function isTransient(error: unknown, response: Response | null): boolean {
  if (response) return response.status === 429 || response.status >= 500;
  return true; // network error / timeout
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  opts: RetryOptions = {},
): Promise<Response> {
  const { retries = 2, baseDelayMs = 500, onRetry } = opts;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (response.ok || !isTransient(null, response) || attempt === retries) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (attempt === retries) throw error;
      lastError = error;
    }

    onRetry?.(attempt + 1, lastError);
    const delay = baseDelayMs * 2 ** attempt + Math.random() * baseDelayMs;
    await sleep(delay);
  }

  throw lastError;
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;

  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      try {
        const value = await worker(items[index], index);
        results[index] = { status: 'fulfilled', value };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => run());
  await Promise.all(workers);

  return results;
}
