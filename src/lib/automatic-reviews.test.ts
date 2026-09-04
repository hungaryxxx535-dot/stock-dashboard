import { describe, expect, it } from "vitest";
import { demoState } from "@/domain/demo-state";
import { automaticReviewSchedule, generateDueAutomaticReviews } from "./automatic-reviews";

describe("automatic reviews", () => {
  it("uses the previous business day before the Shanghai close", () => {
    expect(automaticReviewSchedule(new Date("2026-09-07T02:00:00Z")).date).toBe("2026-09-04");
  });

  it("adds weekly and monthly reviews at the last business day", () => {
    expect(automaticReviewSchedule(new Date("2026-07-31T08:00:00Z")).types).toEqual(["daily", "weekly", "monthly"]);
  });

  it("is idempotent and does not run for demo data", () => {
    expect(generateDueAutomaticReviews(demoState, new Date("2026-09-04T08:00:00Z")).generated).toEqual([]);
    const cloud = { ...structuredClone(demoState), mode: "cloud" as const };
    const first = generateDueAutomaticReviews(cloud, new Date("2026-09-04T08:00:00Z"));
    expect(first.generated).toEqual(["daily", "weekly"]);
    expect(first.state.snapshots).toHaveLength(1);
    expect(generateDueAutomaticReviews(first.state, new Date("2026-09-04T09:00:00Z")).generated).toEqual([]);
  });
});
