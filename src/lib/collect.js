import { ComponentType } from "discord.js";
import { ownerFilter } from "./components.js";

export async function awaitButton({ message, ownerId, timeMs = 120000 }) {
  try {
    return await message.awaitMessageComponent({
      componentType: ComponentType.Button,
      time: timeMs,
      filter: (i) => ownerFilter(i, ownerId),
    });
  } catch {
    return null; // timeout / no interaction
  }
}

// Awaits any message component (button OR select menu) from the owner.
export async function awaitComponent({ message, ownerId, timeMs = 120000 }) {
  try {
    return await message.awaitMessageComponent({
      time: timeMs,
      filter: (i) => ownerFilter(i, ownerId),
    });
  } catch {
    return null; // timeout / no interaction
  }
}

export function disableAll(rows) {
  for (const row of rows) {
    for (const comp of row.components) {
      if (typeof comp.setDisabled === "function") comp.setDisabled(true);
    }
  }
  return rows;
}
