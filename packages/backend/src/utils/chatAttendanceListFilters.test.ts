import { describe, expect, it } from 'vitest';
import {
  isClosedOrArchivedAttendanceStatus,
  sqlExcludeClosedArchived,
  sqlQueueOrUnassignedAttendance,
} from './chatAttendanceListFilters.js';

describe('chatAttendanceListFilters', () => {
  it('sqlExcludeClosedArchived keeps null/open and blocks closed/archived', () => {
    const sql = sqlExcludeClosedArchived('c');
    expect(sql).toContain("NOT IN ('closed', 'archived')");
    expect(sql).toContain('attendance_status IS NULL');
  });

  it('sqlQueueOrUnassignedAttendance never matches closed/archived', () => {
    const sql = sqlQueueOrUnassignedAttendance('c');
    expect(sql).toContain("IN ('pending', 'open')");
    expect(sql).toContain("IS DISTINCT FROM 'closed'");
    expect(sql).toContain("IS DISTINCT FROM 'archived'");
    expect(sql).toContain('assigned_to_user_id IS NULL');
  });

  it('isClosedOrArchivedAttendanceStatus', () => {
    expect(isClosedOrArchivedAttendanceStatus('closed')).toBe(true);
    expect(isClosedOrArchivedAttendanceStatus('archived')).toBe(true);
    expect(isClosedOrArchivedAttendanceStatus('pending')).toBe(false);
    expect(isClosedOrArchivedAttendanceStatus(null)).toBe(false);
  });
});
