export type Presence = "active" | "away" | "offline";

export interface User {
  id: number;
  name: string;
  email: string;
  avatarUrl: string;
  presence: Presence;
}

export interface Stream {
  id: number;
  name: string;
}

export interface Topic {
  id: number;
  name: string;
  streamId: number;
}

export interface Message {
  id: number;
  senderId: number;
  streamId: number;
  topicId?: number; // undefined means stream-wide (all topics)
  content: string;
  ts: string; // ISO
  attachments?: { type: "image" | "file"; url: string; name?: string }[];
}
