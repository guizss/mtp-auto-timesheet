// Regressão do kill switch. Sobe um servidor HTTP local no lugar do host do flag
// e dirige as checagens à mão, cobrindo: ativar, reativar, minVersion, não repetir
// transição e — o mais importante — fail-open quando o host cai.
//
// Roda com:  node test/killswitch.js  (node puro, não toca em nada externo)
const http = require('http');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let falhas = 0;
function check(nome, ok) {
  console.log(`  ${ok ? 'ok  ' : 'FALHOU'} ${nome}`);
  if (!ok) falhas++;
}

// Servidor que devolve o flag atual (ou 500, ou lixo) conforme o teste mandar.
function startFlagServer(port) {
  let mode = { flag: { enabled: true } };
  const server = http.createServer((req, res) => {
    if (mode.status) { res.statusCode = mode.status; res.end('erro'); return; }
    if (mode.garbage) { res.setHeader('content-type', 'application/json'); res.end('isto não é json {'); return; }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(mode.flag));
  });
  return new Promise((resolve) => server.listen(port, () => resolve({
    setFlag: (flag) => { mode = { flag }; },
    setStatus: (status) => { mode = { status }; },
    setGarbage: () => { mode = { garbage: true }; },
    close: () => new Promise((r) => server.close(() => r())),
  })));
}

(async () => {
  const PORT = 13998;
  process.env.MTP_AUTO_TIMESHEET_KILL_URL = `http://localhost:${PORT}/killswitch.json`;
  // require SÓ depois da env — a URL é lida no load do módulo.
  const { setupKillSwitch, allowedByFlag, compareVersions } = require('../src/killswitch');

  console.log('\n== compareVersions / allowedByFlag (unidade) ==');
  check('1.0.7 < 1.1.0', compareVersions('1.0.7', '1.1.0') === -1);
  check('1.2.0 > 1.10.0 é falso (numérico)', compareVersions('1.2.0', '1.10.0') === -1);
  check('iguais', compareVersions('1.0.7', '1.0.7') === 0);
  check('enabled:false -> desligar', allowedByFlag({ enabled: false }, '1.0.7') === false);
  check('minVersion acima -> desligar', allowedByFlag({ enabled: true, minVersion: '2.0.0' }, '1.0.7') === false);
  check('minVersion abaixo -> ok', allowedByFlag({ enabled: true, minVersion: '1.0.0' }, '1.0.7') === true);
  check('flag ausente -> null (fail-open)', allowedByFlag(null, '1.0.7') === null);

  console.log('\n== ciclo com servidor real ==');
  const srv = await startFlagServer(PORT);
  const calls = { kill: 0, restore: 0, lastMsg: null };
  const ks = setupKillSwitch({
    version: '1.0.7',
    onKill: (m) => { calls.kill++; calls.lastMsg = m; },
    onRestore: () => { calls.restore++; },
  });
  ks.stop();            // desliga o intervalo; a partir daqui eu dirijo
  await sleep(150);     // deixa a checagem inicial (enabled:true) assentar
  check('começa vivo', ks.isKilled() === false && calls.kill === 0);

  srv.setFlag({ enabled: false, message: 'manutenção' });
  await ks.checkNow();
  check('kill acionado', ks.isKilled() === true && calls.kill === 1);
  check('mensagem repassada', calls.lastMsg === 'manutenção');

  await ks.checkNow();
  check('não repete kill na mesma transição', calls.kill === 1);

  srv.setFlag({ enabled: true });
  await ks.checkNow();
  check('restore acionado', ks.isKilled() === false && calls.restore === 1);

  srv.setFlag({ enabled: true, minVersion: '2.0.0' });
  await ks.checkNow();
  check('minVersion mata versão antiga', ks.isKilled() === true && calls.kill === 2);

  srv.setFlag({ enabled: true, minVersion: '1.0.0' });
  await ks.checkNow();
  check('minVersion abaixo reativa', ks.isKilled() === false && calls.restore === 2);

  console.log('\n== fail-open: host indisponível NÃO desliga ==');
  srv.setFlag({ enabled: false });
  await ks.checkNow();                    // desliga de propósito
  check('desligado antes da queda', ks.isKilled() === true && calls.kill === 3);

  srv.setFlag({ enabled: true });         // agora deveria reativar...
  srv.setStatus(500);                     // ...mas o host começa a dar erro
  await ks.checkNow();
  check('erro 500 mantém o estado (não reativa por engano)', ks.isKilled() === true && calls.restore === 2);

  srv.setGarbage();
  await ks.checkNow();
  check('JSON inválido mantém o estado', ks.isKilled() === true && calls.restore === 2);

  await srv.close();                      // host totalmente fora
  await ks.checkNow();
  check('host offline mantém o estado', ks.isKilled() === true && calls.restore === 2);

  // E o contrário: estava vivo e o host cai — não pode desligar por falha de rede.
  const srv2 = await startFlagServer(PORT + 1);
  process.env.MTP_AUTO_TIMESHEET_KILL_URL = `http://localhost:${PORT + 1}/killswitch.json`;
  // Novo módulo pra pegar a URL nova (é lida no load).
  delete require.cache[require.resolve('../src/killswitch')];
  const ks2 = require('../src/killswitch').setupKillSwitch({ version: '1.0.7', onKill: () => {}, onRestore: () => {} });
  ks2.stop();
  await sleep(150);
  check('novo cliente começa vivo', ks2.isKilled() === false);
  await srv2.close();
  await ks2.checkNow();
  check('vivo + host offline continua vivo (fail-open)', ks2.isKilled() === false);

  console.log(falhas === 0 ? '\nTudo passou.' : `\n${falhas} verificação(ões) falharam.`);
  process.exit(falhas === 0 ? 0 : 1);
})();
