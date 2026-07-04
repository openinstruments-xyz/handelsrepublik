import { writeFile } from 'node:fs/promises';
import { schemaCatalogMarkdown } from '../src/schemas/registry.js';

await writeFile('SCHEMAS.md', schemaCatalogMarkdown(), 'utf8');
