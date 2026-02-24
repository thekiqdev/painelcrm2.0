# PWA — Instalar no Windows (e outros dispositivos)

O PainelCRM pode ser instalado como aplicativo no Windows, no celular ou em outros dispositivos sem gerar um .exe separado.

## O que foi configurado

- **`public/manifest.json`** — Nome do app (PainelCRM), ícones 192×192 e 512×512, abertura em janela própria (`standalone`), cores do tema.
- **`public/icons/`** — Ícones PNG do logo para o menu Iniciar e atalhos.
- **`index.html`** — Link para o manifest e meta `theme-color`.

## Como o usuário instala (Windows)

1. Abrir o site no **Chrome** ou **Edge** (ex.: https://beta.painelcrm.com).
2. Clicar no ícone **“Instalar”** na barra de endereço (ou em ⋮ → “Instalar PainelCRM” / “Aplicativo disponível”).
3. Confirmar. O atalho aparece no **Menu Iniciar** e, se escolhido, na **área de trabalho**.

O app abre em janela própria, sem barra de endereço do navegador.

## Requisitos

- Site em **HTTPS** (obrigatório para PWA).
- Manifest e ícones servidos no mesmo domínio (ex.: `/manifest.json`, `/icons/icon-192.png`).

## Testar localmente

1. Fazer build e servir com HTTPS (ou usar `npm run dev` e acessar por `https://localhost` se configurado).
2. No Chrome: **F12** → aba **Application** → **Manifest**. Conferir se o manifest aparece e se os ícones carregam.
3. O botão “Instalar” só aparece se o Chrome considerar o app instalável (HTTPS + manifest válido + ícones).

## Service Worker (opcional)

Para cache e uso offline, é possível adicionar depois um Service Worker (ex.: Workbox). Não é obrigatório para o “Instalar no Windows” funcionar.
