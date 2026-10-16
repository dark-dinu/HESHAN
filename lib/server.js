const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('../config');

function normalize(raw) {
  let n = String(raw || '').replace(/\D/g, '');
  if (n.startsWith('0') && n.length >= 9 && n.length <= 11) n = config.DEFAULT_COUNTRY_CODE + n.slice(1);
  return /^\d{8,15}$/.test(n) ? n : null;
}

function createServer(manager) {
  const html = fs
    .readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8')
    .replace(/{{BOT_NAME}}/g, config.BOT_NAME);

  const hits = new Map();
  const limited = (ip) => {
    const now = Date.now();
    const arr = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
    arr.push(now);
    hits.set(ip, arr);
    return arr.length > 6;
  };
  setInterval(() => hits.clear(), 30 * 60 * 1000).unref();

  const json = (res, code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  };

  const readBody = (req) =>
    new Promise((resolve) => {
      let b = '';
      req.on('data', (c) => { b += c; if (b.length > 2000) req.destroy(); });
      req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } });
    });

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

    try {
      if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(html);
      }
      if (url.pathname === '/health') return json(res, 200, { ok: true });
      if (url.pathname === '/api/stats') return json(res, 200, { bots: manager.connectedCount() });

      if (req.method === 'GET' && url.pathname === '/api/status') {
        const n = normalize(url.searchParams.get('number'));
        if (!n) return json(res, 400, { error: 'Invalid number' });
        return json(res, 200, manager.getStatus(n));
      }

      if (req.method === 'POST' && url.pathname === '/api/pair') {
        if (limited(ip)) return json(res, 429, { error: 'ටිකක් වැඩියි. විනාඩි කිහිපයකින් ආයෙ try කරන්න.' });
        const body = await readBody(req);
        const n = normalize(body.number);
        if (!n) return json(res, 400, { error: 'Number එක වැරදියි. Country code එක්ක දෙන්න (උදා: 94771234567)' });
        const r = await manager.pair(n);
        return json(res, 200, { ok: true, ...r });
      }

      json(res, 404, { error: 'Not found' });
    } catch (e) {
      console.error('Server error:', e.message);
      json(res, 500, { error: e.message || 'Server error' });
    }
  });
}

module.exports = { createServer };
