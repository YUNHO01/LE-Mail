/**
 * LEMail MCP Server E2E 검증 스크립트
 * - Stdio JSON-RPC 핸드셰이크 (initialize, tools/list, resources/list, prompts/list)
 * - 백엔드 기동 시 /api/mcp/health 확인
 */

const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

function checkBackendHealth() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:9200/api/mcp/health', (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          resolve({ ok: res.statusCode === 200, data: JSON.parse(body) });
        } catch {
          resolve({ ok: false, data: null });
        }
      });
    });
    req.on('error', () => resolve({ ok: false, data: null }));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve({ ok: false, data: null });
    });
  });
}

async function runTest() {
  console.log('======================================================================');
  console.log('LEMail Model Context Protocol (MCP) 서버 검증');
  console.log('======================================================================');

  const health = await checkBackendHealth();
  console.log(
    `[1/2] 원격 MCP (/api/mcp/health): ${health.ok ? 'ONLINE' : 'OFFLINE (Stdio 단독 검증 진행)'}`,
  );

  const serverEntry = path.join(__dirname, '../packages/mcp-server/dist/index.js');
  const child = spawn('node', [serverEntry], {
    env: {
      ...process.env,
      LEMAIL_API_URL: 'http://localhost:9200/api',
    },
  });

  let buffer = '';
  const responses = new Map();

  child.stderr.on('data', (chunk) => {
    const msg = chunk.toString().trim();
    if (msg) console.log(`  [stderr] ${msg}`);
  });

  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line);
        if (json.id !== undefined) responses.set(json.id, json);
      } catch {
        // ignore non-json
      }
    }
  });

  const send = (id, method, params = {}) => {
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  };

  const waitFor = async (id, timeoutMs = 4000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (responses.has(id)) return responses.get(id);
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`Timeout waiting for JSON-RPC id=${id}`);
  };

  try {
    send(1, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'lemail-e2e-test', version: '1.0.0' },
    });
    const initRes = await waitFor(1);
    if (initRes.error) throw new Error(`initialize failed: ${JSON.stringify(initRes.error)}`);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

    send(2, 'tools/list');
    const toolsRes = await waitFor(2);
    const tools = toolsRes.result?.tools || [];
    console.log(`[2/2] Stdio tools/list: ${tools.length}개 등록 확인`);

    send(3, 'resources/list');
    const resourcesRes = await waitFor(3);
    const resources = resourcesRes.result?.resources || [];
    console.log(`      Stdio resources/list: ${resources.length}개 등록 확인`);

    send(4, 'prompts/list');
    const promptsRes = await waitFor(4);
    const prompts = promptsRes.result?.prompts || [];
    console.log(`      Stdio prompts/list: ${prompts.length}개 등록 확인`);

    if (tools.length !== 20 || resources.length !== 4 || prompts.length !== 2) {
      throw new Error(
        `예상 개수 불일치 (tools=${tools.length}, resources=${resources.length}, prompts=${prompts.length})`,
      );
    }

    console.log('\n✅ MCP Stdio 프로토콜 및 스펙 검증 통과!');
  } finally {
    child.kill();
  }
}

runTest().catch((err) => {
  console.error('❌ MCP 검증 실패:', err);
  process.exit(1);
});
