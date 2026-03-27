import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { EvaluationRecord, HarnessState } from "../types.js";

export class StateStore {
	private filePath: string;

	constructor(private harnessDir: string) {
		this.filePath = join(harnessDir, "state.yaml");
	}

	initialize(description: string, maxIterations: number): HarnessState {
		mkdirSync(this.harnessDir, { recursive: true });
		const now = new Date().toISOString();
		const taskId = `task-${now.slice(0, 10).replace(/-/g, "")}-${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`;

		const state: HarnessState = {
			version: "1",
			task: { id: taskId, description, spec_file: "./spec.md", started_at: now },
			progress: {
				phase: "planning",
				iteration: 0,
				max_iterations: maxIterations,
				features_total: 0,
				features_completed: 0,
			},
			context: { generator_reset_count: 0, last_reset_at: null },
			evaluations: [],
		};
		this.save(state);
		return state;
	}

	load(): HarnessState | null {
		if (!existsSync(this.filePath)) return null;
		return parseYaml(readFileSync(this.filePath, "utf-8")) as HarnessState;
	}

	updatePhase(phase: HarnessState["progress"]["phase"]): void {
		const state = this.loadOrThrow();
		state.progress.phase = phase;
		this.save(state);
	}

	updateProgress(featuresTotal: number, featuresCompleted: number): void {
		const state = this.loadOrThrow();
		state.progress.features_total = featuresTotal;
		state.progress.features_completed = featuresCompleted;
		this.save(state);
	}

	incrementIteration(): void {
		const state = this.loadOrThrow();
		state.progress.iteration++;
		this.save(state);
	}

	recordReset(): void {
		const state = this.loadOrThrow();
		state.context.generator_reset_count++;
		state.context.last_reset_at = new Date().toISOString();
		this.save(state);
	}

	addEvaluation(record: EvaluationRecord): void {
		const state = this.loadOrThrow();
		state.evaluations.push(record);
		this.save(state);
	}

	private loadOrThrow(): HarnessState {
		const state = this.load();
		if (!state) throw new Error("No state file found");
		return state;
	}

	private save(state: HarnessState): void {
		writeFileSync(this.filePath, stringifyYaml(state));
	}
}
