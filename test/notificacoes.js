// Teste visual dos toasts. Usa o notifier e o wireDetector de verdade — só o
// clique no Discord é falso, então nada acontece na sua conta.
//
// Rode com:  npm run test:notif
// Espere 4 notificações do Windows, em ~12s.
const { app } = require('electron');
const { EventEmitter } = require('events');

const { wireDetector } = require('../src/core/detector');
const { configureNotifier, attachNotifications, notify } = require('../src/notifier');

app.setAppUserModelId('gg.metropole.autotimesheet');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const { Notification } = require('electron');
  console.log(`Notification.isSupported(): ${Notification.isSupported()}`);
  if (!Notification.isSupported()) {
    console.log('FALHOU: este Windows não suporta notificações.');
    app.exit(1);
  }

  configureNotifier(() => true);

  const det = new EventEmitter();
  det.stop = () => {};
  let falharProximoClique = false;
  const ctl = wireDetector(det, async (btn) => {
    if (falharProximoClique) throw new Error('Discord fora do ar.');
  });
  attachNotifications(ctl);

  console.log('\n[1] entrando em serviço -> deve aparecer "Ponto aberto"');
  det.emit('status', { status: 'on-duty', text: 'Em Serviço', source: 'teste' });
  await sleep(3000);

  console.log('[2] saindo de serviço -> deve aparecer "Ponto fechado"');
  det.emit('status', { status: 'off-duty', text: 'Fora de Serviço', source: 'teste' });
  await sleep(3000);

  console.log('[3] clique falhando -> deve aparecer "Falha ao abrir o ponto"');
  falharProximoClique = true;
  det.emit('status', { status: 'on-duty', text: 'Em Serviço', source: 'teste' });
  await sleep(3000);

  console.log('[4] dedup: 3 toasts idênticos seguidos -> só 1 deve aparecer');
  const r1 = notify('Teste de dedup', 'Esta mensagem deve aparecer UMA vez.');
  const r2 = notify('Teste de dedup', 'Esta mensagem deve aparecer UMA vez.');
  const r3 = notify('Teste de dedup', 'Esta mensagem deve aparecer UMA vez.');
  console.log(`    enviados: ${[r1, r2, r3].filter(Boolean).length} (esperado 1) — ${r1 && !r2 && !r3 ? 'ok' : 'FALHOU'}`);

  console.log('\nDeve ter aparecido 4 notificações no total.');
  await sleep(2000);
  app.exit(r1 && !r2 && !r3 ? 0 : 1);
});
