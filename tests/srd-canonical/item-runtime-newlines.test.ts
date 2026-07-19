import { describe, it, expect } from "vitest";
import runtime2014 from "../../src/srd/data/runtime/item.2014.json";
import canonical2014 from "../../src/srd/data/canonical/magicitems.2014.json";

describe("2014 item descriptions have no literal backslash-n", () => {
  it("runtime/item.2014.json descriptions are newline-clean", () => {
    for (const item of runtime2014 as Array<{ name?: string; description?: unknown }>) {
      if (typeof item.description === "string") {
        expect(item.description, `${item.name}`).not.toContain("\\n");
      }
    }
  });
  it("canonical/magicitems.2014.json descriptions are newline-clean", () => {
    for (const item of canonical2014 as Array<{ name?: string; description?: unknown }>) {
      if (typeof item.description === "string") {
        expect(item.description, `${item.name}`).not.toContain("\\n");
      }
    }
  });
});
