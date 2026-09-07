import { describe, it, expect } from "vitest";
import ts from "typescript";
import { readFileSync } from "node:fs";
import path from "node:path";
import { monsterSchema } from "../src/monster/monster.schema";

/** R4-G6 §3.4 · the ONLY detector of a key declared on one side and not the other (`satisfies` catches only a wrong
 *  TYPE on a declared key). The interface walk is the converter's `interfaceKeys` transcribed. */
function interfaceKeys(filePath: string, name: string): string[] {
  const sf = ts.createSourceFile(filePath, readFileSync(filePath, "utf8"), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  let decl: ts.InterfaceDeclaration | undefined;
  sf.forEachChild((n) => { if (ts.isInterfaceDeclaration(n) && n.name.text === name) decl = n; });
  if (!decl) throw new Error(`no interface ${name} in ${filePath}`);
  const keys: string[] = [];
  for (const m of decl.members) if (ts.isPropertySignature(m) && m.name && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name))) keys.push(m.name.text);
  return keys;
}

describe("monsterSchema and the Monster interface declare the same keys (R4-G6 §3.4)", () => {
  const iface = interfaceKeys(path.resolve(__dirname, "../src/monster/monster.types.ts"), "Monster");
  const schema = Object.keys(monsterSchema.shape);
  it("as sets", () => {
    expect([...schema].sort()).toEqual([...iface].sort());
  });
  it("pins the count", () => {
    expect(schema.length).toBe(88); // MEASURED at T4; the spec's rebuilds say 88; correct the literal only from a measurement
  });
});
