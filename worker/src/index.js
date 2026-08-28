/**
 * Cloudflare Worker CORS Proxy for Arcade Leaderboard
 * Strict origin whitelisting & domain validation for Google Cloud Skills Boost profiles.
 */

const ALLOWED_ORIGINS = new Set([
  'https://schryzon.github.io',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
]);

const ALLOWED_TARGET_HOSTS = new Set([
  'skills.google',
  'www.skills.google',
  'cloudskillsboost.google',
  'www.cloudskillsboost.google',
  'google.qwiklabs.com',
  'www.google.qwiklabs.com'
]);

function is_origin_allowed(origin) {
  if (!origin) return true; // Non-browser / direct requests
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const url = new URL(origin);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true;
  } catch {}
  return false;
}

function get_cors_headers(origin) {
  const allow_origin = is_origin_allowed(origin) && origin ? origin : 'https://schryzon.github.io';
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
    const cors_headers = get_cors_headers(origin);

    // Handle preflight OPTIONS request
    if (request.method === 'OPTIONS') {
      if (!is_origin_allowed(origin)) {
        return new Response('Forbidden: Origin not allowed', {
          status: 403,
          headers: cors_headers
        });
      }
      return new Response(null, {
        status: 204,
        headers: cors_headers
      });
    }

    // Only allow GET requests
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: cors_headers
      });
    }

    // Validate Origin for browser requests
    if (!is_origin_allowed(origin)) {
      return new Response('Forbidden: Origin not allowed', {
        status: 403,
        headers: cors_headers
      });
    }

    // Extract target URL
    const request_url = new URL(request.url);
    const target_url = request_url.searchParams.get('url');

    if (!target_url) {
      return new Response('Bad Request: Missing "url" query parameter', {
        status: 400,
        headers: cors_headers
      });
    }

    // Validate target URL host to prevent open proxy abuse
    let parsed_target;
    try {
      parsed_target = new URL(target_url);
    } catch {
      return new Response('Bad Request: Invalid URL format', {
        status: 400,
        headers: cors_headers
      });
    }

    const is_valid_protocol = parsed_target.protocol === 'https:' || parsed_target.protocol === 'http:';
    const is_valid_host = is_valid_protocol && ALLOWED_TARGET_HOSTS.has(parsed_target.hostname.toLowerCase());

    if (!is_valid_host) {
      return new Response('Bad Request: Target URL must belong to Google Skills Boost domains (skills.google, cloudskillsboost.google)', {
        status: 400,
        headers: cors_headers
      });
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
        headers: cors_headers
      });
    }
  }
};
