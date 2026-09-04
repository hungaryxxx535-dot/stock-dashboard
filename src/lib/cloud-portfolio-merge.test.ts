import { describe, expect, it } from "vitest";
import { demoState } from "@/domain/demo-state";
import { mergeCloudPortfolioWithLocal } from "./cloud-portfolio-merge";

describe("cloud portfolio merge", () => {
  it("updates cloud holdings while preserving local workflow history", () => {
    const local = { ...structuredClone(demoState), mode: "local" as const, reviews: [{ id: "saved-review" } as never], tradePlans: [{ id: "saved-plan" } as never] };
    const cloud = { ...structuredClone(demoState), mode: "cloud" as const, holdings: [], reviews: [], tradePlans: [] };
    const merged = mergeCloudPortfolioWithLocal(cloud, local);
    expect(merged.holdings).toEqual([]);
    expect(merged.reviews[0]?.id).toBe("saved-review");
    expect(merged.tradePlans[0]?.id).toBe("saved-plan");
    expect(merged.mode).toBe("cloud");
  });
});
