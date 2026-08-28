/**
 * Cloudflare Worker CORS Proxy for Arcade Leaderboard
 * Strict origin whitelisting & domain validation for Google Cloud Skills Boost profiles.
 */

const ALLOWED_ORIGINS = new Set([
  'https://schryzon.github.io',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
]);

function get_cors_headers(origin) {
  const is_allowed = ALLOWED_ORIGINS.has(origin);
  const allow_origin = is_allowed ? origin : 'https://schryzon.github.io';
  return {
    'Access-Control-Allow-Origin': allow_origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin');

    // Handle preflight OPTIONS request
    if (request.method === 'OPTIONS') {
      if (origin && !ALLOWED_ORIGINS.has(origin)) {
        return new Response('Forbidden: Origin not allowed', { status: 403 });
      }
      return new Response(null, {
        status: 204,
        headers: get_cors_headers(origin)
      });
    }

    // Only allow GET requests
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // Validate Origin for browser requests
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return new Response('Forbidden: Origin not allowed', { status: 403 });
    }

    // Extract target URL
    const request_url = new URL(request.url);
    const target_url = request_url.searchParams.get('url');

    if (!target_url) {
      return new Response('Bad Request: Missing "url" query parameter', { status: 400 });
    }

    // Validate target URL host to prevent open proxy abuse
    let parsed_target;
    try {
      parsed_target = new URL(target_url);
    } catch {
      return new Response('Bad Request: Invalid URL format', { status: 400 });
    }

    const is_valid_host =
      parsed_target.protocol === 'https:' &&
      (parsed_target.hostname === 'www.cloudskillsboost.google' ||
       parsed_target.hostname === 'cloudskillsboost.google');

    if (!is_valid_host) {
      return new Response('Bad Request: Target URL must belong to cloudskillsboost.google', { status: 400 });
    }

    // Fetch target resource
    try {
      const response = await fetch(target_url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });

      const body = await response.text();
      const cors_headers = get_cors_headers(origin);

      return new Response(body, {
        status: response.status,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          ...cors_headers
        }
      });
    } catch (err) {
      return new Response(`Bad Gateway: Failed to fetch upstream profile (${err.message})`, {
        status: 502,
        headers: get_cors_headers(origin)
      });
    }
  }
};
