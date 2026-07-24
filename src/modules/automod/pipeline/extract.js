function embedText(embeds = []) {
  const parts = [];
  for (const e of embeds) {
    if (e.title) parts.push(e.title);
    if (e.description) parts.push(e.description);
    if (e.author?.name) parts.push(e.author.name);
    if (e.footer?.text) parts.push(e.footer.text);
    for (const f of e.fields ?? []) parts.push(f.name, f.value);
  }
  return parts.filter(Boolean).join(" ");
}

const values = (mapLike) =>
  mapLike?.values ? [...mapLike.values()] : Array.isArray(mapLike) ? mapLike : [];

// Parse URLs as structured data: tokenize on whitespace, attempt `new URL`,
// retrying with an https:// prefix to catch bare domains. Never regex-scan.
function parseUrls(text) {
  const out = [];
  for (const token of text.split(/\s+/)) {
    if (!token) continue;
    let u = null;
    try {
      u = new URL(token);
    } catch {
      if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(token)) {
        try {
          u = new URL(`https://${token}`);
        } catch {
          u = null;
        }
      }
    }
    if (u && (u.protocol === "http:" || u.protocol === "https:")) {
      out.push({ href: u.href, protocol: u.protocol, hostname: u.hostname, pathname: u.pathname });
    }
  }
  return out;
}

export function extract(message, member) {
  const raw = message.content ?? "";
  const filenames = values(message.attachments).map((a) => a.name).join(" ");
  const stickerNames = values(message.stickers).map((s) => s.name).join(" ");
  const displayName = member?.displayName ?? message.author?.username ?? "";
  const text = [raw, embedText(message.embeds), filenames, stickerNames, displayName]
    .filter(Boolean)
    .join(" ");
  return { text, urls: parseUrls(raw) };
}
