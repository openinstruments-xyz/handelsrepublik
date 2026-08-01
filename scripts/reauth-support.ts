export class GhCommandError extends Error {
  constructor(
    readonly args: string[],
    readonly exitCode: number | null,
    readonly stderr: string,
  ) {
    const detail = stderr.trim();
    super(
      `gh ${args.join(' ')} failed with exit code ${exitCode ?? 'unknown'}.`
      + (detail ? `\n${detail}` : ''),
    );
    this.name = 'GhCommandError';
  }
}

export function isMissingRemoteWorkflow(error: unknown): boolean {
  return error instanceof GhCommandError && /\bHTTP 404\b/.test(error.stderr);
}
