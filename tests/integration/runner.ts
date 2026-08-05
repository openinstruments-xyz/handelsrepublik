import { describe as nodeDescribe, it } from 'node:test';

type SuiteDefinition = () => void;
type SuiteOptions = { concurrency?: boolean | number };
type RegisteredSuite = { name: string; options?: SuiteOptions; define: SuiteDefinition };

const suites: RegisteredSuite[] = [];

export { it };

export function describe(name: string, define: SuiteDefinition): void;
export function describe(name: string, options: SuiteOptions, define: SuiteDefinition): void;
export function describe(
  name: string,
  optionsOrDefinition: SuiteOptions | SuiteDefinition,
  maybeDefinition?: SuiteDefinition,
): void {
  if (typeof optionsOrDefinition === 'function') {
    suites.push({ name, define: optionsOrDefinition });
    return;
  }
  if (!maybeDefinition) throw new Error(`Missing integration suite definition for ${name}.`);
  suites.push({ name, options: optionsOrDefinition, define: maybeDefinition });
}

export function runIntegrationTests(): void {
  nodeDescribe('live integration', { concurrency: 3 }, () => {
    for (const suite of suites) {
      nodeDescribe(suite.name, { concurrency: false, ...suite.options }, suite.define);
    }
  });
}
