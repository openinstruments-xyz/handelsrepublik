const OWNER = 'VIEWVIEWVIEW';
const REPOSITORY = 'handelsrepublik';
const BRANCH = 'main';
const API_VERSION = '2026-03-10';

const WORKFLOWS = Object.freeze({
  quality: 'quality.yml',
  unit: 'unit-tests.yml',
  reads: 'general-read-only-validation.yml',
  destinations: 'validate-order-destinations-during-closed-market-hours.yml',
  venue: 'validate-venue-during-opening-times.yml',
  mutations: 'validate-reversible-account-mutations.yml',
  'limit-rejection': 'validate-closed-venue-limit-order-rejection.yml',
  'market-rejection': 'validate-closed-venue-market-order-rejection.yml',
  lifecycle: 'validate-open-venue-limit-order-lifecycle.yml',
  buy: 'execute-market-buy-on-live-account.yml',
});

const EVENTS = Object.freeze({
  latest: undefined,
  scheduled: 'schedule',
  manual: 'workflow_dispatch',
});

const COLORS = Object.freeze({
  success: '#4c1',
  failure: '#e05d44',
  running: '#007ec6',
  cancelled: '#9f9f9f',
  skipped: '#9f9f9f',
  neutral: '#dfb317',
  unknown: '#9f9f9f',
});

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

export function renderBadge(message, color) {
  const safeMessage = escapeXml(message);
  const width = Math.max(46, Math.ceil(message.length * 6.8) + 14);
  const center = width / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="CI: ${safeMessage}">
  <title>CI: ${safeMessage}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#fff" stop-opacity=".15"/>
    <stop offset="1" stop-opacity=".15"/>
  </linearGradient>
  <rect width="${width}" height="20" rx="3" fill="${color}"/>
  <rect width="${width}" height="20" rx="3" fill="url(#s)"/>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${center}" y="15" fill="#010101" fill-opacity=".3">${safeMessage}</text>
    <text x="${center}" y="14">${safeMessage}</text>
  </g>
</svg>`;
}

function svgResponse(message, color, status = 200, cacheable = true) {
  return new Response(renderBadge(message, color), {
    status,
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': cacheable
        ? 'public, max-age=60, s-maxage=180, stale-while-revalidate=300'
        : 'no-store',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'x-content-type-options': 'nosniff',
    },
  });
}

function parseBadgePath(pathname) {
  const match = /^\/([a-z-]+)\/(latest|scheduled|manual)\.svg$/.exec(pathname);
  if (!match) {
    return undefined;
  }

  const [, workflowAlias, eventAlias] = match;
  const workflow = WORKFLOWS[workflowAlias];
  if (!workflow) {
    return undefined;
  }

  return { workflow, event: EVENTS[eventAlias] };
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

export default {
  async fetch(request, env, context) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', {
        status: 405,
        headers: { allow: 'GET, HEAD' },
      });
    }

    const selection = parseBadgePath(new URL(request.url).pathname);
    if (!selection) {
      return new Response('Not found', { status: 404 });
    }

    if (!env.GH_TOKEN) {
      return svgResponse('unknown', COLORS.unknown, 503, false);
    }

    const cache = caches.default;
    const cached = await cache.match(request);
    if (cached) {
      return request.method === 'HEAD'
        ? new Response(null, cached)
        : cached;
    }

    try {
      const state = badgeState(await loadLatestRun(selection, env.GH_TOKEN));
      const response = svgResponse(state.message, state.color);
      context.waitUntil(cache.put(request, response.clone()));
      return request.method === 'HEAD'
        ? new Response(null, response)
        : response;
    } catch {
      return svgResponse('unknown', COLORS.unknown, 502, false);
    }
  },
};
