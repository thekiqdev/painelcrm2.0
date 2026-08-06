import { describe, expect, it } from 'vitest';
import { mergeAttendanceAssigneeFields } from './attendanceAssigneeMerge';

describe('mergeAttendanceAssigneeFields', () => {
  const assigned = {
    assigned_to_user_id: 'u1',
    assignee_email: 'a@x.com',
    assignee_display: 'Kaique',
    assignee_avatar_url: 'https://cdn/a.png',
  };

  it('limpa foto/nome quando assigned_to_user_id vem null', () => {
    expect(
      mergeAttendanceAssigneeFields(assigned, {
        assigned_to_user_id: null,
        assignee_display: null,
        assignee_avatar_url: null,
        assignee_email: null,
      }),
    ).toEqual({
      assigned_to_user_id: null,
      assignee_email: null,
      assignee_display: null,
      assignee_avatar_url: null,
    });
  });

  it('preserva display quando patch omite assignee (undefined)', () => {
    expect(
      mergeAttendanceAssigneeFields(assigned, {
        assigned_to_user_id: 'u1',
      }),
    ).toMatchObject({
      assigned_to_user_id: 'u1',
      assignee_display: 'Kaique',
      assignee_avatar_url: 'https://cdn/a.png',
    });
  });

  it('aplica novo agente com display do patch', () => {
    expect(
      mergeAttendanceAssigneeFields(assigned, {
        assigned_to_user_id: 'u2',
        assignee_display: 'Maria',
        assignee_avatar_url: 'https://cdn/b.png',
        assignee_email: 'm@x.com',
      }),
    ).toEqual({
      assigned_to_user_id: 'u2',
      assignee_email: 'm@x.com',
      assignee_display: 'Maria',
      assignee_avatar_url: 'https://cdn/b.png',
    });
  });

  it('mesmo agente: null incompleto no patch não apaga foto', () => {
    expect(
      mergeAttendanceAssigneeFields(assigned, {
        assigned_to_user_id: 'u1',
        assignee_display: null,
        assignee_avatar_url: null,
      }),
    ).toMatchObject({
      assigned_to_user_id: 'u1',
      assignee_display: 'Kaique',
      assignee_avatar_url: 'https://cdn/a.png',
    });
  });
});
