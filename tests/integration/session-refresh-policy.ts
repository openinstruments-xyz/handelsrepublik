export function shouldRefreshLiveSession(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return environment.TR_INTEGRATION_SKIP_SESSION_REFRESH !== 'true';
}
