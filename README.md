
  # QTecnico

  Aplicacao web para gerenciamento de clientes, ordens de servico, pagamentos e atendimentos tecnicos.

  ## Requisitos

  - Node.js 20 ou superior
  - npm
  - PostgreSQL 14 ou superior

  ## Configuracao local

  1. Instale as dependencias:

    ```bash
    npm install
    ```

  2. Crie o banco e o usuario no PostgreSQL:

    ```bash
    sudo -u postgres psql
    ```

    ```sql
    CREATE USER qtecnico WITH PASSWORD 'troque_esta_senha';
    CREATE DATABASE qtecnico OWNER qtecnico;
    \q
    ```

  3. Crie um arquivo `.env` na raiz do projeto:

    ```env
    DATABASE_URL=postgresql://qtecnico:troque_esta_senha@localhost:5432/qtecnico
    ```

    O arquivo `.env` e ignorado pelo Git. Nunca publique credenciais no repositorio.

  ## Executar em desenvolvimento

  Em um terminal, inicie a API:

  ```bash
  npm run server
  ```

  Em outro terminal, inicie o frontend:

  ```bash
  npm run dev
  ```

  Acesse `http://localhost:5173`. A API fica disponível em `http://localhost:3000`.

  Na primeira inicializacao, o servidor cria as tabelas e insere dados de teste automaticamente. Credenciais locais de teste:

  ```text
  E-mail: lucas.qtech@gmail.com
  Senha: 123456
  ```

  ## Build e producao

  O backend serve o frontend compilado quando a pasta `dist/` existe:

  ```bash
  npm run build
  npm run server
  ```

  O servidor usa a variavel `PORT` fornecida pelo ambiente de hospedagem e usa `3000` como padrao local.

  ## Deploy

  O projeto precisa de uma hospedagem que execute Node.js e forneca PostgreSQL, como Render, Railway ou um VPS. Cloudflare Pages sozinho nao executa este backend Express.

  Configure o servico com:

  ```text
  Build command: npm install && npm run build
  Start command: npm run server
  ```

  Adicione `DATABASE_URL` como variavel secreta na hospedagem. Depois, no Cloudflare, aponte um registro `CNAME` do seu dominio para a URL fornecida pela hospedagem e mantenha o proxy ativado.

  ## Validacao

  ```bash
  npm run build
  ```
  