/**
 * Tiny DSL for Resource.max_formula and Resource.recovery[].amount (SP4d; R4-G4 §6 added max / min). Grammar:
 *   expr   := term (('+' | '-') term)*
 *   term   := factor (('*' | '/') factor)*
 *   factor := number | string-arg-only | ident | '{' ident '}' | fn1 '(' expr ')' | fnN '(' expr (',' expr)+ ')'
 *           | "column" '(' string ')' | '(' expr ')'
 *   fn1    := 'ceil' | 'floor'          (exactly one argument)
 *   fnN    := 'max' | 'min'             (two or more comma-separated arguments)
 *   ident  := level | class_level | prof | <abil>_mod
 * The single-quoted string literal (e.g. 'Seals') is valid ONLY as the argument to column(...).
 * '*' and '/' bind tighter than '+'/'-'. '/' is real division; wrap in ceil()/floor() for integer
 * results (e.g. "ceil({class_level}/2)"). "max(1, {cha_mod})" is how the data says "a minimum of once".
 * `AT_WILL_MAX` (999) is the at-will sentinel: it evaluates as the literal 999; R4-G4 T3 (§5) taught
 * the plugin's charge boxes to render "at will" for it instead of 999 boxes (the `opts.atWill` branch
 * at the head of `renderChargeBoxes`, fed by the `atWill: fu.max === AT_WILL_MAX` opt its callers
 * pass). Measured 2026-09-05 on the plugin tree that carries T5 with
 * `grep -rn "atWill:" packages/obsidian/src`: THREE lines, the two T3 feature trackers
 * `renderCardResource` and `renderFirstResourceTracker` plus T5's pool-tab dice head `renderPoolHead`.
 */
export interface FormulaBindings {
  level: number;
  class_level: number;
  prof: number;
  str_mod: number; dex_mod: number; con_mod: number;
  int_mod: number; wis_mod: number; cha_mod: number;
  /** Numeric values of the owning (sub)class table row at the current class
   *  level, keyed by column name (e.g. "Seals"). Empty when no table/row.
   *  Read by the `column('Name')` accessor; missing name → 0. */
  columns: Record<string, number>;
}

const IDENTS = new Set([
  "level", "class_level", "prof",
  "str_mod", "dex_mod", "con_mod", "int_mod", "wis_mod", "cha_mod",
]);
export const AT_WILL_MAX = 999;

const FUNCS = new Set(["ceil", "floor", "max", "min"]);
type FnName = "ceil" | "floor" | "max" | "min";

type Tok =
  | { kind: "num"; value: number }
  | { kind: "str"; value: string }
  | { kind: "id"; name: string }
  | { kind: "fn"; name: FnName }
  | { kind: "col" }
  | { kind: "op"; op: "+" | "-" | "*" | "/" }
  | { kind: "comma" }
  | { kind: "lparen" }
  | { kind: "rparen" };

function tokenize(input: string): Tok[] | null {
  input = input.trim();
  const tokens: Tok[] = [];
  const re = /\s*('[^']*'|\{[a-z_]+\}|[a-z_]+|\d+|[+\-*/(),])/y;
  let i = 0;
  while (i < input.length) {
    re.lastIndex = i;
    const m = re.exec(input);
    if (!m || m.index !== i) return null;
    const raw = m[1];
    i = re.lastIndex;
    if (/^\d+$/.test(raw)) tokens.push({ kind: "num", value: parseInt(raw, 10) });
    else if (raw.startsWith("'")) tokens.push({ kind: "str", value: raw.slice(1, -1) });
    else if (raw === "(") tokens.push({ kind: "lparen" });
    else if (raw === ")") tokens.push({ kind: "rparen" });
    else if (raw === ",") tokens.push({ kind: "comma" });
    else if (raw === "+" || raw === "-" || raw === "*" || raw === "/") tokens.push({ kind: "op", op: raw });
    else {
      const braced = raw.startsWith("{");
      const name = braced ? raw.slice(1, -1) : raw;
      if (!braced && FUNCS.has(name)) tokens.push({ kind: "fn", name: name as FnName });
      else if (!braced && name === "column") tokens.push({ kind: "col" });
      else if (IDENTS.has(name)) tokens.push({ kind: "id", name });
      else return null;
    }
  }
  return tokens.length > 0 ? tokens : null;
}

function evalTokens(tokens: Tok[], b: FormulaBindings): number | null {
  let pos = 0;
  const peek = () => tokens[pos];
  const factor = (): number | null => {
    const t = peek();
    if (!t) return null;
    if (t.kind === "num") { pos++; return t.value; }
    if (t.kind === "id") {
      const val = (b as unknown as Record<string, number>)[t.name];
      if (val === undefined) return null;
      pos++;
      return val;
    }
    if (t.kind === "fn") {
      pos++;
      if (peek()?.kind !== "lparen") return null;
      pos++;
      const args: number[] = [];
      const first = expr();
      if (first === null) return null;
      args.push(first);
      while (peek()?.kind === "comma") {
        pos++;
        const next = expr();
        if (next === null) return null;
        args.push(next);
      }
      if (peek()?.kind !== "rparen") return null;
      pos++;
      if (t.name === "ceil" || t.name === "floor") {
        if (args.length !== 1) return null;
        return t.name === "ceil" ? Math.ceil(args[0]) : Math.floor(args[0]);
      }
      if (args.length < 2) return null;
      return t.name === "max" ? Math.max(...args) : Math.min(...args);
    }
    if (t.kind === "col") {
      pos++;
      if (peek()?.kind !== "lparen") return null;
      pos++;
      const s = peek();
      if (!s || s.kind !== "str") return null;
      pos++;
      if (peek()?.kind !== "rparen") return null;
      pos++;
      return b.columns?.[s.value] ?? 0;
    }
    if (t.kind === "lparen") {
      pos++;
      const inner = expr();
      if (inner === null) return null;
      if (peek()?.kind !== "rparen") return null;
      pos++;
      return inner;
    }
    return null;
  };
  const term = (): number | null => {
    let v = factor();
    if (v === null) return null;
    while (peek()?.kind === "op" && ((peek() as { op: string }).op === "*" || (peek() as { op: string }).op === "/")) {
      const op = (peek() as { op: string }).op;
      pos++;
      const r = factor();
      if (r === null) return null;
      v = op === "*" ? v * r : v / r;
    }
    return v;
  };
  const expr = (): number | null => {
    let v = term();
    if (v === null) return null;
    while (peek()?.kind === "op" && ((peek() as { op: string }).op === "+" || (peek() as { op: string }).op === "-")) {
      const op = (peek() as { op: "+" | "-" }).op;
      pos++;
      const r = term();
      if (r === null) return null;
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  const result = expr();
  if (result === null || pos !== tokens.length) return null;
  return result;
}

const ZERO: FormulaBindings = {
  level: 1, class_level: 1, prof: 2,
  str_mod: 0, dex_mod: 0, con_mod: 0, int_mod: 0, wis_mod: 0, cha_mod: 0,
  columns: {},
};

export function isValidMaxFormula(formula: string): boolean {
  const toks = tokenize(formula);
  if (!toks) return false;
  return evalTokens(toks, ZERO) !== null;
}

export function evaluateMaxFormula(formula: string, bindings: FormulaBindings): number {
  const toks = tokenize(formula);
  if (!toks) throw new Error(`invalid max_formula: ${JSON.stringify(formula)}`);
  const v = evalTokens(toks, bindings);
  if (v === null) throw new Error(`invalid max_formula: ${JSON.stringify(formula)}`);
  return v;
}

export interface ScalableResource {
  max_formula: string;
  scales_at?: { level: number; max: string }[];
}

/** The max-formula string in effect at `totalLevel`: the highest `scales_at` step whose level
 *  ≤ totalLevel (the FIRST declaration wins on a duplicate level; a `level: 0` step is skipped), else
 *  the base `max_formula`. Parse-free, so a die-string step comes back as the die string. Its one
 *  production caller, the plugin's `seedFeatureUses` (`pc.resource-seed.ts`), moved to
 *  `resolveMaxCountAt` in R4-G4 T3, so it is now TEST-ONLY: zero callers in this repo's `src/` and zero
 *  in the plugin's `packages/obsidian/src/`, pinned by this repo's `tests/resource-formula.test.ts`
 *  (its Bardic-Die-2024 and duplicate-level-tie cases) and by the plugin's cross-repo file of the same
 *  name (its `describe("resolveMaxAt")` block). */
export function resolveMaxAt(totalLevel: number, resource: ScalableResource): string {
  let chosen = resource.max_formula;
  let best = 0;
  for (const step of resource.scales_at ?? []) {
    if (step.level <= totalLevel && step.level > best) {
      best = step.level;
      chosen = step.max;
    }
  }
  return chosen;
}

/** The max COUNT in effect at `level`: the highest `scales_at` step at or below `level` whose `max`
 *  PARSES under the DSL, else the base `max_formula` if it parses, else null. Ties break exactly as
 *  `resolveMaxAt` breaks them (the FIRST declaration at a duplicate level wins, a `level: 0` step is
 *  skipped), so a duplicate-level pair of PARSING steps cannot make the count and the die label pick
 *  different steps; where one member of the pair is a die string they DO pick different steps
 *  (`[{level:3,max:"1d8"},{level:3,max:"3"}]` at 3 reads 3 here and "1d8" there), which is the same
 *  parse-vs-string divergence described next. A step that does not parse is a die size (Bardic Die
 *  2024: "1d8" at 5), not a count, and is skipped HERE while `resolveMaxAt` still returns it; a base
 *  that does not parse (Sneak Attack "1d6") is a damage die, correctly no tracker. `resolveMaxAt`
 *  keeps the parse-free string lookup; R4-G4 T3 handed its one production caller, the plugin seed, to
 *  this function (see its docblock), so a null here is what the seed warns on and leaves un-seeded. */
export function resolveMaxCountAt(level: number, resource: ScalableResource, bindings: FormulaBindings): number | null {
  const tryEval = (s: string): number | null => {
    const toks = tokenize(s);
    return toks ? evalTokens(toks, bindings) : null;
  };
  let best = 0;
  let chosen: number | null = null;
  for (const step of resource.scales_at ?? []) {
    if (step.level > level || step.level <= best) continue;
    const v = tryEval(step.max);
    if (v === null) continue;
    best = step.level;
    chosen = v;
  }
  if (chosen !== null) return chosen;
  return tryEval(resource.max_formula);
}
