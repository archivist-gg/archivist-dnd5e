import { describe, it, expect } from "vitest";
import { buildMockRegistry } from "./mock-entity-registry";
import { resolveBaseItem } from "../src/entities/base-item-resolver";
import item2014 from "../src/srd/data/runtime/item.2014.json";
import item2024 from "../src/srd/data/runtime/item.2024.json";
import armor2014 from "../src/srd/data/runtime/armor.2014.json";
import armor2024 from "../src/srd/data/runtime/armor.2024.json";
import weapon2014 from "../src/srd/data/runtime/weapon.2014.json";
import weapon2024 from "../src/srd/data/runtime/weapon.2024.json";

// D6: build-time guard. Every magic-item `base_item` reference MUST resolve,
// via the shared resolveBaseItem helper, to a registered weapon|armor entity.
// A dangling or type-mismatched link (e.g. "Plate Armor" when the entity is
// "Plate", or a comma-name crossbow, or a Horn masquerading as a base) fails
// the build here instead of silently degrading the PC sheet at runtime.
//
// We register every weapon/armor (both editions) so links resolve. entityType
// is assigned by the loop kind below (mk(rows, "armor"|"weapon")); we never read
// row.entity_type (the seeded Shield deliberately omits it, matching real armor
// runtime keys).
function fullRegistry() {
  const mk = (rows: any[], t: "armor" | "weapon") =>
    rows.map((r: any) => ({ slug: r.slug, entityType: t, name: r.name, data: r }));
  return buildMockRegistry([
    ...mk(armor2014 as any[], "armor"),
    ...mk(armor2024 as any[], "armor"),
    ...mk(weapon2014 as any[], "weapon"),
    ...mk(weapon2024 as any[], "weapon"),
  ]);
}

describe("every item base_item resolves to a weapon|armor base (P2 D6)", () => {
  const reg = fullRegistry();
  const items = [...(item2014 as any[]), ...(item2024 as any[])];
  const broken: string[] = [];
  for (const it of items) {
    if (typeof it.base_item !== "string" || it.base_item.length === 0) continue;
    const found = resolveBaseItem(it.base_item, reg);
    if (!found || (found.entityType !== "weapon" && found.entityType !== "armor")) {
      broken.push(`${it.slug} -> ${it.base_item} (${found ? found.entityType : "null"})`);
    }
  }
  it("has zero unresolved base_item references", () => {
    expect(broken, `broken base_item:\n${broken.join("\n")}`).toEqual([]);
  });
});

describe("the assertion catches a broken base_item (negative control)", () => {
  it("flags an item whose base_item does not resolve", () => {
    const reg = buildMockRegistry([
      { slug: "srd-5e_armor_plate", entityType: "armor", name: "Plate", data: {} },
    ]);
    // "Plate Armor" slugifies to `srd-5e_armor_plate-armor`, which is NOT the
    // registered `srd-5e_armor_plate` slug -> resolves to null.
    expect(resolveBaseItem("[[SRD 5e/Armor/Plate Armor]]", reg)).toBeNull();
  });
});
