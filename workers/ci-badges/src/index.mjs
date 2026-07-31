const OWNER = 'openinstruments-xyz';
const REPOSITORY = 'handelsrepublik';
const BRANCH = 'main';
const API_VERSION = '2026-03-10';
const BADGE_TIME_ZONE = 'Europe/Berlin';
const MAX_RESULT_BODY_BYTES = 256 * 1024;

const WORKFLOWS = Object.freeze({
  quality: 'quality.yml',
  unit: 'unit-tests.yml',
  'account-market-mutations': 'validate-account-market-data-and-reversible-mutations.yml',
  destinations: 'validate-order-destinations-during-closed-market-hours.yml',
  'limit-rejection': 'validate-closed-venue-limit-order-rejection.yml',
  'market-rejection': 'validate-closed-venue-market-order-rejection.yml',
  lifecycle: 'validate-open-venue-limit-order-lifecycle.yml',
  buy: 'execute-market-buy-on-live-account.yml',
  sell: 'execute-market-sell-on-live-account.yml',
});

const STORED_RESULT_WORKFLOWS = new Set(['account-market-mutations']);

const EVENTS = Object.freeze({
  latest: undefined,
  scheduled: 'schedule',
  manual: 'workflow_dispatch',
});

const COLORS = Object.freeze({
  success: '#4c1',
  failure: '#e05d44',
  failureDetails: '#24292f',
  running: '#007ec6',
  cancelled: '#9f9f9f',
  skipped: '#9f9f9f',
  neutral: '#dfb317',
  unknown: '#9f9f9f',
});

const MAX_FAILURES = 5;
const MAX_BADGE_WIDTH = 300;
const DETAIL_HORIZONTAL_PADDING = 8;
const DETAIL_PREFIX = '× ';
const DETAIL_FONT_SIZE = 10;
const FINAL_BASELINE_PADDING = 10;

function badgeState(run) {
  if (!run) {
    return { message: 'unknown', color: COLORS.unknown };
  }

  if (run.status !== 'completed') {
    return { message: 'running', color: COLORS.running };
  }

  if (run.conclusion === 'success') {
    return { message: 'passing', color: COLORS.success };
  }

  if (run.conclusion === 'cancelled') {
    return { message: 'cancelled', color: COLORS.cancelled };
  }

  if (run.conclusion === 'skipped') {
    return { message: 'skipped', color: COLORS.skipped };
  }

  if (run.conclusion === 'neutral') {
    return { message: 'neutral', color: COLORS.neutral };
  }

  return { message: 'failing', color: COLORS.failure };
}

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function estimateTextWidth(value, fontSize) {
  let width = 0;

  for (const character of value) {
    if (character === ' ') {
      width += 0.35;
    } else if (/[ilI1.,:;!'|]/.test(character)) {
      width += 0.3;
    } else if (/[mwMW@%&QO0]/.test(character)) {
      width += 0.78;
    } else if (/[A-Z]/.test(character)) {
      width += 0.67;
    } else {
      width += 0.55;
    }
  }

  return width * fontSize;
}

function truncateToWidth(value, maxWidth, fontSize) {
  if (estimateTextWidth(value, fontSize) <= maxWidth) {
    return value;
  }

  const ellipsis = '…';
  let visible = '';

  for (const character of value) {
    if (estimateTextWidth(`${visible}${character}${ellipsis}`, fontSize) > maxWidth) {
      break;
    }
    visible += character;
  }

  return `${visible}${ellipsis}`;
}

export function renderBadge(message, color, failures = [], title = `CI: ${message}`) {
  const safeMessage = escapeXml(message);
  const detailTextWidth = MAX_BADGE_WIDTH
    - DETAIL_HORIZONTAL_PADDING * 2
    - estimateTextWidth(DETAIL_PREFIX, DETAIL_FONT_SIZE);
  const visibleFailures = failures
    .slice(0, MAX_FAILURES)
    .map((failure) => truncateToWidth(failure, detailTextWidth, DETAIL_FONT_SIZE));
  const hiddenFailureCount = Math.max(0, failures.length - visibleFailures.length);
  const failureLines = hiddenFailureCount > 0
    ? [...visibleFailures, `+${hiddenFailureCount} more`]
    : visibleFailures;
  const contentWidth = Math.max(
    estimateTextWidth(message, 11) + 14,
    ...failureLines.map((line) => (
      estimateTextWidth(`${DETAIL_PREFIX}${line}`, DETAIL_FONT_SIZE)
      + DETAIL_HORIZONTAL_PADDING * 2
    )),
  );
  const width = Math.max(46, Math.min(MAX_BADGE_WIDTH, Math.ceil(contentWidth)));
  const height = failureLines.length > 0
    ? 20 + failureLines.length * 16 + FINAL_BASELINE_PADDING
    : 20;
  const center = width / 2;
  const accessibleFailures = failures.length > 0
    ? `; failed checks: ${failures.join('; ')}`
    : '';
  const safeAccessibleLabel = escapeXml(`${title}${accessibleFailures}`);
  const detailRows = failureLines.map((failure, index) => {
    const y = 34 + index * 16;
    return `    <text x="${DETAIL_HORIZONTAL_PADDING}" y="${y}">${DETAIL_PREFIX}${escapeXml(failure)}</text>`;
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" role="img" aria-label="${safeAccessibleLabel}">
  <title>${safeAccessibleLabel}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#fff" stop-opacity=".15"/>
    <stop offset="1" stop-opacity=".15"/>
  </linearGradient>
  <rect width="${width}" height="20" rx="3" fill="${color}"/>
  <rect width="${width}" height="20" rx="3" fill="url(#s)"/>
${failureLines.length > 0
    ? `  <path d="M0 17h${width}v${height - 20}a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3z" fill="${COLORS.failureDetails}"/>`
    : ''}
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${center}" y="15" fill="#010101" fill-opacity=".3">${safeMessage}</text>
    <text x="${center}" y="14">${safeMessage}</text>
  </g>
${failureLines.length > 0
    ? `  <g fill="#fff" text-anchor="start" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="10">
${detailRows}
  </g>`
    : ''}
</svg>`;
}

function svgResponse(message, color, failures = [], status = 200, title) {
  return new Response(renderBadge(message, color, failures, title), {
    status,
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'no-cache',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'x-content-type-options': 'nosniff',
    },
  });
}

function parseRequestPath(pathname) {
  const runLinkMatch = /^\/([a-z-]+)\/(latest|scheduled|manual)\/run$/.exec(pathname);
  const badgeMatch = /^\/([a-z-]+)\/(latest|scheduled|manual)\.svg$/.exec(pathname);
  const match = runLinkMatch ?? badgeMatch;

  if (!match) {
    return undefined;
  }

  const [, workflowAlias, eventAlias] = match;
  const workflow = WORKFLOWS[workflowAlias];
  if (!workflow) {
    return undefined;
  }

  return {
    workflowAlias,
    workflow,
    eventAlias,
    event: EVENTS[eventAlias],
    responseKind: runLinkMatch ? 'run-link' : 'badge',
  };
}

function parseIngestPath(pathname) {
  const match = /^\/results\/([a-z-]+)$/.exec(pathname);
  const workflowAlias = match?.[1];
  return workflowAlias && STORED_RESULT_WORKFLOWS.has(workflowAlias)
    ? workflowAlias
    : undefined;
}

export function formatRunTitle(message, run) {
  const timestamp = run?.run_started_at ?? run?.created_at;
  if (!timestamp) {
    return `CI: ${message}`;
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return `CI: ${message}`;
  }

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BADGE_TIME_ZONE,
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value;
  const day = Number(value('day'));
  const month = Number(value('month'));
  const hour = value('hour');
  const minute = value('minute');

  if (!day || !month || hour === undefined || minute === undefined) {
    return `CI: ${message}`;
  }

  return `${message} - ${day}/${month} ${hour}:${minute}`;
}

function runLinkResponse(run, requestMethod) {
  if (!run?.html_url) {
    return new Response('Run not found', { status: 404 });
  }

  return new Response(requestMethod === 'HEAD' ? null : 'Redirecting to GitHub Actions run', {
    status: 302,
    headers: {
      location: run.html_url,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

async function loadLatestRun(selection, token) {
  const endpoint = new URL(
    `https://api.github.com/repos/${OWNER}/${REPOSITORY}/actions/workflows/${selection.workflow}/runs`,
  );
  endpoint.searchParams.set('branch', BRANCH);
  endpoint.searchParams.set('per_page', '1');
  if (selection.event) {
    endpoint.searchParams.set('event', selection.event);
  }

  const response = await fetch(endpoint, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'user-agent': 'handelsrepublik-ci-badges',
      'x-github-api-version': API_VERSION,
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status}`);
  }

  const payload = await response.json();
  return payload.workflow_runs?.[0];
}

async function loadFailedChecks(runId, token) {
  const endpoint = new URL(
    `https://api.github.com/repos/${OWNER}/${REPOSITORY}/actions/runs/${runId}/jobs`,
  );
  endpoint.searchParams.set('filter', 'latest');
  endpoint.searchParams.set('per_page', '100');

  const response = await fetch(endpoint, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'user-agent': 'handelsrepublik-ci-badges',
      'x-github-api-version': API_VERSION,
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status}`);
  }

  const payload = await response.json();
  const failures = [];

  for (const job of payload.jobs ?? []) {
    const failedSteps = (job.steps ?? [])
      .filter((step) => step.conclusion === 'failure')
      .map((step) => step.name)
      .filter((name) => name.toLowerCase() !== 'publish test result table');

    if (failedSteps.length > 0) {
      failures.push(...failedSteps);
    } else if (job.conclusion === 'failure') {
      failures.push(job.name);
    }
  }

  return [...new Set(failures)];
}

function storedResultKey(workflowAlias, eventAlias) {
  return `result:${workflowAlias}:${eventAlias}`;
}

async function loadStoredReport(selection, env) {
  if (!env.CI_RESULTS) return undefined;
  const value = await env.CI_RESULTS.get(
    storedResultKey(selection.workflowAlias, selection.eventAlias),
    'json',
  );
  return value ? validateStoredReport(value, selection.workflowAlias) : undefined;
}

function storedReportAsRun(report) {
  return {
    id: report.runId,
    html_url: report.runUrl,
    status: 'completed',
    conclusion: report.conclusion,
    run_started_at: report.createdAt,
  };
}

function validateStoredReport(value, expectedWorkflow) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('The stored CI result must be an object.');
  }
  const result = value;
  if (
    result.schemaVersion !== 1
    || result.workflow !== expectedWorkflow
    || !Number.isSafeInteger(result.runId)
    || result.runId <= 0
    || !Number.isSafeInteger(result.runAttempt)
    || result.runAttempt <= 0
    || typeof result.runUrl !== 'string'
    || !result.runUrl.startsWith('https://github.com/openinstruments-xyz/handelsrepublik/actions/runs/')
    || !['push', 'schedule', 'workflow_dispatch'].includes(result.event)
    || typeof result.sha !== 'string'
    || result.sha.length < 7
    || result.sha.length > 64
    || !Number.isFinite(Date.parse(result.createdAt))
    || !['success', 'failure'].includes(result.conclusion)
    || !Array.isArray(result.results)
    || result.results.length > 500
  ) {
    throw new TypeError('The stored CI result fields are invalid.');
  }
  result.results.forEach(validateCaseResult);
  const expectedConclusion = result.results.length > 0
    && result.results.every((caseResult) => caseResult.status !== 'failed')
    ? 'success'
    : 'failure';
  if (result.conclusion !== expectedConclusion) {
    throw new TypeError('The stored CI conclusion does not match its case results.');
  }
  return result;
}

function validateCaseResult(result) {
  if (
    !result
    || typeof result !== 'object'
    || Array.isArray(result)
    || typeof result.id !== 'string'
    || result.id.length < 1
    || result.id.length > 160
    || typeof result.name !== 'string'
    || result.name.length < 1
    || result.name.length > 160
    || !['passed', 'failed', 'skipped'].includes(result.status)
    || !Number.isFinite(result.durationMs)
    || result.durationMs < 0
    || typeof result.note !== 'string'
    || result.note.length > 2_000
  ) {
    throw new TypeError('A stored CI case result is invalid.');
  }
}

async function hasValidBearerToken(request, expectedToken) {
  if (!expectedToken) return false;
  const authorization = request.headers.get('authorization') ?? '';
  const suppliedToken = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';
  const encoder = new TextEncoder();
  const [suppliedDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(suppliedToken)),
    crypto.subtle.digest('SHA-256', encoder.encode(expectedToken)),
  ]);
  if (typeof crypto.subtle.timingSafeEqual === 'function') {
    return crypto.subtle.timingSafeEqual(suppliedDigest, expectedDigest);
  }
  const supplied = new Uint8Array(suppliedDigest);
  const expected = new Uint8Array(expectedDigest);
  let difference = supplied.length ^ expected.length;
  for (let index = 0; index < Math.min(supplied.length, expected.length); index += 1) {
    difference |= supplied[index] ^ expected[index];
  }
  return difference === 0;
}

async function readResultPayload(request, workflowAlias) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new TypeError('Content-Type must be application/json.');
  }
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_RESULT_BODY_BYTES) {
    throw new RangeError('The CI result payload is too large.');
  }
  const source = await request.text();
  if (new TextEncoder().encode(source).byteLength > MAX_RESULT_BODY_BYTES) {
    throw new RangeError('The CI result payload is too large.');
  }
  return validateStoredReport(JSON.parse(source), workflowAlias);
}

function isNewerReport(incoming, current) {
  return !current
    || incoming.runId > current.runId
    || (incoming.runId === current.runId && incoming.runAttempt > current.runAttempt);
}

async function putReportIfNewer(env, key, report) {
  const currentValue = await env.CI_RESULTS.get(key, 'json');
  const current = currentValue ? validateStoredReport(currentValue, report.workflow) : undefined;
  if (!isNewerReport(report, current)) return false;
  await env.CI_RESULTS.put(key, JSON.stringify(report));
  return true;
}

async function ingestResults(request, env, workflowAlias) {
  if (!env.CI_RESULTS || !env.CI_RESULTS_INGEST_TOKEN) {
    return new Response('Service unavailable', { status: 503 });
  }
  if (!await hasValidBearerToken(request, env.CI_RESULTS_INGEST_TOKEN)) {
    return new Response('Unauthorized', { status: 401 });
  }

  let report;
  try {
    report = await readResultPayload(request, workflowAlias);
  } catch (error) {
    const status = error instanceof RangeError ? 413 : 400;
    return new Response(error instanceof Error ? error.message : 'Invalid result payload.', { status });
  }

  const keys = [storedResultKey(workflowAlias, 'latest')];
  if (report.event === 'schedule') keys.push(storedResultKey(workflowAlias, 'scheduled'));
  if (report.event === 'workflow_dispatch') keys.push(storedResultKey(workflowAlias, 'manual'));
  const writes = [];
  for (const key of keys) {
    writes.push(await putReportIfNewer(env, key, report));
  }
  return Response.json(
    { stored: writes.some(Boolean), runId: report.runId },
    { status: writes.some(Boolean) ? 201 : 202 },
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ingestWorkflow = request.method === 'POST'
      ? parseIngestPath(url.pathname)
      : undefined;
    if (ingestWorkflow) {
      return ingestResults(request, env, ingestWorkflow);
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', {
        status: 405,
        headers: { allow: 'GET, HEAD' },
      });
    }

    const selection = parseRequestPath(url.pathname);
    if (!selection) {
      return new Response('Not found', { status: 404 });
    }

    if (STORED_RESULT_WORKFLOWS.has(selection.workflowAlias)) {
      try {
        const report = await loadStoredReport(selection, env);
        const run = report ? storedReportAsRun(report) : undefined;
        if (selection.responseKind === 'run-link') {
          return runLinkResponse(run, request.method);
        }
        const state = badgeState(run);
        const failures = report?.results
          .filter((result) => result.status === 'failed')
          .map((result) => result.name) ?? [];
        const response = svgResponse(
          state.message,
          state.color,
          failures,
          200,
          formatRunTitle(state.message, run),
        );
        return request.method === 'HEAD'
          ? new Response(null, response)
          : response;
      } catch {
        return svgResponse('unknown', COLORS.unknown, [], 502);
      }
    }

    if (!env.GH_TOKEN) {
      return selection.responseKind === 'badge'
        ? svgResponse('unknown', COLORS.unknown, [], 503)
        : new Response('Service unavailable', { status: 503 });
    }

    try {
      const run = await loadLatestRun(selection, env.GH_TOKEN);

      if (selection.responseKind === 'run-link') {
        return runLinkResponse(run, request.method);
      }

      const state = badgeState(run);
      let failures = [];

      if (state.message === 'failing' && run?.id) {
        try {
          failures = await loadFailedChecks(run.id, env.GH_TOKEN);
        } catch {
          // The run status is still useful when GitHub's jobs endpoint is unavailable.
        }
      }

      const response = svgResponse(
        state.message,
        state.color,
        failures,
        200,
        formatRunTitle(state.message, run),
      );
      return request.method === 'HEAD'
        ? new Response(null, response)
        : response;
    } catch {
      return svgResponse('unknown', COLORS.unknown, [], 502);
    }
  },
};
