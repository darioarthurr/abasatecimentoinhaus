# Sistema de Gestão de Abastecimento — Grupo GPS

**Versão-fonte 1.0.0** · PWA instalável + Google Apps Script + Google Sheets + Google Drive

Este pacote contém o frontend do aplicativo e o backend Google Apps Script. A interface foi estruturada como PWA para celular, com operação offline, armazenamento local no IndexedDB e sincronização com o Google quando a conexão estiver disponível.

> **Status da entrega:** código-fonte preparado e verificações estáticas concluídas. O sistema ainda precisa ser configurado na sua conta Google e publicado no repositório GitHub Pages. Não há planilha, pasta Drive ou URL de API conectada neste pacote.

## 1. Funcionalidades incluídas

- PWA instalável em Android e iOS, com cache dos arquivos da aplicação.
- Perfis **ADMIN** e **OPERACAO**. Ambos podem lançar abastecimentos.
- ADMIN: dashboard, histórico global, indicadores, cadastro de veículos e usuários, relatórios CSV e correção de registros sincronizados com justificativa e auditoria.
- OPERAÇÃO: lançamento e consulta dos próprios abastecimentos.
- Campos de lançamento: placa, KM, litros, combustível, data/hora, valor, posto, observações e marcação de tanque completo.
- Combustíveis disponíveis: Gasolina, Gasolina aditivada e Etanol.
- Fotos obrigatórias do odômetro e do comprovante; as imagens são comprimidas no celular antes do armazenamento.
- IndexedDB para cache de dados, rascunhos, fotos e fila offline (outbox).
- Identificador único por lançamento para evitar duplicidade no reenvio.
- Backend com autenticação, controle de perfil e validação de KM.
- Google Sheets para dados e Google Drive para evidências, organizadas por ano/mês.

## 2. Como interpretar os indicadores de consumo

O sistema calcula km/L por **ciclos de tanque completo**. Um abastecimento marcado como tanque completo inicia ou fecha um ciclo; os litros dos abastecimentos intermediários são somados ao volume do ciclo. A distância é a diferença entre o KM de dois abastecimentos completos.

Abastecimentos parciais são registrados normalmente, mas não geram isoladamente um km/L confiável. Se houver troca de combustível dentro do ciclo, o ciclo é sinalizado e excluído da média.

O alerta inicial de consumo baixo compara o resultado com o consumo esperado cadastrado para o veículo, usando 80% como limite. Esse alerta é apenas um indício para investigação, não prova de furto ou fraude. Deve ser avaliado em conjunto com rota, carga, trânsito, manutenção, combustível e documentos.

## 3. Arquivos do pacote

```text
Sistema_Gestao_Abastecimento_Grupo_GPS/
├── index.html
├── styles.css
├── app.js
├── config.js
├── sw.js
├── manifest.webmanifest
├── assets/
│   ├── icon.svg
│   ├── icon-192.png
│   └── icon-512.png
├── backend/
│   └── Code.gs
└── LEIA-ME.md
```

**Importante:** somente os arquivos da raiz do PWA e a pasta `assets/` vão para o repositório GitHub Pages. O arquivo `backend/Code.gs` deve ser copiado para um projeto separado no Google Apps Script; não é necessário publicá-lo no GitHub Pages.

## 4. Preparar o Google Apps Script

1. Entre em [script.google.com](https://script.google.com/) com a conta Google que será proprietária da planilha e das fotos.
2. Crie um projeto independente, por exemplo `GPS - Gestão de Abastecimento`.
3. Abra `backend/Code.gs` deste pacote, copie todo o conteúdo e cole no editor do Apps Script, substituindo o código inicial.
4. Salve o projeto.
5. No seletor de funções, execute `setupFleetSystem` e autorize os acessos solicitados ao Google Sheets e Google Drive. Essa função cria a planilha, as abas e uma pasta privada de evidências.
6. Em **Configurações do projeto → Propriedades do script**, crie estas três propriedades:
   - `FIRST_ADMIN_NAME` — nome do administrador inicial;
   - `FIRST_ADMIN_EMAIL` — e-mail de acesso do administrador;
   - `FIRST_ADMIN_PASSWORD` — senha inicial forte, com pelo menos 12 caracteres.
7. Execute `bootstrapFirstAdmin` uma única vez. A função cria a conta ADMIN, armazena o hash da senha com salt e remove as três propriedades temporárias.
8. Em **Implantar → Nova implantação → Aplicativo da Web**, configure:
   - Executar como: **Eu** (proprietário do script);
   - Quem pode acessar: **Qualquer pessoa**, caso a política do Google Workspace permita.
9. Conclua a implantação e copie a URL terminada em `/exec`.

O endpoint da API precisa receber chamadas do PWA hospedado no GitHub Pages. O acesso aos dados, contudo, é protegido pela autenticação interna e pelas permissões verificadas no servidor. Não compartilhe publicamente a planilha ou a pasta de evidências. Para uma implantação corporativa, valide com o administrador Google Workspace se a política permite o tipo de implantação necessário.

## 5. Configurar o PWA e publicar no GitHub Pages

1. Abra `config.js` e preencha `API_URL` com a URL `/exec` gerada no passo anterior:

```js
window.APP_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/SEU_ID_DE_IMPLANTACAO/exec',
  VERSION: '1.0.0',
  APP_NAME: 'Controle de Abastecimento'
};
```

2. No repositório GitHub que será usado para o abastecimento, copie **os arquivos da raiz deste pacote** (`index.html`, `styles.css`, `app.js`, `config.js`, `sw.js`, `manifest.webmanifest`) e a pasta `assets/` para a raiz do repositório.
3. Não copie `backend/Code.gs` para o repositório Pages. O backend fica no editor do Apps Script.
4. No GitHub, abra **Settings → Pages** e publique a branch principal usando a pasta `/root` (ou a configuração equivalente ao seu repositório).
5. Abra a URL do GitHub Pages, entre com a conta ADMIN criada e cadastre primeiro os veículos. Em seguida, cadastre os usuários de operação.
6. Instale o aplicativo pelo menu do navegador do celular. O primeiro login e a primeira carga da lista de veículos exigem internet.

## 6. Abas criadas no Google Sheets

| Aba | Conteúdo |
|---|---|
| `VEICULOS` | Placa, marca/modelo, capacidade do tanque, consumo esperado, centro de custo, KM de referência e status. |
| `USUARIOS` | Nome, e-mail, perfil, salt/hash da senha, status e datas. |
| `ABASTECIMENTOS` | Dados do abastecimento, métricas, identificadores e links das fotos, alertas e versão do registro. |
| `AUDITORIA` | Usuário, data, motivo, dados anteriores e dados corrigidos. |
| `INSTRUCOES` | Links e informações da configuração inicial. |

## 7. Matriz de permissões

| Recurso | ADMIN | OPERACAO |
|---|:---:|:---:|
| Lançar abastecimento | Sim | Sim |
| Anexar fotos | Sim | Sim |
| Trabalhar offline após login autorizado e dados carregados | Sim | Sim |
| Consultar histórico global | Sim | Não |
| Consultar próprios lançamentos | Sim | Sim |
| Cadastrar veículos e usuários | Sim | Não |
| Dashboard e relatórios gerenciais | Sim | Não |
| Corrigir registro sincronizado com justificativa | Sim | Não |

## 8. Teste-piloto obrigatório antes de liberar para toda a equipe

Execute com 2 ou 3 veículos e pelo menos 2 celulares:

1. Faça um lançamento online e confira a linha criada na planilha e as duas fotos na pasta do Drive.
2. Ative o modo avião, faça outro lançamento e confirme que aparece como pendente no aparelho.
3. Reative a internet e confira que o lançamento sincroniza uma única vez.
4. Tente lançar KM inferior ao último registro do veículo e verifique o bloqueio.
5. Registre um tanque completo, alguns abastecimentos parciais e outro tanque completo; confira litros acumulados, distância e km/L.
6. Acesse com um usuário OPERAÇÃO e confirme que não consegue abrir módulos administrativos ou consultar lançamentos de outros usuários.
7. Corrija um registro com ADMIN e confira a justificativa na aba `AUDITORIA`.
8. Teste câmera, instalação, comportamento offline e visualização das fotos nos aparelhos reais da equipe.

## 9. Observações técnicas e limites conhecidos

- **Não publicado ainda:** a implantação no GitHub e a autorização do Google Apps Script precisam ser feitas na sua conta. `config.js` vem intencionalmente com `API_URL` vazia.
- **Validação pendente em ambiente real:** sintaxe dos arquivos verificada localmente, mas o fluxo completo depende da configuração e das permissões da sua conta Google e deve passar pelo piloto acima.
- **Fotos no Drive:** a pasta é criada como privada. O proprietário do Apps Script terá acesso. Para os administradores abrirem os links diretamente no Drive, conceda acesso apropriado à pasta ou configure uma política de Drive compartilhado. Não torne a pasta pública.
- **Offline:** o navegador pode encerrar o PWA ou limpar dados locais por decisão do sistema. O rascunho e a fila ajudam a preservar lançamentos, mas não substituem a sincronização; reconecte o aparelho assim que possível.
- **Retorno e atualização por gesto:** o app tenta impedir a saída acidental durante o lançamento e o gesto de atualização para baixo enquanto a tela está no topo. Navegadores e sistemas operacionais ainda podem impor comportamentos próprios; o rascunho persistente é a proteção principal contra perda.
- **Escala:** a sincronização inicial carrega até 2.500 registros recentes para ADMIN e até 150 registros próprios para OPERAÇÃO. Para volume maior, recomenda-se paginação por período/placa e arquivamento anual.
- **Segurança operacional:** use senhas individuais, não compartilhe contas e remova usuários que deixarem de atuar na operação. A URL do Web App é pública por desenho; todas as ações de dados exigem sessão válida e autorização no backend.

## 10. Referências técnicas

- [Google Apps Script — Web Apps](https://developers.google.com/apps-script/guides/web)
- [Google Apps Script — HTML Service: X-Frame Options](https://developers.google.com/apps-script/reference/html/x-frame-options-mode)
- [MDN — IndexedDB](https://developer.mozilla.org/docs/Web/API/IndexedDB_API)
- [MDN — Progressive Web Apps](https://developer.mozilla.org/docs/Web/Progressive_web_apps)
