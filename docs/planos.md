# Planos e permissões

O catálogo operacional é `saas_plans`. O módulo `server/plans.ts` resolve o
plano efetivo por `accounts.plan_key` e fornece contexto do usuário, permissões
e consumo mensal. OS, equipe e indicadores financeiros usam esse serviço.
Não há fallback estático para preço, limites ou recursos em tempo de execução.
Uma conta sem catálogo válido gera erro, em vez de receber limites ilimitados.

`server/planCatalog.ts` contém os valores de reconciliação do catálogo usados
na inicialização, compartilhados com o banco em memória. A reconciliação
existente ainda sobrescreve os valores dos três planos a cada inicialização;
mudanças persistentes no catálogo devem ser refletidas nesse arquivo.

A última assinatura pode estar aguardando pagamento. Ela descreve a cobrança,
mas não substitui o plano efetivo da conta nas decisões de acesso. Os fluxos
existentes de ativação Asaas e backoffice atualizam `accounts.plan_key`.
O pagamento manual do backoffice também deve sincronizar esse campo.
Esta alteração não redefine regras de suspensão, cancelamento ou carência.

O consumo de OS considera a empresa inteira e o mês de `created_at`, no fuso
horário da sessão PostgreSQL. O limite é informativo (fair-use); excedê-lo não
bloqueia a criação. O limite de usuários continua obrigatório no backend.
`null` representa OS ilimitadas; zero não é convertido em ilimitado.
Fotos sem limite configurado mantêm o comportamento ilimitado atual.

O arquivo de rota legado `server/routes/account.ts` continua compatível com
seus nomes antigos de limites, derivados do mesmo catálogo. Ele não está
montado no `server/index.ts`; os testes o montam apenas para verificar o contrato.

## Validação local

- `npm test`: regressões de API, catálogo, permissões, consumo e requisições HTTP
  autenticadas. Os testes de planos usam banco em memória e mocks de transações;
  não acessam Asaas ou contas reais. A regressão do backoffice usa também
  PostgreSQL embarcado (PGlite) para executar o SQL real das trocas de plano.
- `npm run build`: compilação do frontend e servidor.

## Próximas verificações em homologação

1. Comparar plano efetivo e assinatura de contas existentes antes de publicar.
2. Conferir os três planos, criação de equipe e consumo de OS pela interface e API.
3. Auditar os demais recursos da matriz, sobretudo produtividade e relatórios.
4. Validar ativação de assinatura e cobranças legadas no Asaas Sandbox.

Uma assinatura pendente não libera recursos por meio do serviço de planos.
O fluxo Asaas existente ainda precisa de uma auditoria própria para confirmar
quando o status remoto de assinatura representa pagamento efetivamente confirmado.

## Troca de plano no backoffice

Em `/backoffice`, abra a empresa e use **Ações administrativas → Plano →
Alterar plano**. A troca funciona nos dois sentidos e atualiza o plano efetivo,
a assinatura local e o histórico de auditoria. Depois, recarregue o painel da
empresa para renovar as permissões carregadas no frontend.

O downgrade preserva os usuários existentes; se a equipe exceder o novo limite,
a criação de novos usuários será bloqueada. O comando não sincroniza preços com
a assinatura remota do Asaas e não deve ser confundido com uma alteração da
cobrança no provedor.

A consulta de alteração trava somente a linha de `accounts` (`FOR UPDATE OF a`).
Um `FOR UPDATE` sem alvo tenta travar também o lado opcional do `LEFT JOIN` e é
rejeitado pelo PostgreSQL. O teste embarcado cobre Business → Essencial → Pro →
Business, conta sem assinatura prévia, rejeição de plano inválido, preservação
da equipe e eventos de auditoria.
