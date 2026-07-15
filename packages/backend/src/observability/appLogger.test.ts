import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  appLogger,
  getLogMinLevel,
  isHttpAccessLogEnabled,
  refreshLogLevelFromEnv,
} from './appLogger.js';

describe('appLogger (MB-014)', () => {
  const prev = { ...process.env };

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = { ...prev };
    refreshLogLevelFromEnv();
    vi.restoreAllMocks();
  });

  it('respects LOG_LEVEL=warn (suppresses info/debug)', () => {
    process.env.LOG_LEVEL = 'warn';
    refreshLogLevelFromEnv();
    expect(getLogMinLevel()).toBe('warn');
    appLogger.info('t', 'nope');
    appLogger.warn('t', 'yes');
    expect(console.log).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
  });

  it('HTTP access log off by default', () => {
    process.env.LOG_LEVEL = 'debug';
    delete process.env.LOG_HTTP;
    refreshLogLevelFromEnv();
    expect(isHttpAccessLogEnabled()).toBe(false);
  });

  it('HTTP access log on with LOG_HTTP=1', () => {
    process.env.LOG_LEVEL = 'info';
    process.env.LOG_HTTP = '1';
    refreshLogLevelFromEnv();
    expect(isHttpAccessLogEnabled()).toBe(true);
  });
});
