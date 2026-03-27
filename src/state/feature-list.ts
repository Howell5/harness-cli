import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Feature } from "../types.js";

export function loadFeatureList(filePath: string): Feature[] {
	if (!existsSync(filePath)) return [];
	return JSON.parse(readFileSync(filePath, "utf-8")) as Feature[];
}

export function saveFeatureList(filePath: string, features: Feature[]): void {
	writeFileSync(filePath, `${JSON.stringify(features, null, 2)}\n`);
}

export function getPendingFeatures(features: Feature[]): Feature[] {
	return features.filter((f) => f.status === "pending");
}

export function getCompletedCount(features: Feature[]): number {
	return features.filter((f) => f.status === "completed").length;
}

export function isAllComplete(features: Feature[]): boolean {
	return features.length > 0 && features.every((f) => f.status === "completed");
}
