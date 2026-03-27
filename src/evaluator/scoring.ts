import type { CriteriaConfig, EvalScores } from "../types.js";

export function calculateWeightedScore(scores: EvalScores, criteria: CriteriaConfig): number {
  let total = 0;
  for (const dim of criteria.dimensions) {
    total += (scores[dim.id] ?? 0) * dim.weight;
  }
  return Math.round(total * 100) / 100;
}
