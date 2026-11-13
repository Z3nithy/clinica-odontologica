<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import {
  Activity,
  Bell,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ClipboardList,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
} from 'lucide-vue-next'
import { RouterLink, useRouter } from 'vue-router'
import { clearSession, getSessionUser } from '../services/auth-session'
import UiAvatar from './ui/UiAvatar.vue'
import UiToothIcon from './ui/UiToothIcon.vue'

defineProps({
  activePage: {
    type: String,
    required: true,
    validator: (value) =>
      ['overview', 'schedule', 'patient-list', 'odontogram', 'treatment-plans', 'clinical-documents', 'history', 'settings'].includes(value),
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
  { id: 'schedule', label: 'Agenda', icon: CalendarRange },
  { id: 'patient-list', label: 'Paciente', icon: Users },
  { id: 'odontogram', label: 'Odontograma', icon: Activity },
  { id: 'treatment-plans', label: 'Plano de Tratamento', icon: ClipboardList },
  { id: 'clinical-documents', label: 'Receita e Documentos', icon: FileText },
  { id: 'history', label: 'Histórico', icon: History },
]
const profileMenuOpen = ref(false)
const notificationPanelOpen = ref(false)
const loggingOut = ref(false)
const profileWrap = ref(null)
const profileTrigger = ref(null)
const notificationWrap = ref(null)
const notificationTrigger = ref(null)

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

function goToSettings() {
  profileMenuOpen.value = false
  void router.push({ name: 'dentist-settings' })
}

function goToNotificationPreferences() {
  profileMenuOpen.value = false
  notificationPanelOpen.value = false
  void router.push({ name: 'dentist-settings' })
}

function closeProfileMenu() {
  profileMenuOpen.value = false
}

function refreshSessionUser() {
  currentUser.value = getSessionUser()
}

function handleDocumentPointerDown(event) {
  if (event.target instanceof Node && !profileWrap.value?.contains(event.target)) {
    closeProfileMenu()
  }
  if (event.target instanceof Node && !notificationWrap.value?.contains(event.target)) {
    notificationPanelOpen.value = false
  }
}

function handleDocumentKeydown(event) {
  if (event.key === 'Escape' && profileMenuOpen.value) {
    closeProfileMenu()
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
  <header class="dentist-shell__header">
    <RouterLink class="dentist-shell__brand" :to="{ name: 'dentist-dashboard' }" aria-label="Zen — início">
      <span class="dentist-shell__brand-mark"><UiToothIcon :size="20" /></span>
      <span>Zen</span>
      <span class="dentist-shell__brand-divider" aria-hidden="true"></span>
      <span class="dentist-shell__area">Dentista</span>
    </RouterLink>

    <div class="dentist-shell__header-actions">
      <span class="dentist-shell__date" :aria-label="dateLabel">
        <CalendarDays :size="16" aria-hidden="true" />
        <span class="dentist-shell__date-full" aria-hidden="true">{{ dateLabel }}</span>
        <span class="dentist-shell__date-compact" aria-hidden="true">{{ compactDateLabel }}</span>
      </span>
      <div ref="notificationWrap" class="dentist-shell__notification-wrap">
        <button
          ref="notificationTrigger"
          class="dentist-shell__icon-action"
          type="button"
          aria-label="Notificações recentes"
          :aria-expanded="notificationPanelOpen"
          aria-controls="dentist-recent-notifications"
          @click="notificationPanelOpen = !notificationPanelOpen"
        >
          <Bell :size="19" aria-hidden="true" />
        </button>
        <section
          v-if="notificationPanelOpen"
          id="dentist-recent-notifications"
          class="dentist-shell__notification-panel"
          aria-label="Notificações recentes"
          aria-live="polite"
        >
          <div class="dentist-shell__panel-heading">
            <div>
              <h2>Notificações</h2>
              <p>Atualizações recentes da clínica</p>
            </div>
            <Bell :size="18" aria-hidden="true" />
          </div>
          <div class="dentist-shell__notification-empty">
            <span class="dentist-shell__notification-mark"><Bell :size="19" aria-hidden="true" /></span>
            <strong>Nenhuma notificação recente</strong>
            <p>Os avisos aparecerão aqui quando os eventos da clínica estiverem conectados ao sistema.</p>
          </div>
          <button class="dentist-shell__notification-preferences" type="button" @click="goToNotificationPreferences">
            Preferências de notificações
          </button>
        </section>
      </div>
      <div ref="profileWrap" class="dentist-shell__profile-wrap">
        <button
          ref="profileTrigger"
          class="dentist-shell__profile-trigger"
          type="button"
          :aria-label="`Menu da conta de ${currentUser?.name || 'dentista'}`"
          :aria-expanded="profileMenuOpen"
          aria-controls="dentist-profile-menu"
          @click="profileMenuOpen = !profileMenuOpen"
        >
          <UiAvatar :name="currentUser?.name || 'Dentista'" size="sm" />
          <span class="dentist-shell__profile-name">{{ currentUser?.name || 'Dentista' }}</span>
          <ChevronDown :size="15" aria-hidden="true" />
        </button>
        <div v-if="profileMenuOpen" id="dentist-profile-menu" class="dentist-shell__profile-menu">
          <span class="dentist-shell__menu-label">Dentista</span>
          <button type="button" @click="goToSettings">
            <Settings :size="16" aria-hidden="true" /> Configurações
          </button>
          <button type="button" @click="logOut">
            <LogOut :size="16" aria-hidden="true" /> Deslogar
          </button>
        </div>
      </div>
    </div>
  </header>

  <nav class="dentist-shell__nav" aria-label="Navegação: Dentista">
    <div class="dentist-shell__nav-items">
      <button
        v-for="item in navigationItems"
        :key="item.id"
        class="dentist-shell__nav-icon"
        :class="{ 'dentist-shell__nav-icon--active': item.id === activePage }"
        type="button"
        :aria-label="item.label"
        :aria-current="item.id === activePage ? 'page' : undefined"
        @click="emit('navigate', item.id)"
      >
        <component :is="item.icon" :size="19" aria-hidden="true" />
        <span class="dentist-shell__nav-tooltip" role="tooltip">{{ item.label }}</span>
      </button>
      <span class="dentist-shell__nav-divider" aria-hidden="true"></span>
      <button
        class="dentist-shell__nav-icon"
        type="button"
        aria-label="Configurações"
        :class="{ 'dentist-shell__nav-icon--active': activePage === 'settings' }"
        :aria-current="activePage === 'settings' ? 'page' : undefined"
        @click="goToSettings"
      >
        <Settings :size="19" aria-hidden="true" />
        <span class="dentist-shell__nav-tooltip" role="tooltip">Configurações</span>
      </button>
    </div>
    <span class="dentist-shell__caption">Dentista</span>
  </nav>

  <div v-if="loggingOut" class="dentist-shell__logout" role="status" aria-live="polite" aria-busy="true">
    <div class="dentist-shell__logout-content">
      <span class="dentist-shell__logout-mark"><UiToothIcon :size="28" /></span>
      <span class="dentist-shell__logout-spinner" aria-hidden="true"></span>
      <strong>Encerrando sua sessão</strong>
      <span>Você será redirecionada em instantes.</span>
    </div>
  </div>
</template>

<style scoped>
.dentist-shell__header,
.dentist-shell__brand,
.dentist-shell__header-actions,
.dentist-shell__date,
.dentist-shell__profile-trigger,
.dentist-shell__nav-items {
  display: flex;
  align-items: center;
}

.dentist-shell__header {
  min-height: 4.5rem;
  justify-content: space-between;
  gap: var(--space-4);
  padding: 0 clamp(var(--space-4), 4vw, var(--space-10));
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}

.dentist-shell__brand {
  gap: var(--space-3);
  color: var(--color-text);
  font-family: var(--font-heading);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  text-decoration: none;
}

.dentist-shell__brand-mark {
  display: grid;
  width: 2.25rem;
  height: 2.25rem;
  place-items: center;
  border-radius: var(--radius-md);
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}

.dentist-shell__brand-divider {
  width: 1px;
  height: 1.5rem;
  margin-inline: var(--space-2);
  background: var(--color-border);
}

.dentist-shell__area,
.dentist-shell__date {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.dentist-shell__area {
  font-family: var(--font-body);
}

.dentist-shell__header-actions {
  gap: var(--space-4);
}

.dentist-shell__date {
  flex: 0 0 auto;
  gap: var(--space-2);
  text-transform: capitalize;
  white-space: nowrap;
}

.dentist-shell__date-compact {
  display: none;
}

.dentist-shell__notification-wrap,
.dentist-shell__profile-wrap {
  position: relative;
}

.dentist-shell__icon-action {
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

.dentist-shell__icon-action:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}

.dentist-shell__profile-trigger {
  gap: var(--space-2);
  padding: var(--space-1);
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}

.dentist-shell__profile-trigger:hover {
  background: var(--color-background);
}

.dentist-shell__profile-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.dentist-shell__notification-panel,
.dentist-shell__profile-menu {
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

.dentist-shell__notification-panel {
  width: min(22rem, calc(100vw - 1.5rem));
}

.dentist-shell__panel-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4);
  border-bottom: 1px solid var(--color-border);
  color: var(--color-primary);
}

.dentist-shell__panel-heading h2 {
  margin: 0;
  color: var(--color-text);
  font-size: var(--font-size-md);
}

.dentist-shell__panel-heading p,
.dentist-shell__notification-empty p {
  margin: var(--space-1) 0 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.5;
}

.dentist-shell__notification-empty {
  display: grid;
  justify-items: center;
  gap: var(--space-2);
  padding: var(--space-6) var(--space-4);
  text-align: center;
}

.dentist-shell__notification-empty strong {
  color: var(--color-text);
  font-size: var(--font-size-sm);
}

.dentist-shell__notification-mark {
  display: grid;
  width: 2.5rem;
  height: 2.5rem;
  place-items: center;
  border-radius: var(--radius-pill);
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}

.dentist-shell__notification-preferences {
  width: 100%;
  padding: var(--space-3) var(--space-4);
  border: 0;
  border-top: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-primary);
  cursor: pointer;
  font: inherit;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  text-align: left;
}

.dentist-shell__notification-preferences:hover {
  background: var(--color-primary-subtle);
}

.dentist-shell__profile-menu {
  display: grid;
  width: max-content;
  min-width: 13rem;
  gap: var(--space-1);
  padding: var(--space-2);
}

.dentist-shell__menu-label {
  padding: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.dentist-shell__profile-menu button {
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

.dentist-shell__profile-menu button:hover {
  background: var(--color-background);
}

.dentist-shell__header :focus-visible,
.dentist-shell__nav-icon:focus-visible,
.dentist-shell__brand:focus-visible,
.dentist-shell__notification-preferences:focus-visible {
  outline: 3px solid var(--color-blue-300);
  outline-offset: 3px;
}

.dentist-shell__nav {
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

.dentist-shell__nav-items {
  gap: var(--space-2);
}

.dentist-shell__nav-icon {
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

.dentist-shell__nav-icon:hover,
.dentist-shell__nav-icon:focus-visible,
.dentist-shell__nav-icon--active {
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}

.dentist-shell__nav-icon--active::after {
  position: absolute;
  right: 0.7rem;
  bottom: -0.64rem;
  left: 0.7rem;
  height: 2px;
  border-radius: var(--radius-pill);
  background: var(--color-primary);
  content: '';
}

.dentist-shell__nav-tooltip {
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

.dentist-shell__nav-icon:hover .dentist-shell__nav-tooltip,
.dentist-shell__nav-icon:focus-visible .dentist-shell__nav-tooltip {
  transform: translate(-50%, 0);
  opacity: 1;
}

.dentist-shell__nav-divider {
  width: 1px;
  height: 1.5rem;
  margin: 0 var(--space-2);
  background: var(--color-border);
}

.dentist-shell__caption {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.dentist-shell__logout {
  position: fixed;
  z-index: 10000;
  inset: 0;
  display: grid;
  place-items: center;
  padding: var(--space-6);
  background: var(--color-background);
}

.dentist-shell__logout-content {
  display: grid;
  justify-items: center;
  gap: var(--space-3);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  text-align: center;
}

.dentist-shell__logout-mark {
  display: grid;
  width: 3.5rem;
  height: 3.5rem;
  margin-bottom: var(--space-2);
  place-items: center;
  border-radius: var(--radius-lg);
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}

.dentist-shell__logout-spinner {
  width: 1.5rem;
  height: 1.5rem;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: var(--radius-pill);
  animation: dentist-shell-spin 0.75s linear infinite;
}

.dentist-shell__logout-content strong {
  color: var(--color-text);
  font-size: var(--font-size-md);
}

@keyframes dentist-shell-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 42.5rem) {
  .dentist-shell__header {
    min-height: 4rem;
    padding-inline: var(--space-3);
  }

  .dentist-shell__header-actions {
    gap: var(--space-2);
  }

  .dentist-shell__date {
    font-size: var(--font-size-xs);
  }

  .dentist-shell__date-full,
  .dentist-shell__profile-name,
  .dentist-shell__profile-trigger > svg {
    display: none;
  }

  .dentist-shell__date-compact {
    display: inline;
  }

  .dentist-shell__brand {
    gap: var(--space-2);
    font-size: var(--font-size-md);
  }

  .dentist-shell__brand-divider {
    margin-inline: var(--space-1);
  }

  .dentist-shell__nav {
    min-height: 3.5rem;
    overflow-x: auto;
    padding-inline: var(--space-2);
    scrollbar-width: none;
  }

  .dentist-shell__nav::-webkit-scrollbar {
    display: none;
  }

  .dentist-shell__nav-items {
    min-width: max-content;
    gap: 2px;
  }

  .dentist-shell__caption {
    display: none;
  }
}

@media (min-width: 42.501rem) and (max-width: 56.25rem) {
  .dentist-shell__date-full {
    display: none;
  }

  .dentist-shell__date-compact {
    display: inline;
  }

  .dentist-shell__header {
    gap: var(--space-2);
    padding-inline: var(--space-4);
  }

  .dentist-shell__header-actions {
    gap: var(--space-2);
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition-duration: 0.01ms !important;
  }

  .dentist-shell__logout-spinner {
    animation: none;
  }
}
</style>
