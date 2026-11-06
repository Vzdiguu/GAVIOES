# Contrato de backend — Web Push do Painel Gaviões

O frontend é um PWA estático, mas notificações mesmo com o painel fechado dependem de um backend real que receba eventos de pedidos e envie Web Push. O backend deve manter a inscrição no escopo do usuário administrador autenticado. Não armazene dados de aluno dentro do payload da notificação.

## Rotas same-origin esperadas

Todas as rotas abaixo devem exigir a sessão de administrador existente (`credentials: same-origin`). A resposta JSON deve definir `Content-Type: application/json` e evitar cache (`Cache-Control: no-store`).

- `GET /api/admin/push/vapid-public-key` → `{ "publicKey": "<VAPID public key base64url>" }`. A chave pública pode ser exposta somente a administradores autenticados; a privada nunca pode ir ao frontend.
- `POST /api/admin/push/subscriptions` com `{ "action": "subscribe", "subscription": { "endpoint": "https://…", "keys": { "p256dh": "…", "auth": "…" } } }` → valida e persiste a inscrição associada ao administrador atual. Torne a operação idempotente por endpoint.
- `POST /api/admin/push/subscriptions` com `{ "action": "unsubscribe", "endpoint": "https://…" }` → remove apenas a inscrição pertencente ao administrador atual.

Ao criar uma inscrição, valide esquema e tamanho, aceite somente HTTPS em `endpoint`, aplique limites por usuário/IP e nunca considere o endpoint informado pelo cliente confiável para SSRF: as chamadas de envio devem usar uma biblioteca Web Push mantida, validar resposta e não aceitar endpoints arbitrários em rotas de proxy.

## Eventos que devem gerar push

Envie push no servidor, não no navegador:

1. Quando um novo Pix/pedido for criado: tipo `new_order`.
2. Quando um pedido mudar pela primeira vez para `paid`: tipo `payment_confirmed`.

Use o mesmo ponto de origem onde o backend grava/broadcasta os eventos. Não envie ao recarregar o histórico, em reconciliações sem mudança ou em atualizações de observação/contato. Faça deduplicação/idempotência por ID do evento/pedido + transição de estado. Se o provedor responder `404` ou `410`, exclua a inscrição expirada.

Payload recomendado, deliberadamente sem CPF, telefone, e-mail, nome completo ou dados de pagamento:

```json
{
  "eventId": "order-id:event-type",
  "type": "new_order",
  "title": "Novo Pix gerado",
  "body": "Uma nova matrícula aguarda no painel.",
  "url": "/painel/#matriculas",
  "tag": "order-id:new_order"
}
```

Para pagamento confirmado, use título `Pagamento confirmado`, texto genérico sem dados pessoais e URL `/painel/#matriculas`. O service worker só abre URLs da mesma origem.

## Variáveis de ambiente

O servidor existente já usa `PUSHINPAY_TOKEN` (obrigatória para pagamentos reais), `PUBLIC_BASE_URL` (URL HTTPS pública para webhooks), `PUSHINPAY_API_URL` (opcional; padrão `https://api.pushinpay.com.br`) e `PORT` (opcional; padrão 3000).

Quando você adicionar o backend administrativo e de push, configure `ADMIN_PASSWORD` para o acesso ao painel e estas variáveis para Web Push: `VAPID_PUBLIC_KEY` (a API autenticada devolve o valor), `VAPID_PRIVATE_KEY` (segredo apenas do servidor) e `VAPID_SUBJECT` (contato VAPID válido, como `mailto:ops@seudominio.com`). `ADMIN_SECRET` é opcional se usar o modelo de assinatura de sessão do `admin.js` que veio no RAR. O repositório atual ainda não consome essas novas variáveis porque as rotas administrativas/push não foram implementadas. As inscrições precisam ser guardadas em banco ou armazenamento persistente, não dependem de uma variável de ambiente específica.

## Requisitos operacionais e de segurança

- Gere o par VAPID no backend e configure contato VAPID válido. Guarde a chave privada em secret manager/variável de ambiente; não a versione nem a coloque em `pwa-config.js`, HTML ou logs.
- Persista inscrições em armazenamento durável. Não dependa apenas da memória do processo ou do disco efêmero do container.
- Associe cada inscrição ao administrador autenticado e remova-a ao desativar; proteja POST contra CSRF conforme a política de sessão do seu backend.
- A permissão do navegador só pode ser solicitada após clique do usuário, como implementado. Push requer origem HTTPS pública (localhost é exceção de desenvolvimento) e suporte do navegador/SO.
- O service worker está em `/painel/sw.js` com escopo `/painel/`; mantenha-o acessível sem autenticação, MIME `application/javascript`, TLS e cabeçalho de cache que permita atualizar a versão.
- Não envie notificações com CPF, telefone, e-mail, valor, nome ou outras informações pessoais. O usuário verá notificações no ecrã bloqueado.
- A inscrição push do browser não é prova de autenticação. As rotas de gestão e a operação de envio devem estar protegidas no servidor.

O frontend já usa esses endpoints. Se o backend tiver rotas diferentes, altere `PUSH_KEY_URL` e `PUSH_SUBSCRIPTIONS_URL` no JavaScript do `index.html`.

## Publicação no repositório GAVIOES

O frontend foi instalado sob `/painel/`; o service worker tem escopo restrito a esse caminho. As APIs de administração continuam same-origin em `/api/admin/...`, fora do service worker. O servidor Node atual precisa devolver `application/manifest+json` para `.webmanifest` e ser servido sob HTTPS no domínio final. Este repositório ainda não contém as rotas de login administrativo ou de gestão/envio de inscrições push.
