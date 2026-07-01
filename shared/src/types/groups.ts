export interface Group {
  id: string;
  name: string;
  description: string;
  provider: string; // 'local' or SSO provider name
  memberCount?: number;
  createdAt: string;
}

export interface GroupMember {
  id: string;
  groupId: string;
  userId: string;
  userName?: string;
  userEmail?: string;
}
