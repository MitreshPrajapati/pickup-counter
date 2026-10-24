type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Formats a Date object into: "24, Oct 2026, 01:08:36 AM"
 * 12-hour cycle with AM/PM and "DD, Mon YYYY" date format.
 */
export function formatTimestamp(date: Date = new Date()): string {
  const day = date.getDate();
  const month = MONTH_NAMES[date.getMonth()];
  const year = date.getFullYear();

  const hours24 = date.getHours();
  const ampm = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;

  const hours = String(hours12).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${day}, ${month} ${year}, ${hours}:${minutes}:${seconds} ${ampm}`;
}

class Logger {
  private formatMessage(level: LogLevel, message: string, meta?: any): string {
    const timestamp = formatTimestamp();
    const metaString = meta
      ? ` | ${typeof meta === 'object' ? JSON.stringify(meta) : meta}`
      : '';
    return `[${timestamp}] [${level}] ${message}${metaString}`;
  }

  info(message: string, meta?: any): void {
    console.log(this.formatMessage('INFO', message, meta));
  }

  warn(message: string, meta?: any): void {
    console.warn(this.formatMessage('WARN', message, meta));
  }

  error(message: string, error?: any, meta?: any): void {
    const errorDetails =
      error instanceof Error
        ? { message: error.message, stack: error.stack }
        : error;
    const combinedMeta = meta
      ? { ...meta, error: errorDetails }
      : errorDetails;
    console.error(this.formatMessage('ERROR', message, combinedMeta));
  }

  debug(message: string, meta?: any): void {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(this.formatMessage('DEBUG', message, meta));
    }
  }
}

export const logger = new Logger();
export default logger;
