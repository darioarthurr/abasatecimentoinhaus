# Atualização 1.1.0 — Gestão de cartões de abastecimento

Esta atualização adiciona o controle financeiro de cartões ao Sistema de Gestão de Abastecimento Grupo GPS.

## O que foi incluído

- Dois cartões iniciais criados na migração: **Cartão 1 — R$ 1.500,00** e **Cartão 2 — R$ 5.500,00**.
- Saldo inicial registrado como movimentação de abertura no extrato.
- Seleção obrigatória do cartão utilizado em cada novo abastecimento.
- Exibição do saldo estimado do cartão no formulário, considerando abastecimentos ainda pendentes no aparelho.
- Débito automático do valor do abastecimento no servidor, com validação de saldo e proteção contra envio duplicado.
- Tela administrativa com saldo total, saldo individual, cartões ativos/inativos e extrato de movimentações.
- Cadastro de novos cartões, edição de identificação, quatro últimos dígitos, limite de alerta e status ativo.
- Registro de recargas com origem/justificativa obrigatória.
- Auditoria para cadastro, alteração e recarga de cartões.
- Ajuste do saldo e lançamento de crédito/débito compensatório quando o valor de um abastecimento é corrigido.
- Novas stores IndexedDB para cache local de cartões e movimentações; os stores existentes e a fila offline são preservados.

Os limites de alerta iniciais são R$ 300,00 para o Cartão 1 e R$ 1.100,00 para o Cartão 2. O administrador poderá editá-los na tela de cartões.

## Antes de atualizar

1. Abra o aplicativo atual em cada aparelho e toque em **Sincronizar**.
2. Confira se não há abastecimentos pendentes. Isso é especialmente importante para lançamentos feitos antes da seleção obrigatória do cartão.
3. Não limpe os dados do navegador, o cache do site ou o armazenamento do aplicativo. A atualização preserva o IndexedDB.

Se houver lançamento offline antigo ainda pendente, não o apague. Ele pode não ter a identificação do cartão, pois esse campo não existia na versão anterior. Mantenha-o no aparelho e trate-o antes de sincronizar a nova versão; não atribua um cartão por suposição.

## 1. Atualizar o Google Apps Script

1. Abra o projeto Apps Script associado à API atual.
2. Substitua integralmente o conteúdo de `Código.gs` pelo arquivo `backend/Code.gs` deste pacote.
3. Salve o projeto.
4. No seletor de funções, escolha **`setupCardManagement`** e clique em **Executar**.
5. Autorize o acesso à planilha, se solicitado.
6. Confirme na planilha a criação das abas `CARTOES` e `MOVIMENTACOES_CARTOES`, e as três colunas novas no final de `ABASTECIMENTOS`: `cartaoId`, `cartaoNome` e `movimentacaoCartaoId`.
7. A função cria os dois cartões iniciais somente se a aba `CARTOES` estiver vazia. Executá-la novamente não duplica os cartões já cadastrados.
8. Vá em **Implantar → Gerenciar implantações → Editar** a implantação atual, selecione **Nova versão** e clique em **Implantar**.

**Não execute novamente** `setupFleetSystem()` nem `bootstrapFirstAdmin()`. A migração de cartões é feita por `setupCardManagement()` e preserva as abas e os registros existentes.

## 2. Atualizar o GitHub Pages

Na raiz do repositório, substitua estes quatro arquivos pelos equivalentes deste pacote:

- `index.html`
- `app.js`
- `styles.css`
- `sw.js`

Mantenha sem alterações:

- `config.js` (contém o endereço da sua API);
- `manifest.webmanifest`;
- a pasta `assets/` e seus ícones.

Faça commit das alterações. O novo Service Worker usa o cache `gps-abastecimento-v1.1.0`. Ao abrir o PWA com internet, a atualização deverá ser detectada; também é possível usar **Verificar versão → Atualizar agora**.

## 3. Configurar os cartões

1. Entre no sistema com o perfil ADMIN.
2. Abra **Gestão → Cartões de abastecimento**.
3. Confira os saldos iniciais: R$ 1.500,00 e R$ 5.500,00.
4. Edite os nomes para identificar os cartões reais (por exemplo, nome da administradora ou unidade) e, opcionalmente, informe somente os quatro últimos dígitos.
5. Ajuste os limites de alerta conforme a política da operação.

Não informe nem armazene o número completo, CVV, senha ou outros dados sensíveis do cartão.

## 4. Operação diária

- No formulário **Novo abastecimento**, selecione o cartão usado.
- O app mostra o saldo estimado, descontando os lançamentos locais pendentes daquele aparelho.
- Ao sincronizar, o servidor confere o saldo real sob bloqueio de concorrência e realiza o débito financeiro.
- Se dois aparelhos estiverem offline e tentarem consumir o mesmo saldo, o servidor aceita somente os lançamentos cobertos pelo saldo disponível. Os demais continuam preservados no aparelho como pendentes de revisão; não são apagados.
- Para adicionar saldo, o ADMIN abre a tela de cartões e usa **Registrar recarga**, informando valor e justificativa.
- O extrato registra saldo anterior, valor e saldo posterior de cada movimentação.

## Teste recomendado

1. Confirmar no painel que os cartões aparecem com R$ 1.500,00 e R$ 5.500,00.
2. Em um aparelho de teste, fazer um abastecimento de R$ 100,00 usando Cartão 1.
3. Sincronizar e confirmar que o saldo do Cartão 1 passa para R$ 1.400,00.
4. Confirmar que o extrato registra o débito, placa, usuário e horário.
5. Registrar uma recarga de R$ 200,00 no Cartão 1 e confirmar saldo de R$ 1.600,00.
6. Testar também um abastecimento offline e sincronização posterior.

## Escopo e verificação

Os arquivos deste pacote foram verificados quanto à sintaxe JavaScript e à consistência das rotas e campos do módulo. A integração real depende da implantação na sua conta Google e publicação no GitHub Pages; por isso, conclua o teste recomendado antes de liberar para todos os usuários.
