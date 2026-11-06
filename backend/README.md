# Backend Pix PushinPay (referência legada)

A API Pix agora está integrada ao servidor único da raiz em `server.js`, que também entrega o site. Use apenas:

```bash
npm start
```

O servidor único expõe:

- `POST /api/payments/pix`: cria uma cobrança Pix.
- `GET /api/payments/pix/:id`: consulta o status da cobrança.
- `POST /api/payments/pix/webhook`: recebe notificações da PushinPay.

Configure `PUSHINPAY_TOKEN`, `PUSHINPAY_API_URL`, `PUBLIC_BASE_URL` e `PORT` no ambiente da hospedagem, nunca no navegador ou em arquivos versionados. O arquivo `pushinpay-server.js` permanece apenas como referência da implementação original; não o use como comando de inicialização em produção, pois ele sobe uma segunda porta.
