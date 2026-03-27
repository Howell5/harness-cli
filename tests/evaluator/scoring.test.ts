import { describe, expect, it } from "vitest";
import { calculateWeightedScore } from "../../src/evaluator/scoring.js";
import type { CriteriaConfig, EvalScores } from "../../src/types.js";

describe("calculateWeightedScore", () => {
  it("calculates weighted average", () => {
    const criteria: CriteriaConfig = {
      dimensions: [
        { id: "functionality", weight: 0.6, checklist: [] },
        { id: "code_quality", weight: 0.4, checklist: [] },
      ],
      passing_threshold: 7.5,
    };
    const scores: EvalScores = { functionality: 8.0, code_quality: 7.0 };
    expect(calculateWeightedScore(scores, criteria)).toBeCloseTo(7.6);
  });

  it("handles missing dimension scores by treating as 0", () => {
    const criteria: CriteriaConfig = {
      dimensions: [
        { id: "a", weight: 0.5, checklist: [] },
        { id: "b", weight: 0.5, checklist: [] },
      ],
      passing_threshold: 5.0,
    };
    expect(calculateWeightedScore({ a: 8.0 }, criteria)).toBeCloseTo(4.0);
  });
});
