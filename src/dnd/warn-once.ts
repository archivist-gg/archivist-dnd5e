/**
 * R4-G3a §4.4 · one console warning per distinct key, for the whole process.
 *
 * The engine folds a character on every recalc and a sheet re-renders many times per session, so a
 * warning written at a fold site fires once per recalc per carrier: a single unrecognised effect
 * subject would fill the console. This is the `warnedAmbiguousBare` idiom from
 * `pc.decision-engine.ts`, extracted so more than one call site can share it.
 *
 * It is never a refusal. The caller decides what to do; this only reports, and only the first time.
 *
 * `src/dnd/*` imports nothing from `src/pc/*`, so a `src/pc` module may import this with no cycle.
 * `__resetWarnOnceForTests` exists because the `Set` is module state: without it a spy test would
 * depend on which file ran first.
 */
const seen = new Set<string>();
export function warnOnce(key: string, msg: string): void { if (seen.has(key)) return; seen.add(key); console.warn(msg); }
export function __resetWarnOnceForTests(): void { seen.clear(); }
