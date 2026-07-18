// Regressão do comportamento de conexão. O bug original: o monitor encerrava
// sozinho quando o FiveM não estava aberto. Ele deve ESPERAR, para sempre.
//
// Roda numa porta própria pra não encostar num FiveM real na 13172.
// Leva ~2min (os tempos são reais: heartbeat de 5s, retry de 10s).
const PORT = 13999;
process.env.MTP_AUTO_TIMESHEET_NUI_URL = `http://localhost:${PORT}/`;

const { EventEmitter } = require('events');
const { startMockFiveM } = require('./mock-fivem');
const { DutyDetector, wireDetector } = require('../src/core/detector');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EM_SERVICO = 'Polícia Capital - ✅ Em Serviço';

let falhas = 0;
function check(nome, ok) {
  console.log(`  ${ok ? 'ok  ' : 'FALHOU'} ${nome}`);
  if (!ok) falhas++;
}

// -------- Ciclo: jogo abre -> em serviço -> jogo fecha -> volta --------

async function testeCiclo() {
  console.log('\n== Ciclo abrir/fechar/reabrir o jogo ==');
  let encerrou = false;
  const detector = new DutyDetector();
  detector.on('stopped', () => { encerrou = true; });
  const cliques = [];
  const ctl = wireDetector(detector, async (b) => { cliques.push(b); });
  detector.start();

  console.log('\n[1] jogo fechado por 20s (o bug antigo matava em ~15s)');
  await sleep(20_000);
  check('não encerrou esperando o jogo', !encerrou);

  console.log('[2] jogo abre, jogador entra em serviço');
  let fake = await startMockFiveM(PORT);
  await sleep(6_000);
  check('anexou sozinho', detector.attached);
  fake.reportarStatus(EM_SERVICO);
  await sleep(500);
  check('ponto aberto', ctl.pontoOpen);

  console.log('[3] jogo fecha');
  await fake.stop();
  await sleep(25_000);
  check('ponto fechado automaticamente', !ctl.pontoOpen);
  check('monitor continua vivo', !encerrou);
  check('voltou a sondar', !detector.attached);

  console.log('[4] jogo reabre, jogador entra em serviço de novo');
  fake = await startMockFiveM(PORT);
  await sleep(8_000);
  check('reconectou sozinho', detector.attached);
  fake.reportarStatus(EM_SERVICO);
  await sleep(500);
  // Se o dedup não for resetado na queda, o status repetido é engolido e o ponto não reabre.
  check('ponto reaberto após reconectar', ctl.pontoOpen);
  check('sequência de cliques correta',
    JSON.stringify(cliques) === JSON.stringify(['Abrir Ponto', 'Fechar Ponto', 'Abrir Ponto']));

  console.log('[5] stop() explícito');
  detector.stop();
  await sleep(3_000);
  check('encerrou sob comando', encerrou);
  await fake.stop();
}

// -------- Fechamento do ponto insiste quando o Discord falha --------

async function testeRetryFechamento() {
  console.log('\n== Fechar ponto com o Discord falhando ==');
  const det = new EventEmitter();
  det.stop = () => { throw new Error('stop() não deve ser chamado numa queda de conexão'); };
  let tentativas = 0;
  const ctl = wireDetector(det, async (b) => {
    if (b === 'Fechar Ponto' && ++tentativas < 3) throw new Error('Discord fora do ar');
  });

  det.emit('status', { status: 'on-duty', text: 'x', source: 'test' });
  await sleep(50);
  check('ponto aberto', ctl.pontoOpen);

  det.emit('no-connection');
  await sleep(25_000); // 2 falhas => 2 esperas de 10s antes do sucesso
  check('insistiu até fechar (3 tentativas)', tentativas === 3);
  check('ponto fechado', !ctl.pontoOpen);
}

// -------- Portão: fora da Metrópole, o detector não toca em nada --------

async function testeServidorEstranho() {
  console.log('\n== Servidor que não é a Metrópole (portão anti-ban) ==');
  const fake = await startMockFiveM(PORT, { metropole: false });
  const detector = new DutyDetector();
  const cliques = [];
  const ctl = wireDetector(detector, async (b) => { cliques.push(b); });
  detector.start();

  await sleep(6_000); // tempo de sobra pra ao menos uma tentativa de attach
  check('não anexou em servidor estranho', !detector.attached);
  check('reconheceu como servidor estranho', detector._onForeignServer === true);

  const m = fake.methodsSeen();
  check('leu a árvore de frames (leitura passiva)', m.includes('Page.getFrameTree'));
  const injetou = m.some((x) => /addBinding|createIsolatedWorld|Runtime\.enable|Network\.enable|Runtime\.evaluate/.test(x));
  check('NÃO injetou nada (sem addBinding/evaluate/enable)', !injetou);
  check('nenhum clique no Discord', cliques.length === 0);

  detector.stop();
  await sleep(500);
  await fake.stop();
}

(async () => {
  await testeServidorEstranho();
  await testeCiclo();
  await testeRetryFechamento();
  console.log(falhas === 0 ? '\nTudo passou.' : `\n${falhas} verificação(ões) falharam.`);
  process.exit(falhas === 0 ? 0 : 1);
})();
