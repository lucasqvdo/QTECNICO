# Cartões e faturas (v1)

Acesse **Financeiro → Cartões de crédito**, cadastre nome/apelido, últimos quatro dígitos, fechamento e vencimento. Selecione a competência para criar ou abrir uma fatura. Adicione, edite ou remova compras com data, descrição, categoria e valor. A linha em **Contas a pagar** abre o mesmo detalhamento.

A competência representa o **mês do vencimento**. O fechamento ocorre antes do vencimento (no mês anterior quando necessário). Dias inexistentes são ajustados ao último dia do mês. Alterações no cartão afetam as datas de novas faturas; as existentes preservam suas datas. Faturas são criadas sob demanda; não há geração de meses futuros vazios.

## Integridade financeira

- Uma combinação empresa/cartão/competência possui uma fatura e uma única linha em `company_expenses`. Os itens não são despesas adicionais nem custos de OS.
- A criação da fatura e da despesa é atômica; repetir a criação da competência retorna a mesma fatura. A criação bloqueia a linha do cartão para serializar chamadas concorrentes.
- Inclusão, edição e remoção de itens bloqueiam a fatura e a despesa, somam valores `NUMERIC` no PostgreSQL e atualizam o total na mesma transação. Falhas revertem também os itens.
- A despesa de uma fatura vazia pode valer zero. Despesas comuns continuam exigindo valor positivo. As rotas genéricas não permitem editar ou excluir a despesa vinculada à fatura.
- O pagamento é registrado no detalhe, preservando data e status na despesa. Faturas pagas não aceitam alteração de itens até serem explicitamente reabertas. Uma fatura vazia não pode ser marcada como paga.
- Todas as rotas exigem sessão e CSRF nas mutações. `account_id` vem da conta do usuário, nunca do corpo da requisição. Chaves estrangeiras compostas impedem vínculos entre empresas.
- O financeiro existente (OS, recebimentos, despesas avulsas, parcelas e CSV) permanece no mesmo modelo. Os indicadores de OS mantêm o escopo existente.

## Migração e API

`server/creditCards.ts` contém a migração idempotente executada no startup, depois de `company_expenses`. Uma transação e um advisory lock serializam inicializações sobrepostas. Não há backfill, reclassificação ou remoção de despesas existentes. A restrição de valor é substituída atomicamente para admitir zero somente em faturas.

| Método | Caminho (prefixo `/api/credit-cards`) | Ação |
|---|---|---|
| GET / POST | `/` | Listar/cadastrar cartões |
| PUT | `/:cardId` | Editar cartão |
| GET / POST | `/:cardId/invoices` | Listar/criar ou abrir competência |
| GET | `/invoices/:invoiceId` | Detalhes e itens |
| PATCH | `/invoices/:invoiceId/payment` | Registrar pagamento ou reabrir |
| POST | `/invoices/:invoiceId/items` | Adicionar item |
| PUT / DELETE | `/invoices/:invoiceId/items/:itemId` | Editar/remover item |

Erros de entrada retornam 400, recursos de outra conta/inexistentes retornam 404 e alterações incompatíveis com fatura paga retornam 409. O pagamento usa `{status: 'paid', paidAt: 'AAAA-MM-DD'}`; a reabertura usa `{status: 'pending'}`. Os valores de itens são positivos, em reais, com até duas casas decimais.

## Importação futura

Itens incluem `source`, `source_reference` e `source_metadata`, com índice único de referência por empresa/fatura/origem. A API manual sempre define origem `manual`. Uma futura confirmação de PDF deve reutilizar o bloqueio da fatura, validação, deduplicação e recálculo transacional. Não há upload, extração de texto ou leitura de PDF nesta versão.

## Validação

`tests/credit-cards-postgres.test.ts` usa PostgreSQL em PGlite e os routers reais por HTTP, com sessão/CSRF. Cobre migração repetida, dados legados, CRUD, total sem duplicação, rollback, pagamento/reabertura, isolamento e chaves estrangeiras. A revisão de interface usa banco local descartável; não cria despesas reais na homologação.
