# Update QTECNICO — segurança + storage de fotos + planos

## Como aplicar

A estrutura de pastas dentro deste zip é igual à do repositório. Descompacte
e copie cada arquivo por cima do original, mantendo o mesmo caminho:

```
server/index.ts                            → substitui
server/auth.ts                             → substitui
server/storage.ts                          → NOVO
server/plans.ts                            → NOVO
server/planLimits.ts                       → NOVO
server/routes/orders.ts                    → substitui
server/routes/users.ts                     → substitui
server/routes/uploads.ts                   → NOVO
server/routes/account.ts                   → NOVO
server/scripts/migrate-photos-to-storage.ts → NOVO
src/app/types.ts                           → substitui
src/app/api.ts                             → substitui
src/app/App.tsx                            → substitui
package.json                               → substitui
.env.example                               → NOVO
```

Se estiver no terminal, dentro da pasta raiz do projeto:

```bash
unzip qtecnico-update.zip -d /tmp/qtecnico-update
cp -r /tmp/qtecnico-update/* .
```

## Depois de copiar

```bash
npm install
```

Configure as variáveis de ambiente (ver `.env.example`), especialmente:
- `JWT_SECRET` — agora obrigatória, o servidor não sobe sem ela.
- `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_BUCKET_NAME`
  — necessárias pro upload de fotos funcionar (crie o bucket **privado** no Backblaze B2 antes).

Se já existirem fotos salvas em base64 no banco, rode uma vez:

```bash
npm run migrate:photos
```

## Commit

```bash
git add .
git commit -m "fix: corrige IDOR em orders, remove JWT secret hardcoded, migra fotos para bucket privado e adiciona planos"
git push
```

## O que mudou (resumo)

- **Segurança**: `JWT_SECRET` obrigatória (sem fallback fraco); corrigido IDOR em
  `PUT /orders/:id` que permitia alterar despesas/pagamentos/atendimentos de
  ordens de outro usuário; seed do usuário inicial não usa mais senha fixa `123456`.
- **Fotos**: fotos de atendimento, assinatura do cliente e foto de perfil deixam
  de ser salvas como base64 no Postgres e passam a ser enviadas via upload para
  um **bucket privado** S3-compatible (Backblaze B2 por padrão, sem exigir
  cartão de crédito — funciona também com Cloudflare R2, Supabase Storage, etc.,
  só trocando as variáveis `STORAGE_*`). Como o bucket é privado, não existe URL
  pública fixa: o app guarda no banco a *chave* do objeto e o backend gera uma
  URL assinada, válida por 1 hora, toda vez que uma ordem é carregada. Antes
  dessa mudança, a captura de assinatura do cliente (`SignaturePad`) ainda
  gravava base64 puro direto no banco sem passar pelo upload — isso também foi
  corrigido, agora ela sobe pro bucket como as demais fotos.
- **Planos**: 4 planos definidos em `server/plans.ts` (free/entry/medium/power)
  com limites (ordens/mês, fotos/atendimento, usuários) e features
  (relatórios, PDF, notificações, multiusuário, API, white-label). Toda conta
  existente é migrada automaticamente para uma `account` própria no plano
  `power` (sem limites) — ajuste `plan_key` na tabela `accounts` no banco se
  quiser testar os limites de um plano menor. Limite de ordens/mês é aplicado
  em `POST /orders`; limite de fotos por atendimento em `PUT /orders/:id`.
  Endpoint `GET /api/account` retorna plano, limites, features e uso atual —
  use no frontend para mostrar "12/15 ordens este mês" e desabilitar botões
  quando o limite for atingido.

## Próximos passos sugeridos (não incluídos neste pacote)

- Multiusuário de verdade (planos Médio/Power): hoje a tabela `accounts` já
  existe, mas `orders`/`clients` ainda são vinculados a `user_id` individual,
  não a `account_id`. Pra vários técnicos verem as mesmas ordens, essas
  tabelas precisam ganhar `account_id` e as rotas precisam ser ajustadas —
  é uma mudança maior, melhor fazer como próxima etapa isolada.
- Gateway de pagamento (Mercado Pago) para upgrade/downgrade de plano de
  verdade, hoje o `plan_key` só muda manualmente no banco.
- UI no frontend mostrando plano atual, uso e um botão de upgrade quando a
  API retornar erro `PLAN_LIMIT_ORDERS`/`PLAN_LIMIT_PHOTOS`/`PLAN_LIMIT_FEATURE`.

