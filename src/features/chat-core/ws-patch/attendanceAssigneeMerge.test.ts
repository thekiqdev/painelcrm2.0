import { describe, expect, it } from 'vitest';
import { mergeAttendanceAssigneeFields } from './attendanceAssigneeMerge';
import { mergeAttendanceConversationPatch } from './conversation-merge';
import type { ChatConversation } from '@/services/chat';

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

describe('mergeAttendanceConversationPatch', () => {
  const prev: ChatConversation = {
    id: 'c1',
    user_id: 'owner',
    external_chat_id: '5511999999999@s.whatsapp.net',
    unreadCount: 2,
    contactName: 'Criar Loja',
    displayName: 'Criar Loja',
    phoneNumber: '+5511999999999',
    attendance_status: 'queued',
    assigned_to_user_id: null,
  };

  it('aplica assignee sem apagar nome/telefone do contacto', () => {
    const next = mergeAttendanceConversationPatch(prev, {
      attendance_status: 'in_progress',
      assigned_to_user_id: 'u1',
      assignee_display: 'Kaique',
      assignee_avatar_url: 'https://cdn/a.png',
      last_assignment_reason: 'attend',
    });
    expect(next.contactName).toBe('Criar Loja');
    expect(next.displayName).toBe('Criar Loja');
    expect(next.phoneNumber).toBe('+5511999999999');
    expect(next.unreadCount).toBe(2);
    expect(next.assignee_display).toBe('Kaique');
    expect(next.assigned_to_user_id).toBe('u1');
    expect(next.attendance_status).toBe('in_progress');
  });
});
