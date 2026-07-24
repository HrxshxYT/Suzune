import { domainToUnicode } from "node:url";

export const DEFAULT_TARGETS = [
  "discord.com",
  "discord.gg",
  "discord.gift",
  "discordapp.com",
  "steamcommunity.com",
  "steampowered.com",
];

const WEIGHTS = { blocklist: 80, impersonation: 60, "mixed-script": 50, shortener: 25 };

export const KNOWN_SHORTENERS = new Set([
  "bit.ly",
  "tinyurl.com",
  "goo.gl",
  "t.co",
  "ow.ly",
  "is.gd",
  "buff.ly",
  "rebrand.ly",
  "cutt.ly",
  "shorturl.at",
  "rb.gy",
  "tiny.cc",
  "bit.do",
  "soo.gd",
  "s.id",
]);

export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return dp[m][n];
}

// Registrable-ish domain: last two labels. Good enough for impersonation checks.
function registrable(host) {
  const labels = host.split(".");
  return labels.slice(-2).join(".");
}

function isMixedScript(host) {
  const unicode = domainToUnicode(host);
  const scripts = new Set();
  for (const ch of unicode) {
    if (/\p{Script=Latin}/u.test(ch)) scripts.add("Latin");
    else if (/\p{Script=Cyrillic}/u.test(ch)) scripts.add("Cyrillic");
    else if (/\p{Script=Greek}/u.test(ch)) scripts.add("Greek");
  }
  return scripts.size > 1;
}

export function analyzeUrls(urls, { blocklist, targets = DEFAULT_TARGETS, shorteners }) {
  const hits = [];
  const seen = new Set();
  for (const { hostname } of urls) {
    if (!hostname || seen.has(hostname)) continue;
    seen.add(hostname);
    const host = hostname.toLowerCase();
    const reg = registrable(host);

    // blocklist: exact or subdomain suffix
    for (const bad of blocklist) {
      if (host === bad || host.endsWith(`.${bad}`)) {
        hits.push({ kind: "blocklist", host, weight: WEIGHTS.blocklist });
        break;
      }
    }
    if (shorteners?.has(host) || shorteners?.has(reg))
      hits.push({ kind: "shortener", host, weight: WEIGHTS.shortener });
    if (isMixedScript(host))
      hits.push({ kind: "mixed-script", host, weight: WEIGHTS["mixed-script"] });
    for (const t of targets) {
      const d = levenshtein(reg, t);
      if (d >= 1 && d <= 2) {
        hits.push({ kind: "impersonation", host, weight: WEIGHTS.impersonation });
        break;
      }
    }
  }
  return hits;
}
