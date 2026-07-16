# auto-timesheet

App de bandeja que abre e fecha o **ponto no Discord** automaticamente, conforme você
entra e sai de serviço na Polícia Capital no FiveM (Metrópole).

Ele não inventa horas: só reflete o duty real do jogo. Se você entra em serviço, ele
abre o ponto; se sai (ou fecha o jogo), ele fecha.

---

## ⚠️ Leia antes de usar ou distribuir

**Isto automatiza a sua conta de usuário do Discord.** O Discord chama isso de *self-bot*
e os Termos de Serviço deles proíbem — a punição típica é **encerramento da conta**.
O risco é de quem instala. Avise quem for usar.

Vale também confirmar com a staff do Metrópole se ponto automatizado é permitido antes
de espalhar isso na facção.

---

## Para quem vai usar

1. Rode `auto-timesheet-setup-x.y.z.exe`.
2. Na primeira vez, uma janela do Discord abre — **faça login normalmente**. Não precisa
   apertar nada no teclado: o app detecta o login sozinho e não pede de novo.
3. Pronto. O app vive perto do relógio, no ícone da bandeja.

### O ícone da bandeja

| Cor | Significado |
|---|---|
| 🔘 Cinza | Aguardando o FiveM abrir |
| 🟠 Laranja | Conectado ao FiveM, fora de serviço |
| 🟢 Verde | Em serviço — ponto aberto |
| ⚫ Escuro | Pausado, ou Discord não conectado |

Clique com o botão direito no ícone para ver o status, **Pausar**, ligar/desligar
**Notificações** e **Iniciar com o Windows**, ou **Ver logs**. Use **Sair** para fechar —
ele fecha o ponto antes de encerrar. Se você matar o app pelo Gerenciador de Tarefas com
o ponto aberto, o ponto **fica aberto**.

### Notificações

O Windows avisa toda vez que o ponto abre ou fecha, e também **quando o clique falha** —
esse é o aviso que importa, porque significa que o ponto pode ter ficado aberto.

Avisos repetidos são agrupados: quando o FiveM cai, o fechamento tenta 5 vezes, mas você
recebe um aviso só. Dá pra desligar tudo pelo menu da bandeja.

Se nenhuma notificação aparecer, verifique o **Assistente de Foco** do Windows e se
`auto-timesheet` está permitido em *Configurações → Sistema → Notificações*.

### Comportamento quando o jogo fecha

O monitor **nunca** encerra sozinho. Se o FiveM cair ou você fechar o jogo, ele fecha o
ponto (com até 5 tentativas) e volta a sondar `localhost:13172` indefinidamente, até o
jogo voltar. Aí ele reconecta e reabre o ponto se você estiver em serviço.

---

## Para quem vai desenvolver / gerar o instalador

```powershell
npm install
npm start            # roda em modo dev (Electron)
npm test             # regressão do detector (~2min, não toca no seu Discord)
npm run test:notif   # dispara os toasts pra conferir visualmente
npm run icons        # regenera assets/ e build/icon.ico
npm run dist         # gera dist/auto-timesheet-setup-x.y.z.exe (~78 MB)
```

### Publicar uma atualização

```powershell
npm version patch                       # 1.0.1 -> 1.0.2 (commit + tag)
$env:GH_TOKEN = gh auth token
npm run publish                         # compila e sobe pra GitHub Releases
gh release edit v1.0.2 --draft=false    # ← OBRIGATÓRIO
git push --follow-tags
```

⚠️ **O electron-builder publica como _draft_.** Draft é invisível para o
`electron-updater` — se você esquecer o `--draft=false`, ninguém recebe a
atualização e nenhum erro aparece. É a pegadinha mais fácil de cair aqui.

O auto-update só funciona **a partir da 1.0.1**, que foi a primeira versão a
embutir o updater. Quem estiver na 1.0.0 precisa reinstalar na mão uma vez.

### 🚨 NUNCA empacote a sua sessão do Discord

`user-data/` (perfil antigo do Playwright) e o `userData` do Electron
(`%APPDATA%\auto-timesheet`) contêm **os cookies de login da sua conta**. Se forem parar
no instalador, todo mundo que instalar vai bater ponto **na sua conta**.

Por isso o `build.files` do `package.json` é uma **allowlist** (`src/`, `assets/`,
`package.json`) e não uma lista de exclusões — o que não está listado não entra, mesmo
que apareça um arquivo novo na pasta amanhã.

Para conferir depois de qualquer mudança no build:

```powershell
node -e "const a=require('@electron/asar');const f=a.listPackage('dist/win-unpacked/resources/app.asar');console.log(f.filter(x=>/user-data|Cookies|Local Storage/i.test(x)).length===0?'OK: nada vazou':'VAZOU!')"
```

### Se o build falhar com "Cannot create symbolic link"

O electron-builder baixa o pacote `winCodeSign` (de onde sai o `rcedit.exe`, que grava o
ícone no .exe — ele é necessário mesmo sem assinatura de código). Esse pacote traz
symlinks do macOS, e o Windows exige privilégio especial pra criá-los.

Extraia o cache manualmente sem a pasta `darwin`:

```powershell
cd "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
& "<projeto>\node_modules\7zip-bin\win\x64\7za.exe" x <hash>.7z -o"winCodeSign-2.6.0" "-x!darwin" -y
```

Alternativa: ativar o **Modo Desenvolvedor** do Windows (Configurações → Privacidade e
segurança → Para desenvolvedores).

---

## Como funciona por dentro

- `src/core/detector.js` — o núcleo. Conecta via CDP na NUI do FiveM
  (`localhost:13172`), injeta um MutationObserver no iframe `metro-inventory` para ver o
  span "Polícia Capital", e em paralelo faz poll em `api.metropole.gg/.../character/data`
  usando o Bearer token capturado dos próprios requests do tablet. As duas fontes passam
  por um dedup comum. Não depende de Electron — dá pra testar com node puro.
- `src/discord.js` — usa o Chromium do próprio Electron (não Playwright) para logar e
  clicar nos botões. Sessão em `persist:discord`, dentro do userData de cada usuário.
- `src/main.js` — bandeja, menu, autostart e o ciclo de vida.

Configuração e logs de cada usuário ficam em `%APPDATA%\auto-timesheet\`.

Para testar o detector contra um FiveM falso, use a variável `AUTO_TIMESHEET_NUI_URL`
para apontar para outra porta.
