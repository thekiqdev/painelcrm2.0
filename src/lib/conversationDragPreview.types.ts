export type ConversationDragPreviewModel = {
  displayName: string;
  avatarUrl?: string | null;
  initials: string;
  line2?: string | null;
  line3?: string | null;
  crm: 'client' | 'lead' | 'none';
};
