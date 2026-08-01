import { createRequire } from 'node:module';
import type { LiveSuiteId } from './types.js';

export interface LiveSuiteManifestEntry {
  id: LiveSuiteId;
  name: string;
  automatic: boolean;
}

export const liveSuiteManifest = createRequire(import.meta.url)(
  './manifest.json',
) as LiveSuiteManifestEntry[];

export function liveSuiteName(id: LiveSuiteId): string {
  const entry = liveSuiteManifest.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Missing live-suite manifest entry for ${id}.`);
  return entry.name;
}
