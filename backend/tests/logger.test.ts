import { describe, it, expect } from 'vitest';
import { formatTimestamp, logger } from '../src/utils/logger';

describe('Logger Timestamp Formatting', () => {
  it('formats dates in "DD, Mon YYYY, hh:mm:ss A" format', () => {
    // 24th October 2026 at 01:08:36 (morning)
    const testDateMorning = new Date(2026, 9, 24, 1, 8, 36);
    expect(formatTimestamp(testDateMorning)).toBe('24, Oct 2026, 01:08:36 AM');

    // 24th October 2026 at 13:45:09 (afternoon)
    const testDateAfternoon = new Date(2026, 9, 24, 13, 45, 9);
    expect(formatTimestamp(testDateAfternoon)).toBe('24, Oct 2026, 01:45:09 PM');

    // Midnight: 00:00:00 should format to 12:00:00 AM
    const midnight = new Date(2026, 9, 24, 0, 0, 0);
    expect(formatTimestamp(midnight)).toBe('24, Oct 2026, 12:00:00 AM');

    // Noon: 12:00:00 should format to 12:00:00 PM
    const noon = new Date(2026, 9, 24, 12, 0, 0);
    expect(formatTimestamp(noon)).toBe('24, Oct 2026, 12:00:00 PM');
  });

  it('logger logs without throwing errors', () => {
    expect(() => logger.info('Test info message')).not.toThrow();
    expect(() => logger.warn('Test warn message')).not.toThrow();
    expect(() => logger.error('Test error message', new Error('Sample error'))).not.toThrow();
  });
});
