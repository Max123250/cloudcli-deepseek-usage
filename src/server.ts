import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

// ── Types ──────────────────────────────────────────────────────────────

interface BalanceInfo {
  currency: string;
  total_balance: string;
  granted_balance: string;
  topped_up_balance: string;
}

interface BalanceResponse {
  is_available: boolean;
  balance_infos: BalanceInfo[];
  fetched_at: string;
}

// ── Constants ──────────────────────────────────────────────────────────

const API_URL = 'https://api.deepseek.com/user/balance';
const REQUEST_TIMEOUT_MS = 15_000;
const KEY_ENV_NAMES = ['DEEPSEEK_API_KEY', 'ANTHROPIC_AUTH_TOKEN'] as const;

// ── API key ────────────────────────────────────────────────────────────

/**
 * Read the DeepSeek key from the environment or Claude Code's settings.
 * Error messages never contain the key itself.
 */
function loadApiKey(): string {
  for (const name of KEY_ENV_NAMES) {
    const value = (process.env[name] ?? '').trim();
    if (value) return value;
  }

  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  let settings: unknown;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  } catch {
    throw new Error(`未找到 DeepSeek API key，且无法读取 ${settingsPath}`);
  }

  const token = (settings as { env?: Record<string, unknown> } | null)?.env
    ?.ANTHROPIC_AUTH_TOKEN;
  if (typeof token === 'string' && token.trim()) return token.trim();

  throw new Error(
    `未找到 DeepSeek API key：请设置环境变量 DEEPSEEK_API_KEY，或在 ${settingsPath} 的 env.ANTHROPIC_AUTH_TOKEN 中配置`,
  );
}

// ── DeepSeek request ───────────────────────────────────────────────────

function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '0';
}

function normalize(payload: unknown): BalanceResponse {
  if (!payload || typeof payload !== 'object') {
    throw new Error('DeepSeek 余额接口返回的 JSON 顶层不是对象');
  }

  const raw = payload as Record<string, unknown>;
  const infos = raw.balance_infos;
  if (!Array.isArray(infos)) {
    throw new Error('DeepSeek 余额响应缺少 balance_infos 列表');
  }

  const balanceInfos: BalanceInfo[] = infos
    .filter((info): info is Record<string, unknown> => Boolean(info) && typeof info === 'object')
    .map((info) => ({
      currency: asString(info.currency),
      total_balance: asString(info.total_balance),
      granted_balance: asString(info.granted_balance),
      topped_up_balance: asString(info.topped_up_balance),
    }));

  return {
    is_available: Boolean(raw.is_available),
    balance_infos: balanceInfos,
    fetched_at: new Date().toISOString(),
  };
}

async function fetchBalance(apiKey: string): Promise<BalanceResponse> {
  let response: Response;
  try {
    response = await fetch(API_URL, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error('无法连接 DeepSeek 余额接口，请检查网络');
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`DeepSeek 余额接口返回 HTTP ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('DeepSeek 余额接口返回的不是合法 JSON');
  }
  return normalize(payload);
}

// ── HTTP server ────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const pathname = (req.url ?? '').split('?')[0];
  if (req.method === 'GET' && pathname === '/balance') {
    try {
      const data = await fetchBalance(loadApiKey());
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(502);
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(0, '127.0.0.1', () => {
  const addr = server.address();
  if (addr && typeof addr !== 'string') {
    // Required handshake: the host watches stdout for this JSON line.
    console.log(JSON.stringify({ ready: true, port: addr.port }));
  }
});
