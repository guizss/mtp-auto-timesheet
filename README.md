# mtp-auto-timesheet

**Desenvolvido por [@guip1_](https://discord.com/users/guip1_)**

Programa que **abre e fecha o ponto no Discord sozinho**, conforme você entra e sai de
serviço na Polícia Capital do FiveM (Metrópole). Ele fica perto do relógio, invisível, e
você não precisa fazer nada.

Ele não inventa hora: só reflete o duty real do jogo. Entrou em serviço, o ponto abre.
Saiu, o ponto fecha. Fechou o FiveM, o ponto fecha.

---

## ⚠️ Leia antes de instalar

**Este programa automatiza a sua conta de usuário do Discord.** O Discord chama isso de
*self-bot* e proíbe nos Termos de Serviço. A punição típica é **encerramento da conta**.

O risco é de quem instala. Instale sabendo disso.

---

## Requisitos

| | |
|---|---|
| **Windows** | 10 ou 11, 64 bits |
| **FiveM** | instalado, jogando na Metrópole |
| **Discord** | sua conta, já no servidor da Metrópole, com acesso ao canal do ponto |
| **Internet** | só para baixar. Depois roda sozinho |

Não precisa instalar nada além disso. Não precisa de Node, navegador ou permissão de
administrador.

---

## Instalação

### 1. Baixe

**https://github.com/guizss/mtp-auto-timesheet/releases/latest**

Baixe o arquivo **`mtp-auto-timesheet-setup-x.y.z.exe`**. É o único que serve — ignore o
`latest.yml`, o `.blockmap` e o "Source code", que são peças internas do programa.

### 2. O Windows vai reclamar — é esperado

Ao abrir, aparece **"O Windows protegeu o seu PC"**:

```
Mais informações  →  Executar assim mesmo
```

Isso acontece porque o programa não tem assinatura digital (o certificado é pago e
cobrado por ano). Não é vírus, mas você não precisa acreditar em mim: o código-fonte
inteiro está no repositório acima.

Alguns antivírus também podem implicar, pelo mesmo motivo.

### 3. Instale

O instalador não pede administrador. Ao terminar, o programa **abre sozinho**.

### 4. Faça login no Discord

Uma janela do Discord abre **na hora**. Faça login normalmente.

Não precisa apertar nada, nem confirmar: o programa detecta o login sozinho, fecha a
janela e **nunca mais pede**. A sessão fica só na sua máquina.

### 5. Pronto

O programa foi para a bandeja (perto do relógio, às vezes escondido na setinha `^`).
Ele já vem configurado para **iniciar junto com o Windows**.

---

## Como usar

**Você não faz nada.** Abra o FiveM e jogue. O resto é automático.

### O ícone da bandeja

| Ícone | O que significa |
|---|---|
| 🔘 **Cinza** | Aguardando você abrir o FiveM |
| 🟠 **Laranja** | Conectado ao jogo, você está fora de serviço |
| 🟢 **Verde** | Em serviço — ponto aberto |
| ⚫ **Escuro** | Pausado, ou Discord não conectado |

### O menu (botão direito no ícone)

| Item | O que faz |
|---|---|
| **Status** | mostra o que está acontecendo agora |
| **Pausar** | para tudo. Se o ponto estiver aberto, fecha antes |
| **Notificações** | liga/desliga os avisos na tela |
| **Som** | liga/desliga só o som, mantendo os avisos |
| **Iniciar com o Windows** | vem ligado |
| **Procurar atualização** | força a checagem (ele já checa sozinho) |
| **Ver logs** | abre o histórico do que aconteceu |
| **Sair** | fecha o programa — **fechando o ponto antes** |

### 🚨 Use sempre o "Sair" do menu

Se você **matar o programa pelo Gerenciador de Tarefas** com o ponto aberto, o ponto
**fica aberto** no Discord, contando hora sem você em serviço. O "Sair" existe para
evitar isso.

### Os avisos

Aparecem no **canto superior direito, dentro do jogo**, com um som curto:

| Cor | Quando |
|---|---|
| 🟩 Verde | ponto aberto ou fechado com sucesso |
| 🟧 Laranja | aviso (ex: FiveM fechou) |
| 🟥 Vermelho | **falhou** — o ponto pode ter ficado aberto, confira o Discord |

O vermelho é o que exige ação sua. Os outros são só confirmação.

Com o FiveM fechado, o aviso aparece numa janela no canto da tela — porque aí não há
jogo onde desenhar.

---

## O que acontece em cada situação

| Você | O programa |
|---|---|
| Entra em serviço | Abre o ponto e avisa |
| Sai de serviço | Fecha o ponto e avisa |
| **Fecha o FiveM** | Fecha o ponto e fica esperando o jogo voltar — **não encerra** |
| Reabre o FiveM | Reconecta sozinho. Se você estiver em serviço, reabre o ponto |
| Desliga o PC com o ponto aberto | ⚠️ O ponto **fica aberto**. Use o "Sair" antes |
| Fica dias sem abrir o jogo | Ele espera, sem fazer nada |
| Publica uma versão nova | Ele baixa e avisa. Você clica em "Reiniciar e atualizar" |

---

## Problemas comuns

**"Instalei e não aconteceu nada."**
Olhe perto do relógio, na setinha `^` — o Windows esconde ícones novos. Arraste o ícone
para fora para fixá-lo.

**"Não abre a janela de login."**
Verifique se já não há outro `mtp-auto-timesheet` rodando (Gerenciador de Tarefas). Só
uma cópia roda por vez, de propósito — duas bateriam ponto duplicado.

**"O ponto não abriu."**
Bandeja → **Ver logs**. Procure `Falha ao abrir ponto`. As causas mais comuns são o
Discord ter deslogado ou o canal do ponto ter mudado.

**"Pede login toda vez."**
Não deveria. Se acontecer, é bug — abra uma issue no repositório com o log.

**"Está em serviço mas o ícone está laranja."**
O programa lê o seu status pelo inventário e pela API do jogo. Abra o inventário uma vez
para forçar a leitura.

**"Quero desinstalar."**
Painel de Controle → Adicionar ou remover programas → mtp-auto-timesheet. Feche o ponto
antes, pelo menu **Sair**.

---

## Como funciona por dentro

### Detectar o serviço

O FiveM expõe a interface do jogo (a NUI) numa porta local, `localhost:13172`. O programa
conecta nela pelo mesmo protocolo que o DevTools do Chrome usa (CDP) e lê o seu status de
**duas fontes independentes**:

1. Um observador injetado no iframe `metro-inventory`, que vigia o texto
   "Polícia Capital — Em Serviço / Fora de Serviço".
2. Uma consulta a cada 5s em `api.metropole.gg/.../character/data`, usando o token que o
   próprio tablet do jogo já manda nos requests dele.

Duas fontes porque uma sozinha falha: o inventário só existe quando aberto, e a API às
vezes demora. As duas passam pelo mesmo filtro, então nunca geram clique duplicado.

**O programa só lê.** Não altera o jogo, não dá vantagem, não toca em outros jogadores.

### Clicar no Discord

Usa o Chromium que já vem embutido no próprio programa para abrir o canal e clicar no
botão. A sessão fica em `%APPDATA%\mtp-auto-timesheet`, na sua máquina. Nada é enviado
para servidor nenhum — não existe backend, telemetria ou coleta.

### Avisar

Os avisos são desenhados **dentro da NUI do jogo**, e não como notificação do Windows.
Dois motivos: em *fullscreen exclusive* nenhuma janela externa aparece por cima do jogo,
e a notificação do Windows não funciona se a pessoa tiver desligado notificações — sem
avisar ninguém. Um elemento nosso na NUI sempre aparece.

Quando o FiveM está fechado, cai para uma janela própria — que é justamente quando avisos
de erro mais importam.

### Nunca desistir

O monitor não encerra sozinho. Sem o FiveM no ar, ele fica sondando a porta
indefinidamente. Se o jogo cair com o ponto aberto, ele tenta fechar até 5 vezes, com 10s
entre cada tentativa, e depois volta a esperar.

### Atualizar

Ao abrir e a cada 6h, consulta as releases do GitHub. Baixa só os blocos que mudaram —
uma atualização típica é **menos de 1 MB**, não os 79 MB do instalador. Instala em
silêncio (sem SmartScreen) e **fecha o ponto antes de reiniciar**.

### Onde ficam as coisas

```
C:\Program Files\mtp-auto-timesheet\        o programa
%APPDATA%\mtp-auto-timesheet\
  ├── config.json                            suas preferências
  ├── logs\mtp-auto-timesheet.log            histórico
  └── Partitions\discord\                    sua sessão do Discord
```

---

## Para desenvolvedores

```powershell
npm install
npm start            # modo dev
npm test             # regressão do detector (~2min, não toca no seu Discord)
npm run test:notif   # dispara os avisos pra conferir visualmente
npm run dist         # gera dist/mtp-auto-timesheet-setup-x.y.z.exe (~79 MB)
```

### Publicar uma atualização

```powershell
npm version patch                       # commit + tag
$env:GH_TOKEN = gh auth token
npm run publish                         # compila e sobe pra GitHub Releases
gh release edit vX.Y.Z --draft=false    # ← OBRIGATÓRIO
git push --follow-tags
```

⚠️ **O electron-builder publica como _draft_,** e draft é invisível para o
`electron-updater`. Se esquecer o `--draft=false`, ninguém recebe a atualização e
**nenhum erro aparece**. É a pegadinha mais fácil de cair aqui.

As releases `v1.0.1` e `v1.0.2` são do nome antigo (`auto-timesheet`) e estão órfãs: não
se atualizam para o nome novo. Estão marcadas como obsoletas. O `mtp-auto-timesheet`
começa na `v1.0.3`.

### 🚨 Nunca empacote a sua sessão do Discord

`%APPDATA%\mtp-auto-timesheet` contém **os cookies de login da sua conta**. Se forem parar
no instalador, todo mundo que instalar bate ponto **na sua conta**.

Por isso `build.files` no `package.json` é uma **allowlist** (`src/`, `assets/`,
`package.json`), não uma lista de exclusões: o que não está listado não entra, mesmo que
apareça um arquivo novo na pasta amanhã.

Confira depois de qualquer mudança no build:

```powershell
node -e "const a=require('@electron/asar');const f=a.listPackage('dist/win-unpacked/resources/app.asar');console.log(f.filter(x=>/user-data|Cookies|Local Storage/i.test(x)).length===0?'OK: nada vazou':'VAZOU!')"
```

### Se o build falhar com "Cannot create symbolic link"

O electron-builder baixa o pacote `winCodeSign` — de onde sai o `rcedit.exe`, que grava o
ícone no .exe. Ele é necessário **mesmo sem assinatura de código**. Esse pacote traz
symlinks do macOS, e o Windows exige privilégio especial para criá-los.

Extraia o cache manualmente, sem a pasta `darwin`:

```powershell
cd "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
& "<projeto>\node_modules\7zip-bin\win\x64\7za.exe" x <hash>.7z -o"winCodeSign-2.6.0" "-x!darwin" -y
```

Alternativa: ativar o **Modo Desenvolvedor** do Windows.

### Mapa do código

| Arquivo | Responsabilidade |
|---|---|
| `src/core/detector.js` | Núcleo: CDP, observer, poll da API, reconexão. Sem Electron — testável com node puro |
| `src/core/nui-overlay.js` | Avisos desenhados dentro da NUI do jogo |
| `src/core/logger.js` | Log em arquivo + bus para a bandeja |
| `src/discord.js` | Login e clique nos botões, via Chromium do Electron |
| `src/notifier.js` | Decide entre o overlay do jogo e a janela; dedup de 60s |
| `src/toast.js` | Janela de aviso (fallback com o FiveM fechado) |
| `src/updater.js` | Auto-update — fecha o ponto antes de reiniciar |
| `src/main.js` | Bandeja, menu, autostart, ciclo de vida |
| `tools/make-icons.js` | Gera os ícones por código (PNG/ICO na mão, via zlib) |
| `tools/make-sound.js` | Gera o som por código (WAV na mão) |

Para testar o detector contra um FiveM falso, aponte `MTP_AUTO_TIMESHEET_NUI_URL` para
outra porta. Para segurar um aviso na tela e conferir o visual, use
`MTP_AUTO_TIMESHEET_TOAST_MS`.
