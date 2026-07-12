export const CATEGORIES = [
  { key: "members", label: "Member join/leave", btn: "Members" },
  { key: "memberEdits", label: "Member edits (nick/roles/timeout)", btn: "Member edits" },
  { key: "bans", label: "Bans & unbans", btn: "Bans" },
  { key: "messages", label: "Message edits/deletes", btn: "Messages" },
  { key: "channels", label: "Channel changes", btn: "Channels" },
  { key: "roles", label: "Role changes", btn: "Roles" },
  { key: "server", label: "Server settings", btn: "Server" },
  { key: "emojis", label: "Emojis & stickers", btn: "Emojis" },
  { key: "threads", label: "Threads", btn: "Threads" },
  { key: "voice", label: "Voice activity", btn: "Voice" },
  { key: "invites", label: "Invites", btn: "Invites" },
];

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

// A category is tracked unless explicitly disabled (missing key defaults on).
export function isOn(audit, key) {
  return audit?.events?.[key] !== false;
}
