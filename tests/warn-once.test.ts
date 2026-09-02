import { describe, it, expect, vi, beforeEach } from "vitest";
import { warnOnce, __resetWarnOnceForTests } from "../src/dnd/warn-once";
import { foldsOnSelf } from "../src/pc/pc.feature-effects";
describe("warnOnce", () => {
  beforeEach(() => __resetWarnOnceForTests());
  it("warns once per key", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnOnce("k", "m"); warnOnce("k", "m"); expect(spy).toHaveBeenCalledTimes(1);
    __resetWarnOnceForTests(); warnOnce("k", "m"); expect(spy).toHaveBeenCalledTimes(2); spy.mockRestore();
  });
  it("foldsOnSelf warns once on an unrecognised subject and never on self/absent", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(foldsOnSelf({ subject: "Self" })).toBe(false); expect(foldsOnSelf({ subject: "Self" })).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(foldsOnSelf({ subject: "self" })).toBe(true); expect(foldsOnSelf({})).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1); spy.mockRestore();
  });
});
