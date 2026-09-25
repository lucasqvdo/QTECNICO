# Trial Business e Backoffice

## Auditoria anterior à alteração

Base: desenvolvimento, commit d0a78ed. O cadastro em `server/routes/auth.ts` cria accounts/usuário/company_profiles em uma transação, com Essencial e status active, sem assinatura. `server/plans.ts` centraliza catálogo, funcionalidades e limites utilizados por OS, equipe e dashboard. Billing/Asaas mantém accounts.plan_key na ativação; assinaturas pendentes não concedem upgrade. MRR soma subscriptions ativas. As datas antigas trial_start_at/trial_end_at em subscriptions pertencem à cobrança e não foram reaproveitadas para a degustação da empresa.

O Backoffice aceitava qualquer administrador de empresa quando BACKOFFICE_ADMIN_EMAILS estava vazio. Agora a autorização usa uma lista explícita por user_id e não consulta essa variável antiga.

A consulta de schema remoto pelo conector Neon falhou: sua interface omite project_id mesmo quando informado. Projeto informado pelo proprietário: polished-dust-23696908, branch br-rough-resonance-ay0ci3y6. Não foram executadas escritas diretas no Neon. A validação de SQL foi feita em PostgreSQL isolado via PGlite; a inspeção do schema remoto continua pendente.

## Comportamento

- Só cadastros novos recebem Business por 14 dias, sem cartão ou cobrança automática. `plan_key` permanece Essencial, ou o plano ativado posteriormente pelo billing.
- O trial pertence à conta/empresa, não ao usuário. Um documento normalizado já cadastrado não ganha uma nova degustação. Uma tabela de claims com chave única impede concessões repetidas e concorrentes; seu hash permanece mesmo se o documento da empresa mudar. Isso não valida a titularidade do documento.
- Reconciliação idempotente adiciona campos nullable, sem datas padrão e sem conceder trial a contas existentes.
- A autorização consulta o horário do banco a cada chamada. Na expiração usa o plano contratado, sem exclusão de dados ou job agendado.
- Trial não cria subscriptions nem payments. Métricas de plano usam plan_key contratado; MRR continua baseado em subscriptions ativas.
- Banner informa dias arredondados para cima e destaca escolha de plano nos últimos três dias. Consulta novamente a cada minuto e ao voltar à janela; mudanças de acesso atualizam a navegação e o dashboard.
- Backoffice permite +7 dias a partir do fim atual (ou de agora se expirado), ou encerramento imediato. A ação manual “Ativar trial Business por 14 dias” pode iniciar ou reiniciar uma degustação de qualquer conta Essencial/Pro sem trial ativo, incluindo contas antigas e trials encerrados. Essa é uma exceção administrativa à oferta automática única, registrada em auditoria. Não altera plano contratado, assinatura, cobrança ou MRR. Tentativas repetidas durante um trial ativo são rejeitadas; use a extensão de +7 dias.
- Datas e eventos de trial ficam separados dos eventos financeiros. Todas as mutações exigem sessão do Backoffice e CSRF.

## Acesso ao Backoffice

A primeira reconciliação procura o usuário existente com email `lucas.qvdo@gmail.com` e o registra como único proprietário. É necessário que esse login exista em users. O vínculo passa a ser pelo ID do usuário; não é reatribuído a outro usuário após mudança de email. Reinicializações preservam colaboradores e revogações.

Na página inicial do Backoffice, o proprietário pode adicionar usuários já cadastrados pelo email, remover ou reativar seu acesso. Colaboradores podem gerenciar empresas, planos, trials e cobranças, mas não podem conceder acesso a outras pessoas. Revogação vale na próxima requisição, mesmo para sessões existentes. O proprietário não pode remover o próprio acesso. A lista e as alterações têm autorização no servidor; eventos de concessão/revogação são registrados.

## Validação

`npm test` executa testes unitários e HTTP, incluindo PostgreSQL isolado. `npm run build` compila frontend/PWA e backend. `npx tsc --noEmit` verifica tipos.

Cenários cobertos: três planos, registro novo, documento repetido, rollback, migração repetida, clock de expiração, preservação de dados, extensão e encerramento, trial sem MRR, isolamento de permissões, proprietário único, colaboradores e revogação. Prévia visual local com dados fictícios verifica banner/seleção de plano e ações do Backoffice. Não foi usado o Neon como banco de testes.
