import { describe, expect, it } from 'vitest';
import { getAnnouncementsSendPollMs } from '../config/announcementsWorkerEnv.js';

describe('announcements worker env (MB-017)', () => {
  it('defaults to 15s', () => {
    const prev = process.env.ANNOUNCEMENTS_SEND_POLL_MS;
    delete process.env.ANNOUNCEMENTS_SEND_POLL_MS;
    expect(getAnnouncementsSendPollMs()).toBe(15_000);
    if (prev !== undefined) process.env.ANNOUNCEMENTS_SEND_POLL_MS = prev;
  });

  it('respects env override and enforces min 2s', () => {
    process.env.ANNOUNCEMENTS_SEND_POLL_MS = '500';
    expect(getAnnouncementsSendPollMs()).toBe(2000);
    process.env.ANNOUNCEMENTS_SEND_POLL_MS = '4000';
    expect(getAnnouncementsSendPollMs()).toBe(4000);
    delete process.env.ANNOUNCEMENTS_SEND_POLL_MS;
  });
});
