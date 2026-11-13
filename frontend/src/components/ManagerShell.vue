<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import {
  Bell,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  ChartColumn,
  Settings,
  UserRound,
  FileChartColumn,
  UsersRound,
} from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { clearSession, getSessionUser } from '../services/auth-session'
import UiAvatar from './ui/UiAvatar.vue'
import UiToothIcon from './ui/UiToothIcon.vue'

defineProps({
  activePage: {
    type: String,
    required: true,
    validator: (value) => ['overview', 'schedule', 'team', 'productivity', 'patients', 'reports', 'settings'].includes(value),
  },
  dateLabel: { type: String, required: true },
})
const emit = defineEmits(['navigate'])
const router = useRouter()
const currentUser = ref(getSessionUser())
const compactDateLabel = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
}).format(new Date())
const navigationItems = [
  { id: 'overview', label: 'Visão Geral', icon: LayoutDashboard },
  { id: 'schedule', label: 'Visão Geral da Agenda', icon: CalendarRange },
  { id: 'team', label: 'Gestão de Usuários e Equipe', icon: UsersRound },
  { id: 'productivity', label: 'Produtividade da Equipe', icon: ChartColumn },
  { id: 'patients', label: 'Gestão de Pacientes', icon: UserRound },
  { id: 'reports', label: 'Relatórios Gerenciais', icon: FileChartColumn },
  { id: 'settings', label: 'Configurações', icon: Settings },
]
const profileMenuOpen = ref(false)
const notificationPanelOpen = ref(false)
const loggingOut = ref(false)
const profileWrap = ref(null)
const profileTrigger = ref(null)
const notificationWrap = ref(null)
const notificationTrigger = ref(null)

function navigateToSettings() {
  profileMenuOpen.value = false
  notificationPanelOpen.value = false
  emit('navigate', 'settings')
}

function navigateToOverview() {
  profileMenuOpen.value = false
  notificationPanelOpen.value = false
  emit('navigate', 'overview')
}

async function logOut() {
  const logoutEvent = new Event('zen:logout-requested', { cancelable: true })
  window.dispatchEvent(logoutEvent)
  if (logoutEvent.defaultPrevented) return

  profileMenuOpen.value = false
  loggingOut.value = true
  clearSession()
  await new Promise((resolve) => window.setTimeout(resolve, 450))
  await router.push('/')
}

function refreshSessionUser() {
  currentUser.value = getSessionUser()
}

function handleDocumentPointerDown(event) {
  if (event.target instanceof Node && !profileWrap.value?.contains(event.target)) {
    profileMenuOpen.value = false
  }
  if (event.target instanceof Node && !notificationWrap.value?.contains(event.target)) {
    notificationPanelOpen.value = false
  }
}

function handleDocumentKeydown(event) {
  if (event.key === 'Escape' && profileMenuOpen.value) {
    profileMenuOpen.value = false
    profileTrigger.value?.focus()
  }
  if (event.key === 'Escape' && notificationPanelOpen.value) {
    notificationPanelOpen.value = false
    notificationTrigger.value?.focus()
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  document.addEventListener('keydown', handleDocumentKeydown)
  window.addEventListener('zen:session-changed', refreshSessionUser)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  document.removeEventListener('keydown', handleDocumentKeydown)
  window.removeEventListener('zen:session-changed', refreshSessionUser)
})
</script>

<template>
  <header class="manager-shell__header">
    <button
      class="manager-shell__brand"
      type="button"
      aria-label="Zen — visão geral do gestor"
      @click="navigateToOverview"
    >
      <span class="manager-shell__brand-mark"><UiToothIcon :size="20" /></span>
      <span>Zen</span>
      <span class="manager-shell__brand-divider" aria-hidden="true"></span>
      <span class="manager-shell__area">Gestor</span>
    </button>

    <div class="manager-shell__header-actions">
      <span class="manager-shell__date" :aria-label="dateLabel">
        <CalendarDays :size="16" aria-hidden="true" />
        <span class="manager-shell__date-full" aria-hidden="true">{{ dateLabel }}</span>
        <span class="manager-shell__date-compact" aria-hidden="true">{{ compactDateLabel }}</span>
      </span>
      <div ref="notificationWrap" class="manager-shell__notification-wrap">
        <button
          ref="notificationTrigger"
          class="manager-shell__icon-action"
          type="button"
          aria-label="Notificações recentes"
          :aria-expanded="notificationPanelOpen"
          aria-controls="manager-recent-notifications"
          @click="notificationPanelOpen = !notificationPanelOpen"
        >
          <Bell :size="19" aria-hidden="true" />
        </button>
        <section
          v-if="notificationPanelOpen"
          id="manager-recent-notifications"
          class="manager-shell__notification-panel"
          aria-label="Notificações recentes"
          aria-live="polite"
        >
          <div class="manager-shell__panel-heading">
            <div>
              <h2>Notificações</h2>
              <p>Atualizações recentes da clínica</p>
            </div>
            <Bell :size="18" aria-hidden="true" />
          </div>
          <div class="manager-shell__notification-empty">
            <span class="manager-shell__notification-mark"><Bell :size="19" aria-hidden="true" /></span>
            <strong>Central não integrada</strong>
            <p>O sistema ainda não disponibiliza notificações ou contador de itens não lidos para o gestor.</p>
          </div>
        </section>
      </div>
      <div ref="profileWrap" class="manager-shell__profile-wrap">
        <button
          ref="profileTrigger"
          class="manager-shell__profile-trigger"
          type="button"
          :aria-label="`Menu da conta de ${currentUser?.name || 'gestor'}`"
          :aria-expanded="profileMenuOpen"
          aria-controls="manager-profile-menu"
          @click="profileMenuOpen = !profileMenuOpen"
        >
          <UiAvatar :name="currentUser?.name || 'Gestor'" size="sm" />
          <span class="manager-shell__profile-name">{{ currentUser?.name || 'Gestor' }}</span>
          <ChevronDown :size="15" aria-hidden="true" />
        </button>
        <div v-if="profileMenuOpen" id="manager-profile-menu" class="manager-shell__profile-menu">
          <span class="manager-shell__menu-label">Gestor</span>
          <button type="button" @click="navigateToSettings">
            <Settings :size="16" aria-hidden="true" /> Configurações
          </button>
          <button type="button" @click="logOut">
            <LogOut :size="16" aria-hidden="true" /> Deslogar
          </button>
        </div>
      </div>
    </div>
  </header>

  <nav class="manager-shell__nav" aria-label="Navegação: Gestor">
    <div class="manager-shell__nav-items">
      <button
        v-for="item in navigationItems"
        :key="item.id"
        class="manager-shell__nav-icon"
        :class="{ 'manager-shell__nav-icon--active': item.id === activePage }"
        type="button"
        :aria-label="item.label"
        :aria-current="item.id === activePage ? 'page' : undefined"
        @click="item.id === 'settings' ? navigateToSettings() : emit('navigate', item.id)"
      >
        <component :is="item.icon" :size="19" aria-hidden="true" />
        <span class="manager-shell__nav-tooltip" role="tooltip">{{ item.label }}</span>
      </button>
    </div>
    <span class="manager-shell__caption">Gestor</span>
  </nav>

  <div v-if="loggingOut" class="manager-shell__logout" role="status" aria-live="polite" aria-busy="true">
    <div class="manager-shell__logout-content">
      <span class="manager-shell__logout-mark"><UiToothIcon :size="28" /></span>
      <span class="manager-shell__logout-spinner" aria-hidden="true"></span>
      <strong>Encerrando sua sessão</strong>
      <span>Você será redirecionado em instantes.</span>
    </div>
  </div>
</template>

<style scoped>
.manager-shell__header,
.manager-shell__brand,
.manager-shell__header-actions,
.manager-shell__date,
.manager-shell__profile-trigger,
.manager-shell__nav-items {
  display: flex;
  align-items: center;
}

.manager-shell__header {
  min-height: 4.5rem;
  justify-content: space-between;
  gap: var(--space-4);
  padding: 0 clamp(var(--space-4), 4vw, var(--space-10));
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}

.manager-shell__brand {
  gap: var(--space-3);
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  font-family: var(--font-heading);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
}

.manager-shell__brand-mark {
  display: grid;
  width: 2.25rem;
  height: 2.25rem;
  place-items: center;
  border-radius: var(--radius-md);
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}

.manager-shell__brand-divider {
  width: 1px;
  height: 1.5rem;
  margin-inline: var(--space-2);
  background: var(--color-border);
}

.manager-shell__area,
.manager-shell__date {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.manager-shell__area {
  font-family: var(--font-body);
}

.manager-shell__header-actions {
  gap: var(--space-4);
}

.manager-shell__date {
  flex: 0 0 auto;
  gap: var(--space-2);
  text-transform: capitalize;
  white-space: nowrap;
}

.manager-shell__date-compact {
  display: none;
}

.manager-shell__notification-wrap,
.manager-shell__profile-wrap {
  position: relative;
}

.manager-shell__icon-action {
  position: relative;
  display: inline-grid;
  width: 2.5rem;
  height: 2.5rem;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: color var(--transition-fast), border-color var(--transition-fast), background var(--transition-fast);
}

.manager-shell__icon-action:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}

.manager-shell__profile-trigger {
  gap: var(--space-2);
  padding: var(--space-1);
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}

.manager-shell__profile-trigger:hover {
  background: var(--color-background);
}

.manager-shell__profile-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.manager-shell__notification-panel,
.manager-shell__profile-menu {
  position: absolute;
  z-index: var(--z-dropdown);
  top: calc(100% + var(--space-2));
  right: 0;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-md);
}

.manager-shell__notification-panel {
  width: min(22rem, calc(100vw - 1.5rem));
}

.manager-shell__panel-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4);
  border-bottom: 1px solid var(--color-border);
  color: var(--color-primary);
}

.manager-shell__panel-heading h2 {
  margin: 0;
  color: var(--color-text);
  font-size: var(--font-size-md);
}

.manager-shell__panel-heading p,
.manager-shell__notification-empty p {
  margin: var(--space-1) 0 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.5;
}

.manager-shell__notification-empty {
  display: grid;
  justify-items: center;
  gap: var(--space-2);
  padding: var(--space-6) var(--space-4);
  text-align: center;
}

.manager-shell__notification-empty strong {
  color: var(--color-text);
  font-size: var(--font-size-sm);
}

.manager-shell__notification-mark {
  display: grid;
  width: 2.5rem;
  height: 2.5rem;
  place-items: center;
  border-radius: var(--radius-pill);
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}

.manager-shell__profile-menu {
  display: grid;
  width: max-content;
  min-width: 13rem;
  gap: var(--space-1);
  padding: var(--space-2);
}

.manager-shell__menu-label {
  padding: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.manager-shell__profile-menu button {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  font-size: var(--font-size-sm);
  text-align: left;
}

.manager-shell__profile-menu button:hover {
  background: var(--color-background);
}

.manager-shell__header :focus-visible,
.manager-shell__nav-icon:focus-visible,
.manager-shell__brand:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 3px;
}

.manager-shell__nav {
  position: relative;
  z-index: var(--z-sticky);
  display: flex;
  min-height: 3.75rem;
  align-items: center;
  justify-content: space-between;
  padding: 0 clamp(var(--space-4), 4vw, var(--space-10));
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}

.manager-shell__nav-items {
  gap: var(--space-2);
}

.manager-shell__nav-icon {
  position: relative;
  display: grid;
  width: 2.5rem;
  height: 2.5rem;
  place-items: center;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: color var(--transition-fast), background var(--transition-fast);
}

.manager-shell__nav-icon:hover,
.manager-shell__nav-icon:focus-visible,
.manager-shell__nav-icon--active {
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}

.manager-shell__nav-icon--active::after {
  position: absolute;
  right: 0.7rem;
  bottom: -0.64rem;
  left: 0.7rem;
  height: 2px;
  border-radius: var(--radius-pill);
  background: var(--color-primary);
  content: '';
}

.manager-shell__nav-tooltip {
  position: absolute;
  z-index: var(--z-dropdown);
  top: calc(100% + 0.5rem);
  left: 50%;
  padding: 0.35rem 0.55rem;
  transform: translate(-50%, -0.15rem);
  border-radius: var(--radius-sm);
  background: var(--color-blue-900);
  color: var(--color-text-inverse);
  font-size: var(--font-size-xs);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--transition-fast), transform var(--transition-fast);
  white-space: nowrap;
}

.manager-shell__nav-icon:hover .manager-shell__nav-tooltip,
.manager-shell__nav-icon:focus-visible .manager-shell__nav-tooltip {
  transform: translate(-50%, 0);
  opacity: 1;
}

.manager-shell__caption {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.manager-shell__logout {
  position: fixed;
  z-index: 10000;
  inset: 0;
  display: grid;
  place-items: center;
  padding: var(--space-6);
  background: var(--color-background);
}

.manager-shell__logout-content {
  display: grid;
  justify-items: center;
  gap: var(--space-3);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  text-align: center;
}

.manager-shell__logout-mark {
  display: grid;
  width: 3.5rem;
  height: 3.5rem;
  margin-bottom: var(--space-2);
  place-items: center;
  border-radius: var(--radius-lg);
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}

.manager-shell__logout-spinner {
  width: 1.5rem;
  height: 1.5rem;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: var(--radius-pill);
  animation: manager-shell-spin 0.75s linear infinite;
}

.manager-shell__logout-content strong {
  color: var(--color-text);
  font-size: var(--font-size-md);
}

@keyframes manager-shell-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 42.5rem) {
  .manager-shell__header {
    min-height: 4rem;
    padding-inline: var(--space-3);
  }

  .manager-shell__header-actions {
    gap: var(--space-2);
  }

  .manager-shell__date {
    font-size: var(--font-size-xs);
  }

  .manager-shell__date-full,
  .manager-shell__profile-name,
  .manager-shell__profile-trigger > svg {
    display: none;
  }

  .manager-shell__date-compact {
    display: inline;
  }

  .manager-shell__brand {
    gap: var(--space-2);
    font-size: var(--font-size-md);
  }

  .manager-shell__brand-divider {
    margin-inline: var(--space-1);
  }

  .manager-shell__nav {
    min-height: 3.5rem;
    overflow-x: auto;
    padding-inline: var(--space-2);
    scrollbar-width: none;
  }

  .manager-shell__nav::-webkit-scrollbar {
    display: none;
  }

  .manager-shell__nav-items {
    min-width: max-content;
    gap: 2px;
  }

  .manager-shell__caption {
    display: none;
  }
}

@media (min-width: 42.501rem) and (max-width: 56.25rem) {
  .manager-shell__date-full {
    display: none;
  }

  .manager-shell__date-compact {
    display: inline;
  }

  .manager-shell__header {
    gap: var(--space-2);
    padding-inline: var(--space-4);
  }

  .manager-shell__header-actions {
    gap: var(--space-2);
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition-duration: 0.01ms !important;
  }

  .manager-shell__logout-spinner {
    animation: none;
  }
}
</style>
