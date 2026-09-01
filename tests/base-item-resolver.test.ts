import { describe, it, expect } from "vitest";
import {
  resolveBaseItem,
  resolveBaseItemOfType,
  vaultPathToSlug,
} from "../src/entities/base-item-resolver";
import { buildMockRegistry } from "./mock-entity-registry";
import { EntityRegistry } from "@archivist-gg/core";

describe("vaultPathToSlug", () => {
  it("injects the entity type from the Type folder", () => {
    // Registered base weapons/armor now carry a type-namespaced slug
    // (`<prefix>_<type>_<name>`); the reconstructed path-slug must weave the
    // singular type token from the middle Type folder to keep matching.
    expect(vaultPathToSlug("SRD 5e/Weapons/Longsword")).toBe(
      "srd-5e_weapon_longsword",
    );
    expect(vaultPathToSlug("SRD 2024/Armor/Plate Armor")).toBe(
      "srd-2024_armor_plate-armor",
    );
  });

  // R4-G2 Task 5 · spec §7 / §11 floor 7.
  it("RED-FIRST: the `Magic Items` folder maps to the `item` token", () => {
    // Measured: 766/766 SRD 5e `Magic Items` bundle docs carry a 3-part
    // `<prefix>_item_<name>` slug; ZERO carry the legacy 2-part form. Pre-fix
    // the unrecognized folder fell through to `<prefix>_<name>`, so every
    // Magic-Items path dereferenced nothing (285 `base_item` links / 39 distinct
    // targets across 7+ books).
    expect(vaultPathToSlug("Test Book/Magic Items/Orb of Direction")).toBe(
      "test-book_item_orb-of-direction",
    );
  });
});

describe("resolveBaseItem", () => {
  it("resolves a vault-path wikilink to the SRD-5e type-namespaced slug", () => {
    const registry = buildMockRegistry([
      {
        slug: "srd-5e_weapon_longsword",
        entityType: "weapon",
        name: "Longsword",
        data: { name: "Longsword", slug: "srd-5e_weapon_longsword" },
      },
    ]);
    const found = resolveBaseItem("[[SRD 5e/Weapons/Longsword]]", registry);
    expect(found?.slug).toBe("srd-5e_weapon_longsword");
    expect(found?.entityType).toBe("weapon");
  });

  it("resolves a vault-path wikilink to the SRD-2024 type-namespaced slug", () => {
    const registry = buildMockRegistry([
      {
        slug: "srd-2024_weapon_longsword",
        entityType: "weapon",
        name: "Longsword",
        data: { name: "Longsword", slug: "srd-2024_weapon_longsword" },
      },
    ]);
    const found = resolveBaseItem("[[SRD 2024/Weapons/Longsword]]", registry);
    expect(found?.slug).toBe("srd-2024_weapon_longsword");
  });

  it("ignores the alias portion of an aliased wikilink", () => {
    const registry = buildMockRegistry([
      {
        slug: "srd-5e_weapon_longsword",
        entityType: "weapon",
        name: "Longsword",
        data: { name: "Longsword", slug: "srd-5e_weapon_longsword" },
      },
    ]);
    const found = resolveBaseItem(
      "[[SRD 5e/Weapons/Longsword|Longsword]]",
      registry,
    );
    expect(found?.slug).toBe("srd-5e_weapon_longsword");
  });

  it("derives the prefix and type from a non-SRD compendium folder", () => {
    const registry = buildMockRegistry([
      {
        slug: "homebrew_weapon_custom-sword",
        entityType: "weapon",
        name: "Custom Sword",
        data: { name: "Custom Sword", slug: "homebrew_weapon_custom-sword" },
      },
    ]);
    const found = resolveBaseItem("[[Homebrew/Weapons/Custom Sword]]", registry);
    expect(found?.slug).toBe("homebrew_weapon_custom-sword");
  });

  // R4-G2 Task 5 · spec §11 floor 7's mandated level for this red-first:
  // `vaultPathToSlug` NEVER returns null (it degrades to the legacy 2-part
  // slug), so the discriminating assertion has to sit at `resolveBaseItem`.
  it("RED-FIRST: a `Magic Items` vault-path wikilink resolves to the type-namespaced item", () => {
    const registry = buildMockRegistry([
      {
        slug: "test-book_item_orb-of-direction",
        entityType: "item",
        name: "Orb of Direction",
        data: { name: "Orb of Direction", slug: "test-book_item_orb-of-direction" },
      },
    ]);
    // Pre-fix this is NULL: the fallback minted `test-book_orb-of-direction`,
    // which nothing registers.
    const found = resolveBaseItem("[[Test Book/Magic Items/Orb of Direction]]", registry);
    expect(found?.slug).toBe("test-book_item_orb-of-direction");
    expect(found?.entityType).toBe("item");
  });

  it("RED-FIRST: a parenthesized Magic-Items name resolves (the Defender family shape)", () => {
    // The real bundle registers `srd-5e_item_defender-longsword` for
    // `SRD 5e/Magic Items/Defender (Longsword).md` — measured, not assumed.
    const registry = buildMockRegistry([
      {
        slug: "srd-5e_item_defender-longsword",
        entityType: "item",
        name: "Defender (Longsword)",
        data: { name: "Defender (Longsword)", slug: "srd-5e_item_defender-longsword" },
      },
    ]);
    expect(
      resolveBaseItem("[[SRD 5e/Magic Items/Defender (Longsword)]]", registry)?.slug,
    ).toBe("srd-5e_item_defender-longsword");
  });

  it("CONTROL (green both sides by design): an unmapped Type folder keeps the legacy 2-part fallback", () => {
    // Only `Weapons`/`Armor`/`Magic Items` are mapped; anything else must still
    // degrade gracefully rather than crash or become a 3-part slug.
    expect(vaultPathToSlug("SRD 5e/Backgrounds/Acolyte")).toBe("srd-5e_acolyte");
  });

  it("returns null for null/undefined/empty inputs", () => {
    const registry = new EntityRegistry();
    expect(resolveBaseItem(null, registry)).toBeNull();
    expect(resolveBaseItem(undefined, registry)).toBeNull();
    expect(resolveBaseItem("", registry)).toBeNull();
  });

  it("treats a non-wikilink string as a bare slug for direct registry lookup", () => {
    const registry = buildMockRegistry([
      {
        slug: "srd-5e_longsword",
        entityType: "weapon",
        name: "Longsword",
        data: { name: "Longsword", slug: "srd-5e_longsword" },
      },
    ]);
    // Bare prefixed slug — slugify is idempotent on lowercase-hyphenated input,
    // but the underscore between prefix and name slug is preserved by
    // entity-vault-store's slugify regex (it strips non-alphanumeric except
    // spaces/hyphens). Confirm round-trip.
    expect(resolveBaseItem("srd-5e_longsword", registry)?.slug).toBe(
      "srd-5e_longsword",
    );
  });

  it("resolves a legacy bare-name wikilink against a bare-slug registry entry", () => {
    const registry = buildMockRegistry([
      {
        slug: "longsword",
        entityType: "weapon",
        name: "Longsword",
        data: { name: "Longsword", slug: "longsword" },
      },
    ]);
    expect(resolveBaseItem("[[longsword]]", registry)?.slug).toBe("longsword");
    // And against a human-cased name — slugify lowercases+hyphenates.
    expect(resolveBaseItem("[[Longsword]]", registry)?.slug).toBe("longsword");
  });

  it("returns null for a wikilink that doesn't match any registered slug", () => {
    const registry = buildMockRegistry([
      {
        slug: "srd-5e_weapon_longsword",
        entityType: "weapon",
        name: "Longsword",
        data: { name: "Longsword" },
      },
    ]);
    expect(
      resolveBaseItem("[[SRD 5e/Weapons/Greatsword]]", registry),
    ).toBeNull();
  });

  it("returns null when wikilink is malformed (unbalanced brackets)", () => {
    const registry = new EntityRegistry();
    // Single-bracket forms are treated as bare slugs by slugify; they only
    // resolve if a matching bare slug exists. With an empty registry they all
    // miss.
    expect(resolveBaseItem("[[unclosed", registry)).toBeNull();
    expect(resolveBaseItem("unopened]]", registry)).toBeNull();
  });
});

describe("resolveBaseItemOfType", () => {
  it("returns the entity when entityType matches", () => {
    const registry = buildMockRegistry([
      {
        slug: "srd-5e_weapon_longsword",
        entityType: "weapon",
        name: "Longsword",
        data: { name: "Longsword" },
      },
    ]);
    const found = resolveBaseItemOfType(
      "[[SRD 5e/Weapons/Longsword]]",
      "weapon",
      registry,
    );
    expect(found?.entityType).toBe("weapon");
  });

  it("returns null when the entity exists but is the wrong type", () => {
    const registry = buildMockRegistry([
      {
        slug: "srd-5e_weapon_longsword",
        entityType: "weapon",
        name: "Longsword",
        data: { name: "Longsword" },
      },
    ]);
    expect(
      resolveBaseItemOfType(
        "[[SRD 5e/Weapons/Longsword]]",
        "armor",
        registry,
      ),
    ).toBeNull();
  });
});
