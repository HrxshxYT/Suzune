import { brandEmbed } from "../../lib/embeds.js";
import { EMOJIS } from "../../lib/constants.js";

export const TUTORIAL_CHAPTERS = [
  {
    title: `${EMOJIS.book} Getting Started`,
    body:
      "Welcome to **Suzune** — an all-in-one moderation, security, and community bot.\n\n" +
      "**First steps**\n" +
      "• Make sure my role sits **near the top** of your role list — I can't action members above me.\n" +
      "• Run `/config view` to see your server settings.\n" +
      "• Set moderator roles with `/config modrole add @role` so trusted staff can use mod commands.\n\n" +
      "• `/ping` shows a bot-health card, `/avatar` shows a user's avatar, `/serverinfo` & `/userinfo` show details.\n\n" +
      "Use the ◀️ ▶️ buttons below to page through this guide.",
  },
  {
    title: `${EMOJIS.mod} Moderation`,
    body:
      "Every action is recorded as a numbered **case**.\n\n" +
      "**Commands:** `/ban` `/kick` `/timeout` `/mute` `/warn` `/purge` `/softban` `/tempban` and their reversals (`/unban`, `/untimeout`, `/unmute`).\n" +
      "**Confirmations:** destructive actions (ban/kick/unban/purge…) ask you to **Confirm** first.\n" +
      "**History:** `/warnings` and `/case` let you review and edit past actions.\n" +
      "Route mod-action logs to a channel from the `/logging` panel.",
  },
  {
    title: `${EMOJIS.shield} Anti-Nuke`,
    body:
      "Protects against mass-destruction and rogue admins.\n\n" +
      "• `/antinuke` opens a **button control panel** — toggle protection, punishment, alert channel, quarantine role, and anti-raid all in one place.\n" +
      "• **Whitelist** trusted users/bots from the panel's **Whitelist** button — only the **server owner** can add or remove entries.\n" +
      "• **Anti-raid** auto-acts on floods of new joins; **panic mode** locks the server down.\n" +
      "• Set an alert channel so you're notified the instant something trips.",
  },
  {
    title: `${EMOJIS.gear} Auto-Moderation`,
    body:
      "Automatically filters bad messages using curated rule packs and a heat score.\n\n" +
      "• `/automod panel` opens a **button control panel** — one place for everything.\n" +
      "• Toggle **rule packs** (Core, Nitro scams, Steam gift scams, Crypto/airdrop, IP grabbers, Raid advertising) or add your own **custom rules** with `/automod rules add`.\n" +
      "• Violations add **heat** that decays over time; punishment (warn / timeout / kick / ban / quarantine) fires once heat crosses your threshold — try new rules risk-free in **dry-run** mode first.\n" +
      "• Pick **exempt roles/channels** right from the panel's select menus.",
  },
  {
    title: `${EMOJIS.log} Logging & Audit Log`,
    body:
      "Two complementary systems:\n\n" +
      "• **`/logging`** — route each category (joins, message edits/deletes, roles, channels, voice…) to its **own** channel.\n" +
      "• **`/auditlog`** — a single **consolidated feed** of *everything* that changes in the server, to one channel. `/auditlog` opens a **button control panel**: pick the log channel and toggle which event categories are tracked.\n" +
      "Use logging for tidy per-category channels, auditlog for one all-seeing feed.",
  },
  {
    title: `${EMOJIS.wave} Welcome & Roles`,
    body:
      "Onboard new members automatically.\n\n" +
      "• `/welcome` opens a **control panel** — toggle welcome/goodbye, pick channels, edit messages, and **preview** them. Placeholders: `{mention} {user} {username} {server} {memberCount}`.\n" +
      "• `/autorole add @role` — give roles to everyone on join.\n" +
      "• `/reactionrole add <message_id> <emoji> @role` — let members self-assign roles by reacting.",
  },
  {
    title: `${EMOJIS.star} Leveling`,
    body:
      "Reward activity with XP and levels.\n\n" +
      "• `/levels` opens a **control panel** — enable leveling, toggle level-up announcements, set XP rate/cooldown, choose ignored channels/roles, and configure **role rewards**.\n" +
      "• Members earn XP by chatting (rate-limited); level-ups announce in the current channel.\n" +
      "• **Role rewards** are **highest-only** — a member wears just their current tier.\n" +
      "• `/rank` shows a member's level card; `/leaderboard` ranks the server by XP.",
  },
  {
    title: `${EMOJIS.invite} Invite Tracking`,
    body:
      "See who's growing your server.\n\n" +
      "• `/invites view [user]` — a member's total / regular / left / bonus invites.\n" +
      "• `/invites leaderboard` — top inviters (paged with buttons).\n" +
      "• `/invites add` / `/invites reset` — adjust bonus invites (Manage Server).\n" +
      "I need **Manage Server** to read the invite list.",
  },
  {
    title: `🎫 Tickets`,
    body: "**🎫 Tickets** — Run `/tickets` to build panels. Each panel shows a category dropdown members use to open a private ticket channel. Staff can claim, add/remove members, and close (archive → transcript → delete).",
  },
  {
    title: `${EMOJIS.star} Tips & Support`,
    body:
      "• `/help` lists every command; `/help <command>` explains one.\n" +
      "• Most config commands need **Administrator**; moderation needs the matching permission or a mod role.\n" +
      "• Buttons are usable only by the person who ran the command, and expire after a few minutes — just re-run the command to get fresh controls.\n\n" +
      "That's the tour — enjoy Suzune! 🎉",
  },
];

export function chapterCount() {
  return TUTORIAL_CHAPTERS.length;
}

export function renderChapter(index) {
  const i = Math.max(0, Math.min(TUTORIAL_CHAPTERS.length - 1, index));
  const ch = TUTORIAL_CHAPTERS[i];
  return brandEmbed({
    title: `${ch.title}  ·  ${i + 1}/${TUTORIAL_CHAPTERS.length}`,
    description: ch.body,
  });
}
