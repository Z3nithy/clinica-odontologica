<script setup>
import { ref } from 'vue'
import {
  ArrowLeft,
  Bell,
  Check,
  ChevronRight,
  CircleHelp,
  Heart,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-vue-next'
import UiAccordion from '../components/ui/UiAccordion.vue'
import UiAlert from '../components/ui/UiAlert.vue'
import UiAvatar from '../components/ui/UiAvatar.vue'
import UiBadge from '../components/ui/UiBadge.vue'
import UiBreadcrumbs from '../components/ui/UiBreadcrumbs.vue'
import UiButton from '../components/ui/UiButton.vue'
import UiCard from '../components/ui/UiCard.vue'
import UiCheckbox from '../components/ui/UiCheckbox.vue'
import UiDialog from '../components/ui/UiDialog.vue'
import UiDropdownMenu from '../components/ui/UiDropdownMenu.vue'
import UiDrawer from '../components/ui/UiDrawer.vue'
import UiEmptyState from '../components/ui/UiEmptyState.vue'
import UiErrorState from '../components/ui/UiErrorState.vue'
import UiFormField from '../components/ui/UiFormField.vue'
import UiIconButton from '../components/ui/UiIconButton.vue'
import UiInput from '../components/ui/UiInput.vue'
import UiLabel from '../components/ui/UiLabel.vue'
import UiPagination from '../components/ui/UiPagination.vue'
import UiRadioGroup from '../components/ui/UiRadioGroup.vue'
import UiSelect from '../components/ui/UiSelect.vue'
import UiSkeleton from '../components/ui/UiSkeleton.vue'
import UiSpinner from '../components/ui/UiSpinner.vue'
import UiSwitch from '../components/ui/UiSwitch.vue'
import UiTabs from '../components/ui/UiTabs.vue'
import UiTextarea from '../components/ui/UiTextarea.vue'
import UiToast from '../components/ui/UiToast.vue'
import UiTooltip from '../components/ui/UiTooltip.vue'
import UiToothIcon from '../components/ui/UiToothIcon.vue'

const name = ref('Marina')
const email = ref('')
const appointmentType = ref('checkup')
const contactPreference = ref('email')
const acceptedTerms = ref(true)
const notificationsEnabled = ref(true)
const activeTab = ref('foundations')
const currentPage = ref(2)
const selectedMenuItem = ref('Nenhuma ação selecionada')
const dialogOpen = ref(false)
const drawerOpen = ref(false)
const toastVisible = ref(false)
const toastCount = ref(0)

const appointmentOptions = [
  { value: 'checkup', label: 'Avaliação preventiva' },
  { value: 'cleaning', label: 'Limpeza' },
  { value: 'consultation', label: 'Conversa inicial' },
]
const contactOptions = [
  { value: 'email', label: 'E-mail' },
  { value: 'phone', label: 'Telefone' },
  { value: 'whatsapp', label: 'WhatsApp', disabled: true },
]
const accordionItems = [
  {
    id: 'props',
    question: 'Como os componentes recebem estilos?',
    answer:
      'Eles consomem tokens semânticos do design system e expõem variantes pequenas e explícitas por props.',
  },
  {
    id: 'a11y',
    question: 'Como a biblioteca trata acessibilidade?',
    answer:
      'Os componentes usam elementos nativos sempre que possível, rótulos acessíveis, estados ARIA e foco visível.',
  },
]
const tabs = [
  { id: 'foundations', label: 'Fundamentos' },
  { id: 'components', label: 'Componentes' },
  { id: 'patterns', label: 'Padrões' },
]
const tabIcons = {
  foundations: Heart,
  components: Sparkles,
  patterns: Check,
}
const menuItems = [
  { id: 'edit', label: 'Editar perfil' },
  { id: 'copy', label: 'Copiar endereço' },
  { id: 'remove', label: 'Remover acesso', disabled: true },
]
const breadcrumbs = [
  { label: 'Início', href: '/' },
  { label: 'Biblioteca de UI', href: '/design-system' },
  { label: 'Componentes' },
]

function showToastExample() {
  toastCount.value += 1
  toastVisible.value = true
}
</script>

<template>
  <div class="ds-page">
    <header class="ds-topbar">
      <a class="ds-brand" href="/" aria-label="Voltar ao início">
        <span class="ds-brand-mark"><UiToothIcon :size="20" /></span>
        <span>Zen</span>
      </a>
      <a class="button button--secondary button--sm" href="/">
        <ArrowLeft :size="15" aria-hidden="true" /> Voltar ao início
      </a>
    </header>

    <div class="ds-layout">
      <aside class="ds-sidebar" aria-label="Navegação do design system">
        <p class="ds-sidebar-label">Nesta página</p>
        <a href="#overview">Visão geral</a>
        <a href="#foundations">Fundamentos</a>
        <a href="#actions">Ações</a>
        <a href="#forms">Formulários</a>
        <a href="#feedback">Feedback e status</a>
        <a href="#navigation">Navegação</a>
        <a href="#overlays">Sobreposições</a>
        <a href="#states">Estados</a>
      </aside>

      <main class="ds-main">
        <section id="overview" class="ds-intro">
          <UiBreadcrumbs :items="breadcrumbs" />
          <p class="eyebrow"><span></span> Biblioteca da interface</p>
          <h1>Design system <em>em uso.</em></h1>
          <p class="ds-lead">
            Tokens, componentes e estados reutilizáveis para construir experiências consistentes,
            acessíveis e prontas para evoluir.
          </p>
          <div class="ds-meta">
            <UiBadge variant="info">Vue 3</UiBadge>
            <UiBadge variant="success">Acessibilidade como padrão</UiBadge>
            <UiBadge>Sem dependências adicionais</UiBadge>
          </div>
        </section>

        <UiTabs v-model="activeTab" :tabs="tabs" class="ds-tabs">
          <template #icon="{ tab }">
            <component :is="tabIcons[tab.id]" :size="15" />
          </template>
          <template #default="{ tab }">
            <p v-if="tab.id === 'foundations'">
              Fundamentos definidos por tokens CSS semânticos, com fallback de fonte local.
            </p>
            <p v-else-if="tab.id === 'components'">
              Componentes Vue pequenos, com slots para composição e props explícitas.
            </p>
            <p v-else>
              Padrões de formulário, navegação, feedback e sobreposição com estados acessíveis.
            </p>
          </template>
        </UiTabs>

        <section id="foundations" class="ds-section">
          <div class="ds-section-heading">
            <div>
              <p class="ds-kicker">01 — Fundamentos</p>
              <h2>Uma linguagem visual compartilhada</h2>
            </div>
            <p>Cores, tipografia e superfícies partem dos tokens de `design-system.css`.</p>
          </div>

          <UiCard class="ds-card">
            <h3>Paleta semântica</h3>
            <div class="ds-swatches">
              <div class="ds-swatch">
                <span class="swatch swatch--primary"></span
                ><span>Primary<br /><code>#2878B5</code></span>
              </div>
              <div class="ds-swatch">
                <span class="swatch swatch--navy"></span
                ><span>Texto<br /><code>#183B56</code></span>
              </div>
              <div class="ds-swatch">
                <span class="swatch swatch--blue-soft"></span
                ><span>Superfície sutil<br /><code>#EAF4FB</code></span>
              </div>
              <div class="ds-swatch">
                <span class="swatch swatch--surface"></span
                ><span>Superfície<br /><code>#FFFFFF</code></span>
              </div>
              <div class="ds-swatch">
                <span class="swatch swatch--background"></span
                ><span>Fundo<br /><code>#F5F7FA</code></span>
              </div>
              <div class="ds-swatch">
                <span class="swatch swatch--success"></span
                ><span>Sucesso<br /><code>#248A57</code></span>
              </div>
            </div>
          </UiCard>

          <div class="ds-type-grid">
            <UiCard class="ds-card">
              <p class="ds-kicker">Tipografia de títulos · Plus Jakarta Sans</p>
              <h3 class="ds-type-heading">Saúde com atenção</h3>
              <p class="ds-copy">Texto de interface em Inter, com fallback para fontes locais.</p>
            </UiCard>
            <UiCard class="ds-card ds-token-card">
              <span>Espaço base</span><strong>4 px</strong> <span>Raio de card</span
              ><strong>12 px</strong> <span>Largura de conteúdo</span><strong>1160 px</strong>
            </UiCard>
          </div>
        </section>

        <section id="actions" class="ds-section">
          <div class="ds-section-heading">
            <div>
              <p class="ds-kicker">02 — Ações</p>
              <h2>Botões e ícones</h2>
            </div>
            <p>
              Use uma ação principal por contexto; escolha variantes secundárias para alternativas.
            </p>
          </div>
          <UiCard class="ds-card">
            <div class="ds-component-row">
              <UiButton>
                <template #start><Heart :size="16" /></template>
                Continuar
                <template #end><ChevronRight :size="16" /></template>
              </UiButton>
              <UiButton variant="secondary">Cancelar</UiButton>
              <UiButton variant="tertiary">Ação discreta</UiButton>
              <UiButton variant="danger">Remover</UiButton>
              <UiButton size="sm">Pequeno</UiButton>
              <UiButton size="lg">Grande</UiButton>
            </div>
            <div class="ds-component-row ds-state-row">
              <UiButton :loading="true">Estado de carregamento</UiButton>
              <UiButton :disabled="true">Desabilitado</UiButton>
              <UiIconButton label="Buscar"><Search :size="18" aria-hidden="true" /></UiIconButton>
              <UiTooltip content="Ajuda sobre esta ação">
                <template #default="{ describedBy }">
                  <UiIconButton label="Ajuda" :aria-describedby="describedBy">
                    <CircleHelp :size="18" aria-hidden="true" />
                  </UiIconButton>
                </template>
              </UiTooltip>
            </div>
          </UiCard>
        </section>

        <section id="forms" class="ds-section">
          <div class="ds-section-heading">
            <div>
              <p class="ds-kicker">03 — Formulários</p>
              <h2>Campos claros e associados</h2>
            </div>
            <p>Rótulos, dicas e mensagens de validação ficam semanticamente ligados ao controle.</p>
          </div>
          <UiCard class="ds-card">
            <div class="ds-form-grid">
              <UiFormField label="Nome" hint="Como prefere ser chamado?" required>
                <template #default="{ id, describedBy, invalid, required }">
                  <UiInput
                    :id="id"
                    v-model="name"
                    autocomplete="given-name"
                    :aria-describedby="describedBy"
                    :aria-required="required"
                    :required="required"
                    :invalid="invalid"
                  >
                    <template #leading><Heart :size="17" /></template>
                  </UiInput>
                </template>
              </UiFormField>
              <UiFormField label="E-mail" error="Informe um e-mail válido." required>
                <template #default="{ id, describedBy, invalid, required }">
                  <UiInput
                    :id="id"
                    v-model="email"
                    type="email"
                    autocomplete="email"
                    placeholder="voce@exemplo.com"
                    :aria-describedby="describedBy"
                    :aria-required="required"
                    :required="required"
                    :invalid="invalid"
                  />
                </template>
              </UiFormField>
              <UiFormField label="Tipo de atendimento">
                <template #default="{ id }">
                  <UiSelect :id="id" v-model="appointmentType" :options="appointmentOptions">
                    <template #icon><ChevronRight :size="16" /></template>
                  </UiSelect>
                </template>
              </UiFormField>
              <UiFormField label="Mensagem">
                <template #default="{ id }">
                  <UiTextarea :id="id" placeholder="Escreva uma observação..." :rows="3" />
                </template>
              </UiFormField>
            </div>
            <div class="ds-choice-grid">
              <UiCheckbox v-model="acceptedTerms" label="Aceito receber informações importantes" />
              <UiRadioGroup
                v-model="contactPreference"
                label="Preferência de contato"
                :options="contactOptions"
              />
              <UiSwitch v-model="notificationsEnabled" label="Ativar notificações" />
            </div>
            <UiLabel required>Campo com indicação de obrigatoriedade</UiLabel>
          </UiCard>
        </section>

        <section id="feedback" class="ds-section">
          <div class="ds-section-heading">
            <div>
              <p class="ds-kicker">04 — Feedback</p>
              <h2>Estados que não dependem só da cor</h2>
            </div>
            <p>Badges, alertas e notificações acompanham o estado com texto e semântica.</p>
          </div>
          <UiCard class="ds-card">
            <div class="ds-component-row">
              <UiBadge>Rascunho</UiBadge>
              <UiBadge variant="info">Informação</UiBadge>
              <UiBadge variant="success"><Check :size="13" aria-hidden="true" /> Concluído</UiBadge>
              <UiBadge variant="warning">Atenção</UiBadge>
              <UiBadge variant="danger">Falha</UiBadge>
              <UiAvatar name="Marina Oliveira" />
              <UiAvatar name="Zen" size="sm" />
              <UiAvatar name="Equipe Clínica" size="lg" />
            </div>
            <div class="ds-alert-grid">
              <UiAlert title="Tudo certo" variant="success">
                <template #icon><Check :size="18" /></template>
                Alterações salvas com sucesso.
              </UiAlert>
              <UiAlert title="Atenção" variant="warning">
                <template #icon><CircleHelp :size="18" /></template>
                Confira os dados antes de continuar.
              </UiAlert>
              <UiAlert title="Não foi possível concluir" variant="danger">
                <template #icon><X :size="18" /></template>
                Tente novamente ou procure suporte.
              </UiAlert>
              <UiAlert title="Informação" variant="info">
                <template #icon><Sparkles :size="18" /></template>
                Você pode atualizar esta preferência depois.
              </UiAlert>
            </div>
            <div class="ds-component-row">
              <UiButton @click="showToastExample">
                <Bell :size="16" aria-hidden="true" /> Mostrar exemplo de toast
              </UiButton>
              <span class="ds-inline-note">Fechamento automático em 5 segundos.</span>
            </div>
          </UiCard>
          <UiToast
            v-model="toastVisible"
            :message="`Exemplo de notificação${toastCount > 1 ? ` #${toastCount}` : ''}.`"
          />
        </section>

        <section id="navigation" class="ds-section">
          <div class="ds-section-heading">
            <div>
              <p class="ds-kicker">05 — Navegação</p>
              <h2>Orientação e contexto</h2>
            </div>
            <p>Controles para dividir conteúdo, localizar a posição e percorrer resultados.</p>
          </div>
          <UiCard class="ds-card ds-navigation-demo">
            <div>
              <h3>Menu de contexto</h3>
              <UiDropdownMenu
                label="Ações do perfil"
                :items="menuItems"
                @select="selectedMenuItem = $event.label"
              >
                <template #icon="{ item }">
                  <component
                    :is="item.id === 'remove' ? X : item.id === 'copy' ? Check : Heart"
                    :size="16"
                  />
                </template>
              </UiDropdownMenu>
              <p class="ds-inline-note">{{ selectedMenuItem }}</p>
            </div>
            <div>
              <h3>Trilha de navegação</h3>
              <UiBreadcrumbs :items="breadcrumbs" />
            </div>
            <div>
              <h3>Paginação · página {{ currentPage }}</h3>
              <UiPagination v-model:page="currentPage" :total-pages="5" />
            </div>
            <div>
              <h3>Acordeão</h3>
              <UiAccordion :items="accordionItems" />
            </div>
          </UiCard>
        </section>

        <section id="overlays" class="ds-section">
          <div class="ds-section-heading">
            <div>
              <p class="ds-kicker">06 — Sobreposições</p>
              <h2>Diálogos e painéis</h2>
            </div>
            <p>
              Elementos modais usam o diálogo nativo para foco, teclado e fechamento com Escape.
            </p>
          </div>
          <UiCard class="ds-card ds-component-row">
            <UiButton @click="dialogOpen = true">Abrir diálogo</UiButton>
            <UiButton variant="secondary" @click="drawerOpen = true">Abrir painel lateral</UiButton>
          </UiCard>
          <UiDialog v-model="dialogOpen" title="Confirmar alteração">
            <p>Este é um exemplo de diálogo modal com foco gerenciado pelo navegador.</p>
            <template #footer>
              <UiButton variant="secondary" @click="dialogOpen = false">Cancelar</UiButton>
              <UiButton @click="dialogOpen = false">Confirmar</UiButton>
            </template>
          </UiDialog>
          <UiDrawer v-model="drawerOpen" title="Painel de detalhes">
            <p>
              O drawer ocupa a lateral em telas grandes e se adapta à parte inferior em telas
              pequenas.
            </p>
            <UiButton variant="secondary" @click="drawerOpen = false">
              <X :size="16" aria-hidden="true" /> Fechar painel
            </UiButton>
          </UiDrawer>
        </section>

        <section id="states" class="ds-section">
          <div class="ds-section-heading">
            <div>
              <p class="ds-kicker">07 — Estados</p>
              <h2>Carregamento, vazio e erro</h2>
            </div>
            <p>
              Mensagens orientam a próxima ação e skeletons não substituem informação acessível.
            </p>
          </div>
          <div class="ds-state-grid">
            <UiCard class="ds-card">
              <h3>Carregamento</h3>
              <div class="ds-loading-row"><UiSpinner /><span>Carregando conteúdo...</span></div>
              <UiSkeleton height="14px" />
              <UiSkeleton width="72%" height="14px" />
              <UiSkeleton width="48%" height="14px" />
            </UiCard>
            <UiCard class="ds-card">
              <h3>Estado vazio</h3>
              <UiEmptyState
                title="Nenhum item por aqui"
                description="Quando houver conteúdo, ele aparecerá nesta área."
              >
                <template #icon><Sparkles :size="23" aria-hidden="true" /></template>
                <UiButton size="sm"><Plus :size="15" aria-hidden="true" /> Adicionar item</UiButton>
              </UiEmptyState>
            </UiCard>
            <UiCard class="ds-card">
              <h3>Estado de erro</h3>
              <UiErrorState @retry="toastVisible = true">
                <template #icon><X :size="20" aria-hidden="true" /></template>
              </UiErrorState>
            </UiCard>
          </div>
        </section>

        <footer class="ds-footer">
          <span>Biblioteca de UI · Zen</span>
          <a href="/">Voltar para a página inicial <ArrowLeft :size="15" aria-hidden="true" /></a>
        </footer>
      </main>
    </div>
  </div>
</template>

<style>
.ds-page {
  min-height: 100vh;
  background: var(--color-background);
}

.ds-topbar {
  position: sticky;
  z-index: var(--z-sticky);
  top: 0;
  display: flex;
  min-height: 4.5rem;
  align-items: center;
  justify-content: space-between;
  padding: 0 clamp(1rem, 4vw, 3.5rem);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}

.ds-brand {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  gap: var(--space-3);
  color: var(--color-text);
  font-size: var(--font-size-sm);
  text-decoration: none;
}

.ds-brand-mark {
  display: grid;
  width: 2.25rem;
  height: 2.25rem;
  place-items: center;
  border-radius: 50%;
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}

.ds-layout {
  display: grid;
  max-width: 1440px;
  grid-template-columns: 13rem minmax(0, 1fr);
  gap: clamp(2rem, 4vw, 4rem);
  margin: 0 auto;
  padding: 2.5rem clamp(1rem, 4vw, 3.5rem) 4rem;
}

.ds-sidebar {
  position: sticky;
  top: 7rem;
  display: flex;
  height: fit-content;
  flex-direction: column;
  gap: var(--space-1);
}

.ds-sidebar-label,
.ds-kicker {
  margin: 0 0 var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  letter-spacing: var(--letter-spacing-wide);
  text-transform: uppercase;
}

.ds-sidebar a {
  min-height: 2.75rem;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  text-decoration: none;
}

.ds-sidebar a:hover {
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}

.ds-main {
  min-width: 0;
}

.ds-intro {
  padding: 0 0 var(--space-8);
}

.ds-intro .breadcrumbs {
  margin-bottom: var(--space-8);
}

.ds-intro .eyebrow {
  margin-bottom: var(--space-4);
}

.ds-intro h1 {
  margin: 0 0 var(--space-4);
  color: var(--color-text);
  font-family: var(--font-heading);
  font-size: clamp(2.5rem, 5vw, 4rem);
  font-weight: var(--font-weight-semibold);
  letter-spacing: var(--letter-spacing-tight);
  line-height: var(--line-height-tight);
}

.ds-intro h1 em {
  color: var(--color-accent);
  font-weight: var(--font-weight-semibold);
}

.ds-lead {
  max-width: 44rem;
  margin-bottom: var(--space-5);
  color: var(--color-text-secondary);
  font-size: var(--font-size-lg);
  line-height: var(--line-height-relaxed);
}

.ds-meta,
.ds-component-row,
.ds-state-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.ds-tabs {
  margin-bottom: var(--space-8);
}

.ds-tabs p {
  margin: 0;
  color: var(--color-text-secondary);
}

.ds-section {
  display: grid;
  gap: var(--space-4);
  margin-top: var(--space-12);
  scroll-margin-top: 7rem;
}

.ds-section-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: var(--space-6);
  margin-bottom: var(--space-2);
}

.ds-section-heading h2 {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-heading);
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-semibold);
  letter-spacing: var(--letter-spacing-tight);
}

.ds-section-heading > p {
  max-width: 23rem;
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-body);
}

.ds-card {
  display: grid;
  gap: var(--space-5);
  padding: var(--space-6);
}

.ds-card h3 {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-heading);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
}

.ds-swatches {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr));
  gap: var(--space-4);
}

.ds-swatch {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-body);
}

.ds-swatch code {
  color: var(--color-text-muted);
}

.swatch {
  width: 2.5rem;
  height: 2.5rem;
  flex: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.swatch--primary {
  background: var(--color-primary);
}
.swatch--navy {
  background: var(--color-blue-900);
}
.swatch--blue-soft {
  background: var(--color-blue-50);
}
.swatch--surface {
  background: var(--color-surface);
}
.swatch--background {
  background: var(--color-background);
}
.swatch--success {
  background: var(--color-success);
}

.ds-type-grid,
.ds-state-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}

.ds-type-heading {
  margin: 0;
  font-family: var(--font-heading);
  font-size: var(--font-size-2xl);
}

.ds-copy,
.ds-inline-note {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.ds-token-card {
  grid-template-columns: 1fr auto;
  align-items: center;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.ds-token-card strong {
  color: var(--color-text);
  font-weight: var(--font-weight-semibold);
}

.ds-state-row {
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border);
}

.ds-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-5);
}

.ds-choice-grid {
  display: grid;
  gap: var(--space-3);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border);
}

.ds-alert-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

.ds-navigation-demo > div {
  display: grid;
  justify-items: start;
  gap: var(--space-3);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.ds-navigation-demo > div:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.ds-navigation-demo .ui-accordion {
  width: 100%;
}

.ds-loading-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.ds-footer {
  display: flex;
  justify-content: space-between;
  gap: var(--space-4);
  margin-top: var(--space-16);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.ds-footer a {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-primary);
}

@media (max-width: 56.25rem) {
  .ds-layout {
    grid-template-columns: 1fr;
  }

  .ds-sidebar {
    position: static;
    flex-direction: row;
    overflow-x: auto;
    padding-bottom: var(--space-2);
  }

  .ds-sidebar-label {
    display: none;
  }

  .ds-sidebar a {
    flex: none;
  }
}

@media (max-width: 42.5rem) {
  .ds-topbar {
    min-height: 4rem;
  }

  .ds-layout {
    gap: var(--space-5);
    padding-top: var(--space-5);
  }

  .ds-section-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: var(--space-2);
  }

  .ds-section-heading h2 {
    font-size: var(--font-size-xl);
  }

  .ds-card {
    padding: var(--space-4);
  }

  .ds-type-grid,
  .ds-state-grid,
  .ds-form-grid,
  .ds-alert-grid {
    grid-template-columns: 1fr;
  }

  .ds-footer {
    flex-direction: column;
  }
}
</style>
