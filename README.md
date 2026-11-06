# Academia Gaviões

Site institucional da Academia Gaviões 24h com checkout Pix PushinPay, painel administrativo e PWA de notificações, servidos pela mesma aplicação Node.

## Estrutura

- `index.html` e `home.css`: página inicial.
- `unidades.html`, `units.js` e `units.css`: diretório e busca de unidades.
- `unidades/item/`: páginas individuais das unidades, com rotas limpas.
- `agenda.js` e `agenda-data.js`: renderização local das grades de aulas.
- `matricula.html`, `matricula.js` e `matricula.css`: fluxo de matrícula e checkout.
- `painel/`: interface administrativa PWA, manifesto, service worker e ícones.
- `server.js`: servidor HTTP, arquivos públicos e encaminhamento de APIs.
- `payment-api.js`: cobrança Pix, validação de pedido e sincronização do status com a PushinPay.
- `admin-api.js`: autenticação, pedidos, exportação, SSE e Web Push.
- `database.js` e `admin-schema.sql`: PostgreSQL e criação idempotente das tabelas administrativas.
- `payment-rules.js`: preços aceitos pelo servidor e validações compartilhadas.

## Desenvolvimento e produção

Requer Node.js 18 ou mais recente:

```bash
npm install
npm start
```

Acesse `http://localhost:3000`. O servidor usa `PORT` quando a hospedagem fornece essa variável. Os testes locais podem ser executados com `npm test`.

No Render, configure o serviço Node para iniciar com `npm start` e vincule o banco PostgreSQL para fornecer `DATABASE_URL`. Na inicialização, o servidor conecta ao banco e aplica o esquema administrativo. Se `DATABASE_URL` estiver definido mas a conexão ou a criação das tabelas falhar, o processo não inicia, para que o deploy não publique um painel sem banco.

## Variáveis de ambiente

Configure os valores em **Render → serviço do site → Environment**; nunca os versione:

- `DATABASE_URL`: URL do PostgreSQL do Render.
- `ADMIN_PASSWORD`: senha forte para `/painel/`. As sessões são HttpOnly, same-site, expiram em 8 horas e podem ser revogadas no logout.
- `PUSHINPAY_TOKEN`: token Bearer da API PushinPay.
- `PUSHINPAY_API_URL`: opcional; padrão `https://api.pushinpay.com.br`. Não use `https://app.pushinpay.com.br`, que é o portal web da conta, não a API.
- `PUBLIC_BASE_URL`: domínio HTTPS público do próprio site; a PushinPay usa `/api/payments/pix/webhook` para avisar mudanças.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT`: par/chave e contato usados para Web Push. A chave privada fica apenas no ambiente do servidor.
- `PORT`: fornecida automaticamente pelo Render; padrão local 3000.
- `PGSSLMODE`: opcional, configure `require` somente se a conexão do PostgreSQL exigir TLS.

O arquivo `.env.example` lista os nomes, sem conter credenciais reais.

## Pix e limites atuais do checkout

O servidor determina o valor a partir do plano escolhido e ignora valores enviados pelo navegador. Os dados do pedido só são gravados depois que o plano, CPF, contato e aceite do termo são validados. O webhook não é tratado como prova de pagamento: o servidor consulta novamente a transação na PushinPay antes de marcar o pedido como pago.

O checkout hoje gera **uma cobrança Pix avulsa** e não processa renovações mensais automáticas. O botão de cartão fica desabilitado porque não há integração de cartão ativa. Os textos comerciais/contratuais de mensalidade recorrente precisam ser alinhados com o fluxo de cobrança antes de anunciar renovação automática ou considerar essa parte completamente pronta para produção.

## Painel administrativo PWA

Abra `/painel/`. O HTML da página pode ser público, mas todas as rotas administrativas exigem sessão válida: login, listagem, exportação CSV, atualizações, exclusão de pedidos não pagos, stream SSE e gestão das inscrições push. O login usa `ADMIN_PASSWORD` e persiste sessões e tentativas de acesso no PostgreSQL. As inscrições Web Push são guardadas no banco e o servidor envia avisos genéricos sem dados de alunos. Requer HTTPS para instalação PWA e notificações push.

## Rotas no servidor

- `POST /api/payments/pix`: valida o pedido e cria uma cobrança Pix.
- `GET /api/payments/pix/:id`: consulta status da cobrança cadastrada.
- `POST /api/payments/pix/webhook`: recebe o aviso e confirma o estado consultando a API da PushinPay.
- `POST /api/admin/login` e `/api/admin/logout`: login/logout do painel.
- `/api/admin/orders`, `/api/admin/stream`, `/api/admin/export.csv` e `/api/admin/push/...`: APIs protegidas do painel.
- `POST /api/locations`: proxy restrito para a busca oficial de unidades.

Arquivos internos de servidor, dependências, arquivos de ambiente e esquema SQL não são servidos como arquivos estáticos.

A rota auxiliar `POST /api/capture-agenda` fica desativada por padrão. Só habilite `ENABLE_AGENDA_CAPTURE=true` em um ambiente local isolado; não ative no serviço público.
