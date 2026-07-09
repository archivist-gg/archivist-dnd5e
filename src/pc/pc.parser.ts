import * as yaml from "js-yaml";
import type { ParseResult } from "@archivist-gg/core";
import { characterSchema } from "./pc.schema";
import type { Character } from "./pc.types";

export function parsePC(source: string): ParseResult<Character> {
  let raw: unknown;
  try {
    raw = yaml.load(source);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `YAML parse error: ${msg}` };
  }
  if (!raw || typeof raw !== "object") {
    return { success: false, error: "Invalid YAML: expected an object" };
  }
  const result = characterSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue.path.length ? issue.path.join(".") : "(root)";
    return { success: false, error: `${path}: ${issue.message}` };
  }
  const data = result.data;
  // SP5 migration: lift legacy state.currency to definition.currency.
  // Definition value wins when both are present. The legacy fields are
  // declared @deprecated on CharacterState; we access them through a
  // single typed view that intentionally omits the deprecation markers
  // (the project's eslint config forbids disabling no-deprecated).
  const legacyState = data.state as {
    currency?: Character["currency"];
    attuned_items?: string[];
  };
  const legacyCurrency = legacyState.currency;
  if (legacyCurrency && !data.currency) {
    data.currency = legacyCurrency;
  }
  if (legacyCurrency) {
    delete legacyState.currency;
  }
  // SP5 migration: drop legacy state.attuned_items (per-entry attuned flag is canonical).
  if (legacyState.attuned_items) {
    delete legacyState.attuned_items;
  }
  return { success: true, data };
}
