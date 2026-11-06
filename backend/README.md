# Backend PushinPay

Este backend mantém o token PushinPay fora do navegador e expõe os endpoints usados pelo checkout:

- `POST /api/payments/pix`: cria uma cobrança Pix.
- `GET /api/payments/pix/:id`: consulta o status da cobrança.
- `POST /api/payments/pix/webhook`: recebe notificações da PushinPay.

## Configuração

```bash
export PUSHINPAY_TOKEN="seu_token_aqui"
export PUBLIC_BASE_URL="https://api.seudominio.com"
node backend/pushinpay-server.js
```

O frontend chama `/api/payments/pix` na mesma origem. Em produção, faça o proxy desse caminho para este backend ou hospede o backend junto da aplicação. Nunca coloque `PUSHINPAY_TOKEN` em `matricula.js`, HTML ou no repositório.

A API PushinPay recebe valores em centavos. O backend converte os valores em reais enviados pelo checkout para centavos antes de criar a cobrança.
