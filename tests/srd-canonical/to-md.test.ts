import { describe, it, expect, afterEach, vi } from "vitest";
import { writeMd, writeCompendiumIndex } from "../../tools/srd-canonical/to-md";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

let tmpdir: string;

describe("writeMd", () => {
  afterEach(() => {
    if (tmpdir) fs.rmSync(tmpdir, { recursive: true, force: true });
  });

  it("writes a complete MD file with frontmatter + body", () => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "to-md-"));
    writeMd(tmpdir, {
      kind: "feat",
      edition: "2014",
      compendium: "SRD 5e",
      data: {
        slug: "alert",
        name: "Alert",
        edition: "2014",
        source: "SRD 5.1",
        category: "general",
        description: "Always on watch.",
        prerequisites: [],
        benefits: ["+5 to initiative"],
        repeatable: false,
      },
    });
    const expected = path.join(tmpdir, "Feats", "Alert.md");
    expect(fs.existsSync(expected)).toBe(true);
    const content = fs.readFileSync(expected, "utf8");
    expect(content).toContain("---\n");
    expect(content).toContain("compendium: SRD 5e");
    expect(content).toContain("```feat\n");
    expect(content).toContain("slug: alert");
  });

  it("rewrites cross-refs in string fields", () => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "to-md-"));
    writeMd(tmpdir, {
      kind: "spell",
      edition: "2014",
      compendium: "SRD 5e",
      data: {
        slug: "magic-missile",
        name: "Magic Missile",
        description: "Deals {@damage 1d4+1} force damage.",
      },
    });
    const content = fs.readFileSync(path.join(tmpdir, "Spells", "Magic Missile.md"), "utf8");
    expect(content).toContain("`d:1d4+1`");
  });

  it("sanitizes filenames containing path separators", () => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "to-md-"));
    writeMd(tmpdir, {
      kind: "item",
      edition: "2014",
      compendium: "SRD 5e",
      data: { slug: "weird", name: "A/B?" },
    });
    expect(fs.existsSync(path.join(tmpdir, "Magic Items", "A_B_.md"))).toBe(true);
  });

  it("writeCompendiumIndex emits a valid index file", () => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "compendium-index-"));
    writeCompendiumIndex(tmpdir, "SRD 5e", "2014", "1.2.3");
    const content = fs.readFileSync(path.join(tmpdir, "_compendium.md"), "utf8");
    expect(content).toContain("name: SRD 5e");
    expect(content).toContain("edition: '2014'");
    expect(content).toContain("archivist_compendium_version: 1.2.3");
    expect(content).toContain("# SRD 5e");
  });

  it("omits the wall-clock imported_at stamp from entity frontmatter", () => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "to-md-stamp-"));
    writeMd(tmpdir, {
      kind: "feat",
      edition: "2014",
      compendium: "SRD 5e",
      data: { slug: "alert", name: "Alert" },
    });
    const expected = path.join(tmpdir, "Feats", "Alert.md");
    // Guard first, so a throw inside writeMd is distinguishable from a wrong value.
    expect(fs.existsSync(expected)).toBe(true);
    const content = fs.readFileSync(expected, "utf8");
    // The file is still well-formed: absence of the stamp must not mean absence of output.
    expect(content).toContain("slug: alert");
    expect(content).not.toContain("archivist_compendium_imported_at");
  });

  it("omits the wall-clock imported_at stamp from _compendium.md", () => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "compendium-index-stamp-"));
    writeCompendiumIndex(tmpdir, "SRD 5e", "2014", "1.2.3");
    const expected = path.join(tmpdir, "_compendium.md");
    expect(fs.existsSync(expected)).toBe(true);
    const content = fs.readFileSync(expected, "utf8");
    expect(content).toContain("archivist_compendium_version: 1.2.3");
    expect(content).not.toContain("archivist_compendium_imported_at");
  });

  it("emits byte-identical output when the wall clock moves between runs", () => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "to-md-determinism-"));
    const runA = path.join(tmpdir, "run-a");
    const runB = path.join(tmpdir, "run-b");
    const input = {
      kind: "feat" as const,
      edition: "2014" as const,
      compendium: "SRD 5e",
      data: { slug: "alert", name: "Alert" },
    };

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2020-01-01T00:00:00.000Z"));
      writeMd(runA, input);
      writeCompendiumIndex(runA, "SRD 5e", "2014", "1.2.3");

      vi.setSystemTime(new Date("2021-06-15T12:34:56.000Z"));
      writeMd(runB, input);
      writeCompendiumIndex(runB, "SRD 5e", "2014", "1.2.3");
    } finally {
      vi.useRealTimers();
    }

    const entityA = fs.readFileSync(path.join(runA, "Feats", "Alert.md"), "utf8");
    const entityB = fs.readFileSync(path.join(runB, "Feats", "Alert.md"), "utf8");
    expect(entityA).toContain("slug: alert");
    expect(entityB).toBe(entityA);

    const indexA = fs.readFileSync(path.join(runA, "_compendium.md"), "utf8");
    const indexB = fs.readFileSync(path.join(runB, "_compendium.md"), "utf8");
    expect(indexA).toContain("name: SRD 5e");
    expect(indexB).toBe(indexA);
  });
});
