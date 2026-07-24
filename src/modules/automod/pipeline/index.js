// src/modules/automod/pipeline/index.js
import { extract } from "./extract.js";
import { normalize } from "./normalize.js";
import { evaluate } from "./evaluate.js";
import { score } from "./score.js";
import { act } from "./act.js";
import { Budget } from "../budget.js";

export async function runPipeline({
  message, member, config, guildConfig, compiledRules, heat, blocklist, shorteners, cases, logger,
}) {
  const { text, urls } = extract(message, member);
  const variants = normalize(text);
  const budget = new Budget();
  const { hits, disabled } = evaluate({ variants, urls, compiledRules, blocklist, shorteners, budget });

  if (hits.length === 0) return { hits, dryRunHits: [], memberAction: null, heatAfter: 0, disabled };

  const { heatAfter, deleteMessage, dryRunHits, liveHits } = score({
    hits, guildId: message.guild.id, userId: member?.id ?? message.author.id, heat, halfLifeMs: config.heatDecaySec * 1000,
  });

  let memberAction = null;
  if (liveHits.length) {
    ({ memberAction } = await act({ message, member, config, guildConfig, deleteMessage, heatAfter, cases, logger }));
  }
  return { hits: liveHits, dryRunHits, memberAction, heatAfter, disabled };
}
