// Toasts do Windows. Separado do main.js pra poder ser testado sem subir o app inteiro.
const { Notification } = require('electron');
const path = require('path');
const { log } = require('./core/logger');

const ASSETS = path.join(__dirname, '..', 'assets');
const DEDUP_WINDOW_MS = 60_000;

let lastNotif = { key: '', at: 0 };
let isEnabled = () => true;

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

module.exports = { notify, configureNotifier, attachNotifications };
