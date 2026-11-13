# Zen — Sistema de gestão odontológica

Aplicação web para apoiar a rotina de uma clínica odontológica. Reúne uma interface para recepção,
dentistas e gestores, com uma API que autentica usuários e controla o acesso aos dados da clínica.

> **Aviso importante:** este repositório é uma base de desenvolvimento e demonstração, não um
> serviço clínico pronto para produção. Não use dados reais de pacientes nem tome decisões clínicas
> com base neste software. Antes de qualquer uso real, faça uma revisão independente de segurança,
> privacidade, requisitos legais e infraestrutura, além de configurar backups, HTTPS e migrações de
> banco de dados.

## O que já existe

- **Recepção:** agenda, cadastro e pesquisa de pacientes, disponibilidade e check-in.
- **Dentistas:** agenda, histórico de consultas, odontograma, planos de tratamento e rascunhos de
  documentos clínicos.
- **Gestores:** usuários da equipe, indicadores de produtividade, relatórios e visão administrativa
  de pacientes.
- **Conta e preferências:** login, primeiro acesso por convite, alteração de senha e preferências de
  interface.
- **API:** FastAPI com autenticação JWT, persistência SQLAlchemy e documentação OpenAPI.

Alguns fluxos ainda não estão integrados: envio de e-mail/SMS/WhatsApp e notificações operacionais.
Documentos clínicos são rascunhos, não documentos emitidos. A interface também contém telas ou
indicadores demonstrativos; consulte os READMEs do [backend](backend/README.md) e do
[frontend](frontend/README.md) para detalhes sobre o comportamento e as limitações atuais.

## Tecnologias

| Parte | Tecnologias |
| --- | --- |
| Frontend | Vue 3, Vue Router, Pinia, Vite e Axios |
| Backend | Python, FastAPI, SQLAlchemy, JWT e SQLite por padrão |

O Node.js suportado está indicado em [`frontend/package.json`](frontend/package.json). O backend
requer Python 3.10 ou superior.

## Executar localmente

Abra dois terminais na pasta do projeto.

### 1. Inicie a API

**Windows (PowerShell):**

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Edite o `.env` dentro da pasta `backend/` e substitua `SECRET_KEY` por uma chave aleatória privada.
Você pode gerar uma com:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Depois, ainda dentro de `backend/`, inicie o servidor:

```powershell
uvicorn main:app --reload
```

**Linux/macOS:** use `python3 -m venv .venv`, `source .venv/bin/activate` e
`test -f .env || cp .env.example .env`; os demais comandos são os mesmos.

A API ficará em <http://127.0.0.1:8000>. A documentação interativa fica em
<http://127.0.0.1:8000/docs> e o endpoint de verificação em
<http://127.0.0.1:8000/api/health>.

### 2. Inicie a interface

Em outro terminal, na raiz do projeto:

```powershell
cd frontend
npm ci
npm run dev
```

Abra o endereço mostrado pelo Vite (normalmente <http://localhost:5173>). Durante o desenvolvimento,
o Vite encaminha chamadas `/api` para `http://127.0.0.1:8000`.

### 3. Crie o primeiro usuário

Não há cadastro público. Com a API configurada, abra outro terminal, entre em `backend/`, ative o
ambiente virtual e execute:

```powershell
python -m scripts.create_user --clinic "Minha clínica" --name "Nome da pessoa" --email "pessoa@exemplo.com" --role manager
```

O script pede a senha sem exibi-la. Os perfis disponíveis são `manager`, `receptionist` e `dentist`.
Use apenas dados fictícios durante o desenvolvimento.

## Configuração

O backend lê suas variáveis de `backend/.env`; veja
[`backend/.env.example`](backend/.env.example). As principais são:

| Variável | Finalidade |
| --- | --- |
| `SECRET_KEY` | Chave privada usada para assinar tokens; obrigatória |
| `DATABASE_URL` | URL SQLAlchemy do banco; por padrão cria `database.db` local |
| `CORS_ORIGINS` | Origens autorizadas para chamadas à API |
| `CLINIC_OPEN_TIME`, `CLINIC_CLOSE_TIME` | Horário usado na disponibilidade |

Para a interface, `frontend/.env.example` documenta `VITE_API_BASE_URL`. Em produção, configure
também o endereço da API, o proxy reverso e as origens CORS corretas; o proxy do Vite é apenas para
desenvolvimento.

## Verificações e build

Na pasta `frontend/`:

```powershell
npm run lint
npm run build
```

O build de produção é gerado em `frontend/dist/`. Não existe uma suíte automatizada de testes
integrados no momento.

## Estrutura

```text
backend/
  core/          configuração, JWT e hash de senhas
  database/      engine, sessões e base SQLAlchemy
  dependencies/  autenticação e dependências da API
  models/        modelos persistidos
  routes/        endpoints HTTP
  schemas/       validação de entrada e saída
  scripts/       tarefas administrativas locais
  services/      regras de negócio
frontend/
  src/components/ componentes Vue reutilizáveis
  src/router/     rotas e navegação
  src/services/   integração com a API
  src/views/      telas da aplicação
  src/assets/     estilos e recursos visuais
```

## Dados, privacidade e segurança

- Nunca publique arquivos `.env`, chaves, credenciais ou bancos de dados. O `.gitignore` da raiz
  exclui esses arquivos, inclusive `backend/clinica.db`, que contém contas locais.
- Não coloque informações reais de pacientes em issues, commits, screenshots ou arquivos de teste.
- A aplicação cria tabelas automaticamente ao iniciar, mas não inclui migrações de schema. Para
  dados persistentes ou ambientes compartilhados, implemente e valide uma estratégia de migração e
  backup antes de atualizar o modelo.
- Revise autenticação, autorização, gestão de segredos e privacidade antes de expor a API à internet.

## Licença

Distribuído sob a licença [MIT](LICENSE). Consulte o arquivo para os termos completos.