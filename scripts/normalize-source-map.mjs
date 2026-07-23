import { readFile, writeFile } from 'node:fs/promises';

const sourceMapPath = new URL('../dist/index.js.map', import.meta.url);
const sourceMap = JSON.parse(await readFile(sourceMapPath, 'utf8'));

if (Array.isArray(sourceMap.sourcesContent)) {
  sourceMap.sourcesContent = sourceMap.sourcesContent.map((source) => (
    typeof source === 'string' ? source.replace(/\r\n?/g, '\n') : source
  ));
}

await writeFile(sourceMapPath, `${JSON.stringify(sourceMap)}\n`, 'utf8');
