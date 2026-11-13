# Zen API

API da plataforma Zen para autenticação, operações da recepção e agenda da dentista. O backend usa
**FastAPI**, **SQLAlchemy**, **Pydantic** e tokens **JWT**; pacientes e agendamentos são isolados
por clínica.

> Esta API é destinada a desenvolvimento e demonstração. Não a exponha à internet nem use dados
> reais de pacientes sem uma revisão independente de segurança e privacidade, infraestrutura
> adequada e um processo validado de migrações e backups.

## Objetivo

O backend oferece:

- aplicação web com FastAPI;
- persistência de dados com SQLAlchemy;
- gerenciamento de configurações por variáveis de ambiente;
- criação e validação de tokens JWT;
- armazenamento seguro de senhas;
- dependências para identificar o usuário autenticado;
- cadastro e pesquisa de pacientes, com validação e registro de consentimento;
- agenda diária, filtros, indicadores, disponibilidade e atualização de status;
- dashboard da dentista com consultas da própria agenda e da própria clínica;
- odontograma FDI com registros clínicos append-only e histórico por paciente;
- planos de tratamento com procedimentos organizados por etapa e histórico de auditoria;
- separação entre modelos, schemas, rotas, serviços e enums.

## Estrutura do projeto

```text
backend/
├── core/
│   ├── config.py       # Configurações carregadas do ambiente
│   ├── jwt.py          # Criação e validação de tokens JWT
│   └── senha_hash.py   # Hash e verificação de senhas
├── database/
│   ├── db.py           # Engine, sessão, Base e dependência do banco
│   └── __init__.py
├── dependencies/
│   ├── autenticacao.py # Recuperação do usuário autenticado
│   └── __init__.py
├── enums/              # Enumerações do domínio
├── models/             # Modelos SQLAlchemy
├── routes/             # Rotas e routers da API
├── schemas/            # Schemas Pydantic de entrada e saída
├── services/           # Regras de negócio e serviços da aplicação
├── main.py             # Ponto de entrada da aplicação
├── requirements.txt    # Dependências do projeto
├── .env.example        # Modelo de configuração
└── .env                # Configurações locais, não versionadas
```

## Tecnologias utilizadas

- [FastAPI](https://fastapi.tiangolo.com/): criação da API e documentação automática;
- [Uvicorn](https://www.uvicorn.org/): servidor ASGI;
- [SQLAlchemy](https://www.sqlalchemy.org/): comunicação com o banco de dados;
- [python-jose](https://python-jose.readthedocs.io/): geração e validação de JWT;
- [pwdlib](https://frankie567.github.io/pwdlib/): hash seguro de senhas;
- [python-dotenv](https://github.com/theskumar/python-dotenv): carregamento das variáveis do arquivo `.env`.

## Configuração do ambiente

### 1. Criar e ativar o ambiente virtual

No Windows:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

No Linux ou macOS:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Instalar as dependências

```bash
pip install -r requirements.txt
```

### 3. Configurar as variáveis de ambiente

Na pasta `backend/`, crie um arquivo `.env` a partir de `.env.example` (sem substituir um `.env`
existente):

```env
DATABASE_URL=sqlite:///./database.db
SECRET_KEY=gere-uma-chave-aleatoria-e-secreta
ALGORITHM=HS256
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
CLINIC_OPEN_TIME=08:00
CLINIC_CLOSE_TIME=18:00
```

Use uma chave longa, aleatória e exclusiva por ambiente. O arquivo `.env` é ignorado pelo Git e
nunca deve ser enviado ao controle de versão. `CORS_ORIGINS` deve conter as origens reais do
frontend; o expediente define os horários retornados pelo endpoint de disponibilidade. A URL SQLite
é relativa ao diretório atual: execute os comandos a seguir dentro de `backend/`.

## Executando a aplicação

Com o ambiente virtual ativado, execute:

```bash
uvicorn main:app --reload
```

A API ficará disponível em:

- `http://127.0.0.1:8000`
- `http://127.0.0.1:8000/docs` para a documentação Swagger;
- `http://127.0.0.1:8000/redoc` para a documentação ReDoc.

Também é possível iniciar pelo próprio arquivo principal:

```bash
python main.py
```

### Criar o primeiro acesso

Não existe endpoint público de criação de usuários. Crie uma clínica e uma conta administrativa
localmente com o script, que solicita a senha de forma interativa:

```powershell
python -m scripts.create_user --clinic "Zen" --name "Nome da pessoa" --email "pessoa@clinica.com" --role receptionist
```

Os papéis aceitos são `receptionist`, `dentist` e `manager`. Crie dentistas ativos com o mesmo
comando usando `--role dentist` para que apareçam na agenda.

## Endpoints do frontend

As rotas de autenticação e recepção usam o prefixo `/api`. Após o login, envie o token no header
`Authorization: Bearer <token>`.

| Método | Endpoint | Finalidade |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Autenticar com e-mail e senha |
| `GET` | `/api/auth/me` | Consultar o perfil autenticado |
| `PATCH` | `/api/auth/me` | Atualizar o nome do perfil autenticado |
| `POST` | `/api/auth/change-password` | Validar a senha atual e atualizar a senha autenticada |
| `GET` | `/api/auth/me/preferences` | Consultar preferências pessoais persistidas; retorna padrões do perfil quando ainda não há personalização |
| `PUT` | `/api/auth/me/preferences` | Validar e salvar preferências de aparência, acessibilidade e navegação do usuário autenticado |
| `DELETE` | `/api/auth/me/preferences` | Remover a personalização e restaurar os padrões permitidos para o perfil |
| `GET` | `/api/manager/users` | Listar usuários da clínica do gestor com busca, filtros, ordenação, paginação e indicadores |
| `GET` | `/api/manager/users/{user_id}` | Consultar dados e auditoria administrativa do usuário na clínica |
| `POST` | `/api/manager/users` | Criar usuário dentista/recepcionista inativo e emitir link de primeiro acesso de uso único |
| `PATCH` | `/api/manager/users/{user_id}` | Atualizar o nome de um usuário de equipe |
| `PATCH` | `/api/manager/users/{user_id}/status?active=true` | Ativar ou desativar usuário; profissionais com consultas futuras não podem ser desativados |
| `POST` | `/api/manager/users/{user_id}/invitation/resend` | Renovar convite expirado e invalidar o link anterior |
| `POST` | `/api/manager/users/invitation/accept` | Definir a senha de primeiro acesso e ativar a conta usando o token |
| `GET` | `/api/manager/productivity?start_date=AAAA-MM-DD&end_date=AAAA-MM-DD` | Consultar indicadores agregados por profissional, série temporal e período anterior equivalente; aceita `status`, `dentist_ids` separados por vírgula e `compare` |
| `GET` | `/api/manager/productivity/records?start_date=AAAA-MM-DD&end_date=AAAA-MM-DD&metric=completed` | Consultar registros resumidos e paginados que compõem um indicador, sem dados pessoais do paciente |
| `GET` | `/api/manager/patients` | Consultar pacientes da clínica com filtros administrativos, paginação e indicadores agregados |
| `GET` | `/api/manager/patients/{patient_id}` | Consultar dados administrativos mínimos de um paciente da clínica, sem prontuário ou anotações clínicas |
| `GET` | `/api/dentist/dashboard?date=AAAA-MM-DD&days=7` | Consultas da agenda da própria dentista, limitadas à clínica e ao intervalo solicitado (até 31 dias) |
| `GET` | `/api/dentist/patients` | Pacientes vinculados a consultas da dentista, com busca, filtros e paginação |
| `GET` | `/api/dentist/patients/{patient_id}/appointments` | Atendimentos concluídos do paciente vinculados à dentista autenticada |
| `GET` | `/api/dentist/appointment-history` | Consultar atendimentos autorizados com filtros por período, paciente, situação e procedimento, com indicadores do conjunto filtrado |
| `GET` | `/api/dentist/patients/{patient_id}/odontogram` | Odontograma, registros autorizados e consultas vinculadas à dentista |
| `POST` | `/api/dentist/patients/{patient_id}/odontogram` | Acrescentar condição observada ou procedimento com autoria, superfícies e vínculo opcional |
| `GET` | `/api/dentist/patients/{patient_id}/odontogram/history` | Histórico do odontograma com filtros por período, dente, profissional e tipo |
| `GET` | `/api/dentist/treatment-plans` | Listar planos autorizados, indicadores e filtros por busca, situação, paciente, categoria, data e estado dos procedimentos |
| `POST` | `/api/dentist/treatment-plans` | Criar plano como rascunho e incluir procedimentos iniciais |
| `GET` | `/api/dentist/treatment-plans/{plan_id}` | Consultar os dados e procedimentos de um plano autorizado |
| `PATCH` | `/api/dentist/treatment-plans/{plan_id}` | Atualizar dados, iniciar explicitamente ou cancelar o plano com controle de versão |
| `POST` | `/api/dentist/treatment-plans/{plan_id}/procedures` | Acrescentar procedimento planejado ao plano |
| `PATCH` | `/api/dentist/treatment-plans/{plan_id}/procedures/{procedure_id}` | Atualizar procedimento, situação, prioridade e etapa com controle de versão |
| `DELETE` | `/api/dentist/treatment-plans/{plan_id}/procedures/{procedure_id}` | Remover procedimento ainda planejado, registrando a ação no histórico |
| `GET` | `/api/dentist/treatment-plans/{plan_id}/history` | Consultar em modo somente leitura o histórico de alterações do plano |
| `GET` | `/api/dentist/documents` | Listar e pesquisar rascunhos clínicos acessíveis, com filtros por tipo e paciente |
| `POST` | `/api/dentist/documents` | Salvar rascunho clínico vinculado a paciente e, opcionalmente, atendimento autorizado |
| `GET` | `/api/dentist/documents/{document_id}` | Consultar um rascunho clínico autorizado |
| `PATCH` | `/api/dentist/documents/{document_id}` | Atualizar rascunho com controle de versão e trilha de auditoria |
| `GET` | `/api/dentist/documents/{document_id}/history` | Consultar em modo somente leitura o histórico do rascunho |
| `PATCH` | `/api/auth/me` | Atualizar o nome do perfil autenticado |
| `POST` | `/api/auth/change-password` | Validar a senha atual e atualizar a senha autenticada |
| `GET` | `/api/reception/dashboard?date=AAAA-MM-DD` | Indicadores, agenda, espera, confirmações e pacientes recentes |
| `GET` | `/api/reception/patients?q=...` | Pesquisar pacientes por nome, telefone ou CPF |
| `GET` | `/api/reception/patients/registry` | Listar pacientes com filtros, paginação e indicadores administrativos |
| `GET` | `/api/reception/patients/{patient_id}/appointments` | Consultar o histórico administrativo de consultas do paciente |
| `POST` | `/api/reception/patients` | Cadastrar pacientes |
| `PATCH` | `/api/reception/patients/{patient_id}` | Atualizar pacientes |
| `GET` | `/api/reception/dentists` | Listar dentistas ativos da clínica |
| `GET` | `/api/reception/availability` | Consultar horários disponíveis |
| `GET` | `/api/reception/appointments?date=AAAA-MM-DD&date_to=AAAA-MM-DD` | Consultar agendamentos em uma data ou intervalo, com busca e filtros opcionais por paciente, dentista, status, procedimento e data de criação |
| `POST` | `/api/reception/appointments` | Criar agendamentos |
| `PATCH` | `/api/reception/appointments/{appointment_id}` | Atualizar agendamentos e status |
| `POST` | `/api/reception/appointments/{appointment_id}/check-in` | Registrar chegada uma única vez, com horário do servidor |
| `GET` | `/api/reception/notification-preferences` | Consultar preferências de notificação do usuário autenticado |
| `PUT` | `/api/reception/notification-preferences` | Validar e salvar preferências de notificação do usuário autenticado |
| `GET` | `/api/health` | Verificar se a API está ativa |

Rotas da recepção exigem papel `receptionist` ou `manager`; dados clínicos não são retornados.
As rotas administrativas `/api/manager/users` exigem papel `manager` e limitam as operações à
clínica vinculada ao gestor; a rota pública `/invitation/accept` exige o token de uso único. O fluxo
de primeiro acesso gera um token aleatório com validade de 48 horas, armazena apenas
seu hash e retorna o link uma única vez para compartilhamento manual; não existe envio de e-mail
integrado. A pessoa define a própria senha (mínimo de 12 caracteres, com minúscula, maiúscula e
número). Este fluxo não altera o perfil `manager`, e-mail, permissões granulares ou dados
profissionais que não existem no modelo atual. As alterações administrativas bem-sucedidas ficam
registradas em uma trilha de auditoria sem credenciais ou tokens.

As preferências da interface são persistidas por usuário na API autenticada; a cópia no navegador
serve apenas para aplicar o tema sem atraso e migrar preferências locais já existentes. A página
inicial é validada pelo papel no servidor. As configurações de conta (nome e senha) permanecem nos
endpoints `/api/auth/me` e `/api/auth/change-password`.

### Produtividade da equipe

`GET /api/manager/productivity` é exclusivo para gestores e limita os registros à clínica da conta autenticada. O intervalo é inclusivo e aceita até 366 dias. Os filtros opcionais `dentist_ids` (IDs separados por vírgula), `status` e `compare` são aplicados aos indicadores, à série temporal e à comparação.

As taxas usam como denominador consultas que não estão marcadas como `Reagendada` e já ocorreram ou têm um status terminal; consultas futuras ainda em aberto ficam fora da base. Cancelamentos e faltas permanecem no denominador. Se um único status for filtrado, as taxas retornam `null`, pois essa seleção não permite uma base comparável. A contagem “agendadas” exclui `Cancelada` e `Reagendada`. A comparação usa um intervalo imediatamente anterior de igual duração. Horas representam a soma de `duration_minutes` planejados em consultas concluídas, não tempo efetivamente medido. Ocupação, especialidade, unidade adicional, motivos, exportação e alertas de desempenho não são calculados porque esses dados/regras não existem no modelo atual.

### Pacientes e relatórios gerenciais

`GET /api/manager/patients` e `GET /api/manager/patients/{patient_id}` são exclusivos para gestores e limitam as consultas à clínica autenticada. A listagem aceita busca por nome, código ou telefone, período de cadastro, consulta futura, completude administrativa, ordenação e paginação; não pesquisa por CPF. O detalhe mascara o CPF e não retorna histórico clínico. “Cadastro incompleto” significa telefone ausente ou autorização administrativa pendente. Os indicadores de total, consultas futuras e incompletude são da clínica; o indicador de novos cadastros usa o período informado (ou o mês atual quando omitido).

A tela Relatórios Gerenciais não cria uma fonte de dados paralela: consome os endpoints de produtividade e pacientes existentes. Status, profissionais, série temporal, taxas e comparações seguem as regras da seção anterior. O CSV é montado no navegador apenas com as linhas agregadas do relatório carregadas pela API; não há geração server-side, auditoria específica de exportação, XLSX ou PDF. Unidade adicional, motivo estruturado de cancelamento, dados financeiros e identificação de pacientes não são incluídos porque não estão disponíveis ou não são necessários à análise gerencial.
O dashboard da dentista exige o papel `dentist` e filtra os resultados pelo identificador da
dentista autenticada e pela clínica. A resposta contém somente os dados mínimos de agenda e
identificação do paciente. Os planos de tratamento e seus procedimentos são restritos à dentista
responsável e aos pacientes autorizados pela agenda. Planos novos permanecem como rascunhos; não
há fluxo de aprovação clínica/pelo paciente ou catálogo de procedimentos/preços configurado.
Concluir um procedimento exige um registro concluído correspondente no odontograma, associado a
um atendimento concluído. O histórico inclui a situação real da agenda e registros do odontograma
vinculados ao atendimento; somente registros de procedimento concluídos e não retificados contam
como procedimentos realizados. Prontuário e evoluções não estão implementados. A pendência de
documentação é apresentada como não configurada, não como zero.
O odontograma exige que o paciente possua uma consulta vinculada à dentista autenticada na clínica.
Os registros são append-only para preservar autoria e histórico; correções e mudanças de
situação dos procedimentos são novos registros vinculados à versão anterior.
Superfícies e numeração FDI são validadas pela API. Procedimentos marcados como concluídos exigem
vínculo a um atendimento concluído da mesma dentista e paciente. A integração entre planos e
odontograma é limitada à consulta e ao vínculo da conclusão clínica; prontuário, receitas e
documentos emitidos não estão integrados. A central de documentos persiste somente rascunhos.
Receitas e documentos permitem somente rascunhos, com autoria, histórico e controle de versão.
Emissão oficial, assinatura, cancelamento/retificação e modelos clínicos não estão configurados;
os rascunhos não são documentos válidos. A impressão disponível na interface é explicitamente
marcada como cópia de rascunho e não representa emissão ou PDF oficial.
O proxy de desenvolvimento do Vite encaminha `/api` para `http://127.0.0.1:8000`. Em produção,
configure `VITE_API_BASE_URL` ou um reverse proxy, além do CORS.

Integrações de WhatsApp/SMS/e-mail e notificações ainda não estão configuradas. O campo de canal de
contato registra a preferência, mas não envia mensagens.
O perfil permite atualizar o nome e alterar a senha após validar a credencial atual. E-mail, telefone,
último acesso, sessões e autenticação em dois fatores não estão disponíveis para edição/consulta por
esta aplicação. Preferências de aparência, acessibilidade e navegação são persistidas pela API por
usuário e sincronizadas entre dispositivos; o navegador mantém somente uma cópia para aplicação
visual imediata.
A nova senha exige ao menos 12 caracteres, letras maiúsculas e minúsculas e um número; credenciais
não são devolvidas pela API nem armazenadas em texto simples.
As preferências da tela de notificações são persistidas por usuário. Ainda não há produtores de eventos
operacionais que entreguem esses avisos; a notificação do navegador serve apenas para teste explícito
com a aplicação aberta e permissão concedida. Canais externos são rejeitados pela API enquanto não
estiverem integrados.
O status de confirmação pode ser atualizado pelo `PATCH /api/reception/appointments/{appointment_id}`
sem alterar o status operacional da consulta; para cancelar um agendamento, envie explicitamente
`status: "Cancelada"`. A recepção pode registrar "Não comparecerá" como resposta sem cancelar
automaticamente a consulta.
Cada resposta de agendamento inclui a data de criação. A API ainda não mantém timestamp de última
atualização, autor das alterações nem uma trilha imutável de remarcações; relatórios de histórico
devem exibir esses dados como indisponíveis, sem inferi-los a partir do status atual.

## Componentes principais

### Configuração

O módulo `core/config.py` carrega as configurações do arquivo `.env` por meio de variáveis de ambiente. Dessa forma, informações específicas de cada ambiente não ficam fixas no código.

### Banco de dados

O módulo `database/db.py` centraliza:

- a criação do `engine` do SQLAlchemy;
- a classe declarativa `Base` usada pelos modelos;
- a fábrica de sessões `SessionLocal`;
- a dependência `get_db`, que abre e fecha a sessão por requisição.

Ao iniciar a aplicação, `main.py` executa `Base.metadata.create_all` para criar as tabelas registradas nos modelos.

### Segurança

O módulo `core/senha_hash.py` disponibiliza funções para criar e verificar hashes de senha. A senha original não deve ser armazenada no banco.

O módulo `core/jwt.py` cria tokens de acesso com identificação do usuário no campo `sub` e prazo de expiração. A dependência `get_usuario_atual`, em `dependencies/autenticacao.py`, lê o token enviado no header `Authorization`, valida suas informações e recupera o usuário correspondente.

## Como evoluir o template

Para iniciar um novo domínio de negócio a partir desta base, a organização recomendada é:

1. Criar os modelos SQLAlchemy em `models/`.
2. Criar os schemas de entrada e saída em `schemas/`.
3. Implementar as regras de negócio em `services/`.
4. Criar os endpoints em `routes/`.
5. Registrar os routers em `main.py`.
6. Adicionar enums específicos em `enums/`, quando necessário.
7. Criar testes para os serviços e endpoints adicionados.

Essa separação mantém as rotas focadas no protocolo HTTP e concentra as regras da aplicação nos serviços, facilitando manutenção e expansão.

## Observações

- As chaves e credenciais do ambiente devem permanecer fora do código-fonte.
- A inicialização atual cria tabelas com `Base.metadata.create_all`; alterações de schema em
  ambientes existentes precisam de migrations antes de produção.
- O frontend não oferece cadastro de usuários; use o script administrativo e mantenha o acesso ao
  backend restrito.
