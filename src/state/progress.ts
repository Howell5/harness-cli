import { writeFileSync } from "node:fs";
import type { Feature, HarnessState } from "../types.js";

export function writeProgressFile(
	filePath: string,
	state: HarnessState,
	features: Feature[],
	feedbackSummary?: string,
): void {
	const lines: string[] = [];
	lines.push(`# Task: ${state.task.description}`);
	lines.push(
		`# Phase: ${state.progress.phase}, iteration ${state.progress.iteration}/${state.progress.max_iterations}, resets: ${state.context.generator_reset_count}`,
	);
	lines.push("");

	const completed = features.filter((f) => f.status === "completed");
	if (completed.length > 0) {
		lines.push(`## Completed (${completed.length}/${features.length})`);
		for (const f of completed) {
			lines.push(`- [${f.id}] ${f.desc} ✓${f.commit ? ` commit ${f.commit}` : ""}`);
		}
		lines.push("");
	}

	const inProgress = features.filter((f) => f.status === "in_progress");
	if (inProgress.length > 0) {
		lines.push("## In Progress");
		for (const f of inProgress) lines.push(`- [${f.id}] ${f.desc}`);
		lines.push("");
	}

	const pending = features.filter((f) => f.status === "pending");
	if (pending.length > 0) {
		lines.push("## Pending");
		for (const f of pending) lines.push(`- [${f.id}] ${f.desc}`);
		lines.push("");
	}

	if (feedbackSummary) {
		lines.push("## Last Evaluation Feedback");
		lines.push(feedbackSummary);
		lines.push("");
	}

	writeFileSync(filePath, `${lines.join("\n")}\n`);
}
