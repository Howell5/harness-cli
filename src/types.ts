export type AgentRole = "planner" | "generator" | "evaluator";

export interface AgentConfig {
	role: AgentRole;
	systemPrompt: string;
	allowedTools: string[];
	maxTurns?: number;
	inputPrompt: string;
	workingDir: string;
}

export interface AgentResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

export interface Feature {
	id: string;
	desc: string;
	status: "pending" | "in_progress" | "completed";
	commit?: string;
}

export interface EvalScores {
	[dimension: string]: number;
}

export interface EvaluationRecord {
	iteration: number;
	scores: EvalScores;
	weighted_avg: number;
	passed: boolean;
	feedback_file: string;
}

export interface HarnessState {
	version: string;
	task: {
		id: string;
		description: string;
		spec_file: string;
		started_at: string;
	};
	progress: {
		phase: "planning" | "generation" | "evaluation" | "complete";
		iteration: number;
		max_iterations: number;
		features_total: number;
		features_completed: number;
	};
	context: {
		generator_reset_count: number;
		last_reset_at: string | null;
	};
	evaluations: EvaluationRecord[];
}

export interface AgentYamlConfig {
	max_turns?: number;
	allowed_tools: string[];
	criteria_file?: string;
}

export interface HarnessConfig {
	max_iterations: number;
	passing_threshold: number;
	generator: AgentYamlConfig;
	evaluator: AgentYamlConfig;
	planner: AgentYamlConfig;
	prompts: {
		planner: string;
		generator: string;
		evaluator: string;
	};
}

export interface CriteriaDimension {
	id: string;
	weight: number;
	checklist: string[];
	tool?: string;
}

export interface CriteriaConfig {
	dimensions: CriteriaDimension[];
	passing_threshold: number;
}

export type HarnessEvent =
	| { type: "harness:start"; task: string }
	| { type: "harness:done"; iterations: number; resets: number; score: number }
	| {
			type: "agent:start";
			agent: AgentRole;
			iteration?: number;
			featuresCompleted?: number;
			featuresTotal?: number;
	  }
	| { type: "agent:output"; agent: AgentRole; line: string }
	| { type: "agent:exit"; agent: AgentRole; exitCode: number; durationMs: number }
	| { type: "agent:reset"; agent: AgentRole; count: number }
	| {
			type: "agent:tool_call";
			agent: AgentRole;
			tool: string;
			input: Record<string, unknown>;
	  }
	| {
			type: "agent:tool_result";
			agent: AgentRole;
			tool: string;
			result: string;
	  }
	| {
			type: "eval:score";
			iteration: number;
			scores: EvalScores;
			avg: number;
			passed: boolean;
	  }
	| { type: "feature:complete"; id: string; desc: string; commit?: string }
	| { type: "error"; message: string };

export type Verbosity = 0 | 1;
