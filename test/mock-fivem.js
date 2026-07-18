// FiveM falso: serve /json/list e um CDP mínimo por WebSocket, o bastante pro
// detector anexar. Permite simular abrir/fechar o jogo à vontade.
const http = require('http');
const { WebSocketServer } = require('ws');

const BINDING_NAME = 'mtpAutoTimesheetOnStatus';

// opts.metropole (default true): quando false, a NUI não tem nenhum resource
// metro-*, simulando OUTRO servidor — o detector deve ficar inerte nesse caso.
function startMockFiveM(port, opts = {}) {
  const isMetropole = opts.metropole !== false;
  const clients = new Set();
  const methods = [];       // todo method CDP recebido, pra o teste auditar injeção
  const wss = new WebSocketServer({ noServer: true });

  // Metrópole expõe um frame metro-* (aqui, o celular); servidor estranho, nenhum.
  const childFrames = isMetropole
    ? [{ frame: { id: '2', url: 'https://cfx-nui-metro-cellphone/html/index.html', name: 'metro-cellphone' }, childFrames: [] }]
    : [];
  const frameTree = { frame: { id: '1', url: 'nui://root', name: 'root' }, childFrames };

  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));
    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      if (msg.method) methods.push(msg.method);
      let result = {};
      if (msg.method === 'Page.getFrameTree') result = { frameTree };
      ws.send(JSON.stringify({ id: msg.id, result }));
    });
  });

  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/json/list')) {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify([{
        title: 'CitizenFX root UI',
        webSocketDebuggerUrl: `ws://localhost:${port}/devtools/page/root`,
      }]));
      return;
    }
    res.statusCode = 404;
    res.end();
  });

  server.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
  });

  return new Promise((resolve) => server.listen(port, () => resolve({
    // Métodos CDP recebidos. O teste do servidor estranho confere que só houve
    // leitura (Page.getFrameTree) e nenhuma injeção (addBinding/evaluate/enable).
    methodsSeen: () => methods.slice(),
    // Simula o observer do metro-inventory reportando o texto do span.
    reportarStatus: (text) => {
      for (const ws of clients) {
        ws.send(JSON.stringify({
          method: 'Runtime.bindingCalled',
          params: { name: BINDING_NAME, payload: JSON.stringify({ text }) },
        }));
      }
    },
    stop: () => new Promise((r) => {
      for (const ws of clients) ws.terminate();
      server.close(() => r());
    }),
  })));
}

module.exports = { startMockFiveM };
