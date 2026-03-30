import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = findPackageRoot(__dirname);

function findPackageRoot(from: string): string {
	let dir = from;
	while (true) {
		if (existsSync(resolve(dir, "package.json"))) return dir;
		const parent = dirname(dir);
		if (parent === dir) throw new Error("package.json not found");
		dir = parent;
	}
}

export function initCommand(): void {
	const cwd = process.cwd();
	const configDest = join(cwd, "harnex.yaml");
	const criteriaDir = join(cwd, "criteria");
	const criteriaDest = join(criteriaDir, "default.yaml");

	let created = 0;

	if (existsSync(configDest)) {
		console.log("harnex.yaml already exists, skipping");
	} else {
		copyFileSync(join(PACKAGE_ROOT, "templates", "harnex.yaml"), configDest);
		console.log("Created harnex.yaml");
		created++;
	}

	if (existsSync(criteriaDest)) {
		console.log("criteria/default.yaml already exists, skipping");
	} else {
		mkdirSync(criteriaDir, { recursive: true });
		copyFileSync(join(PACKAGE_ROOT, "templates", "criteria", "default.yaml"), criteriaDest);
		console.log("Created criteria/default.yaml");
		created++;
	}

	if (created === 0) {
		console.log("Nothing to do — already initialized");
	} else {
		console.log(`\nDone. Edit harnex.yaml to customize.`);
	}
}
