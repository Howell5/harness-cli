import { describe, expect, it, vi } from "vitest";
import { HarnessEmitter } from "../../src/events/emitter.js";

describe("HarnessEmitter", () => {
	it("emits and receives typed events", () => {
		const emitter = new HarnessEmitter();
		const handler = vi.fn();
		emitter.on(handler);
		emitter.emit({ type: "harness:start", task: "test task" });
		expect(handler).toHaveBeenCalledWith({ type: "harness:start", task: "test task" });
	});

	it("supports multiple listeners", () => {
		const emitter = new HarnessEmitter();
		const handler1 = vi.fn();
		const handler2 = vi.fn();
		emitter.on(handler1);
		emitter.on(handler2);
		emitter.emit({ type: "error", message: "boom" });
		expect(handler1).toHaveBeenCalledOnce();
		expect(handler2).toHaveBeenCalledOnce();
	});

	it("supports unsubscribe via returned function", () => {
		const emitter = new HarnessEmitter();
		const handler = vi.fn();
		const unsub = emitter.on(handler);
		unsub();
		emitter.emit({ type: "error", message: "should not receive" });
		expect(handler).not.toHaveBeenCalled();
	});
});
