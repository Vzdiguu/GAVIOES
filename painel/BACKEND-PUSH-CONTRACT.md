# Backend de produção do Painel Gaviões

O painel é servido em `/painel/` pelo mesmo servidor Node do site. A página pode ser carregada publicamente, mas as APIs administrativas exigem uma sessão autenticada. O serviço usa PostgreSQL persistente, fornecido pelo Render por `DATABASE_URL`.

## APIs administrativas

- `POST /api/admin/login` recebe `{ "password": "..." }`, compara com `ADMIN_PASSWORD` em tempo constante, limita tentativas e cria uma sessão aleatória persistida no PostgreSQL.
- `POST /api/admin/logout` revoga a sessão e limpa o cookie.
- `GET /api/admin/orders` lista matrículas, sem pedidos ainda em estado intermediário de criação.
- `GET /api/admin/stream` envia eventos SSE para usuários autenticados.
- `GET /api/admin/export.csv` exporta CSV com autenticação e proteção contra fórmulas em planilhas.
- `POST /api/admin/orders/:id` atualiza contato/observação; `POST /api/admin/orders/:id/delete` exclui pedidos não pagos. O painel não pode apagar pedidos pagos.
- `GET /api/admin/push/vapid-public-key` entrega a chave pública VAPID somente após login.
- `POST /api/admin/push/subscriptions` cria ou remove inscrições Push autenticadas.

O cookie de sessão é `HttpOnly`, `SameSite=Lax`, `Secure` em HTTPS, expira em oito horas e é validado contra o banco. Solicitações de alteração verificam a origem same-origin. `ADMIN_PASSWORD` e a chave privada VAPID não são enviados ao navegador.

## Web Push

As inscrições são persistidas na tabela `admin_push_subscriptions`. Push é enviado pelo servidor quando um novo Pix é criado e quando o status passa pela primeira vez para `paid`. O payload contém apenas um aviso genérico, sem nome, CPF, e-mail, telefone ou valor. Endpoints que respondem `404` ou `410` são removidos. O servidor aceita somente domínios conhecidos de push por HTTPS para reduzir risco de SSRF.

Configure estas variáveis no Render para habilitar push: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` (por exemplo, `mailto:admin@seudominio.com`). As notificações exigem HTTPS público, permissão concedida pelo usuário e suporte do navegador/SO.

## Pedidos e pagamentos Pix

`POST /api/payments/pix` só aceita Pix, exige aceite da revisão e do termo, valida CPF/contato e calcula o preço usando o ID do plano no servidor. Os pedidos e inscrições push ficam no PostgreSQL. O navegador não escolhe o valor da cobrança.

`POST /api/payments/pix/webhook` trata o corpo como aviso não confiável. Para atualizar o status, o servidor consulta a transação diretamente na PushinPay e confere ID/valor. `GET /api/payments/pix/:id` também consulta o provedor, com intervalo mínimo entre chamadas automáticas para evitar excesso de requisições.

O checkout implementado gera uma cobrança Pix avulsa; cartão está desativado. O código atual não executa renovações mensais automáticas. Os textos comerciais/contratuais que falam em cobrança recorrente precisam ser alinhados com a operação da academia antes de anunciar ou considerar a recorrência pronta para produção.

## Variáveis do Render

- `DATABASE_URL`: URL de conexão do PostgreSQL Render.
- `ADMIN_PASSWORD`: senha forte do painel.
- `PUSHINPAY_TOKEN`: token Bearer da API PushinPay.
- `PUSHINPAY_API_URL`: opcional; padrão `https://api.pushinpay.com.br`. `https://app.pushinpay.com.br` é o portal de acesso, não o host da API.
- `PUBLIC_BASE_URL`: domínio público HTTPS do site usado para compor o endpoint do webhook.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`: credenciais Web Push.
- `PORT`: fornecido pela hospedagem.

O arquivo `admin-schema.sql` cria as tabelas e índices de forma idempotente na inicialização. A conta de banco deve permitir criar tabelas e índices. Não versione `.env` nem credenciais.

## Escopo do service worker

O service worker permanece em `/painel/sw.js`, com escopo `/painel/`. O manifesto, os ícones e a página offline são públicos e servidos por HTTPS. Arquivos internos de servidor, dependências e ambiente não são expostos como arquivos estáticos.
