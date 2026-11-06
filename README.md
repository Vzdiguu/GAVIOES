# Academia Gaviões

Site institucional da Academia Gaviões 24h com checkout Pix PushinPay servido pela mesma aplicação.

## Estrutura

- `index.html` e `home.css`: página inicial.
- `unidades.html`, `units.js` e `units.css`: diretório e busca de unidades.
- `unidades/item/`: páginas individuais das unidades, com rotas limpas.
- `agenda.js` e `agenda-data.js`: renderização local das grades de aulas.
- `matricula.html`, `matricula.js` e `matricula.css`: fluxo de matrícula e checkout.
- `modalidades/` e `sobre-nos/`: páginas institucionais e de modalidades.
- `server.js`: servidor único de arquivos estáticos, proxy de unidades e API Pix.
- `assets/brand/gavioes-share.webp`: imagem Open Graph para preview de links em WhatsApp e redes sociais.

## Desenvolvimento e produção

Requer Node.js 18 ou mais recente:

```bash
npm start
```

Depois, acesse `http://localhost:3000`. O servidor usa `PORT` quando a hospedagem fornece essa variável.

Para desenvolvimento com recarga automática:

```bash
npm run dev
```

## Pix PushinPay

O frontend chama a mesma origem em:

- `POST /api/payments/pix`: cria uma cobrança Pix.
- `GET /api/payments/pix/:id`: consulta o status da cobrança.
- `POST /api/payments/pix/webhook`: recebe notificações da PushinPay.

Configure o token somente no ambiente do servidor. Nunca coloque `PUSHINPAY_TOKEN` em `matricula.js`, HTML ou no repositório:

```bash
PUSHINPAY_TOKEN=seu_token_aqui
PUSHINPAY_API_URL=https://api.pushinpay.com.br
PUBLIC_BASE_URL=https://seu-dominio.com
PORT=3000
```

`PUBLIC_BASE_URL` deve ser a URL pública do mesmo servidor para que a PushinPay consiga chamar `/api/payments/pix/webhook`. Em hospedagens como Render, o comando de inicialização é `npm start`.

## Outras APIs no mesmo servidor

- `POST /api/locations`: proxy restrito para a busca oficial de unidades.
- `POST /api/capture-agenda`: captura local usada pelas ferramentas de agenda.

As grades de aulas armazenadas localmente são snapshots da programação oficial e podem ser atualizadas quando a unidade alterar seus horários.

## Painel administrativo PWA
O frontend do painel fica em `painel/` e pode ser servido em `/painel/`. Ele inclui manifesto, service worker, ícones e cadastro/cancelamento de inscrição Web Push. O contrato das rotas esperadas pelo frontend está em `painel/BACKEND-PUSH-CONTRACT.md`.

**Ainda não está pronto para produção com push:** este repositório atualmente não implementa autenticação do painel, persistência das inscrições ou envio Web Push; isso precisa ser implementado no backend antes de ativar a funcionalidade. A produção também exige HTTPS e armazenamento durável das inscrições.
