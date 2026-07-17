import { describe, it, expect } from "vitest";
import {
  paginate,
  pageRow,
  confirmRow,
  toggleRow,
  ownerFilter,
  categorySelectRow,
  commandSelectRow,
} from "../../src/lib/components.js";

describe("paginate", () => {
  it("chunks items into pages", () => {
    expect(paginate([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it("returns [] for empty input", () => {
    expect(paginate([], 5)).toEqual([]);
  });
});

describe("pageRow", () => {
  it("disables prev on the first page and next on the last", () => {
    const first = pageRow({ page: 0, pageCount: 3, ownerId: "u1" }).toJSON();
    const [prev, ind, next] = first.components;
    expect(prev.custom_id).toBe("page:prev:u1");
    expect(prev.disabled).toBe(true);
    expect(ind.disabled).toBe(true);
    expect(ind.label).toBe("1/3");
    expect(next.disabled).toBe(false);
    const last = pageRow({ page: 2, pageCount: 3, ownerId: "u1" }).toJSON();
    expect(last.components[2].disabled).toBe(true); // next disabled on last
  });
});

describe("confirmRow", () => {
  it("builds Confirm (danger) / Cancel with owner-scoped ids", () => {
    const r = confirmRow("u1").toJSON();
    expect(r.components[0].custom_id).toBe("confirm:yes:u1");
    expect(r.components[0].style).toBe(4); // Danger
    expect(r.components[1].custom_id).toBe("confirm:no:u1");
  });
});

describe("toggleRow", () => {
  it("renders one button per item, green when on, chunked ≤5/row", () => {
    const items = Array.from({ length: 6 }, (_, i) => ({
      key: `k${i}`,
      label: `L${i}`,
      on: i % 2 === 0,
    }));
    const rows = toggleRow(items, "u1");
    expect(rows.length).toBe(2); // 6 items → 5 + 1
    const first = rows[0].toJSON();
    expect(first.components[0].custom_id).toBe("toggle:k0:u1");
    expect(first.components[0].style).toBe(3); // Success (on)
    expect(first.components[1].style).toBe(2); // Secondary (off)
  });
});

describe("ownerFilter", () => {
  it("passes only the owner", () => {
    expect(ownerFilter({ user: { id: "u1" } }, "u1")).toBe(true);
    expect(ownerFilter({ user: { id: "u2" } }, "u1")).toBe(false);
  });
});

describe("categorySelectRow", () => {
  it("builds a Home option plus one per category, marking the selected one default", () => {
    const menu = categorySelectRow({
      categories: [{ name: "moderation", count: 2 }, { name: "util", count: 1 }],
      selected: "util",
      ownerId: "u1",
    }).toJSON().components[0];
    expect(menu.custom_id).toBe("help:cat:u1");
    expect(menu.options.map((o) => o.value)).toEqual(["home", "moderation", "util"]);
    expect(menu.options.find((o) => o.value === "util").default).toBe(true);
    expect(menu.options[0].default).toBe(false);
  });

  it("marks Home default when nothing is selected", () => {
    const menu = categorySelectRow({
      categories: [{ name: "util", count: 1 }],
      ownerId: "u1",
    }).toJSON().components[0];
    expect(menu.options[0].value).toBe("home");
    expect(menu.options[0].default).toBe(true);
  });

  it("clamps to Discord's 25-option maximum", () => {
    const categories = Array.from({ length: 40 }, (_, i) => ({ name: `c${i}`, count: 1 }));
    const menu = categorySelectRow({ categories, ownerId: "u1" }).toJSON().components[0];
    expect(menu.options.length).toBe(25);
  });
});

describe("commandSelectRow", () => {
  it("builds one option per command, marking the selected one default", () => {
    const menu = commandSelectRow({
      commands: ["ban", "kick"],
      selected: "kick",
      ownerId: "u1",
    }).toJSON().components[0];
    expect(menu.custom_id).toBe("help:cmd:u1");
    expect(menu.options.map((o) => o.value)).toEqual(["ban", "kick"]);
    expect(menu.options.find((o) => o.value === "kick").default).toBe(true);
    expect(menu.placeholder).toBeTruthy();
  });

  it("clamps to 25 options", () => {
    const commands = Array.from({ length: 40 }, (_, i) => `c${i}`);
    const menu = commandSelectRow({ commands, ownerId: "u1" }).toJSON().components[0];
    expect(menu.options.length).toBe(25);
  });
});
