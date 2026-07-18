// Kill switch remoto: um freio de emergência que o desenvolvedor aciona sem que
// o usuário precise atualizar nem fazer nada.
//
// Como funciona: o app lê, de tempos em tempos, um arquivo de status hospedado
// num lugar que o DEV controla (por padrão, um JSON cru no próprio repo). Se o
// status disser "desligado", o app fecha o ponto e fica inerte na próxima leitura.
//
// Regra de ouro (fail-open): se NÃO der pra ler o status (offline, host fora do
// ar), o app MANTÉM o estado atual — nunca desliga por falha de rede. Um usuário
// sem internet não pode ser derrubado por um erro de conexão. O último estado
// conhecido fica em cache implícito (a variável `killed`).
//
// Só decide QUANDO acionar; o QUE fazer (fechar ponto, parar o monitor) vem em
// callbacks do main.js. Assim o módulo não depende de Electron e é testável puro.
const { log } = require('./core/logger');

// Trocar por um gist/host próprio se o repo virar privado — a URL crua do GitHub
// exige o repo público. Override por env pra teste apontar num servidor local.
const KILL_URL = process.env.MTP_AUTO_TIMESHEET_KILL_URL
  || 'https://raw.githubusercontent.com/guizss/mtp-auto-timesheet/master/killswitch.json';
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 min: responsivo o bastante pra uma onda de ban
const FETCH_TIMEOUT_MS = 8_000;

// Compara "1.0.7" vs "1.1.0" numericamente. Sem depender de semver (que aqui é
// dep transitiva do electron-updater e não resolve do bundle). Ignora sufixos.
function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

// A versão atual pode rodar, dado o flag?
//   null  -> flag ilegível/ausente (o chamador deve manter o estado atual)
//   false -> deve ser desligada
//   true  -> pode rodar
// Formato do flag: { "enabled": true, "minVersion": "1.0.0", "message": "..." }
function allowedByFlag(flag, version) {
  if (!flag || typeof flag !== 'object') return null;
  if (flag.enabled === false) return false;
  if (flag.minVersion && compareVersions(version, String(flag.minVersion)) < 0) return false;
  return true;
}

async function fetchFlag() {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // Cache-buster + no-store reduzem o atraso do CDN do raw.githubusercontent.
    const res = await fetch(`${KILL_URL}?t=${Date.now()}`, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null; // rede/timeout/JSON inválido: ilegível → fail-open
  } finally {
    clearTimeout(t);
  }
}

// onKill(message) e onRestore() podem ser async (fecham/reabrem o monitor).
function setupKillSwitch({ version, onKill, onRestore } = {}) {
  let killed = false;     // estado conhecido (cache do último status legível)
  let checking = false;   // evita checagens sobrepostas
  let timer = null;

  async function check() {
    if (checking) return;
    checking = true;
    try {
      const flag = await fetchFlag();
      const allowed = allowedByFlag(flag, version);
      if (allowed === null) return;        // fail-open: mantém o estado atual
      const shouldKill = !allowed;
      if (shouldKill === killed) return;    // sem transição, nada a fazer
      killed = shouldKill;
      if (killed) {
        const msg = (flag && typeof flag.message === 'string') ? flag.message : '';
        log(`KILL SWITCH remoto ATIVADO${msg ? ` — ${msg}` : ''}. Desativando o programa.`);
        if (onKill) await onKill(msg);
      } else {
        log('KILL SWITCH remoto liberado — reativando o programa.');
        if (onRestore) await onRestore();
      }
    } catch (err) {
      log(`Erro ao aplicar o kill switch: ${err && err.message ? err.message : err}`);
    } finally {
      checking = false;
    }
  }

  check();
  timer = setInterval(check, CHECK_INTERVAL_MS);
  // Não segura o processo vivo sozinho — o app já vive pela bandeja.
  if (timer.unref) timer.unref();

  return {
    checkNow: check,
    isKilled: () => killed,
    stop: () => { if (timer) { clearInterval(timer); timer = null; } },
  };
}

module.exports = { setupKillSwitch, allowedByFlag, compareVersions };
