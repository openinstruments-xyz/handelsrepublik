import type { EndpointResolver } from './endpoints.js';
import { TradeRepublicHttpError } from './errors.js';
import type { HttpClient } from './http.js';
import { asRecord } from './normalizers.js';
import type { InstantLoginChallenge, Session, SessionStore } from './types.js';
import { mergeTradeRepublicWebContexts } from './waf.js';

interface CreateQrChallengeOptions {
  phoneNumber?: string;
  deviceName?: string;
  signal?: AbortSignal;
}

export interface StartLoginWithPinOptions {
  phoneNumber: string;
  pin: string;
  otpLess?: boolean | undefined;
  signal?: AbortSignal;
}

export interface LoginWithPinOptions extends StartLoginWithPinOptions, PollLoginOptions {}

export interface PollLoginOptions {
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  debug?: boolean;
}

interface PollQrChallengeOptions extends PollLoginOptions {
  onChallengeUpdate?: InstantLoginChallengeHandler;
}

export interface LoginWithQrOptions extends CreateQrChallengeOptions, PollLoginOptions {
  onChallengeUpdate: InstantLoginChallengeHandler;
}

export type InstantLoginChallengeHandler = (
  challenge: InstantLoginChallenge,
) => void | Promise<void>;

export interface LoginProgressState {
  status: string | undefined;
  processId: string | undefined;
  session: Session | undefined;
}

type SessionReadyHandler = (session: Session) => Promise<Session | void> | Session | void;

export class AuthApi {
  constructor(
    private readonly http: HttpClient,
    private readonly endpoints: EndpointResolver,
    private readonly getSession: () => Session | undefined,
    private readonly setSession: (session: Session) => void,
    private readonly sessionStore?: SessionStore,
    private readonly onSessionReady?: SessionReadyHandler,
  ) {}

  private async createQrChallenge(options: CreateQrChallengeOptions = {}): Promise<InstantLoginChallenge> {
    const basePayload = stripUndefined({
      phoneNumber: options.phoneNumber,
      deviceName: options.deviceName,
    });
    try {
      const response = await this.http.requestDetailed<unknown>(
        'POST',
        this.endpoints.resolve('auth.qrChallenge'),
        basePayload,
        undefined,
        { signal: options.signal },
      );
      return normalizeChallenge(response.body, response.headers.get('date'));
    } catch (error) {
      if (!(error instanceof TradeRepublicHttpError) || options.phoneNumber !== undefined) throw error;
      const response = await this.http.requestDetailed<unknown>(
        'POST',
        this.endpoints.resolve('auth.qrChallenge'),
        {
          ...basePayload,
          phoneNumber: '',
        },
        undefined,
        { signal: options.signal },
      );
      return normalizeChallenge(response.body, response.headers.get('date'));
    }
  }

  async loginWithQr(options: LoginWithQrOptions): Promise<Session> {
    const timeoutMs = options.timeoutMs ?? 120_000;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      let challengeCallbackFailed = false;
      const challenge = await this.createQrChallenge({
        ...(options.phoneNumber !== undefined ? { phoneNumber: options.phoneNumber } : {}),
        ...(options.deviceName !== undefined ? { deviceName: options.deviceName } : {}),
        ...(options.signal !== undefined ? { signal: options.signal } : {}),
      });
      try {
        return await this.pollQrChallenge(challenge, {
          timeoutMs: Math.max(1, deadline - Date.now()),
          async onChallengeUpdate(update) {
            try {
              await options.onChallengeUpdate(update);
            } catch (error) {
              challengeCallbackFailed = true;
              throw error;
            }
          },
          ...(options.intervalMs !== undefined ? { intervalMs: options.intervalMs } : {}),
          ...(options.signal !== undefined ? { signal: options.signal } : {}),
          ...(options.debug !== undefined ? { debug: options.debug } : {}),
        });
      } catch (error) {
        if (challengeCallbackFailed || Date.now() >= deadline || !isRetryableInstantLoginExpiry(error)) throw error;
        debugLog(options.debug, 'challenge:renew', { challengeId: challenge.id });
      }
    }
    throw new Error('Timed out while waiting for Trade Republic instant login approval.');
  }

  async startLoginWithPin(options: StartLoginWithPinOptions): Promise<LoginProgressState> {
    const raw = await this.http.request<unknown>(
      'POST',
      this.endpoints.resolve('auth.login'),
      {
        phoneNumber: options.phoneNumber,
        pin: options.pin,
      },
      undefined,
      {
        signal: options.signal,
        headers: options.otpLess ? { 'X-TR-OTP-Less': 'true' } : undefined,
      },
    );
    return extractLoginProgressState(raw);
  }

  async loginWithPin(options: LoginWithPinOptions): Promise<Session> {
    const progress = await this.startLoginWithPin(options);
    return this.pollLoginProgress(progress, options);
  }

  private async pollQrChallenge(
    challenge: Pick<InstantLoginChallenge, 'id'> & Partial<InstantLoginChallenge>,
    options: PollQrChallengeOptions = {},
  ): Promise<Session> {
    const intervalMs = options.intervalMs ?? 1500;
    const timeoutMs = options.timeoutMs ?? 120_000;
    const startedAt = Date.now();
    let processId: string | undefined;
    let confirmedPolls = 0;
    let accumulatedSession: Session | undefined = this.getSession();
    let latestChallenge = initialChallenge(challenge);
    let deliveredChallengeKey: string | undefined;
    const deliverChallenge = async (next: InstantLoginChallenge): Promise<void> => {
      latestChallenge = mergeChallenges(latestChallenge, next);
      const key = challengePresentationKey(latestChallenge);
      if (!options.onChallengeUpdate || key === undefined || key === deliveredChallengeKey) return;
      deliveredChallengeKey = key;
      await options.onChallengeUpdate(latestChallenge);
    };
    await deliverChallenge(latestChallenge);
    if (isInstantLoginChallengeExpired(latestChallenge)) {
      throw new Error('Trade Republic instant login challenge expired.');
    }
    debugLog(options.debug, 'poll:start', { challengeId: challenge.id, intervalMs, timeoutMs });
    while (Date.now() - startedAt <= timeoutMs) {
      if (options.signal?.aborted) throw options.signal.reason;
      if (processId) {
        const processResponse = await this.http.requestDetailed<unknown>(
          'GET',
          this.endpoints.resolve('auth.loginProcess', { processId }),
          undefined,
          undefined,
          { signal: options.signal },
        );
        const processRaw = processResponse.body;
        const processState = extractLoginProgressState(processRaw);
        const processStatus = normalizeStatus(processState.status);
        confirmedPolls = processStatus === 'CONFIRMED' ? confirmedPolls + 1 : 0;
        const processCookieSession = extractCookieSession(processResponse.headers);
        accumulatedSession = rememberProgressSession(accumulatedSession, processCookieSession, this.setSession);
        debugLog(options.debug, 'poll:process', {
          processId,
          status: processState.status ?? null,
          responseKeys: objectKeys(processRaw),
          responseBody: processRaw,
          setCookieNames: Object.keys(processCookieSession?.cookies ?? {}),
          hasSession: Boolean(processState.session),
        });
        const processSession = processState.session
          ?? ((isAuthenticatedStatus(processStatus) || confirmedPolls >= 2) ? accumulatedSession : undefined);
        if (processSession) {
          const completedSession = await this.completeWebSession(processSession, options);
          const finalizedSession = await this.finalizeSession(completedSession);
          debugLog(options.debug, 'poll:session', summarizeSession(finalizedSession));
          return finalizedSession;
        }
        processId = processState.processId ?? processId;
        if (isTerminalFailureStatus(processStatus)) {
          throw new Error(`Trade Republic instant login failed during process step: ${processState.status ?? 'unknown'}.`);
        }
      } else {
        const response = await this.http.requestDetailed<unknown>(
          'GET',
          this.endpoints.resolve('auth.qrStatus', { challengeId: challenge.id }),
          undefined,
          undefined,
          { signal: options.signal },
        );
        const raw = response.body;
        await deliverChallenge(normalizeChallenge({ ...asRecord(raw), id: challenge.id }, response.headers.get('date')));
        if (isInstantLoginChallengeExpired(latestChallenge)) {
          throw new Error('Trade Republic instant login challenge expired.');
        }
        const challengeState = extractLoginProgressState(raw);
        const challengeStatus = normalizeStatus(challengeState.status);
        const cookieSession = extractCookieSession(response.headers);
        accumulatedSession = rememberProgressSession(accumulatedSession, cookieSession, this.setSession);
        debugLog(options.debug, 'poll:challenge', {
          challengeId: challenge.id,
          status: challengeState.status ?? null,
          processId: challengeState.processId ?? null,
          responseKeys: objectKeys(raw),
          responseBody: raw,
          setCookieNames: Object.keys(cookieSession?.cookies ?? {}),
          hasSession: Boolean(challengeState.session),
        });
        const session = challengeState.session ?? (isAuthenticatedStatus(challengeStatus) ? accumulatedSession : undefined);
        if (session) {
          const completedSession = await this.completeWebSession(session, options);
          const finalizedSession = await this.finalizeSession(completedSession);
          debugLog(options.debug, 'poll:session', summarizeSession(finalizedSession));
          return finalizedSession;
        }
        processId = challengeState.processId ?? processId;
        if (isTerminalFailureStatus(challengeStatus) && !processId) {
          throw new Error(`Trade Republic instant login failed while polling challenge: ${challengeState.status ?? 'unknown'}.`);
        }
      }
      await delay(intervalMs);
    }
    throw new Error('Timed out while waiting for Trade Republic instant login approval.');
  }

  async pollLoginProcess(processId: string, options: PollLoginOptions = {}): Promise<Session> {
    return this.pollLoginProgress({ status: undefined, processId, session: undefined }, options);
  }

  async restoreSession(): Promise<Session | undefined> {
    const session = await this.sessionStore?.load();
    if (!session?.deviceInfo) return undefined;
    this.setSession(session);
    return session;
  }

  async saveSession(session = this.getSession()): Promise<void> {
    if (!session) throw new Error('No Trade Republic session is available to save.');
    await this.sessionStore?.save(session);
  }

  async refreshSession(options: { signal?: AbortSignal; debug?: boolean } = {}): Promise<Session> {
    const currentSession = this.getSession();
    const session = currentSession ?? await this.sessionStore?.load();
    if (!session) throw new Error('No Trade Republic session is available to refresh.');
    if (!currentSession) assertStoredSessionDeviceInfo(session);
    const refreshedSession = await this.completeWebSession(session, options);
    const finalizedSession = await this.finalizeSession(refreshedSession);
    debugLog(options.debug, 'refresh:session', summarizeSession(finalizedSession));
    return finalizedSession;
  }

  async clearSession(): Promise<void> {
    this.setSession({});
    await this.sessionStore?.clear();
  }

  private async completeWebSession(session: Session, options: PollLoginOptions): Promise<Session> {
    this.setSession(session);
    const response = await this.http.requestDetailed<unknown>(
      'GET',
      this.endpoints.resolve('auth.session'),
      undefined,
      undefined,
      { signal: options.signal },
    );
    const webSession = extractSession(response.body);
    const cookieSession = extractCookieSession(response.headers);
    const completedSession = mergeSessions(session, cookieSession, webSession, {
      metadata: {
        source: 'instant-login-web-session',
        authSession: response.body,
      },
    });
    debugLog(options.debug, 'poll:web-session', {
      status: response.status,
      responseKeys: objectKeys(response.body),
      responseBody: response.body,
      setCookieNames: Object.keys(cookieSession?.cookies ?? {}),
      session: summarizeSession(completedSession),
    });
    return completedSession;
  }

  private async finalizeSession(session: Session): Promise<Session> {
    this.setSession(session);
    const updatedSession = await this.onSessionReady?.(session);
    const finalizedSession = updatedSession ? mergeSessions(session, updatedSession) : session;
    this.setSession(finalizedSession);
    await this.sessionStore?.save(finalizedSession);
    return finalizedSession;
  }

  private async pollLoginProgress(progress: LoginProgressState, options: PollLoginOptions): Promise<Session> {
    const intervalMs = options.intervalMs ?? 1500;
    const timeoutMs = options.timeoutMs ?? 120_000;
    const startedAt = Date.now();
    let processId = progress.processId;
    let confirmedPolls = 0;
    let accumulatedSession: Session | undefined = mergeSessions(this.getSession(), progress.session);
    if (accumulatedSession) this.setSession(accumulatedSession);
    debugLog(options.debug, 'poll:process:start', {
      processId: processId ?? null,
      status: progress.status ?? null,
      hasSession: Boolean(progress.session),
    });
    while (Date.now() - startedAt <= timeoutMs) {
      if (options.signal?.aborted) throw options.signal.reason;
      const status = normalizeStatus(progress.status);
      confirmedPolls = status === 'CONFIRMED' ? confirmedPolls + 1 : 0;
      const processSession = progress.session
        ?? ((isAuthenticatedStatus(status) || confirmedPolls >= 2) ? accumulatedSession : undefined);
      if (processSession) {
        const completedSession = await this.completeWebSession(processSession, options);
        const finalizedSession = await this.finalizeSession(completedSession);
        debugLog(options.debug, 'poll:session', summarizeSession(finalizedSession));
        return finalizedSession;
      }
      processId = progress.processId ?? processId;
      if (!processId) {
        if (isTerminalFailureStatus(status)) throw new Error(`Trade Republic login failed: ${progress.status ?? 'unknown'}.`);
        throw new Error('Trade Republic login did not return a process id or session.');
      }
      if (isTerminalFailureStatus(status)) {
        throw new Error(`Trade Republic login failed during process step: ${progress.status ?? 'unknown'}.`);
      }
      await delay(intervalMs);
      const response = await this.http.requestDetailed<unknown>(
        'GET',
        this.endpoints.resolve('auth.loginProcess', { processId }),
        undefined,
        undefined,
        { signal: options.signal },
      );
      const processRaw = response.body;
      progress = extractLoginProgressState(processRaw);
      const processCookieSession = extractCookieSession(response.headers);
      accumulatedSession = rememberProgressSession(accumulatedSession, processCookieSession, this.setSession);
      debugLog(options.debug, 'poll:process', {
        processId,
        status: progress.status ?? null,
        responseKeys: objectKeys(processRaw),
        responseBody: processRaw,
        setCookieNames: Object.keys(processCookieSession?.cookies ?? {}),
        hasSession: Boolean(progress.session),
      });
    }
    throw new Error('Timed out while waiting for Trade Republic login approval.');
  }
}

function normalizeChallenge(raw: unknown, serverTime?: string | null): InstantLoginChallenge {
  const record = asRecord(raw);
  const id = stringValue(record.id, record.challengeId, record.processId);
  const challengeExpiresAt = optionalString(record.challengeExpiresAt);
  const qrCodeTokenExpiresAt = optionalString(record.qrCodeTokenExpiresAt);
  return {
    id,
    qrCode: optionalString(record.qrCode, record.qrCodePayload, record.qr, record.code),
    qrCodeDataUrl: optionalString(record.qrCodeDataUrl, record.qrDataUrl),
    deepLink: optionalString(record.deepLink, record.loginUrl, record.url),
    challengeExpiresAt,
    qrCodeTokenExpiresAt,
    serverTime: serverTime ?? undefined,
    raw,
  };
}

function initialChallenge(
  challenge: Pick<InstantLoginChallenge, 'id'> & Partial<InstantLoginChallenge>,
): InstantLoginChallenge {
  return {
    id: challenge.id,
    qrCode: challenge.qrCode,
    qrCodeDataUrl: challenge.qrCodeDataUrl,
    deepLink: challenge.deepLink,
    challengeExpiresAt: challenge.challengeExpiresAt,
    qrCodeTokenExpiresAt: challenge.qrCodeTokenExpiresAt,
    serverTime: challenge.serverTime,
    raw: challenge.raw ?? challenge,
  };
}

function mergeChallenges(
  previous: InstantLoginChallenge,
  next: InstantLoginChallenge,
): InstantLoginChallenge {
  const hasFreshPresentation = Boolean(next.qrCode || next.qrCodeDataUrl || next.deepLink);
  return {
    ...previous,
    ...next,
    qrCode: hasFreshPresentation ? next.qrCode : previous.qrCode,
    qrCodeDataUrl: hasFreshPresentation ? next.qrCodeDataUrl : previous.qrCodeDataUrl,
    deepLink: hasFreshPresentation ? next.deepLink : previous.deepLink,
    challengeExpiresAt: next.challengeExpiresAt ?? previous.challengeExpiresAt,
    qrCodeTokenExpiresAt: next.qrCodeTokenExpiresAt ?? previous.qrCodeTokenExpiresAt,
    serverTime: next.serverTime ?? previous.serverTime,
  };
}

function challengePresentationKey(challenge: InstantLoginChallenge): string | undefined {
  if (!challenge.qrCode && !challenge.qrCodeDataUrl && !challenge.deepLink) return undefined;
  return JSON.stringify([
    challenge.id,
    challenge.qrCode,
    challenge.qrCodeDataUrl,
    challenge.deepLink,
    challenge.challengeExpiresAt,
    challenge.qrCodeTokenExpiresAt,
  ]);
}

function isRetryableInstantLoginExpiry(error: unknown): boolean {
  return error instanceof Error
    && /expired|timed out while waiting for trade republic instant login approval/i.test(error.message);
}

function isInstantLoginChallengeExpired(challenge: InstantLoginChallenge): boolean {
  if (!challenge.challengeExpiresAt) return false;
  const expiresAt = Date.parse(challenge.challengeExpiresAt);
  const observedAt = challenge.serverTime ? Date.parse(challenge.serverTime) : Date.now();
  return Number.isFinite(expiresAt) && Number.isFinite(observedAt) && observedAt >= expiresAt;
}

function extractSession(raw: unknown): Session | undefined {
  const record = asRecord(raw);
  const sessionRecord = asRecord(record.session);
  const accessToken = optionalString(record.accessToken, sessionRecord.accessToken, record.token);
  const sessionToken = optionalString(
    record.sessionToken,
    sessionRecord.sessionToken,
    record.connectionToken,
    sessionRecord.connectionToken,
    record.webSocketToken,
    sessionRecord.webSocketToken,
    record.websocketToken,
    sessionRecord.websocketToken,
    record.mapperToken,
    sessionRecord.mapperToken,
  );
  const refreshToken = optionalString(record.refreshToken, sessionRecord.refreshToken);
  if (!accessToken && !sessionToken && !refreshToken) return undefined;
  return {
    accessToken,
    refreshToken,
    sessionToken,
    expiresAt: optionalString(record.expiresAt, sessionRecord.expiresAt),
    accountId: optionalString(record.accountId, sessionRecord.accountId),
    deviceId: optionalString(record.deviceId, sessionRecord.deviceId),
    metadata: { source: 'instant-login' },
  };
}

function assertStoredSessionDeviceInfo(session: Session): void {
  if (!session.deviceInfo) {
    throw new TypeError('Stored Trade Republic sessions must contain deviceInfo. Create a new session.');
  }
}

function mergeSessions(...sessions: Array<Session | undefined>): Session {
  const result: Session = {};
  for (const session of sessions) {
    if (!session) continue;
    result.accessToken = session.accessToken ?? result.accessToken;
    result.refreshToken = session.refreshToken ?? result.refreshToken;
    result.sessionToken = session.sessionToken ?? result.sessionToken;
    result.deviceInfo = session.deviceInfo ?? result.deviceInfo;
    result.webContext = mergeTradeRepublicWebContexts(result.webContext, session.webContext);
    result.expiresAt = session.expiresAt ?? result.expiresAt;
    result.accountId = session.accountId ?? result.accountId;
    result.deviceId = session.deviceId ?? result.deviceId;
    result.securitiesAccountNumber = session.securitiesAccountNumber ?? result.securitiesAccountNumber;
    result.cookies = { ...(result.cookies ?? {}), ...(session.cookies ?? {}) };
    result.metadata = { ...(result.metadata ?? {}), ...(session.metadata ?? {}) };
  }
  return result;
}

function rememberProgressSession(
  accumulatedSession: Session | undefined,
  cookieSession: Session | undefined,
  setSession: (session: Session) => void,
): Session | undefined {
  if (!cookieSession) return accumulatedSession;
  const nextSession = mergeSessions(accumulatedSession, cookieSession);
  setSession(nextSession);
  return nextSession;
}

function extractCookieSession(headers: Headers): Session | undefined {
  const cookies = setCookieHeaders(headers)
    .map(parseSetCookie)
    .filter((cookie): cookie is [string, string] => Boolean(cookie));
  if (cookies.length === 0) return undefined;
  return {
    cookies: Object.fromEntries(cookies),
    metadata: {
      source: 'instant-login-set-cookie',
      capturedAt: new Date().toISOString(),
    },
  };
}

function extractLoginProgressState(raw: unknown): LoginProgressState {
  const record = asRecord(raw);
  return {
    status: optionalString(record.status, record.state),
    processId: optionalString(record.processId, record.id),
    session: extractSession(raw),
  };
}

function normalizeStatus(value: string | undefined): string | undefined {
  return value?.trim().toUpperCase();
}

function isTerminalFailureStatus(status: string | undefined): boolean {
  if (!status) return false;
  return status === 'FAILED' || status === 'ERROR' || status === 'EXPIRED' || status === 'DECLINED' || status === 'CANCELLED';
}

function isAuthenticatedStatus(status: string | undefined): boolean {
  if (!status) return false;
  return status === 'PROCESSED' || status === 'COMPLETED' || status === 'SUCCESS' || status === 'AUTHENTICATED';
}

function stripUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function optionalString(...values: unknown[]): string | undefined {
  for (const value of values) if (typeof value === 'string' && value.length) return value;
  return undefined;
}

function stringValue(...values: unknown[]): string {
  return optionalString(...values) ?? '';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function summarizeSession(session: Session): Record<string, unknown> {
  return {
    hasAccessToken: Boolean(session.accessToken),
    hasRefreshToken: Boolean(session.refreshToken),
    hasSessionToken: Boolean(session.sessionToken),
    hasWebContext: Boolean(session.webContext),
    cookieNames: Object.keys(session.cookies ?? {}),
    expiresAt: session.expiresAt ?? null,
    accountId: session.accountId ?? null,
    deviceId: session.deviceId ?? null,
    hasSecuritiesAccountNumber: Boolean(session.securitiesAccountNumber),
  };
}

function debugLog(enabled: boolean | undefined, event: string, payload: Record<string, unknown>): void {
  if (!enabled) return;
  console.log(`[handelsrepublik] ${event}`, payload);
}

function objectKeys(value: unknown): string[] {
  return value && typeof value === 'object' ? Object.keys(value).sort() : [];
}

function setCookieHeaders(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGetSetCookie.getSetCookie === 'function') {
    return withGetSetCookie.getSetCookie().flatMap(splitSetCookieHeader);
  }
  const combined = headers.get('set-cookie');
  return combined ? splitSetCookieHeader(combined) : [];
}

function splitSetCookieHeader(value: string): string[] {
  return value.split(/,(?=\s*[^;,=\s]+=[^;,]+)/).map((item) => item.trim()).filter(Boolean);
}

function parseSetCookie(value: string): [string, string] | undefined {
  const firstPart = value.split(';', 1)[0]?.trim();
  if (!firstPart) return undefined;
  const separator = firstPart.indexOf('=');
  if (separator <= 0) return undefined;
  return [firstPart.slice(0, separator), firstPart.slice(separator + 1)];
}
