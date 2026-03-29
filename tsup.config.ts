import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["bin/harnex.ts"],
	format: ["esm"],
	target: "node20",
	outDir: "dist/bin",
	clean: true,
	banner: {
		js: "#!/usr/bin/env node",
	},
});
