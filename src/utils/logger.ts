/**
 * Centralized Structured Logging System for SIMONLE Backend Service
 * Output formatted with Asia/Jakarta (WIB) timestamps
 */

function getWibTimestamp(): string {
  const now = new Date();
  return now.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).replace(/\./g, ':');
}

export const logger = {
  info: (message: string, meta?: any) => {
    const metaStr = meta ? ` | ${typeof meta === 'object' ? JSON.stringify(meta) : meta}` : '';
    console.log(`\x1b[32m[INFO]\x1b[0m  [${getWibTimestamp()}] ${message}${metaStr}`);
  },
  warn: (message: string, meta?: any) => {
    const metaStr = meta ? ` | ${typeof meta === 'object' ? JSON.stringify(meta) : meta}` : '';
    console.warn(`\x1b[33m[WARN]\x1b[0m  [${getWibTimestamp()}] ${message}${metaStr}`);
  },
  error: (message: string, error?: any) => {
    const errStr = error
      ? ` | ${error instanceof Error ? `${error.message}\n${error.stack}` : JSON.stringify(error)}`
      : '';
    console.error(`\x1b[31m[ERROR]\x1b[0m [${getWibTimestamp()}] ${message}${errStr}`);
  },
};
