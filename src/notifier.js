// Toasts do Windows. Separado do main.js pra poder ser testado sem subir o app inteiro.
const { Notification } = require('electron');
const { execFileSync } = require('child_process');
const path = require('path');
const { log } = require('./core/logger');

const ASSETS = path.join(__dirname, '..', 'assets');
const DEDUP_WINDOW_MS = 60_000;

let lastNotif = { key: '', at: 0 };
let isEnabled = () => true;

// Notification.isSupported() só diz se o SO tem o recurso — retorna true mesmo
// com o usuário tendo desligado as notificações em Configurações. Sem esta
// checagem o app falha calado: tenta notificar, não dá erro, e nada aparece.
function toastsAllowedByWindows() {
  if (process.platform !== 'win32') return true;
  try {
    const out = execFileSync('reg', [
      'query', 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\PushNotifications',
      '/v', 'ToastEnabled',
    ], { encoding: 'utf8', windowsHide: true });
    const m = out.match(/ToastEnabled\s+REG_DWORD\s+0x([0-9a-f]+)/i);
    return m ? parseInt(m[1], 16) !== 0 : true; // valor ausente = padrão ligado
  } catch {
    return true; // na dúvida, não bloqueia
  }
}

// Chamado no boot pra deixar o diagnóstico no log, onde dá pra ver depois.
function reportNotificationHealth() {
  if (!Notification.isSupported()) {
    log('AVISO: este sistema não suporta notificações.');
    return false;
  }
  if (!toastsAllowedByWindows()) {
    log('AVISO: as notificações estão DESLIGADAS no Windows (ToastEnabled=0). ' +
        'Nenhum toast vai aparecer, de nenhum programa. ' +
        'Ligue em Configurações > Sistema > Notificações.');
    return false;
  }
  log('Notificações do Windows: OK.');
  return true;
}

// main.js injeta a leitura do config (o usuário pode desligar na bandeja).
function configureNotifier(enabledFn) {
  isEnabled = enabledFn;
}

// Dedup: quando o FiveM cai, o fechamento tenta 5 vezes e cada falha traria
// o mesmo toast. Uma vez por episódio basta.
function notify(title, body) {
  if (!isEnabled() || !Notification.isSupported()) return false;
  const key = `${title}|${body}`;
  const now = Date.now();
  if (key === lastNotif.key && now - lastNotif.at < DEDUP_WINDOW_MS) return false;
  lastNotif = { key, at: now };
  try {
    new Notification({ title, body, icon: path.join(ASSETS, 'icon.png'), silent: false }).show();
    return true;
  } catch (err) {
    log(`Não consegui notificar: ${err.message}`);
    return false;
  }
}

// Liga os eventos do wireDetector aos toasts.
function attachNotifications(ctl) {
  ctl.on('ponto', ({ open, reason }) => {
    if (open) notify('Ponto aberto ✅', `Ponto aberto no Discord — ${reason}.`);
    else notify('Ponto fechado ✅', `Ponto fechado no Discord — ${reason}.`);
  });

  // Falha é o que o usuário mais precisa saber: o ponto pode ter ficado aberto.
  ctl.on('erro', ({ action, message }) => {
    notify(`Falha ao ${action} o ponto ⚠️`, `${message} Confira o Discord manualmente.`);
  });
}

module.exports = {
  notify,
  configureNotifier,
  attachNotifications,
  reportNotificationHealth,
  toastsAllowedByWindows,
};
