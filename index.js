// Uso:  npm init -y && npm i ws && node server.js
const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 80;
const server = http.createServer((req, res) => {
  fs.readFile(path.join(__dirname, 'taxi.html'), (err, data) => {
    if (err){ res.writeHead(500); return res.end('Falta taxi.html junto a server.js'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
const store = new Map(); // clave -> { v, at }
const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };

wss.on('connection', ws => {
  ws.keys = new Set();
  send(ws, { t: 'all', items: [...store].map(([k, { v, at }]) => [k, v, Date.now() - at]) });

  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (typeof m.k !== 'string' || m.k.length > 60 || !/^tm:[ut]:/.test(m.k)) return;
    if (m.t === 'set') {
      if (!m.v || JSON.stringify(m.v).length > 2000) return;
      store.set(m.k, { v: m.v, at: Date.now() });
      if (m.k.startsWith('tm:u:')) ws.keys.add(m.k);
    } else if (m.t === 'del') {
      store.delete(m.k); ws.keys.delete(m.k);
    } else return;
    wss.clients.forEach(c => { if (c !== ws) send(c, { t: m.t, k: m.k, v: m.v }); });
  });

  // Si el usuario se desconecta, desaparece del mapa
  ws.on('close', () => ws.keys.forEach(k => {
    store.delete(k);
    wss.clients.forEach(c => send(c, { t: 'del', k }));
  }));
});

server.listen(PORT, () => console.log('Taxi en http://localhost:' + PORT));
