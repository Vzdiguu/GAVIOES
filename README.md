# Academia Gaviões

Site institucional estático da Academia Gaviões 24h.

## Estrutura

- `index.html` e `home.css`: página inicial.
- `unidades.html`, `units.js` e `units.css`: diretório e busca de unidades.
- `unidades/item/`: páginas individuais das unidades, com rotas limpas.
- `agenda.js` e `agenda-data.js`: renderização local das grades de aulas.
- `matricula.html`, `matricula.js` e `matricula.css`: fluxo de matrícula.
- `modalidades/` e `sobre-nos/`: páginas institucionais e de modalidades.
- `serve_temp.py`: servidor local de desenvolvimento com suporte a rotas limpas e proxy de localização.
- `assets/brand/gavioes-share.webp`: imagem Open Graph para preview de links em WhatsApp e redes sociais.
- `backend/`: referência de backend seguro para criar cobranças Pix pela PushinPay sem expor o token no navegador.

## Desenvolvimento local

```bash
python3 serve_temp.py
```

Depois, acesse `http://localhost:3000`.

## Pix PushinPay

O checkout chama `POST /api/payments/pix` no backend e exibe o QR Code e o código copia-e-cola retornados pela PushinPay. A implementação de referência está em `backend/pushinpay-server.js`; configure o token apenas por variável de ambiente, seguindo `backend/.env.example`.

## Observações

As grades de aulas armazenadas localmente são snapshots da programação oficial e podem ser atualizadas quando a unidade alterar seus horários.
