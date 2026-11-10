# Atualização 1.0.2 — Atualizador do PWA

Esta atualização adiciona:
- Botão **Verificar versão** no cabeçalho do aplicativo.
- Verificação automática ao iniciar e quando o app volta ao primeiro plano.
- Aviso **Nova versão disponível** quando o novo Service Worker termina de baixar.
- Botão **Atualizar agora**, que ativa a nova versão e recarrega o app.
- Atualizações aguardam a ação do usuário (não interrompem uma operação no meio).
- Registros, rascunhos e fotos locais em IndexedDB não são apagados pela atualização.

## Arquivos para substituir no GitHub

Substitua na raiz do repositório:
- `index.html`
- `styles.css`
- `app.js`
- `sw.js`

Mantenha o seu `config.js` atual, com a URL correta do Apps Script. Mantenha também `manifest.webmanifest` e a pasta `assets/` existentes.

## Publicação de futuras versões

1. Faça as alterações normais no projeto.
2. A cada publicação, altere a versão do cache no início de `sw.js`. Exemplo: `gps-abastecimento-v1.0.3`.
3. Atualize também o comentário de versão no início de `app.js` (apenas controle interno).
4. Faça commit/push no GitHub Pages.
5. Quando a nova versão estiver publicada, os celulares verificarão automaticamente ao abrir/retornar ao app. A equipe também pode tocar em **Verificar versão**.
6. Quando o download terminar, aparecerá **Nova versão disponível**. A pessoa toca em **Atualizar agora** para aplicar.

O registro do Service Worker usa `updateViaCache: 'none'` para evitar que o navegador reutilize uma cópia antiga do próprio `sw.js` durante a verificação.

## Observação importante

A atualização substitui os arquivos em cache do PWA, mas não apaga o banco IndexedDB (`GPSAbastecimentoDB`). Assim, abastecimentos, rascunhos e fila offline permanecem no dispositivo. Antes de atualizações grandes, continue recomendando que a equipe sincronize os registros pendentes quando houver conexão.

Esta entrega é uma atualização de frontend/PWA. Não exige alteração no Google Apps Script nem nova implantação do backend.
