// Uso:  npm init -y && npm i ws && node server.js
const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
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
const isMsg = k => k.startsWith('tm:m:'); // mensajes de chat: privados

wss.on('connection', ws => {
  ws.keys = new Set();
  ws.uid = null;
  // Estado público (usuarios y viajes). Los chats NO se envían a todos.
  send(ws, { t: 'all', items: [...store].filter(([k]) => !isMsg(k)).map(([k, { v, at }]) => [k, v, Date.now() - at]) });

  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }

    if (m.t === 'hi') { // el cliente se identifica y recupera sus chats
      ws.uid = String(m.id || '').slice(0, 30);
      store.forEach(({ v }, k) => { if (isMsg(k) && (v.to === ws.uid || v.from === ws.uid)) send(ws, { t: 'set', k, v }); });
      return;
    }
    if (typeof m.k !== 'string' || m.k.length > 60 || !/^tm:[utmk]:/.test(m.k)) return;

    if (m.t === 'set') {
      if (!m.v || typeof m.v !== 'object' || JSON.stringify(m.v).length > 2000) return;
      if (isMsg(m.k)) {
        const v = m.v;
        if (typeof v.text !== 'string' || v.text.length > 300 || typeof v.to !== 'string' || v.from !== ws.uid) return;
        store.set(m.k, { v, at: Date.now() });
        wss.clients.forEach(c => { if (c !== ws && c.uid === v.to) send(c, { t: 'set', k: m.k, v }); }); // solo al destinatario
        return;
      }
      store.set(m.k, { v: m.v, at: Date.now() });
      if (m.k.startsWith('tm:u:')) ws.keys.add(m.k);
    } else if (m.t === 'del') {
      store.delete(m.k); ws.keys.delete(m.k);
      if (isMsg(m.k)) return;
    } else return;

    wss.clients.forEach(c => { if (c !== ws) send(c, { t: m.t, k: m.k, v: m.v }); });
  });

  // Si el usuario se desconecta, desaparece del mapa
  ws.on('close', () => ws.keys.forEach(k => {
    store.delete(k);
    wss.clients.forEach(c => send(c, { t: 'del', k }));
  }));
});

// Los chats se borran del servidor tras 1 hora
setInterval(() => {
  const lim = Date.now() - 3600000;
  store.forEach(({ at }, k) => { if (isMsg(k) && at < lim) store.delete(k); });
}, 300000);

server.listen(PORT, () => console.log('Taxi en http://localhost:' + PORT));
