import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function buildCommandMap(modules) {
  const map = new Map();
  for (const command of modules) {
    const name = command.data.name;
    if (map.has(name)) {
      throw new Error(`Duplicate command name: ${name}`);
    }
    map.set(name, command);
  }
  return map;
}

export function toJSON(commandMap) {
  return [...commandMap.values()].map((c) => c.data.toJSON());
}

export async function discoverCommands(dir) {
  const modules = [];
  const moduleDirs = await readdir(dir, { withFileTypes: true });
  for (const md of moduleDirs) {
    if (!md.isDirectory()) continue;
    const cmdDir = join(dir, md.name, "commands");
    let files;
    try {
      files = await readdir(cmdDir);
    } catch {
      continue; // module has no commands folder
    }
    for (const file of files) {
      if (!file.endsWith(".js")) continue;
      const mod = await import(pathToFileURL(join(cmdDir, file)).href);
      if (mod.default) modules.push(mod.default);
    }
  }
  return modules;
}
