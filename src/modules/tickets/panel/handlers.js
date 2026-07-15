// src/modules/tickets/panel/handlers.js
import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from "discord.js";
import { successEmbed, errorEmbed } from "../../../lib/embeds.js";
import { buildPublishedPanel } from "../published/render.js";
import { LIMITS } from "../constants.js";

async function reloadPanels(state, ctx) {
  state.panels = await ctx.tickets.listPanels(state.guildId);
}

function textRow(id, label, value, { style = TextInputStyle.Short, required = true, max = 200 } = {}) {
  return new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setStyle(style)
      .setValue(value ?? "")
      .setRequired(required)
      .setMaxLength(max),
  );
}

async function promptModal(i, modalId, title, rows) {
  const modal = new ModalBuilder().setCustomId(modalId).setTitle(title);
  modal.addComponents(...rows);
  await i.showModal(modal);
  try {
    return await i.awaitModalSubmit({
      time: 120000,
      filter: (m) => m.customId === modalId && m.user.id === i.user.id,
    });
  } catch {
    return null;
  }
}

export async function handleTicketsComponent(i, state, ctx, render) {
  const [, kind, arg] = i.customId.split(":");

  switch (kind) {
    case "close":
      return "close";

    case "tog": {
      const next = !state.config[arg];
      await ctx.tickets.updateConfig(state.guildId, { [arg]: next });
      state.config[arg] = next;
      return "update";
    }

    case "transcriptch":
    case "logch": {
      const field = kind === "transcriptch" ? "transcriptChannelId" : "logChannelId";
      const value = i.values[0] ?? null;
      await ctx.tickets.updateConfig(state.guildId, { [field]: value });
      state.config[field] = value;
      return "update";
    }

    case "maxopen": {
      const sub = await promptModal(i, `tk:maxopenmodal:${i.user.id}`, "Max open per user", [
        textRow("n", "0 = unlimited", String(state.config.maxOpenPerUser), { max: 3 }),
      ]);
      if (!sub) return "handled";
      const n = Math.max(0, Math.min(50, parseInt(sub.fields.getTextInputValue("n"), 10) || 0));
      await ctx.tickets.updateConfig(state.guildId, { maxOpenPerUser: n });
      state.config.maxOpenPerUser = n;
      await sub.update(render());
      return "handled";
    }

    case "newpanel": {
      if (state.panels.length >= LIMITS.maxPanelsPerGuild) {
        await i.reply({ embeds: [errorEmbed(`Panel limit (${LIMITS.maxPanelsPerGuild}) reached.`)], ephemeral: true });
        return "handled";
      }
      const sub = await promptModal(i, `tk:newpanelmodal:${i.user.id}`, "New panel", [
        textRow("name", "Panel name (admin label)", "", { max: 80 }),
      ]);
      if (!sub) return "handled";
      const panel = await ctx.tickets.createPanel(state.guildId, { name: sub.fields.getTextInputValue("name") });
      await reloadPanels(state, ctx);
      state.view = "panel";
      state.selectedPanelId = panel.id;
      await sub.update(render());
      return "handled";
    }

    case "selpanel":
      state.view = "panel";
      state.selectedPanelId = i.values[0];
      return "update";

    case "back":
      state.view = "home";
      state.selectedPanelId = null;
      return "update";

    case "editmeta": {
      const panel = state.panels.find((p) => p.id === state.selectedPanelId);
      if (!panel) return "update";
      const sub = await promptModal(i, `tk:metamodal:${i.user.id}`, "Edit panel", [
        textRow("title", "Embed title", panel.title, { max: 200 }),
        textRow("description", "Embed description", panel.description, { style: TextInputStyle.Paragraph, max: 2000 }),
      ]);
      if (!sub) return "handled";
      await ctx.tickets.updatePanel(panel.id, {
        title: sub.fields.getTextInputValue("title"),
        description: sub.fields.getTextInputValue("description"),
      });
      await reloadPanels(state, ctx);
      await sub.update(render());
      return "handled";
    }

    case "addcat": {
      const panel = state.panels.find((p) => p.id === state.selectedPanelId);
      if (!panel) return "update";
      if ((panel.categories?.length ?? 0) >= LIMITS.maxCategoriesPerPanel) {
        await i.reply({ embeds: [errorEmbed(`Category limit (${LIMITS.maxCategoriesPerPanel}) reached.`)], ephemeral: true });
        return "handled";
      }
      const sub = await promptModal(i, `tk:addcatmodal:${i.user.id}`, "Add category", [
        textRow("label", "Label (shown in dropdown)", "", { max: 80 }),
        textRow("namePrefix", "Channel name prefix", "ticket", { max: 40 }),
        textRow("welcomeMessage", "Welcome message ({mention} supported)", "Thanks {mention}, staff will be with you shortly.", { style: TextInputStyle.Paragraph, max: 1000 }),
        textRow("reasonPrompt", "Reason prompt (blank = no modal)", "", { required: false, max: 200 }),
      ]);
      if (!sub) return "handled";
      const reasonPrompt = sub.fields.getTextInputValue("reasonPrompt").trim();
      await ctx.tickets.addCategory(panel.id, {
        label: sub.fields.getTextInputValue("label"),
        namePrefix: sub.fields.getTextInputValue("namePrefix").trim() || "ticket",
        welcomeMessage: sub.fields.getTextInputValue("welcomeMessage"),
        reasonPrompt: reasonPrompt || null,
      });
      await reloadPanels(state, ctx);
      await sub.update(render());
      return "handled";
    }

    case "selcat":
      state.selectedCategoryId = i.values[0];
      return categoryEditor(i, state, ctx, render);

    case "publish":
      return publishPanel(i, state, ctx, render);

    case "delpanel": {
      await ctx.tickets.deletePanel(state.selectedPanelId);
      await reloadPanels(state, ctx);
      state.view = "home";
      state.selectedPanelId = null;
      return "update";
    }

    default:
      return "update";
  }
}

async function categoryEditor(i, state, ctx, render) {
  const cat = await ctx.tickets.getCategory(state.selectedCategoryId);
  if (!cat) return "update";
  const sub = await promptModal(i, `tk:catmodal:${i.user.id}`, `Edit — ${cat.label}`, [
    textRow("label", "Label", cat.label, { max: 80 }),
    textRow("namePrefix", "Channel name prefix", cat.namePrefix, { max: 40 }),
    textRow("discordCategoryId", "Discord category ID (parent)", cat.discordCategoryId ?? "", { required: false, max: 40 }),
    textRow("staffRoleIds", "Staff role IDs (comma-separated)", (cat.staffRoleIds ?? []).join(","), { required: false, max: 400 }),
    textRow("welcomeMessage", "Welcome message", cat.welcomeMessage, { style: TextInputStyle.Paragraph, max: 1000 }),
  ]);
  if (!sub) return "handled";
  const staffRoleIds = sub.fields.getTextInputValue("staffRoleIds").split(",").map((s) => s.trim()).filter(Boolean);
  await ctx.tickets.updateCategory(cat.id, {
    label: sub.fields.getTextInputValue("label"),
    namePrefix: sub.fields.getTextInputValue("namePrefix").trim() || "ticket",
    discordCategoryId: sub.fields.getTextInputValue("discordCategoryId").trim() || null,
    staffRoleIds,
    welcomeMessage: sub.fields.getTextInputValue("welcomeMessage"),
  });
  await reloadPanels(state, ctx);
  await sub.update(render());
  return "handled";
}

async function publishPanel(i, state, ctx, _render) {
  const panel = await ctx.tickets.getPanel(state.selectedPanelId);
  if (!panel || (panel.categories?.length ?? 0) === 0) {
    await i.reply({ embeds: [errorEmbed("Add at least one category before publishing.")], ephemeral: true });
    return "handled";
  }
  const payload = buildPublishedPanel(panel);
  const channel = panel.channelId ? await i.guild.channels.fetch(panel.channelId).catch(() => null) : i.channel;
  const target = channel ?? i.channel;

  let message = null;
  if (panel.messageId) {
    message = await target.messages.fetch(panel.messageId).catch(() => null);
  }
  if (message) {
    await message.edit(payload);
  } else {
    message = await target.send(payload);
  }
  await ctx.tickets.setPublished(panel.id, target.id, message.id);
  await reloadPanels(state, ctx);
  await i.reply({ embeds: [successEmbed(`Published to <#${target.id}>.`)], ephemeral: true });
  return "handled";
}
