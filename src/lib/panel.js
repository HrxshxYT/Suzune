import { awaitComponent, disableAll } from "./collect.js";

// Stateful control-panel loop. `render()` returns the current payload from
// external mutable state; `handle` persists a click and returns a directive.
export async function runPanel({
  interaction,
  ownerId,
  render,
  handle,
  awaitFn = awaitComponent,
  timeMs = 150000,
}) {
  await interaction.reply({ ...render(), ephemeral: true });
  const message = await interaction.fetchReply();

  for (;;) {
    const i = await awaitFn({ message, ownerId, timeMs });
    if (!i) break;

    const directive = await handle(i, render);

    if (directive === "close") {
      await i.update({ components: disableAll(render().components) }).catch(() => {});
      return;
    }
    if (directive === "handled") continue; // handler already responded to `i`
    await i.update(render()).catch(() => {});
  }

  await interaction
    .editReply({ components: disableAll(render().components) })
    .catch(() => {});
}
