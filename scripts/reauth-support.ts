export class GhCommandError extends Error {
  constructor(
    readonly args: string[],
    readonly exitCode: number | null,
    readonly stderr: string,
  ) {
    super(`gh ${args.join(' ')} failed with exit code ${exitCode ?? 'unknown'}.`);
    this.name = 'GhCommandError';
  }
}

export function isMissingRemoteWorkflow(error: unknown): boolean {
  return error instanceof GhCommandError && /\bHTTP 404\b/.test(error.stderr);
}
