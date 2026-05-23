const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const os = require('os');
const path = require('path');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

app.get('/wall', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/submit', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'submit.html'));
});

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const localIP = getLocalIP();

app.get('/qr', async (req, res) => {
  try {
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const host  = req.headers['x-forwarded-host'] || req.headers.host;
    const url   = `${proto}://${host}/submit`;
    const qrDataURL = await QRCode.toDataURL(url, {
      width: 220,
      margin: 2,
      color: { dark: '#1a1000', light: '#fff8e8' },
    });
    res.json({ qr: qrDataURL, url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const displayClients = new Set();

wss.on('connection', (ws, req) => {
  const params = new URL(req.url, 'http://localhost').searchParams;
  const role = params.get('role');

  if (role === 'display') {
    displayClients.add(ws);
    ws.on('close', () => displayClients.delete(ws));
  }

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'prayer' && typeof msg.text === 'string' && msg.text.trim()) {
        const payload = JSON.stringify({
          type: 'prayer',
          text: msg.text.trim().slice(0, 100),
        });
        for (const client of displayClients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
          }
        }
      }
    } catch (e) {
      // ignore malformed messages
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║           心禱牆  Prayer Wall             ║');
  console.log('╚══════════════════════════════════════════╝\n');
  console.log(`  Display Wall  →  http://${localIP}:${PORT}`);
  console.log(`  Student Page  →  http://${localIP}:${PORT}/submit\n`);
  console.log('  Share the Student Page URL with your class.');
  console.log('  A QR code is shown on the display wall.\n');
});
