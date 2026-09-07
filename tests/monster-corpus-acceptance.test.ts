import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import yaml from "js-yaml";
import { parseMonster } from "../src/monster/monster.parser";

/** R4-G6 §12.4 · every converter monster (4,996) and every SRD monster (656) parses with no refusal and NO strip path;
 *  the converter root comes from G6_CONVERTER_ROOT (this workspace's path is the documented default) and an absent
 *  root FAILS loudly, never skips. */
const CONVERTER_ROOT = process.env.G6_CONVERTER_ROOT ?? "/Users/shinoobi/w/archivist-import-5etools/output";
const SRD_ROOT = resolve(__dirname, "../../archivist-obsidian/.compendium-bundle");

function monsterBodies(root: string): { id: string; body: string }[] {
  const files: string[] = [];
  (function walk(d: string) {
    for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (n.endsWith(".md") && p.includes("/Monsters/")) files.push(p); }
  })(root);
  return files.map((f) => {
    const m = readFileSync(f, "utf8").match(/```monster\n([\s\S]*?)\n```/);
    return { id: f.replace(root + "/", ""), body: m ? m[1] : "" };
  });
}

function pathsOf(v: unknown, prefix: string, out: Set<string>): void {
  if (Array.isArray(v)) { out.add(prefix); for (const x of v) pathsOf(x, prefix + "[]", out); return; }
  if (v && typeof v === "object") { if (prefix) out.add(prefix); for (const [k, x] of Object.entries(v as Record<string, unknown>)) pathsOf(x, prefix ? prefix + "." + k : k, out); return; }
  if (prefix) out.add(prefix);
}

function sweep(bodies: { id: string; body: string }[]) {
  const refusals: string[] = []; const strips = new Map<string, number>();
  for (const { id, body } of bodies) {
    const r = parseMonster(body);
    if (!r.success) { refusals.push(`${id}: ${r.error}`.slice(0, 200)); continue; }
    const input = yaml.load(body) as Record<string, unknown>;
    const inP = new Set<string>(); pathsOf(input, "", inP);
    const outP = new Set<string>(); pathsOf(r.data, "", outP);
    const rawP = new Set<string>(); pathsOf((r.data as { raw?: unknown }).raw, "", rawP);
    for (const p of inP) if (!outP.has(p) && !rawP.has(p) && p !== "legendary") strips.set(p, (strips.get(p) ?? 0) + 1);
  }
  return { refusals, strips: [...strips.entries()] };
}

describe("corpus acceptance (R4-G6 §12.4)", () => {
  it("the converter root exists (set G6_CONVERTER_ROOT)", () => {
    expect(existsSync(CONVERTER_ROOT), `converter root absent: ${CONVERTER_ROOT} (set G6_CONVERTER_ROOT)`).toBe(true);
  });
  it("every converter monster parses with no strip path", () => {
    const bodies = monsterBodies(CONVERTER_ROOT);
    expect(bodies.length).toBe(4996);
    const { refusals, strips } = sweep(bodies);
    expect(refusals).toEqual([]);
    expect(strips).toEqual([]);
  });
  it("every SRD monster parses with no strip path", () => {
    const bodies = monsterBodies(SRD_ROOT);
    expect(bodies.length).toBe(656);
    const { refusals, strips } = sweep(bodies);
    expect(refusals).toEqual([]);
    expect(strips).toEqual([]);
  });
});
