// Processo principal: vive na bandeja, sem janela. Faz o login do Discord uma vez,
// roda o DutyDetector e traduz o estado dele em ícone/menu.
const { app, Tray, Menu, dialog, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const { log, setLogFile } = require('./core/logger');
const { DutyDetector, wireDetector, NUI_URL } = require('./core/detector');
const { DiscordClient } = require('./discord');
const { configureNotifier, attachNotifications, notify } = require('./notifier');
const { closeAllToasts } = require('./toast');
const { setupUpdater, updateReady, installNow, checkNow } = require('./updater');
const { setupKillSwitch } = require('./killswitch');

const ASSETS = path.join(__dirname, '..', 'assets');
const AUTOR = '@guip1_';

// 1.0.8: programa DESCONTINUADO. Não automatiza mais nada — não conecta no FiveM,
// não loga no Discord, não injeta nada. Só avisa e sugere desinstalar. Isso protege
// o usuário: um programa "descontinuado" que continuasse batendo ponto ainda daria
// problema. Para reviver no futuro, basta voltar para false — todo o maquinário
// (monitor, kill switch) volta a ser ligado normalmente.
const DISCONTINUED = true;

let tray = null;
let detector = null;
let ctl = null;
let discord = null;
let paused = false;
let loggedIn = false;
let quitting = false;
let logFile = null;
let killed = false;        // desativado remotamente pelo kill switch
let killMessage = '';

// O Windows agrupa toasts pelo AppUserModelID. Sem isso, em vez do nome do app
// a notificação sai como "electron.app.Electron".
app.setAppUserModelId('gg.metropole.mtpautotimesheet');

// Só uma instância: duas rodando dariam cliques duplicados no ponto.
if (!app.requestSingleInstanceLock()) app.exit(0);

// App de bandeja: fechar a janela de login não pode encerrar o programa.
app.on('window-all-closed', () => {});

// -------- Config (userData, por usuário) --------

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function readConfig() {
  try { return JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch { return {}; }
}

function writeConfig(patch) {
  const next = { ...readConfig(), ...patch };
  try { fs.writeFileSync(configPath(), JSON.stringify(next, null, 2)); } catch {}
  return next;
}

// -------- Iniciar com o Windows --------

function getOpenAtLogin() {
  if (!app.isPackaged) return false;   // em dev apontaria pro electron.exe
  return app.getLoginItemSettings().openAtLogin;
}

function setOpenAtLogin(value) {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: value, args: [] });
  writeConfig({ openAtLogin: value });
}

// -------- Notificações --------

function notificationsEnabled() {
  const cfg = readConfig();
  return cfg.notifications !== false; // ligadas por padrão
}

function soundEnabled() {
  const cfg = readConfig();
  return cfg.sound !== false; // ligado por padrão
}

// -------- Bandeja --------

function trayState() {
  if (DISCONTINUED) return { icon: 'paused', label: 'Descontinuado — recomendado desinstalar' };
  if (killed) return { icon: 'paused', label: killMessage ? `Desativado — ${killMessage}` : 'Desativado pelo desenvolvedor' };
  if (!loggedIn) return { icon: 'paused', label: 'Não conectado ao Discord' };
  if (paused) return { icon: 'paused', label: 'Pausado' };
  if (ctl && ctl.pontoOpen) return { icon: 'onduty', label: 'Em serviço — ponto aberto' };
  if (detector && detector.attached) return { icon: 'offduty', label: 'Fora de serviço' };
  return { icon: 'waiting', label: 'Aguardando o FiveM abrir' };
}

function iconFor(name) {
  const img = nativeImage.createFromPath(path.join(ASSETS, `tray-${name}.png`));
  img.setTemplateImage(false);
  return img;
}

function updateTray() {
  if (!tray || quitting) return;
  const { icon, label } = trayState();
  tray.setImage(iconFor(icon));
  tray.setToolTip(`mtp-auto-timesheet — ${label}`);

  // Descontinuado: menu enxuto, sem itens operacionais (não há o que operar).
  if (DISCONTINUED) {
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Programa descontinuado', enabled: false },
      { label: `Versão ${app.getVersion()} — por ${AUTOR}`, enabled: false },
      { type: 'separator' },
      { label: 'Desinstalar...', click: () => openUninstall() },
      { label: 'Ver logs', click: () => { if (logFile) shell.openPath(logFile); } },
      { label: 'Sair', click: () => doQuit() },
    ]));
    return;
  }

  const pronta = updateReady();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Status: ${label}`, enabled: false },
    { label: `Versão ${app.getVersion()} — por ${AUTOR}`, enabled: false },
    { type: 'separator' },
    ...(pronta ? [
      { label: `Reiniciar e atualizar para ${pronta.version}`, click: () => installNow() },
      { type: 'separator' },
    ] : []),
    ...(loggedIn ? [] : [{ label: 'Entrar no Discord...', click: () => doLogin() }]),
    {
      label: 'Pausar',
      type: 'checkbox',
      checked: paused,
      enabled: loggedIn,
      click: (item) => togglePause(item.checked),
    },
    {
      label: 'Notificações',
      type: 'checkbox',
      checked: notificationsEnabled(),
      click: (item) => { writeConfig({ notifications: item.checked }); updateTray(); },
    },
    {
      label: 'Som',
      type: 'checkbox',
      checked: soundEnabled(),
      enabled: notificationsEnabled(),
      click: (item) => { writeConfig({ sound: item.checked }); updateTray(); },
    },
    {
      label: 'Iniciar com o Windows',
      type: 'checkbox',
      checked: getOpenAtLogin(),
      enabled: app.isPackaged,
      click: (item) => { setOpenAtLogin(item.checked); updateTray(); },
    },
    { type: 'separator' },
    { label: 'Procurar atualização', enabled: app.isPackaged && !pronta, click: () => checkNow() },
    { label: 'Ver logs', click: () => { if (logFile) shell.openPath(logFile); } },
    { label: 'Sair', click: () => doQuit() },
  ]));
}

// -------- Monitor --------

function startMonitor() {
  if (detector) return;
  if (DISCONTINUED) { log('Monitor não inicia: programa descontinuado.'); return; }
  if (killed) { log('Monitor não inicia: programa desativado remotamente.'); return; }
  detector = new DutyDetector();
  ctl = wireDetector(detector, (text) => discord.click(text));
  detector.on('attached', updateTray);
  detector.on('no-connection', updateTray);
  ctl.on('ponto', updateTray);
  attachNotifications(ctl);

  detector.start().catch((err) => log(`Monitor caiu: ${err.message}`));
  updateTray();
}

// Fecha o ponto antes de largar o monitor: sair (ou pausar) com o ponto
// aberto deixaria hora correndo sem ninguém em serviço.
async function stopMonitor(reason) {
  if (ctl && ctl.pontoOpen) await ctl.doClose(reason);
  if (detector) detector.stop();
  detector = null;
  ctl = null;
}

// Kill switch remoto: o dev desativou o programa. Fecha o ponto (via stopMonitor)
// e fica inerte, sem o usuário precisar atualizar nem fazer nada. Idempotente.
async function applyKill(message) {
  if (killed) return;
  killed = true;
  killMessage = message || '';
  log(`Desativado remotamente pelo kill switch.${killMessage ? ` Motivo: ${killMessage}` : ''}`);
  updateTray();
  // Avisa ANTES de parar o monitor: o aviso in-game depende do detector vivo.
  try {
    await notify('Programa desativado',
      killMessage || 'O desenvolvedor desativou o programa temporariamente. O ponto foi fechado.',
      'warning');
  } catch { /* aviso é best-effort */ }
  try { await stopMonitor('desativado pelo desenvolvedor'); } catch (err) { log(`Erro ao desativar: ${err.message}`); }
  updateTray();
}

// Kill switch liberado: volta ao normal se o usuário estiver logado e sem pausa.
async function applyRestore() {
  if (!killed) return;
  killed = false;
  killMessage = '';
  log('Reativado remotamente pelo kill switch.');
  updateTray();
  if (loggedIn && !paused) startMonitor();
  updateTray();
}

async function togglePause(next) {
  paused = next;
  updateTray();
  if (paused) {
    log('Pausado pelo usuário.');
    await stopMonitor('pausado pelo usuário');
  } else {
    log('Retomado pelo usuário.');
    startMonitor();
  }
  updateTray();
}

async function doLogin() {
  loggedIn = await discord.ensureLogin();
  updateTray();
  if (loggedIn && !paused && !killed) startMonitor();
  return loggedIn;
}

async function doQuit() {
  if (quitting) return;
  quitting = true;
  if (tray) tray.setToolTip('mtp-auto-timesheet — encerrando...');
  log('Encerrando a pedido do usuário.');
  closeAllToasts();
  try { await stopMonitor('programa encerrado'); } catch (err) { log(`Erro ao encerrar: ${err.message}`); }
  app.exit(0);
}

// -------- Descontinuação (1.0.8) --------

// Abre "Aplicativos e recursos" do Windows, onde o usuário desinstala o programa.
async function openUninstall() {
  try {
    await shell.openExternal('ms-settings:appsfeatures');
  } catch (err) {
    log(`Não consegui abrir a tela de desinstalação: ${err.message}`);
  }
}

// Aviso de descontinuação. Mostrado a cada abertura enquanto o programa existir na
// máquina — o objetivo é que a pessoa desinstale. Sem falar em ban: só "problemas
// com o FiveM", conforme pedido.
async function showDiscontinuedNotice() {
  try {
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      title: 'mtp-auto-timesheet — Descontinuado',
      message: 'Este programa foi descontinuado.',
      detail: 'Para evitar problemas com o FiveM, o mtp-auto-timesheet não bate mais o ponto '
        + 'automaticamente e deixou de funcionar.\n\n'
        + 'Recomendamos desinstalá-lo. Você pode fazer isso agora em "Aplicativos e recursos" '
        + 'do Windows, procurando por "mtp-auto-timesheet".\n\n'
        + 'Obrigado por ter usado.',
      buttons: ['Desinstalar agora', 'Fechar'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (response === 0) await openUninstall();
  } catch (err) {
    log(`Falha ao exibir o aviso de descontinuação: ${err.message}`);
  }
}

// -------- Boot --------

app.whenReady().then(async () => {
  logFile = setLogFile(path.join(app.getPath('userData'), 'logs', 'mtp-auto-timesheet.log'));
  log(`mtp-auto-timesheet ${app.getVersion()} — desenvolvido por ${AUTOR}`);
  log(`Logs em ${logFile}`);

  // DESCONTINUADO: não sobe monitor, não loga no Discord, não toca no jogo.
  // Mantém só o updater vivo (canal para uma futura correção/retomada) e avisa.
  if (DISCONTINUED) {
    log('Programa DESCONTINUADO. Nenhuma automação será executada.');
    tray = new Tray(iconFor('paused'));
    updateTray();
    setupUpdater({ onChange: updateTray, beforeInstall: async () => {} });
    await showDiscontinuedNotice();
    return;
  }

  log(`Iniciando. FiveM esperado em ${NUI_URL}`);

  tray = new Tray(iconFor('waiting'));
  updateTray();

  // Aviso in-game: tenta o celular nativo (SignalR) primeiro; se nenhum socket
  // foi capturado ainda ou o formato da metrópole mudou, cai no overlay nosso.
  // O appId decide o app/ícone do celular — configurável (default abaixo).
  configureNotifier({
    enabled: notificationsEnabled,
    sound: soundEnabled,
    inGame: async (t, b, type, som) => {
      if (!detector) return false;
      const appId = readConfig().phoneAppId || 'bank';
      if (await detector.notifyPhone(t, b, appId, som)) return true;
      return detector.notifyInGame(t, b, type, som);
    },
  });
  discord = new DiscordClient();

  // beforeInstall: o updater reinicia o app, então o ponto precisa fechar antes.
  setupUpdater({
    onChange: updateTray,
    beforeInstall: () => stopMonitor('atualizando o programa'),
  });

  // Freio de emergência remoto: o dev pode desativar todos os clientes já
  // instalados sem que ninguém precise atualizar. Fecha o ponto antes de parar.
  setupKillSwitch({
    version: app.getVersion(),
    onKill: (msg) => applyKill(msg),
    onRestore: () => applyRestore(),
  });

  // Primeira execução: liga o autostart por padrão, mas só uma vez —
  // se o usuário desmarcar depois, respeitamos a escolha dele.
  const cfg = readConfig();
  if (cfg.openAtLogin === undefined) setOpenAtLogin(true);

  const ok = await doLogin();
  if (!ok) {
    log('Login não concluído. Use "Entrar no Discord..." na bandeja quando quiser.');
    dialog.showMessageBox({
      type: 'info',
      title: 'mtp-auto-timesheet',
      message: 'Login do Discord não concluído.',
      detail: 'O programa continua na bandeja (perto do relógio). Clique com o botão direito no ícone e escolha "Entrar no Discord..." para tentar de novo.',
    }).catch(() => {});
  }
});

process.on('uncaughtException', (err) => {
  log(`ERRO não tratado: ${err && err.stack ? err.stack : err}`);
});
