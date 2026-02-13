const fs = require('node:fs/promises');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const targets = [
	{
		sourceDir: path.join(rootDir, 'src', 'dashboard'),
		outputDir: path.join(rootDir, 'dashboard'),
	},
	{
		sourceDir: path.join(rootDir, 'src', 'graphics'),
		outputDir: path.join(rootDir, 'graphics'),
	},
];

const skipExtensions = new Set(['.ts', '.tsx']);
const skipFileNames = new Set(['tsconfig.json']);

async function copyDirectory(sourceDir, outputDir) {
	await fs.mkdir(outputDir, { recursive: true });
	const entries = await fs.readdir(sourceDir, { withFileTypes: true });

	for (const entry of entries) {
		const sourcePath = path.join(sourceDir, entry.name);
		const outputPath = path.join(outputDir, entry.name);

		if (entry.isDirectory()) {
			await copyDirectory(sourcePath, outputPath);
			continue;
		}

		if (skipExtensions.has(path.extname(entry.name).toLowerCase())) {
			continue;
		}

		if (skipFileNames.has(entry.name)) {
			continue;
		}

		await fs.copyFile(sourcePath, outputPath);
	}
}

async function main() {
	for (const target of targets) {
		await copyDirectory(target.sourceDir, target.outputDir);
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
