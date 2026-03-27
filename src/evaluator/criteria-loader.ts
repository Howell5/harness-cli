import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import type { CriteriaConfig } from "../types.js";

export function loadCriteria(filePath: string): CriteriaConfig {
  const raw = readFileSync(filePath, "utf-8");
  const config = parseYaml(raw) as CriteriaConfig;
  if (!config.dimensions || config.dimensions.length === 0) {
    throw new Error("Criteria must have at least one dimension");
  }
  const totalWeight = config.dimensions.reduce((sum, d) => sum + d.weight, 0);
  if (Math.abs(totalWeight - 1.0) > 0.01) {
    throw new Error(`Dimension weights must sum to 1.0, got ${totalWeight.toFixed(2)}`);
  }
  return config;
}
