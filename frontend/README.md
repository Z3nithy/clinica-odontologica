# frontend

## Design system

O sistema visual usa uma direção clínica acolhedora e confiável: azul profissional como ação
principal, superfícies claras para leitura e verde/coral apenas como cores de estado ou acento. A
paleta azul fornecida substitui os antigos verdes como base. O tema é claro por padrão; não há
alternância light/dark porque ela não faz parte da necessidade atual do site.

### Tokens e tipografia

Os tokens vivem em `src/assets/styles/design-system.css` e são carregados por
`src/assets/styles/main.css`. Componentes e páginas devem consumir os tokens semânticos
(`--color-primary`, `--color-text`, `--color-surface`, `--color-border`, `--color-success`,
`--color-warning`, `--color-danger`) em vez de repetir valores da paleta.

| Grupo            | Padrão                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cores primitivas | Azul `#EAF4FB`, `#2878B5`, `#183B56`; neutros `#FFFFFF`, `#F5F7FA`, `#526171`; verde `#DDF5E5`, `#248A57`; âmbar, vermelho e coral para estados/acento |
| Texto            | Inter, com fallback de sistema; texto base 16 px, apoio 14 px, legenda 12 px                                                                           |
| Títulos          | Plus Jakarta Sans, peso 600; escalas responsivas de página e hero                                                                                      |
| Espaçamento      | Base de 4 px: `--space-1` a `--space-24`                                                                                                               |
| Raios            | 6, 10, 12 e 16 px; `--radius-pill` para indicadores                                                                                                    |
| Elevação         | `--shadow-sm`, `--shadow-md`, `--shadow-lg`; camadas `--z-sticky` a `--z-toast`                                                                        |
| Layout           | Conteúdo `--content-width` (1160 px), leitura `--content-width-reading` (768 px)                                                                       |
| Breakpoints      | 680 px mobile, 900 px tablet, 1440 px wide; correspondem a `--breakpoint-sm/md/lg`                                                                     |
| Interação        | Transições `--transition-fast/base/slow`, foco azul de 2 px com halo e alvo mínimo de 44 px                                                            |

Os nomes Inter e Plus Jakarta Sans são priorizados quando já disponíveis no dispositivo, com
fallbacks locais para evitar dependência de um serviço externo de fontes. Para garantir as fontes
em todos os dispositivos, adicione arquivos de fonte licenciados ao projeto e configure `@font-face`.

### Padrões reutilizáveis

As classes abaixo são a base visual dos componentes Vue; a página de catálogo demonstra seus estados
e variantes com interações funcionais.

| Padrão             | Classes/variantes                                                                           | Uso                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Botões             | `.button` com `--primary`, `--secondary`, `--tertiary`, `--danger`; tamanhos `--sm`, `--lg` | Ação principal única por contexto; secundária para alternativas; terciária para baixa ênfase                       |
| Campos             | `.field`, `.input`, `.select`, `.textarea`, `.field__hint`, `.field__error`                 | Sempre associe label visível; associe instruções/erro por `aria-describedby` e marque inválidos com `aria-invalid` |
| Checkbox/radio     | `.choice` envolvendo input nativo                                                           | Preserve o controle nativo para teclado e leitor de tela                                                           |
| Toggle             | `.toggle` com `role="switch"` e `aria-checked`                                              | Use apenas para uma preferência binária que possa ser alterada imediatamente                                       |
| Badges             | `.badge` com `--success`, `--warning`, `--danger`, `--info`                                 | Status compacto; inclua texto, não comunique o estado apenas pela cor                                              |
| Alertas            | `.alert` com `--success`, `--warning`, `--danger`                                           | Feedback persistente e legível; use `role="status"` ou `role="alert"` conforme urgência                            |
| Cards              | `.card`                                                                                     | Agrupamento de conteúdo relacionado; não transforme texto estático em controle falso                               |
| Tooltip/menu       | `.tooltip`, `.menu-panel`                                                                   | Tooltips não devem conter informação essencial; menus precisam de acionador e navegação por teclado                |
| Diálogo            | `.dialog-backdrop`, `.dialog`                                                               | Prefira `<dialog>` nativo; implemente nome acessível, foco inicial, Escape e retorno de foco                       |
| Tabela             | `.table-wrap`, `.table`                                                                     | Mantenha cabeçalhos semânticos e overflow horizontal em telas estreitas                                            |
| Paginação          | `.pagination`, `.pagination__item`                                                          | Botões com rótulos acessíveis; marque a página atual com `aria-current="page"`                                     |
| Carregamento/vazio | `.skeleton`, `.empty-state`                                                                 | Indique carregamento com `aria-busy`; vazio deve explicar o estado e oferecer próximo passo quando possível        |

Exemplos:

```html
<button class="button button--primary" type="button">Salvar</button>
<button class="button button--secondary button--sm" type="button">Cancelar</button>

<label class="field">
  Nome
  <input class="input" name="name" autocomplete="name" aria-describedby="name-hint" />
  <span class="field__hint" id="name-hint">Como prefere ser chamado?</span>
</label>

<span class="badge badge--success">Concluído</span>
```

### Acessibilidade e evolução

- Foco visível é global e não deve ser removido; as cores de texto, ação, estado e links têm
  contrastes definidos por tokens, e estados usam rótulos além de cor.
- Controles interativos devem ter área mínima de 44 × 44 px, nome acessível e estado de teclado
  equivalente ao ponteiro.
- A escala de movimento respeita `prefers-reduced-motion`; animações novas devem seguir a mesma
  regra.
- Não criar valores de cor/raio/sombra locais quando existir token semântico. Elementos puramente
  ilustrativos podem ter medidas próprias, mas controles e conteúdo devem usar a escala compartilhada.

### Movimento e feedback

Use os tokens `--ease-standard` e `--ease-emphasized` para curvas e `--motion-distance-sm/md` para
deslocamentos curtos. Interações rápidas usam 120–140 ms; painéis e feedback usam até 180 ms. Anime
principalmente `opacity` e `transform`; evite movimento que altere a leitura ou a posição do conteúdo.

- Botões, campos, toggles, tabs e ícones têm feedback visual de foco, hover e pressão.
- Menus, tabs, acordeões, diálogos, drawers e toasts usam transições discretas; controles fechados
  não devem continuar acessíveis por teclado.
- Spinners e skeletons indicam somente carregamento real. Use mensagens de sucesso apenas depois da
  operação correspondente ser confirmada; a página de catálogo usa os exemplos como demonstração.
- O toast dura 5 s por padrão, pode ser fechado manualmente e pausa enquanto recebe ponteiro ou foco.
- `prefers-reduced-motion: reduce` remove movimentos contínuos e reduz a duração das transições.

## Componentes Vue

Os wrappers específicos da aplicação ficam em `src/components/ui/`. Eles reutilizam as classes e
tokens documentados acima, mantendo a composição por slots e sem introduzir dependências de UI.
O projeto está em JavaScript; as props usam declarações e validadores nativos do Vue em vez de
adicionar TypeScript sem uma migração solicitada.

| Componente                                                | Contrato                                                                                                            | Estado/padrão                                                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `UiButton`                                                | `href`, `type`, `variant`, `size`, `disabled`, `loading`; slots `start`/`end`                                       | Link para navegação e botão para ações; loading acessível; ícones decorativos nos slots nomeados     |
| `UiIconButton`                                            | `label`, `controls`, `expanded`, `disabled`; ícone em slot                                                          | Usado no menu mobile; requer nome acessível                                                          |
| `UiInput`, `UiTextarea`, `UiSelect`                       | `v-model`, `id`, `invalid`; select recebe `options`; input aceita slots `leading`/`trailing` e select aceita `icon` | Usar com `UiFormField` para rótulo, dica e erro associados; ícones de campo são decorativos          |
| `UiLabel`, `UiFormField`                                  | `htmlFor`/`label`, `id`, `hint`, `error`, `required`; slot de controle                                              | O slot de `UiFormField` fornece `id`, `describedBy`, `invalid` e `required`                          |
| `UiCheckbox`, `UiRadioGroup`, `UiSwitch`                  | `v-model`, rótulos, opções e `disabled`                                                                             | Controles nativos ou switch com teclado e estado ARIA                                                |
| `UiBadge`, `UiAvatar`, `UiCard`, `UiAlert`                | variante/tamanho e slots de conteúdo; alerta aceita slot `icon`                                                     | Status com rótulo, avatar com nome acessível, card semântico e alertas com live-region opcional      |
| `UiTooltip`, `UiDropdownMenu`                             | conteúdo/itens, evento `select` e slot `icon` por item                                                              | Tooltip no foco/hover; associe `describedBy` do slot ao acionador; menu usa `<details>`              |
| `UiDialog`, `UiDrawer`                                    | `v-model`, título, slots `default` e `footer`                                                                       | `<dialog>` modal: Escape, foco inicial e retorno de foco gerenciados pelo navegador                  |
| `UiTabs`, `UiAccordion`                                   | coleção de itens e `v-model`/slot; tabs aceitam slot `icon` por item                                                | Tabs suportam setas; accordion oferece um item aberto por vez com ícone indicador                    |
| `UiToast`                                                 | `v-model`, `message`, `variant`, `duration`                                                                         | Canto inferior direito, progresso regressivo, pausa com foco/ponteiro e fechamento automático em 5 s |
| `UiSkeleton`, `UiSpinner`, `UiEmptyState`, `UiErrorState` | dimensão/estado e slots de conteúdo                                                                                 | Carregamento, vazio e erro com mensagem/ação                                                         |
| `UiPagination`, `UiBreadcrumbs`                           | página e lista de itens                                                                                             | Navegação com rótulos acessíveis e `aria-current`                                                    |

Todos os exemplos executáveis estão na página [DesignSystem.vue](./src/views/DesignSystem.vue), acessível em `/design-system`. A tela de login fica em `/`; o dashboard da recepção está em `/recepcao` e a agenda, com filtros, status e criação de consultas, em `/recepcao/agenda`. Ambas usam a API. Para configurar a URL do backend, use `VITE_API_BASE_URL` (ou o proxy `/api` do Vite em desenvolvimento).

### Dashboard da recepção

A rota `/recepcao` usa dados fictícios identificados na interface como demonstração. Inclusões e
atualizações de pacientes e agendamentos existem somente no estado da página e são descartadas ao
recarregar. Autenticação, persistência, disponibilidade real da equipe, envio de confirmações,
notificações e sincronização com o atendimento odontológico ainda dependem de integrações de
backend.

Exemplo de composição de formulário:

```vue
<UiFormField label="Nome" hint="Como prefere ser chamado?" required>
  <template #default="{ id, describedBy, invalid, required }">
    <UiInput
      :id="id"
      v-model="name"
      :aria-describedby="describedBy"
      :aria-required="required"
      :required="required"
      :invalid="invalid"
    />
  </template>
</UiFormField>
```

Componentes ficam em `src/components/ui/`, tokens e estilos comuns em
`src/assets/styles/design-system.css`, a tela de login em `src/views/LoginPage.vue` e o catálogo
interativo em `src/views/DesignSystem.vue`. Os componentes permanecem em JavaScript com
tipos/validadores de props Vue para acompanhar a configuração atual da stack.

Frontend do sistema Zen, desenvolvido com Vue 3 e Vite.

## Editor recomendado

[VS Code](https://code.visualstudio.com/) com a extensão
[Vue - Official](https://marketplace.visualstudio.com/items?itemName=Vue.volar). Desative o Vetur
para evitar conflitos.

## Navegador para desenvolvimento

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Configuração do Vite

Consulte a [referência de configuração do Vite](https://vite.dev/config/).

## Executar o frontend

Requer uma versão do Node.js compatível com `engines` em `package.json`.

```sh
npm ci
npm run dev
```

O servidor de desenvolvimento normalmente fica em <http://localhost:5173>. Para usar as telas que
dependem de dados, inicie também a API seguindo o [guia principal](../README.md#executar-localmente).
O Vite encaminha `/api` para `http://127.0.0.1:8000` durante o desenvolvimento.

## Configuração da API

Copie `.env.example` para `.env` se precisar apontar a interface para outra API:

```sh
VITE_API_BASE_URL=/api
```

Em produção, defina `VITE_API_BASE_URL` durante o build ou configure um proxy reverso para a API.
Não inclua segredos em variáveis `VITE_*`: elas são incorporadas ao código enviado ao navegador.

## Build e qualidade

```sh
npm run lint
npm run build
npm run preview
```

`npm run build` gera os arquivos estáticos em `dist/`. `npm run preview` serve esse build localmente
para inspeção; não é um servidor de produção.

O projeto usa Vue 3 e Vite. No VS Code, recomenda-se a extensão
[Vue - Official](https://marketplace.visualstudio.com/items?itemName=Vue.volar); desative o Vetur
para evitar conflitos.
