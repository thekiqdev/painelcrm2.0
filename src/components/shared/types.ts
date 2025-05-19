
export interface Member {
  id: string;
  name: string;
  avatar: string;
  email?: string;
  role?: "admin" | "editor" | "viewer";
}
