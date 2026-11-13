<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import {
  Bell,
  CalendarDays,
  CheckCheck,
  ChevronDown,
  History,
  LayoutDashboard,
  LogOut,
  Settings,
  UserRoundCheck,
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
      ['overview', 'schedule', 'patient-list', 'checkin', 'confirmations', 'history', 'notifications', 'settings'].includes(value),
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
const profileMenuOpen = ref(false)
const notificationPanelOpen = ref(false)
const loggingOut = ref(false)
const profileWrap = ref(null)
const profileTrigger = ref(null)
const notificationWrap = ref(null)
const notificationTrigger = ref(null)

const receptionistNavigationItems = [
  { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'schedule', label: 'Agenda', icon: CalendarDays },
  { id: 'patient-list', label: 'Pacientes', icon: Users },
  { id: 'checkin', label: 'Check-in', icon: UserRoundCheck },
  { id: 'confirmations', label: 'Confirmações', icon: CheckCheck },
  { id: 'history', label: 'Histórico', icon: History },
]
const navigationItems = receptionistNavigationItems
const roleLabel = 'Recepção'

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

function goToNotificationPreferences() {
  profileMenuOpen.value = false
  notificationPanelOpen.value = false
  void router.push({
    name: 'reception-notification-settings',
  })
}

function goToSettings() {
  profileMenuOpen.value = false
  void router.push({
    name: 'reception-general-settings',
  })
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
  <header class="reception-header">
    <RouterLink
      class="reception-brand"
      :to="{ name: 'reception-dashboard' }"
      aria-label="Zen — início"
    >
      <span class="reception-brand__mark"><UiToothIcon :size="20" /></span>
      <span>Zen</span>
      <span class="reception-brand__divider"></span>
      <span class="reception-brand__area">{{ roleLabel }}</span>
    </RouterLink>

    <div class="reception-header__actions">
      <span class="reception-date" :aria-label="dateLabel">
        <CalendarDays :size="16" aria-hidden="true" />
        <span class="reception-date__full" aria-hidden="true">{{ dateLabel }}</span>
        <span class="reception-date__compact" aria-hidden="true">{{ compactDateLabel }}</span>
      </span>
      <div ref="notificationWrap" class="notification-wrap">
        <button
          ref="notificationTrigger"
          class="icon-action notification-action"
          type="button"
          aria-label="Notificações recentes"
          :aria-expanded="notificationPanelOpen"
          aria-controls="recent-notifications"
          @click="notificationPanelOpen = !notificationPanelOpen"
        >
          <Bell :size="19" aria-hidden="true" />
        </button>
        <section
          v-if="notificationPanelOpen"
          id="recent-notifications"
          class="notification-panel"
          aria-label="Notificações recentes"
          aria-live="polite"
        >
          <div class="notification-panel__heading">
            <div>
              <h2>Notificações</h2>
              <p>Atualizações recentes da clínica</p>
            </div>
            <Bell :size="18" aria-hidden="true" />
          </div>
          <div class="notification-panel__empty">
            <span class="notification-panel__empty-icon">
              <Bell :size="19" aria-hidden="true" />
            </span>
            <strong>Nenhuma notificação recente</strong>
            <p>
              Os avisos aparecerão aqui quando os eventos da clínica estiverem conectados ao sistema.
            </p>
          </div>
          <button
            class="notification-panel__preferences"
            type="button"
            @click="goToNotificationPreferences"
          >
            Preferências de notificações
          </button>
        </section>
      </div>
      <div ref="profileWrap" class="profile-wrap">
        <button
          ref="profileTrigger"
          class="profile-trigger"
          type="button"
          :aria-label="`Menu da conta de ${currentUser?.name || 'usuária'}`"
          :aria-expanded="profileMenuOpen"
          aria-controls="profile-menu"
          @click="profileMenuOpen = !profileMenuOpen"
        >
          <UiAvatar :name="currentUser?.name || 'Recepcionista'" size="sm" />
          <span class="profile-trigger__name">{{ currentUser?.name || 'Recepcionista' }}</span>
          <ChevronDown :size="15" aria-hidden="true" />
        </button>
        <div v-if="profileMenuOpen" id="profile-menu" class="profile-menu">
          <span class="profile-menu__label">{{ roleLabel }}</span>
          <button
            type="button"
            @click="goToSettings"
          >
            <Settings :size="16" aria-hidden="true" /> Configurações
          </button>
          <button type="button" @click="logOut">
            <LogOut :size="16" aria-hidden="true" /> Deslogar
          </button>
        </div>
      </div>
    </div>
  </header>

  <nav class="reception-nav" :aria-label="`Navegação: ${roleLabel}`">
    <div class="reception-nav__items">
      <button
        v-for="item in navigationItems"
        :key="item.id"
        class="nav-icon"
        :class="{ 'nav-icon--active': item.id === activePage }"
        type="button"
        :aria-label="item.label"
        :aria-current="item.id === activePage ? 'page' : undefined"
        @click="emit('navigate', item.id)"
      >
        <component :is="item.icon" :size="19" aria-hidden="true" />
        <span class="nav-tooltip" role="tooltip">{{ item.label }}</span>
      </button>
      <span class="nav-divider" aria-hidden="true"></span>
      <button
        class="nav-icon"
        type="button"
        aria-label="Notificações"
        :class="{ 'nav-icon--active': activePage === 'notifications' }"
        :aria-current="activePage === 'notifications' ? 'page' : undefined"
        @click="goToNotificationPreferences"
      >
        <Bell :size="19" aria-hidden="true" />
        <span class="nav-tooltip" role="tooltip">Notificações</span>
      </button>
      <button
        class="nav-icon"
        type="button"
        aria-label="Configurações"
        :class="{ 'nav-icon--active': activePage === 'settings' }"
        :aria-current="activePage === 'settings' ? 'page' : undefined"
        @click="goToSettings"
      >
        <Settings :size="19" aria-hidden="true" />
        <span class="nav-tooltip" role="tooltip">Configurações</span>
      </button>
    </div>
    <span class="reception-nav__caption">{{ roleLabel }}</span>
  </nav>

  <div v-if="loggingOut" class="logout-screen" role="status" aria-live="polite" aria-busy="true">
    <div class="logout-screen__content">
      <span class="logout-screen__mark"><UiToothIcon :size="28" /></span>
      <span class="logout-screen__spinner" aria-hidden="true"></span>
      <strong>Encerrando sua sessão</strong>
      <span>Você será redirecionada em instantes.</span>
    </div>
  </div>
</template>

<style scoped>
.reception-header {
  display: flex;
  min-height: 4.5rem;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: 0 clamp(var(--space-4), 4vw, var(--space-10));
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}

.reception-brand,
.reception-header__actions,
.reception-date,
.profile-trigger,
.profile-trigger__name,
.reception-nav__items {
  display: flex;
  align-items: center;
}

.reception-brand {
  gap: var(--space-3);
  color: var(--color-text);
  font-family: var(--font-heading);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  text-decoration: none;
}

.reception-brand__mark {
  display: grid;
  width: 2.25rem;
  height: 2.25rem;
  place-items: center;
  border-radius: var(--radius-md);
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}

.reception-brand__divider {
  width: 1px;
  height: 1.5rem;
  margin-inline: var(--space-2);
  background: var(--color-border);
}

.reception-brand__area {
  color: var(--color-text-secondary);
  font-family: var(--font-body);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.reception-header__actions {
  gap: var(--space-4);
}

.reception-date {
  flex: 0 0 auto;
  gap: var(--space-2);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  text-transform: capitalize;
  white-space: nowrap;
}

.reception-date__compact {
  display: none;
}

.icon-action {
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
  transition:
    color var(--transition-fast),
    border-color var(--transition-fast),
    background var(--transition-fast);
}

.icon-action:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}

.icon-action:focus-visible,
.profile-trigger:focus-visible,
.reception-brand:focus-visible,
.nav-icon:focus-visible {
  outline: 3px solid var(--color-blue-300);
  outline-offset: 3px;
}

.profile-wrap {
  position: relative;
}

.notification-wrap {
  position: relative;
}

.notification-panel {
  position: absolute;
  z-index: var(--z-dropdown);
  top: calc(100% + var(--space-2));
  right: 0;
  width: min(22rem, calc(100vw - 1.5rem));
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-md);
}

.notification-panel__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4);
  border-bottom: 1px solid var(--color-border);
  color: var(--color-primary);
}

.notification-panel__heading h2 {
  margin: 0;
  color: var(--color-text);
  font-size: var(--font-size-md);
}

.notification-panel__heading p,
.notification-panel__empty p {
  margin: var(--space-1) 0 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.5;
}

.notification-panel__empty {
  display: grid;
  justify-items: center;
  gap: var(--space-2);
  padding: var(--space-6) var(--space-4);
  text-align: center;
}

.notification-panel__empty strong {
  color: var(--color-text);
  font-size: var(--font-size-sm);
}

.notification-panel__empty-icon {
  display: grid;
  width: 2.5rem;
  height: 2.5rem;
  place-items: center;
  border-radius: var(--radius-pill);
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}

.notification-panel__preferences {
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

.notification-panel__preferences:hover {
  background: var(--color-primary-subtle);
}

.notification-panel__preferences:focus-visible {
  outline: 3px solid var(--color-blue-300);
  outline-offset: -3px;
}

.logout-screen {
  position: fixed;
  z-index: 10000;
  inset: 0;
  display: grid;
  place-items: center;
  padding: var(--space-6);
  background: var(--color-background);
}

.logout-screen__content {
  display: grid;
  justify-items: center;
  gap: var(--space-3);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  text-align: center;
}

.logout-screen__mark {
  display: grid;
  width: 3.5rem;
  height: 3.5rem;
  margin-bottom: var(--space-2);
  place-items: center;
  border-radius: var(--radius-lg);
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}

.logout-screen__spinner {
  width: 1.5rem;
  height: 1.5rem;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: var(--radius-pill);
  animation: logout-spin 0.75s linear infinite;
}

.logout-screen__content strong {
  color: var(--color-text);
  font-size: var(--font-size-md);
}

@keyframes logout-spin {
  to {
    transform: rotate(360deg);
  }
}

.profile-trigger {
  gap: var(--space-2);
  padding: var(--space-1);
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}

.profile-trigger:hover {
  background: var(--color-background);
}

.profile-trigger__name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.profile-menu {
  position: absolute;
  z-index: var(--z-dropdown);
  top: calc(100% + var(--space-2));
  right: 0;
  display: grid;
  width: max-content;
  min-width: 13rem;
  gap: var(--space-1);
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-md);
}

.profile-menu__label {
  padding: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.profile-menu button {
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

.profile-menu button:hover {
  background: var(--color-background);
}

.reception-nav {
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

.reception-nav__items {
  gap: var(--space-2);
}

.nav-icon {
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
  transition:
    color var(--transition-fast),
    background var(--transition-fast);
}

.nav-icon:hover,
.nav-icon:focus-visible,
.nav-icon--active {
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}

.nav-icon--active::after {
  position: absolute;
  right: 0.7rem;
  bottom: -0.64rem;
  left: 0.7rem;
  height: 2px;
  border-radius: var(--radius-pill);
  background: var(--color-primary);
  content: '';
}

.nav-tooltip {
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
  transition:
    opacity var(--transition-fast),
    transform var(--transition-fast);
  white-space: nowrap;
}

.nav-icon:hover .nav-tooltip,
.nav-icon:focus-visible .nav-tooltip {
  transform: translate(-50%, 0);
  opacity: 1;
}

.nav-divider {
  width: 1px;
  height: 1.5rem;
  margin: 0 var(--space-2);
  background: var(--color-border);
}

.reception-nav__caption {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

@media (max-width: 42.5rem) {
  .reception-header {
    min-height: 4rem;
    padding-inline: var(--space-3);
  }

  .reception-header__actions {
    gap: var(--space-2);
  }

  .reception-date {
    font-size: var(--font-size-xs);
  }

  .reception-date__full {
    display: none;
  }

  .reception-date__compact {
    display: inline;
  }

  .profile-trigger__name,
  .profile-trigger > svg {
    display: none;
  }

  .reception-brand {
    gap: var(--space-2);
    font-size: var(--font-size-md);
  }

  .reception-brand__divider {
    margin-inline: var(--space-1);
  }

  .reception-nav {
    min-height: 3.5rem;
    overflow-x: auto;
    padding-inline: var(--space-2);
    scrollbar-width: none;
  }

  .reception-nav::-webkit-scrollbar {
    display: none;
  }

  .reception-nav__items {
    min-width: max-content;
    gap: 2px;
  }

  .reception-nav__caption {
    display: none;
  }
}

@media (min-width: 42.501rem) and (max-width: 56.25rem) {
  .reception-date__full {
    display: none;
  }

  .reception-date__compact {
    display: inline;
  }

  .reception-header {
    gap: var(--space-2);
    padding-inline: var(--space-4);
  }

  .reception-header__actions {
    gap: var(--space-2);
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition-duration: 0.01ms !important;
  }

  .logout-screen__spinner {
    animation: none;
  }
}
</style>
