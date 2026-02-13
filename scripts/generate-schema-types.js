const fs = require('node:fs/promises');
const path = require('node:path');
const { compile } = require('json-schema-to-typescript');

const rootDir = path.resolve(__dirname, '..');
const schemaDir = path.join(rootDir, 'schemas');
const outputDir = path.join(rootDir, 'src', 'types', 'schemas');

function toTypeName(fileName) {
	const normalized = fileName.replace(/[^a-zA-Z0-9]+/g, ' ');
	const words = normalized.trim().split(/\s+/).filter(Boolean);
	return words.map((word) => word[0].toUpperCase() + word.slice(1)).join('');
}

async function main() {
	const entries = await fs.readdir(schemaDir, { withFileTypes: true });
	const schemaFiles = entries
		.filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.json')
		.map((entry) => entry.name)
		.sort((a, b) => a.localeCompare(b));

	await fs.rm(outputDir, { recursive: true, force: true });
	await fs.mkdir(outputDir, { recursive: true });

	const exportLines = [];
	for (const schemaFile of schemaFiles) {
		const schemaPath = path.join(schemaDir, schemaFile);
		const schemaText = await fs.readFile(schemaPath, 'utf8');
		const schema = JSON.parse(schemaText);
		const fileBaseName = path.parse(schemaFile).name;
		const typeName = toTypeName(fileBaseName);
		const typeSource = await compile(schema, typeName, {
			bannerComment: '',
			style: {
				singleQuote: true,
			},
		});

		const outputFileName = `${fileBaseName}.d.ts`;
		await fs.writeFile(path.join(outputDir, outputFileName), typeSource.trim() + '\n', 'utf8');
		exportLines.push(`export * from './${fileBaseName}';`);
	}

	const indexSource = exportLines.length > 0 ? `${exportLines.join('\n')}\n` : '';
	await fs.writeFile(path.join(outputDir, 'index.d.ts'), indexSource, 'utf8');
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
