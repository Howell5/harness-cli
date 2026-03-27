import type { HarnessEvent } from "../types.js";

type EventHandler = (event: HarnessEvent) => void;

export class HarnessEmitter {
	private handlers: Set<EventHandler> = new Set();

	on(handler: EventHandler): () => void {
		this.handlers.add(handler);
		return () => {
			this.handlers.delete(handler);
		};
	}

	emit(event: HarnessEvent): void {
		for (const handler of this.handlers) {
			handler(event);
		}
	}
}
