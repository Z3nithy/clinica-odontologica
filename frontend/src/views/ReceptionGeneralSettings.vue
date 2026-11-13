<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import {
  Accessibility,
  Check,
  ChevronRight,
  CircleHelp,
  Eye,
  EyeOff,
  FileText,
  LockKeyhole,
  Monitor,
  Palette,
  RotateCcw,
  Save,
  ShieldCheck,
  UserRound,
} from 'lucide-vue-next'
import DentistShell from '../components/DentistShell.vue'
import ManagerShell from '../components/ManagerShell.vue'
import ReceptionShell from '../components/ReceptionShell.vue'
import UiAlert from '../components/ui/UiAlert.vue'
import UiAvatar from '../components/ui/UiAvatar.vue'
import UiButton from '../components/ui/UiButton.vue'
import UiDialog from '../components/ui/UiDialog.vue'
import UiSwitch from '../components/ui/UiSwitch.vue'
import UiToast from '../components/ui/UiToast.vue'
import { changePassword, getCurrentUser, updateCurrentUser } from '../services/auth'
import { getApiErrorMessage } from '../services/api'
import { clearSession, getSessionUser, updateSessionUser } from '../services/auth-session'
import {
  DEFAULT_USER_PREFERENCES,
  getUserPreferences,
  saveUserPreferences,
  resetUserPreferences,
  applyUserPreferences,
} from '../services/user-preferences'

const router = useRouter()
const categories = [
  { id: 'account', label: 'Minha conta', icon: UserRound },
  { id: 'security', label: 'Segurança e acesso', icon: LockKeyhole },
  { id: 'appearance', label: 'Aparência', icon: Palette },
  { id: 'accessibility', label: 'Acessibilidade', icon: Accessibility },
  { id: 'general', label: 'Preferências gerais', icon: Monitor },
  { id: 'privacy', label: 'Privacidade e dados', icon: ShieldCheck },
]
const isDentist = getSessionUser()?.role === 'dentist'
const isManager = getSessionUser()?.role === 'manager'
const homePages = isDentist
  ? [
      ['dentist-dashboard', 'Visão Geral'],
      ['dentist-odontogram', 'Odontograma'],
      ['dentist-treatment-plans', 'Planos de Tratamento'],
    ]
  : isManager
    ? [['manager-dashboard', 'Visão Geral']]
    : [
      ['reception-dashboard', 'Dashboard'],
      ['reception-agenda', 'Agenda'],
      ['reception-patients', 'Pacientes'],
      ['reception-checkin', 'Check-in'],
      ['reception-confirmations', 'Confirmações'],
      ['reception-history', 'Histórico'],
      ['reception-notification-settings', 'Notificações'],
    ]
const themeOptions = [
  { id: 'light', label: 'Claro', description: 'Superfícies claras para ambientes bem iluminados.' },
  { id: 'dark', label: 'Escuro', description: 'Reduz a luminosidade da interface.' },
  { id: 'system', label: 'Automático', description: 'Segue a preferência do sistema operacional.' },
]
const fontOptions = [
  { value: 100, label: 'Padrão' },
  { value: 112, label: 'Grande' },
  { value: 125, label: 'Muito grande' },
]
const accentOptions = [
  { id: 'blue', label: 'Azul Zen', color: '#2878b5' },
  { id: 'teal', label: 'Verde-azulado', color: '#087f78' },
  { id: 'coral', label: 'Terracota', color: '#a84f34' },
]
const dateLabel = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}).format(new Date())

const state = ref('loading')
const activeCategory = ref('account')
const profile = ref(null)
const profileDraft = reactive({ name: '' })
const profileEditing = ref(false)
const profileSaving = ref(false)
const pageAlert = ref(null)
const preferencesSaving = ref(false)
const preferences = reactive({ ...DEFAULT_USER_PREFERENCES })
const originalPreferences = ref('')
const passwordFields = reactive({
  current: '',
  next: '',
  confirm: '',
})
const passwordVisibility = reactive({
  current: false,
  next: false,
  confirm: false,
})
const passwordSaving = ref(false)
const privacyDialogOpen = ref(false)
const toastVisible = ref(false)
const toastMessage = ref('')
const toastVariant = ref('info')
const toastKey = ref(0)

const accountUser = computed(() => profile.value || getSessionUser())
const preferencesDirty = computed(() => JSON.stringify(preferences) !== originalPreferences.value)
const profileDirty = computed(
  () => Boolean(profile.value) && profileDraft.name.trim() !== profile.value.name,
)
const hasUnsavedChanges = computed(() => profileDirty.value || preferencesDirty.value)
const passwordChecks = computed(() => [
  { label: 'Pelo menos 12 caracteres', valid: passwordFields.next.length >= 12 },
  {
    label: 'Uma letra maiúscula e uma minúscula',
    valid: /[A-Z]/.test(passwordFields.next) && /[a-z]/.test(passwordFields.next),
  },
  { label: 'Ao menos um número', valid: /\d/.test(passwordFields.next) },
  {
    label: 'As senhas coincidem',
    valid: passwordFields.next.length > 0 && passwordFields.next === passwordFields.confirm,
  },
])
const passwordValid = computed(() => passwordChecks.value.every(({ valid }) => valid))

function storePreferencesSnapshot() {
  originalPreferences.value = JSON.stringify(preferences)
}

function showToast(message, variant = 'info') {
  toastMessage.value = message
  toastVariant.value = variant
  toastVisible.value = true
  toastKey.value += 1
}

function applyPreferencePreview() {
  applyUserPreferences(preferences)
}

async function loadSettings() {
  state.value = 'loading'
  pageAlert.value = null
  try {
    const user = await getCurrentUser()
    const savedPreferences = await getUserPreferences(user.id)
    profile.value = user
    profileDraft.name = user.name
    Object.assign(preferences, savedPreferences)
    if (user.role === 'dentist' && preferences.homePage !== 'dentist-dashboard') {
      preferences.homePage = 'dentist-dashboard'
    }
    storePreferencesSnapshot()
    applyPreferencePreview()
    state.value = 'ready'
  } catch (error) {
    state.value = 'error'
    pageAlert.value = error?.response
      ? getApiErrorMessage(error, 'Não foi possível carregar as configurações.')
      : error instanceof Error
        ? error.message
        : 'Não foi possível carregar as configurações.'
    showToast(pageAlert.value, 'danger')
  }
}

function discardProfileChanges() {
  profileDraft.name = profile.value?.name || ''
  profileEditing.value = false
}

async function saveProfile() {
  const name = profileDraft.name.trim().replace(/\s+/g, ' ')
  if (name.length < 2) {
    showToast('Informe um nome com pelo menos 2 caracteres.', 'danger')
    return
  }
  profileSaving.value = true
  try {
    const updated = await updateCurrentUser({ name })
    profile.value = updated
    profileDraft.name = updated.name
    updateSessionUser({ ...getSessionUser(), ...updated })
    profileEditing.value = false
    showToast('Dados da conta atualizados com sucesso.', 'success')
  } catch (error) {
    showToast(getApiErrorMessage(error, 'Não foi possível atualizar os dados da conta.'), 'danger')
  } finally {
    profileSaving.value = false
  }
}

function togglePasswordVisibility(field) {
  passwordVisibility[field] = !passwordVisibility[field]
}

function clearPasswordForm() {
  passwordFields.current = ''
  passwordFields.next = ''
  passwordFields.confirm = ''
}

async function submitPasswordChange() {
  if (!passwordFields.current) {
    showToast('Informe sua senha atual.', 'danger')
    return
  }
  if (!passwordValid.value) {
    showToast('Revise os requisitos da nova senha antes de continuar.', 'danger')
    return
  }
  passwordSaving.value = true
  try {
    await changePassword({
      current_password: passwordFields.current,
      new_password: passwordFields.next,
    })
    clearPasswordForm()
    showToast('Senha atualizada. Sua sessão atual continua ativa.', 'success')
  } catch (error) {
    showToast(getApiErrorMessage(error, 'Não foi possível atualizar sua senha.'), 'danger')
  } finally {
    passwordSaving.value = false
  }
}

async function savePreferences() {
  preferencesSaving.value = true
  pageAlert.value = null
  try {
    const saved = await saveUserPreferences(preferences, accountUser.value?.id)
    Object.assign(preferences, saved)
    storePreferencesSnapshot()
    showToast('Preferências sincronizadas com sua conta.', 'success')
  } catch (error) {
    pageAlert.value = error?.response
      ? getApiErrorMessage(error, 'Não foi possível sincronizar as preferências.')
      : error instanceof Error
        ? error.message
        : 'Não foi possível conectar à API para salvar as preferências.'
    showToast(
      pageAlert.value,
      'danger',
    )
  } finally {
    preferencesSaving.value = false
  }
}

function discardPreferenceChanges() {
  try {
    Object.assign(preferences, JSON.parse(originalPreferences.value))
    applyPreferencePreview()
    pageAlert.value = null
  } catch (error) {
    showToast(
      error instanceof Error
        ? error.message
        : 'Não foi possível restaurar as preferências anteriores.',
      'danger',
    )
  }
}

function restoreVisualDefaults() {
  preferences.theme = DEFAULT_USER_PREFERENCES.theme
  preferences.fontScale = DEFAULT_USER_PREFERENCES.fontScale
  preferences.density = DEFAULT_USER_PREFERENCES.density
  preferences.accent = DEFAULT_USER_PREFERENCES.accent
  applyPreferencePreview()
}

function restoreAccessibilityDefaults() {
  preferences.highContrast = DEFAULT_USER_PREFERENCES.highContrast
  preferences.reducedMotion = DEFAULT_USER_PREFERENCES.reducedMotion
  preferences.visibleFocus = DEFAULT_USER_PREFERENCES.visibleFocus
  preferences.underlineLinks = DEFAULT_USER_PREFERENCES.underlineLinks
  preferences.expandedSpacing = DEFAULT_USER_PREFERENCES.expandedSpacing
  applyPreferencePreview()
}

function requestCorrection() {
  privacyDialogOpen.value = true
}

function logout() {
  if (
    hasUnsavedChanges.value &&
    !window.confirm('Há alterações não salvas. Deseja sair sem salvar?')
  )
    return
  profileDraft.name = profile.value?.name || ''
  storePreferencesSnapshot()
  clearSession()
  void router.replace({ name: 'login' })
}

async function recoverPreferences() {
  try {
    Object.assign(preferences, await resetUserPreferences(getSessionUser()?.id))
    storePreferencesSnapshot()
    applyPreferencePreview()
    await loadSettings()
    if (state.value === 'ready') showToast('Preferências padrão restauradas para sua conta.', 'success')
  } catch (error) {
    const message = error?.response
      ? getApiErrorMessage(error, 'Não foi possível restaurar as preferências padrão.')
      : error instanceof Error
        ? error.message
        : 'Não foi possível conectar à API para restaurar as preferências padrão.'
    pageAlert.value = message
    showToast(message, 'danger')
  }
}

function navigationTarget(id) {
  const routes = {
    overview: isDentist ? 'dentist-dashboard' : isManager ? 'manager-dashboard' : 'reception-dashboard',
    schedule: isManager ? 'manager-agenda' : isDentist ? 'dentist-agenda' : 'reception-agenda',
    team: 'manager-team',
    productivity: 'manager-productivity',
    patients: 'manager-patients',
    reports: 'manager-reports',
    'patient-list': isDentist ? 'dentist-patients' : 'reception-patients',
    odontogram: 'dentist-odontogram',
    'treatment-plans': 'dentist-treatment-plans',
    checkin: 'reception-checkin',
    confirmations: 'reception-confirmations',
    history: 'reception-history',
  }
  if (routes[id]) void router.push({ name: routes[id] })
}

function handleBeforeUnload(event) {
  if (!hasUnsavedChanges.value) return
  event.preventDefault()
  event.returnValue = ''
}

function handleLogoutRequest(event) {
  if (!hasUnsavedChanges.value) return
  if (!window.confirm('Há alterações não salvas. Deseja sair sem salvar?')) {
    event.preventDefault()
    return
  }
  discardPreferenceChanges()
  discardProfileChanges()
}

onBeforeRouteLeave(() => {
  if (!hasUnsavedChanges.value) return true
  if (!window.confirm('Há alterações não salvas. Deseja sair sem salvar?')) return false
  discardPreferenceChanges()
  discardProfileChanges()
  return true
})

watch(preferences, applyPreferencePreview, { deep: true })

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  window.addEventListener('zen:logout-requested', handleLogoutRequest)
  void loadSettings()
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.removeEventListener('zen:logout-requested', handleLogoutRequest)
})
</script>

<template>
  <div class="general-settings-page">
    <component
      :is="isDentist ? DentistShell : isManager ? ManagerShell : ReceptionShell"
      active-page="settings"
      :date-label="dateLabel"
      @navigate="navigationTarget"
    />

    <main class="general-settings-main">
      <header class="general-settings-intro">
        <div>
          <p class="general-settings-eyebrow">SUA CONTA ZEN</p>
          <h1>Configurações</h1>
          <p>Gerencie sua conta, personalize a aparência e ajuste suas preferências</p>
        </div>
        <div class="general-settings-intro__actions">
          <UiButton
            v-if="preferencesDirty"
            variant="secondary"
            :disabled="preferencesSaving"
            @click="discardPreferenceChanges"
          >
            Cancelar
          </UiButton>
          <UiButton v-if="preferencesDirty" :loading="preferencesSaving" @click="savePreferences">
            <template #start><Save :size="16" aria-hidden="true" /></template>
            Salvar preferências
          </UiButton>
        </div>
      </header>

      <div
        v-if="state === 'loading'"
        class="general-settings-state"
        role="status"
        aria-live="polite"
      >
        <span class="general-settings-spinner" aria-hidden="true"></span>
        Carregando configurações da conta...
      </div>
      <div v-else-if="state === 'error'" class="general-settings-error">
        <UiAlert variant="danger" title="Configurações indisponíveis">{{ pageAlert }}</UiAlert>
        <UiButton variant="secondary" @click="loadSettings">Tentar novamente</UiButton>
        <UiButton variant="secondary" @click="recoverPreferences"
          >Restaurar preferências padrão</UiButton
        >
      </div>

      <div v-else class="general-settings-layout">
        <nav class="general-settings-nav" aria-label="Categorias de configurações">
          <p class="general-settings-nav__label">CONFIGURAÇÕES DA CONTA</p>
          <button
            v-for="category in categories"
            :key="category.id"
            type="button"
            class="general-settings-nav__item"
            :class="{ 'general-settings-nav__item--active': activeCategory === category.id }"
            :aria-current="activeCategory === category.id ? 'page' : undefined"
            @click="activeCategory = category.id"
          >
            <component :is="category.icon" :size="17" aria-hidden="true" />
            <span>{{ category.label }}</span>
            <ChevronRight :size="15" aria-hidden="true" />
          </button>

          <div class="general-settings-nav__help">
            <CircleHelp :size="17" aria-hidden="true" />
            <p>Precisa de ajuda?</p>
            <span
              >Para dados que não podem ser alterados por aqui, fale com a gerente da clínica.</span
            >
          </div>
        </nav>

        <section
          class="general-settings-content"
          :aria-labelledby="`settings-${activeCategory}-title`"
        >
          <template v-if="activeCategory === 'account'">
            <div class="settings-section-heading">
              <div class="settings-section-heading__icon">
                <UserRound :size="20" aria-hidden="true" />
              </div>
              <div>
                <h2 id="settings-account-title">Minha conta</h2>
                <p>Seus dados básicos e informações de acesso.</p>
              </div>
              <UiButton
                v-if="!profileEditing"
                class="settings-heading-action"
                variant="secondary"
                @click="profileEditing = true"
              >
                Editar dados
              </UiButton>
            </div>

            <div class="settings-profile-card">
              <UiAvatar :name="profile?.name || 'Recepcionista'" size="lg" />
              <div class="settings-profile-card__identity">
                <strong>{{ profile?.name }}</strong>
                <span>{{
                  profile?.role === 'receptionist'
                    ? 'Recepcionista'
                    : profile?.role === 'dentist'
                      ? 'Dentista'
                      : profile?.role
                }}</span>
              </div>
              <span class="settings-profile-card__badge"
                ><ShieldCheck :size="14" aria-hidden="true" /> Perfil protegido</span
              >
            </div>

            <form class="settings-form" @submit.prevent="saveProfile">
              <label class="settings-field">
                <span>Nome completo</span>
                <input
                  v-model="profileDraft.name"
                  type="text"
                  autocomplete="name"
                  maxlength="160"
                  :readonly="!profileEditing"
                  required
                  minlength="2"
                />
              </label>
              <label class="settings-field">
                <span>E-mail cadastrado</span>
                <input :value="profile?.email" type="email" readonly />
                <small
                  >Status da verificação não informado. A alteração de e-mail exige uma etapa que
                  ainda não está disponível.</small
                >
              </label>
              <label class="settings-field">
                <span>Telefone</span>
                <input value="Não cadastrado" type="text" readonly />
                <small>Não há telefone vinculado ao perfil da conta.</small>
              </label>
              <label class="settings-field">
                <span>Perfil de acesso</span>
                <input
                  :value="
                    profile?.role === 'receptionist'
                      ? 'Recepcionista'
                      : profile?.role === 'dentist'
                        ? 'Dentista'
                        : profile?.role
                  "
                  type="text"
                  readonly
                />
                <small>O perfil e as permissões são administrados pela clínica.</small>
              </label>
              <div class="settings-account-meta">
                <span>Conta criada</span>
                <strong>
                  {{
                    profile?.created_at
                      ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(
                          new Date(profile.created_at),
                        )
                      : 'Informação indisponível'
                  }}
                </strong>
              </div>
              <div v-if="profileEditing" class="settings-form-actions">
                <UiButton
                  type="button"
                  variant="secondary"
                  :disabled="profileSaving"
                  @click="discardProfileChanges"
                >
                  Cancelar
                </UiButton>
                <UiButton type="submit" :loading="profileSaving" :disabled="!profileDirty">
                  <template #start><Save :size="15" aria-hidden="true" /></template>
                  Salvar alterações
                </UiButton>
              </div>
            </form>
          </template>

          <template v-else-if="activeCategory === 'security'">
            <div class="settings-section-heading">
              <div class="settings-section-heading__icon settings-section-heading__icon--security">
                <LockKeyhole :size="20" aria-hidden="true" />
              </div>
              <div>
                <h2 id="settings-security-title">Segurança e acesso</h2>
                <p>Mantenha sua senha segura e atualizada.</p>
              </div>
            </div>

            <form class="settings-security-form" @submit.prevent="submitPasswordChange">
              <div class="settings-card-heading">
                <div>
                  <h3>Alterar senha</h3>
                  <p>Use uma senha exclusiva para proteger sua conta.</p>
                </div>
                <LockKeyhole :size="18" aria-hidden="true" />
              </div>

              <label
                v-for="(label, field) in {
                  current: 'Senha atual',
                  next: 'Nova senha',
                  confirm: 'Confirmar nova senha',
                }"
                :key="field"
                class="settings-field settings-password-field"
              >
                <span>{{ label }}</span>
                <span class="settings-password-input">
                  <input
                    v-model="passwordFields[field]"
                    :type="passwordVisibility[field] ? 'text' : 'password'"
                    :autocomplete="field === 'current' ? 'current-password' : 'new-password'"
                    :minlength="field === 'current' ? undefined : 12"
                    maxlength="128"
                    required
                  />
                  <button
                    type="button"
                    class="settings-password-toggle"
                    :aria-label="
                      passwordVisibility[field]
                        ? `Ocultar ${label.toLowerCase()}`
                        : `Mostrar ${label.toLowerCase()}`
                    "
                    :aria-pressed="passwordVisibility[field]"
                    @click="togglePasswordVisibility(field)"
                  >
                    <EyeOff v-if="passwordVisibility[field]" :size="17" aria-hidden="true" />
                    <Eye v-else :size="17" aria-hidden="true" />
                  </button>
                </span>
              </label>

              <ul class="settings-password-checks" aria-label="Requisitos da nova senha">
                <li
                  v-for="check in passwordChecks"
                  :key="check.label"
                  :class="{ 'settings-password-check--valid': check.valid }"
                >
                  <Check :size="14" aria-hidden="true" /> {{ check.label }}
                </li>
              </ul>

              <div class="settings-form-actions">
                <UiButton
                  type="button"
                  variant="secondary"
                  :disabled="passwordSaving"
                  @click="clearPasswordForm"
                >
                  Limpar campos
                </UiButton>
                <UiButton type="submit" :loading="passwordSaving">
                  <template #start><LockKeyhole :size="15" aria-hidden="true" /></template>
                  Atualizar senha
                </UiButton>
              </div>
            </form>

            <section class="settings-security-info">
              <div class="settings-card-heading">
                <div>
                  <h3>Outras opções de segurança</h3>
                  <p>Recursos atualmente disponíveis para esta conta.</p>
                </div>
              </div>
              <dl class="settings-info-list">
                <div>
                  <dt>Último acesso</dt>
                  <dd>Não registrado pelo sistema</dd>
                </div>
                <div>
                  <dt>Autenticação em dois fatores</dt>
                  <dd>Não disponível</dd>
                </div>
                <div>
                  <dt>Encerrar outras sessões</dt>
                  <dd>Gerenciamento de sessões não integrado</dd>
                </div>
              </dl>
              <div class="settings-security-actions">
                <UiButton variant="secondary" @click="logout">Sair da conta</UiButton>
                <span>A recuperação de senha deve ser solicitada à gerente da clínica.</span>
              </div>
            </section>
          </template>

          <template v-else-if="activeCategory === 'appearance'">
            <div class="settings-section-heading">
              <div
                class="settings-section-heading__icon settings-section-heading__icon--appearance"
              >
                <Palette :size="20" aria-hidden="true" />
              </div>
              <div>
                <h2 id="settings-appearance-title">Aparência</h2>
                <p>Personalize o visual da interface. A prévia é aplicada imediatamente.</p>
              </div>
            </div>

            <section class="settings-choice-section">
              <div class="settings-card-heading">
                <div>
                  <h3>Tema da interface</h3>
                  <p>Escolha como o portal deve aparecer.</p>
                </div>
              </div>
              <div class="settings-theme-grid">
                <label
                  v-for="theme in themeOptions"
                  :key="theme.id"
                  class="settings-theme-option"
                  :class="{ 'settings-theme-option--selected': preferences.theme === theme.id }"
                >
                  <input v-model="preferences.theme" type="radio" name="theme" :value="theme.id" />
                  <span
                    class="settings-theme-swatch"
                    :class="`settings-theme-swatch--${theme.id}`"
                    aria-hidden="true"
                  >
                    <i></i><i></i><i></i>
                  </span>
                  <strong>{{ theme.label }}</strong>
                  <small>{{ theme.description }}</small>
                </label>
              </div>
            </section>

            <section class="settings-choice-section">
              <div class="settings-card-heading">
                <div>
                  <h3>Tamanho da fonte</h3>
                  <p>Veja o resultado antes de salvar.</p>
                </div>
              </div>
              <div class="settings-font-options" role="radiogroup" aria-label="Tamanho da fonte">
                <label
                  v-for="font in fontOptions"
                  :key="font.value"
                  class="settings-font-option"
                  :class="{
                    'settings-font-option--selected': preferences.fontScale === font.value,
                  }"
                >
                  <input
                    v-model.number="preferences.fontScale"
                    type="radio"
                    name="font-scale"
                    :value="font.value"
                  />
                  <span :style="{ fontSize: `${font.value / 100}rem` }">Aa</span>
                  <strong>{{ font.label }}</strong>
                </label>
              </div>
              <div class="settings-preview-text">
                <span>Pré-visualização</span>
                <p>Uma interface clara ajuda você a acompanhar a rotina da clínica com conforto.</p>
              </div>
            </section>

            <section class="settings-choice-section">
              <div class="settings-card-heading">
                <div>
                  <h3>Densidade da interface</h3>
                  <p>Equilibre espaço e quantidade de informação visível.</p>
                </div>
              </div>
              <div class="settings-segmented" role="radiogroup" aria-label="Densidade da interface">
                <label
                  :class="{ 'settings-segmented--selected': preferences.density === 'comfortable' }"
                >
                  <input
                    v-model="preferences.density"
                    type="radio"
                    name="density"
                    value="comfortable"
                  />
                  <span>Confortável</span><small>Mais espaço para leitura</small>
                </label>
                <label
                  :class="{ 'settings-segmented--selected': preferences.density === 'compact' }"
                >
                  <input
                    v-model="preferences.density"
                    type="radio"
                    name="density"
                    value="compact"
                  />
                  <span>Compacta</span><small>Mais conteúdo na tela</small>
                </label>
              </div>
            </section>

            <section class="settings-choice-section">
              <div class="settings-card-heading">
                <div>
                  <h3>Cor de destaque</h3>
                  <p>Opções aprovadas para manter a legibilidade.</p>
                </div>
              </div>
              <div class="settings-accent-options">
                <button
                  v-for="accent in accentOptions"
                  :key="accent.id"
                  type="button"
                  class="settings-accent-option"
                  :class="{ 'settings-accent-option--selected': preferences.accent === accent.id }"
                  :aria-pressed="preferences.accent === accent.id"
                  @click="preferences.accent = accent.id"
                >
                  <span :style="{ '--accent-swatch': accent.color }"></span>{{ accent.label }}
                </button>
              </div>
            </section>

            <div class="settings-form-actions settings-appearance-actions">
              <UiButton variant="secondary" @click="restoreVisualDefaults">
                <template #start><RotateCcw :size="15" aria-hidden="true" /></template>
                Restaurar aparência padrão
              </UiButton>
              <UiButton :disabled="!preferencesDirty" @click="savePreferences">
                <template #start><Save :size="15" aria-hidden="true" /></template>
                Salvar aparência
              </UiButton>
            </div>
          </template>

          <template v-else-if="activeCategory === 'accessibility'">
            <div class="settings-section-heading">
              <div
                class="settings-section-heading__icon settings-section-heading__icon--accessibility"
              >
                <Accessibility :size="20" aria-hidden="true" />
              </div>
              <div>
                <h2 id="settings-accessibility-title">Acessibilidade</h2>
                <p>Ajuste recursos visuais e de movimento para facilitar a navegação.</p>
              </div>
            </div>

            <div class="settings-accessibility-list">
              <div class="settings-toggle-row">
                <div>
                  <strong>Alto contraste</strong>
                  <p>Reforça a diferença entre textos, superfícies e bordas.</p>
                </div>
                <UiSwitch v-model="preferences.highContrast" label="Ativar alto contraste" />
              </div>
              <div class="settings-toggle-row">
                <div>
                  <strong>Reduzir animações</strong>
                  <p>Reduz movimentos e transições da interface.</p>
                </div>
                <UiSwitch
                  v-model="preferences.reducedMotion"
                  label="Reduzir animações e transições"
                />
              </div>
              <div class="settings-toggle-row">
                <div>
                  <strong>Foco visível reforçado</strong>
                  <p>Destaca o elemento ativo durante a navegação por teclado.</p>
                </div>
                <UiSwitch v-model="preferences.visibleFocus" label="Reforçar o foco do teclado" />
              </div>
              <div class="settings-toggle-row">
                <div>
                  <strong>Destacar links</strong>
                  <p>Sublinha links para facilitar sua identificação sem depender da cor.</p>
                </div>
                <UiSwitch v-model="preferences.underlineLinks" label="Sublinhar links" />
              </div>
              <div class="settings-toggle-row">
                <div>
                  <strong>Espaçamento ampliado</strong>
                  <p>Amplia os espaçamentos entre os componentes da interface.</p>
                </div>
                <UiSwitch
                  v-model="preferences.expandedSpacing"
                  label="Ampliar espaçamento entre elementos"
                />
              </div>
            </div>

            <div class="settings-a11y-preview" aria-live="polite">
              <span><Accessibility :size="17" aria-hidden="true" /> Prévia de leitura</span>
              <p>
                Este exemplo reflete o tema e a escala de fonte selecionados. As preferências são
                aplicadas às telas do portal.
              </p>
              <UiButton variant="secondary" size="sm">Exemplo de foco e contraste</UiButton>
            </div>

            <div class="settings-form-actions settings-a11y-actions">
              <UiButton variant="secondary" @click="restoreAccessibilityDefaults">
                <template #start><RotateCcw :size="15" aria-hidden="true" /></template>
                Restaurar acessibilidade
              </UiButton>
              <UiButton :disabled="!preferencesDirty" @click="savePreferences">
                <template #start><Save :size="15" aria-hidden="true" /></template>
                Salvar acessibilidade
              </UiButton>
            </div>
          </template>

          <template v-else-if="activeCategory === 'general'">
            <div class="settings-section-heading">
              <div class="settings-section-heading__icon settings-section-heading__icon--general">
                <Monitor :size="20" aria-hidden="true" />
              </div>
              <div>
                <h2 id="settings-general-title">Preferências gerais</h2>
                <p>Defina padrões de navegação e visualização para sua conta.</p>
              </div>
            </div>

            <div class="settings-general-list">
              <label class="settings-field">
                <span>Página inicial após o login</span>
                <select v-model="preferences.homePage">
                  <option v-for="[route, label] in homePages" :key="route" :value="route">
                    {{ label }}
                  </option>
                </select>
                <small>Somente telas disponíveis para a recepção podem ser selecionadas.</small>
              </label>
              <label class="settings-field">
                <span>Registros por página</span>
                <select v-model.number="preferences.pageSize">
                  <option :value="10">10 registros</option>
                  <option :value="20">20 registros</option>
                  <option :value="50">50 registros</option>
                </select>
                <small>Aplicado à paginação do Histórico de Consultas.</small>
              </label>
              <div class="settings-toggle-row">
                <div>
                  <strong>Confirmar ações importantes</strong>
                  <p>Confirmações exigidas pelo sistema continuam ativas.</p>
                </div>
                <UiSwitch
                  v-model="preferences.confirmActions"
                  label="Confirmar ações importantes"
                  disabled
                />
              </div>
              <div class="settings-readonly-row">
                <span>Idioma</span><strong>Português (Brasil)</strong
                ><small>Este é o idioma atualmente disponível.</small>
              </div>
              <div class="settings-readonly-row">
                <span>Formato de data e hora</span><strong>DD/MM/AAAA · 24 horas</strong
                ><small>Padrão adotado pelo portal da clínica.</small>
              </div>
            </div>
            <div class="settings-form-actions">
              <UiButton
                variant="secondary"
                :disabled="!preferencesDirty"
                @click="discardPreferenceChanges"
                >Cancelar</UiButton
              >
              <UiButton :disabled="!preferencesDirty" @click="savePreferences">
                <template #start><Save :size="15" aria-hidden="true" /></template>
                Salvar preferências
              </UiButton>
            </div>
          </template>

          <template v-else>
            <div class="settings-section-heading">
              <div class="settings-section-heading__icon settings-section-heading__icon--privacy">
                <ShieldCheck :size="20" aria-hidden="true" />
              </div>
              <div>
                <h2 id="settings-privacy-title">Privacidade e dados</h2>
                <p>Informações sobre sua conta e gerenciamento de dados.</p>
              </div>
            </div>

            <section class="settings-privacy-card">
              <div class="settings-privacy-card__icon">
                <FileText :size="19" aria-hidden="true" />
              </div>
              <div>
                <h3>Seus dados de conta</h3>
                <p>
                  O sistema utiliza os dados de perfil para autenticação e identificação da equipe.
                  As preferências de interface são vinculadas à sua conta e sincronizadas pela API.
                  Uma cópia local é mantida para aplicar o tema mais rapidamente neste dispositivo.
                </p>
              </div>
            </section>
            <section class="settings-privacy-card">
              <div class="settings-privacy-card__icon">
                <ShieldCheck :size="19" aria-hidden="true" />
              </div>
              <div>
                <h3>Política e solicitações</h3>
                <p>
                  A política de privacidade e o canal formal para solicitações devem ser fornecidos
                  pela clínica.
                </p>
                <UiButton variant="secondary" size="sm" @click="requestCorrection"
                  >Como solicitar correção dos dados</UiButton
                >
              </div>
            </section>
            <section class="settings-privacy-card settings-privacy-card--restricted">
              <div class="settings-privacy-card__icon">
                <LockKeyhole :size="19" aria-hidden="true" />
              </div>
              <div>
                <h3>Desativação da conta</h3>
                <p>
                  A recepcionista não pode desativar a própria conta nem remover registros da
                  clínica. Solicite essa ação à gerente.
                </p>
                <UiButton variant="secondary" size="sm" disabled>Solicitar desativação</UiButton>
              </div>
            </section>
          </template>
        </section>
      </div>

      <footer v-if="state === 'ready'" class="general-settings-footer">
        <span
          ><ShieldCheck :size="15" aria-hidden="true" /> Suas permissões de acesso são definidas
          pela clínica.</span
        >
        <button type="button" class="general-settings-signout" @click="logout">
          Sair da conta
        </button>
      </footer>

      <UiDialog v-model="privacyDialogOpen" title="Solicitar correção de dados">
        <p class="settings-dialog-copy">
          A correção de informações da conta deve ser solicitada diretamente à gerente da clínica,
          que pode validar e atualizar seus dados.
        </p>
        <div class="settings-form-actions">
          <UiButton @click="privacyDialogOpen = false">Entendi</UiButton>
        </div>
      </UiDialog>
    </main>
    <UiToast
      :key="toastKey"
      v-model="toastVisible"
      :message="toastMessage"
      :variant="toastVariant"
    />
  </div>
</template>

<style scoped>
.general-settings-page {
  min-height: 100vh;
  padding-bottom: 2rem;
  background: var(--color-background);
  color: var(--color-text);
}

.general-settings-main {
  width: min(100% - 2.5rem, 78rem);
  margin: 0 auto;
  padding: clamp(1.5rem, 3vw, 2.5rem) 0;
}

.general-settings-intro {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}

.general-settings-eyebrow {
  margin: 0 0 0.4rem;
  color: var(--color-primary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.09em;
}

.general-settings-intro h1 {
  margin: 0;
  font-family: var(--font-heading);
  font-size: clamp(1.6rem, 2.4vw, 2rem);
  line-height: 1.2;
}

.general-settings-intro > div:first-child > p:last-child {
  margin: 0.55rem 0 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.general-settings-intro__actions,
.settings-form-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.625rem;
}

.general-settings-alert {
  margin-bottom: 1rem;
}

.general-settings-layout {
  display: grid;
  grid-template-columns: 15.5rem minmax(0, 1fr);
  align-items: start;
  gap: 1.25rem;
}

.general-settings-nav,
.general-settings-content {
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.general-settings-nav {
  position: sticky;
  top: 1rem;
  padding: 0.8rem;
}

.general-settings-nav__label {
  padding: 0 0.6rem;
  margin: 0.3rem 0 0.65rem;
  color: var(--color-text-muted);
  font-size: 0.65rem;
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.07em;
}

.general-settings-nav__item {
  display: flex;
  width: 100%;
  min-height: 2.75rem;
  align-items: center;
  gap: 0.65rem;
  padding: 0.55rem 0.6rem;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  text-align: left;
  cursor: pointer;
  transition:
    background var(--transition-fast),
    color var(--transition-fast);
}

.general-settings-nav__item > span {
  flex: 1;
}

.general-settings-nav__item > svg:last-child {
  opacity: 0;
}

.general-settings-nav__item:hover,
.general-settings-nav__item--active {
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}

.general-settings-nav__item--active {
  font-weight: var(--font-weight-semibold);
}

.general-settings-nav__item--active > svg:last-child {
  opacity: 1;
}

.general-settings-nav__help {
  padding: 0.85rem 0.65rem 0.25rem;
  margin-top: 0.75rem;
  border-top: 1px solid var(--color-border);
  color: var(--color-text-secondary);
}

.general-settings-nav__help > svg {
  color: var(--color-primary);
}

.general-settings-nav__help p {
  margin: 0.3rem 0;
  color: var(--color-text);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
}

.general-settings-nav__help span {
  font-size: 0.7rem;
  line-height: 1.45;
}

.general-settings-content {
  padding: clamp(1rem, 2.4vw, 1.65rem);
}

.settings-section-heading {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding-bottom: 1.15rem;
  margin-bottom: 1.1rem;
  border-bottom: 1px solid var(--color-border);
}

.settings-section-heading__icon,
.settings-privacy-card__icon {
  display: grid;
  width: 2.5rem;
  height: 2.5rem;
  flex: 0 0 auto;
  place-items: center;
  border-radius: var(--radius-md);
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}

.settings-section-heading__icon--security {
  background: var(--color-warning-subtle);
  color: var(--color-warning);
}

.settings-section-heading__icon--appearance {
  background: var(--color-accent-subtle);
  color: var(--color-accent);
}

.settings-section-heading__icon--accessibility {
  background: var(--color-success-subtle);
  color: var(--color-success-strong);
}

.settings-section-heading h2 {
  margin: 0;
  font-size: var(--font-size-lg);
}

.settings-section-heading p {
  margin: 0.25rem 0 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  line-height: 1.45;
}

.settings-heading-action {
  margin-left: auto;
}

.settings-section-alert {
  margin-bottom: 1rem;
}

.settings-profile-card {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.95rem;
  margin-bottom: 1.1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-background);
}

.settings-profile-card__identity {
  display: grid;
  gap: 0.2rem;
  min-width: 0;
}

.settings-profile-card__identity strong {
  overflow-wrap: anywhere;
  font-size: var(--font-size-sm);
}

.settings-profile-card__identity > span {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.settings-profile-card__badge {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.35rem 0.55rem;
  margin-left: auto;
  border-radius: var(--radius-pill);
  background: var(--color-success-subtle);
  color: var(--color-success-strong);
  font-size: 0.68rem;
  font-weight: var(--font-weight-medium);
  white-space: nowrap;
}

.settings-form,
.settings-security-form {
  display: grid;
  gap: 1rem;
}

.settings-field {
  display: grid;
  gap: 0.4rem;
  color: var(--color-text);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
}

.settings-field input,
.settings-field select {
  width: 100%;
  min-height: 2.75rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-regular);
}

.settings-field input[readonly] {
  background: var(--color-background);
  color: var(--color-text-secondary);
}

.settings-field input:focus-visible,
.settings-field select:focus-visible,
.settings-password-input input:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--color-focus) 35%, transparent);
  outline-offset: 2px;
}

.settings-field small {
  color: var(--color-text-muted);
  font-size: 0.7rem;
  font-weight: var(--font-weight-regular);
  line-height: 1.4;
}

.settings-account-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-top: 0.25rem;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.settings-account-meta strong {
  color: var(--color-text);
  font-weight: var(--font-weight-medium);
}

.settings-card-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.settings-card-heading h3,
.settings-privacy-card h3 {
  margin: 0;
  font-size: var(--font-size-sm);
}

.settings-card-heading p {
  margin: 0.25rem 0 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.settings-card-heading > svg {
  color: var(--color-primary);
}

.settings-security-form,
.settings-security-info,
.settings-choice-section,
.settings-privacy-card {
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.settings-password-field {
  gap: 0.4rem;
}

.settings-password-input {
  position: relative;
  display: flex;
}

.settings-password-input input {
  padding-right: 3rem;
}

.settings-password-toggle {
  position: absolute;
  top: 0.35rem;
  right: 0.35rem;
  display: grid;
  width: 2rem;
  height: 2rem;
  place-items: center;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.settings-password-toggle:hover {
  background: var(--color-surface-muted);
}

.settings-password-checks {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
  padding: 0;
  margin: 0;
  list-style: none;
}

.settings-password-checks li {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--color-text-secondary);
  font-size: 0.7rem;
}

.settings-password-checks li svg {
  color: var(--color-text-muted);
}

.settings-password-checks .settings-password-check--valid {
  color: var(--color-success-strong);
}

.settings-password-checks .settings-password-check--valid svg {
  color: var(--color-success);
}

.settings-security-info {
  margin-top: 1rem;
}

.settings-info-list {
  display: grid;
  margin: 0.8rem 0 0;
}

.settings-info-list > div {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.7rem 0;
  border-top: 1px solid var(--color-border);
  font-size: var(--font-size-xs);
}

.settings-info-list dt {
  color: var(--color-text-secondary);
}

.settings-info-list dd {
  margin: 0;
  color: var(--color-text);
  font-weight: var(--font-weight-medium);
  text-align: right;
}

.settings-security-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding-top: 0.8rem;
  margin-top: 0.35rem;
  border-top: 1px solid var(--color-border);
}

.settings-security-actions > span {
  color: var(--color-text-muted);
  font-size: 0.7rem;
}

.settings-choice-section {
  margin-bottom: 0.9rem;
}

.settings-theme-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.7rem;
  margin-top: 0.9rem;
}

.settings-theme-option,
.settings-font-option {
  display: grid;
  min-width: 0;
  gap: 0.4rem;
  padding: 0.65rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
}

.settings-theme-option--selected,
.settings-font-option--selected {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 1px var(--color-primary);
}

.settings-theme-option input,
.settings-font-option input,
.settings-segmented input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

.settings-theme-option input:focus-visible + .settings-theme-swatch,
.settings-font-option input:focus-visible + span,
.settings-segmented input:focus-visible + span {
  outline: 3px solid var(--color-focus);
  outline-offset: 3px;
}

.settings-theme-swatch {
  display: grid;
  height: 3.8rem;
  grid-template-columns: 0.7rem 1fr;
  grid-template-rows: 0.7rem 1fr;
  gap: 0.28rem;
  padding: 0.4rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: #f5f7fa;
}

.settings-theme-swatch i {
  border-radius: 2px;
  background: #2878b5;
}

.settings-theme-swatch i:first-child {
  grid-row: span 2;
  background: #eaf4fb;
}

.settings-theme-swatch i:last-child {
  background: #fff;
}

.settings-theme-swatch--dark {
  background: #111a22;
}

.settings-theme-swatch--dark i:first-child {
  background: #203747;
}

.settings-theme-swatch--dark i:last-child {
  background: #1b2731;
}

.settings-theme-swatch--system {
  background: linear-gradient(90deg, #f5f7fa 50%, #111a22 50%);
}

.settings-theme-swatch--system i:first-child {
  background: linear-gradient(90deg, #eaf4fb 50%, #203747 50%);
}

.settings-theme-swatch--system i:last-child {
  background: linear-gradient(90deg, #fff 50%, #1b2731 50%);
}

.settings-theme-option > strong,
.settings-font-option > strong {
  font-size: var(--font-size-xs);
}

.settings-theme-option > small {
  color: var(--color-text-secondary);
  font-size: 0.67rem;
  line-height: 1.4;
}

.settings-font-options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 0.9rem;
}

.settings-font-option {
  min-width: 6rem;
  justify-items: center;
  padding: 0.65rem 0.85rem;
}

.settings-font-option > span {
  line-height: 1.4;
}

.settings-preview-text {
  padding: 0.75rem;
  margin-top: 0.8rem;
  border-radius: var(--radius-sm);
  background: var(--color-background);
}

.settings-preview-text > span,
.settings-a11y-preview > span {
  color: var(--color-text-secondary);
  font-size: 0.68rem;
  font-weight: var(--font-weight-semibold);
}

.settings-preview-text p,
.settings-a11y-preview p {
  margin: 0.25rem 0 0;
  color: var(--color-text);
  font-size: var(--font-size-sm);
}

.settings-segmented {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.6rem;
  margin-top: 0.8rem;
}

.settings-segmented label {
  display: grid;
  gap: 0.2rem;
  padding: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
}

.settings-segmented--selected {
  border-color: var(--color-primary) !important;
  background: var(--color-primary-subtle);
}

.settings-segmented label > span {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
}

.settings-segmented label > small {
  color: var(--color-text-secondary);
  font-size: 0.68rem;
}

.settings-accent-options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin-top: 0.85rem;
}

.settings-accent-option {
  display: inline-flex;
  min-height: 2.4rem;
  align-items: center;
  gap: 0.45rem;
  padding: 0.35rem 0.65rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--font-size-xs);
  cursor: pointer;
}

.settings-accent-option--selected {
  border-color: var(--color-primary);
  background: var(--color-primary-subtle);
}

.settings-accent-option > span {
  width: 0.85rem;
  height: 0.85rem;
  border-radius: 50%;
  background: var(--accent-swatch);
}

.settings-appearance-actions {
  margin-top: 1.1rem;
}

.settings-accessibility-list,
.settings-general-list {
  padding: 0 0.95rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.settings-toggle-row {
  display: flex;
  min-height: 4.5rem;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--color-border);
}

.settings-toggle-row:last-child {
  border-bottom: 0;
}

.settings-toggle-row strong {
  font-size: var(--font-size-xs);
}

.settings-toggle-row p {
  margin: 0.2rem 0 0;
  color: var(--color-text-secondary);
  font-size: 0.7rem;
  line-height: 1.45;
}

.settings-a11y-preview {
  display: grid;
  justify-items: start;
  gap: 0.55rem;
  padding: 1rem;
  margin-top: 0.9rem;
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-background);
}

.settings-a11y-preview > span {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.settings-a11y-actions {
  margin-top: 1rem;
}

.settings-general-list {
  display: grid;
  gap: 1rem;
  padding-block: 1rem;
}

.settings-readonly-row {
  display: grid;
  gap: 0.2rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--color-border);
  font-size: var(--font-size-xs);
}

.settings-readonly-row > span,
.settings-readonly-row > small {
  color: var(--color-text-secondary);
}

.settings-readonly-row > strong {
  font-weight: var(--font-weight-semibold);
}

.settings-privacy-card {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.settings-privacy-card__icon {
  width: 2.2rem;
  height: 2.2rem;
}

.settings-privacy-card h3 {
  margin-top: 0.15rem;
}

.settings-privacy-card p {
  margin: 0.35rem 0 0.7rem;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  line-height: 1.55;
}

.settings-privacy-card--restricted {
  background: var(--color-background);
}

.general-settings-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 1rem;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.general-settings-footer > span {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.general-settings-signout {
  padding: 0.4rem 0;
  border: 0;
  background: none;
  color: var(--color-primary);
  font: inherit;
  text-decoration: underline;
  text-underline-offset: 0.15em;
  cursor: pointer;
}

.general-settings-state,
.general-settings-error {
  display: grid;
  min-height: 15rem;
  justify-items: center;
  align-content: center;
  gap: 0.8rem;
  color: var(--color-text-secondary);
}

.general-settings-error > :deep(.alert) {
  width: min(100%, 36rem);
}

.general-settings-spinner {
  width: 1.4rem;
  height: 1.4rem;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: general-settings-spin 0.8s linear infinite;
}

.settings-dialog-copy {
  margin: 0;
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.settings-dialog-copy + .settings-form-actions {
  margin-top: 1rem;
}

@keyframes general-settings-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 58rem) {
  .general-settings-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .general-settings-nav {
    position: static;
    display: flex;
    overflow-x: auto;
    gap: 0.25rem;
    padding: 0.55rem;
    scrollbar-width: thin;
  }

  .general-settings-nav__label,
  .general-settings-nav__help {
    display: none;
  }

  .general-settings-nav__item {
    width: auto;
    min-width: max-content;
    justify-content: center;
    padding-inline: 0.8rem;
  }

  .general-settings-nav__item > svg:last-child {
    display: none;
  }
}

@media (max-width: 40rem) {
  .general-settings-main {
    width: min(100% - 1.25rem, 78rem);
    padding-top: 1.25rem;
  }

  .general-settings-intro {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.9rem;
  }

  .general-settings-intro__actions {
    width: 100%;
  }

  .general-settings-content {
    padding: 0.9rem;
  }

  .settings-section-heading {
    flex-wrap: wrap;
  }

  .settings-heading-action {
    margin-left: 0;
  }

  .settings-theme-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .settings-theme-option {
    grid-template-columns: 4.2rem minmax(0, 1fr);
    align-items: center;
  }

  .settings-theme-swatch {
    grid-row: span 2;
  }

  .settings-theme-option > small {
    grid-column: 2;
  }

  .settings-password-checks {
    grid-template-columns: minmax(0, 1fr);
  }

  .settings-profile-card__badge {
    display: none;
  }

  .settings-info-list > div {
    flex-direction: column;
    gap: 0.2rem;
  }

  .settings-info-list dd {
    text-align: left;
  }

  .general-settings-footer {
    align-items: flex-start;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
