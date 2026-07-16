// Teste visual das notificações. Usa o notifier e o wireDetector de verdade —
// só o clique no Discord é falso, então nada acontece na sua conta.
//
// Rode com:  npm run test:notif
// Elas aparecem no canto inferior direito. NÃO dependem das notificações do Windows.
const { app } = require('electron');
const { EventEmitter } = require('events');

const { wireDetector } = require('../src/core/detector');
const { configureNotifier, attachNotifications, notify } = require('../src/notifier');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  configureNotifier(() => true);

  const det = new EventEmitter();
  det.stop = () => {};
  let falharProximoClique = false;
  const ctl = wireDetector(det, async () => {
    if (falharProximoClique) throw new Error('Discord fora do ar.');
  });
  attachNotifications(ctl);

  console.log('\nOlhe o canto inferior direito da tela.\n');

  console.log('[1] entrando em serviço -> card verde "Ponto aberto"');
  det.emit('status', { status: 'on-duty', text: 'Em Serviço', source: 'teste' });
  await sleep(3500);

  console.log('[2] saindo de serviço -> card verde "Ponto fechado"');
  det.emit('status', { status: 'off-duty', text: 'Fora de Serviço', source: 'teste' });
  await sleep(3500);

  console.log('[3] clique falhando -> card VERMELHO "Falha ao abrir o ponto"');
  falharProximoClique = true;
  det.emit('status', { status: 'on-duty', text: 'Em Serviço', source: 'teste' });
  await sleep(3500);

  console.log('[4] empilhamento: 3 de uma vez, devem aparecer juntos e alinhados');
  notify('Primeiro aviso', 'Deve ficar embaixo.', 'info');
  await sleep(400);
  notify('Segundo aviso', 'Deve ficar no meio.', 'success');
  await sleep(400);
  notify('Terceiro aviso', 'Deve ficar em cima.', 'error');
  await sleep(4000);

  console.log('[5] dedup: 3 idênticos seguidos -> só 1 deve aparecer');
  const r = [
    notify('Teste de dedup', 'Deve aparecer uma vez só.', 'info'),
    notify('Teste de dedup', 'Deve aparecer uma vez só.', 'info'),
    notify('Teste de dedup', 'Deve aparecer uma vez só.', 'info'),
  ];
  const enviados = r.filter(Boolean).length;
  console.log(`    enviados: ${enviados} (esperado 1) — ${enviados === 1 ? 'ok' : 'FALHOU'}`);

  console.log('\n[6] texto longo -> deve cortar com reticências, sem quebrar o card');
  notify('Um título absurdamente longo que não cabe de jeito nenhum nesta linha',
    'Um corpo igualmente longo, que precisa ser truncado em duas linhas no máximo para não estourar a altura do card e vazar pra fora da janela.', 'info');

  await sleep(7000);
  console.log('\nFim. Confirme: os cards apareceram? Empilharam? Sumiram sozinhos?');
  app.exit(enviados === 1 ? 0 : 1);
});
