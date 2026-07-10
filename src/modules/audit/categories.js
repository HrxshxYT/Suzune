export const CATEGORIES = [
  { key: "members", label: "Member join/leave" },
  { key: "memberEdits", label: "Member edits (nick/roles/timeout)" },
  { key: "bans", label: "Bans & unbans" },
  { key: "messages", label: "Message edits/deletes" },
  { key: "channels", label: "Channel changes" },
  { key: "roles", label: "Role changes" },
  { key: "server", label: "Server settings" },
  { key: "emojis", label: "Emojis & stickers" },
  { key: "threads", label: "Threads" },
  { key: "voice", label: "Voice activity" },
  { key: "invites", label: "Invites" },
];

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);
