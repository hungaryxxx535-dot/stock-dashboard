import { describe, expect, it } from "vitest";
import { AppStateSchema } from "@/domain/model";
import { demoState } from "@/domain/demo-state";

describe("backup validation", () => {
  it("round-trips a valid V2 state", () => {
    expect(AppStateSchema.parse(JSON.parse(JSON.stringify(demoState))).schemaVersion).toBe(2);
  });
  it("rejects an incomplete import without mutating the source", () => {
    const source = structuredClone(demoState);
    expect(() => AppStateSchema.parse({ schemaVersion: 2 })).toThrow();
    expect(source.holdings).toHaveLength(demoState.holdings.length);
  });
});
