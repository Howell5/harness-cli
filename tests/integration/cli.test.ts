import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const TSX = join(import.meta.dirname, "../../node_modules/.bin/tsx");
const CLI = join(import.meta.dirname, "../../bin/harnex.ts");

describe("CLI integration", () => {
	it("prints help with --help flag", () => {
		const output = execFileSync(TSX, [CLI, "--help"], { encoding: "utf-8" });
		expect(output).toContain("harnex");
		expect(output).toContain("run");
		expect(output).toContain("plan");
		expect(output).toContain("eval");
	});

	it("prints help with no arguments", () => {
		const output = execFileSync(TSX, [CLI], { encoding: "utf-8" });
		expect(output).toContain("harnex");
	});

	it("errors on unknown command", () => {
		try {
			execFileSync(TSX, [CLI, "foobar"], { encoding: "utf-8", stdio: "pipe" });
			expect.unreachable("Should have thrown");
		} catch (err) {
			expect((err as NodeJS.ErrnoException & { status: number }).status).not.toBe(0);
		}
	});

	it("errors on run without --spec", () => {
		try {
			execFileSync(TSX, [CLI, "run"], { encoding: "utf-8", stdio: "pipe" });
			expect.unreachable("Should have thrown");
		} catch (err) {
			expect((err as NodeJS.ErrnoException & { status: number }).status).not.toBe(0);
		}
	});
});
