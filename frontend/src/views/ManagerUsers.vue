<script setup>
import { computed, onMounted, ref } from 'vue'
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Shield,
  UserRound,
  UsersRound,
} from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { getApiErrorMessage } from '../services/api'
import {
  createManagedUser,
  getManagedUser,
  getManagedUsers,
  resendManagedUserInvitation,
  setManagedUserActive,
  updateManagedUser,
} from '../services/manager-users'
import { getSessionUser } from '../services/auth-session'
import ManagerShell from '../components/ManagerShell.vue'
import UiAvatar from '../components/ui/UiAvatar.vue'
import UiButton from '../components/ui/UiButton.vue'
import UiDialog from '../components/ui/UiDialog.vue'

const router = useRouter()
const sessionUser = getSessionUser()
const dateLabel = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}).format(new Date())
const canManageUsers = sessionUser?.role === 'manager'
const filterDraft = ref({ q: '', role: '', status: '' })
const appliedFilters = ref({ q: '', role: '', status: '' })
const sortBy = ref('created_at')
const sortOrder = ref('desc')
const offset = ref(0)
const pageSize = 10
const items = ref([])
const total = ref(0)
const metrics = ref({
  total: 0,
  active: 0,
  inactive: 0,
  dentists: 0,
  receptionists: 0,
  pending_invitations: 0,
})
const listState = ref('loading')
const listError = ref('')
const lastUpdated = ref(null)
const selectedUser = ref(null)
const detailsState = ref('idle')
const detailsError = ref('')
const detailsOpen = ref(false)
const createOpen = ref(false)
const editOpen = ref(false)
const confirmationOpen = ref(false)
const invitationOpen = ref(false)
const formError = ref('')
const submitPending = ref(false)
const createFormRef = ref(null)
const editFormRef = ref(null)
const createForm = ref({ name: '', email: '', role: 'dentist' })
const editName = ref('')
const confirmationTarget = ref(null)
const inviteUrl = ref('')
const inviteExpiresAt = ref(null)
const inviteMessage = ref('')
const copyMessage = ref('')

const pageNumber = computed(() => Math.floor(offset.value / pageSize) + 1)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const activeFilterLabels = computed(() => [
  appliedFilters.value.q ? `Busca: ${appliedFilters.value.q}` : '',
  appliedFilters.value.role ? `Função: ${roleLabel(appliedFilters.value.role)}` : '',
  appliedFilters.value.status ? `Situação: ${statusLabel(appliedFilters.value.status)}` : '',
].filter(Boolean))

const metricCards = computed(() => [
  { label: 'Total de usuários', value: metrics.value.total, icon: UsersRound, tone: 'blue' },
  { label: 'Usuários ativos', value: metrics.value.active, icon: Check, tone: 'green' },
  { label: 'Usuários inativos', value: metrics.value.inactive, icon: UserRound, tone: 'slate' },
  { label: 'Dentistas', value: metrics.value.dentists, icon: Shield, tone: 'teal' },
  { label: 'Recepcionistas', value: metrics.value.receptionists, icon: UserRound, tone: 'violet' },
  { label: 'Convites pendentes', value: metrics.value.pending_invitations, icon: Mail, tone: 'amber' },
])

function roleLabel(role) {
  return role === 'dentist' ? 'Dentista' : role === 'receptionist' ? 'Recepcionista' : 'Gestor'
}

function statusLabel(status) {
  return ({
    active: 'Ativo',
    inactive: 'Inativo',
    pending: 'Convite pendente',
    expired: 'Convite expirado',
  })[status] || status
}

function statusClass(status) {
  return `manager-users-status--${status}`
}

function formatDate(value) {
  return value
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(value))
    : '—'
}

function formatDateTime(value) {
  return value
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : '—'
}

async function loadUsers() {
  if (!canManageUsers) {
    listState.value = 'denied'
    return
  }
  listState.value = items.value.length ? 'refreshing' : 'loading'
  listError.value = ''
  try {
    const response = await getManagedUsers({
      ...appliedFilters.value,
      sort_by: sortBy.value,
      sort_order: sortOrder.value,
      offset: offset.value,
      limit: pageSize,
    })
    items.value = response.items
    total.value = response.total
    metrics.value = response.metrics
    lastUpdated.value = new Date()
    listState.value = 'ready'
  } catch (error) {
    listError.value = getApiErrorMessage(error, 'Não foi possível carregar a equipe.')
    listState.value = error.response?.status === 403 ? 'denied' : 'error'
  }
}

function applyFilters() {
  appliedFilters.value = { ...filterDraft.value, q: filterDraft.value.q.trim() }
  offset.value = 0
  void loadUsers()
}

function clearFilters() {
  filterDraft.value = { q: '', role: '', status: '' }
  appliedFilters.value = { ...filterDraft.value }
  offset.value = 0
  void loadUsers()
}

function changeSort(value) {
  if (sortBy.value === value) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortBy.value = value
    sortOrder.value = value === 'name' || value === 'role' ? 'asc' : 'desc'
  }
  offset.value = 0
  void loadUsers()
}

function goToPage(page) {
  offset.value = (page - 1) * pageSize
  void loadUsers()
}

function openCreate() {
  formError.value = ''
  createForm.value = { name: '', email: '', role: 'dentist' }
  createOpen.value = true
}

function setupUrl(token) {
  const url = new URL(router.resolve({ name: 'user-first-access' }).href, window.location.origin)
  url.hash = new URLSearchParams({ token }).toString()
  return url.toString()
}

function showInvitation(response, message) {
  inviteUrl.value = setupUrl(response.setup_token)
  inviteExpiresAt.value = response.expires_at
  inviteMessage.value = message
  copyMessage.value = ''
  invitationOpen.value = true
}

function clearInvitation() {
  inviteUrl.value = ''
  inviteExpiresAt.value = null
  copyMessage.value = ''
}

async function createUser() {
  formError.value = ''
  if (!createFormRef.value?.reportValidity()) return
  submitPending.value = true
  try {
    const response = await createManagedUser({
      name: createForm.value.name.trim(),
      email: createForm.value.email.trim(),
      role: createForm.value.role,
    })
    createOpen.value = false
    offset.value = 0
    await loadUsers()
    showInvitation(response, 'Usuário criado. Compartilhe este link de primeiro acesso com a pessoa convidada.')
  } catch (error) {
    formError.value = getApiErrorMessage(error, 'Não foi possível criar o usuário.')
  } finally {
    submitPending.value = false
  }
}

async function copyInvitation() {
  try {
    await navigator.clipboard.writeText(inviteUrl.value)
    copyMessage.value = 'Link copiado. Envie-o manualmente ao usuário antes do vencimento.'
  } catch (error) {
    copyMessage.value = error instanceof Error
      ? 'Não foi possível copiar automaticamente. Selecione e copie o link exibido.'
      : 'Não foi possível copiar automaticamente. Selecione e copie o link exibido.'
  }
}

async function openDetails(user) {
  detailsOpen.value = true
  detailsState.value = 'loading'
  detailsError.value = ''
  try {
    selectedUser.value = await getManagedUser(user.id)
    detailsState.value = 'ready'
  } catch (error) {
    detailsError.value = getApiErrorMessage(error, 'Não foi possível carregar os detalhes do usuário.')
    detailsState.value = 'error'
  }
}

function openEdit(user) {
  detailsOpen.value = false
  selectedUser.value = { user, audit: [] }
  editName.value = user.name
  formError.value = ''
  editOpen.value = true
}

async function saveEdit() {
  formError.value = ''
  if (!editFormRef.value?.reportValidity() || !selectedUser.value?.user) return
  submitPending.value = true
  try {
    await updateManagedUser(selectedUser.value.user.id, { name: editName.value.trim() })
    editOpen.value = false
    await loadUsers()
  } catch (error) {
    formError.value = getApiErrorMessage(error, 'Não foi possível atualizar o cadastro.')
  } finally {
    submitPending.value = false
  }
}

function requestStatusChange(user) {
  detailsOpen.value = false
  formError.value = ''
  confirmationTarget.value = user
  confirmationOpen.value = true
}

async function confirmStatusChange() {
  if (!confirmationTarget.value) return
  submitPending.value = true
  formError.value = ''
  try {
    await setManagedUserActive(confirmationTarget.value.id, !confirmationTarget.value.active)
    confirmationOpen.value = false
    selectedUser.value = null
    await loadUsers()
  } catch (error) {
    formError.value = getApiErrorMessage(error, 'Não foi possível alterar a situação da conta.')
  } finally {
    submitPending.value = false
  }
}

async function resendInvitation(user) {
  submitPending.value = true
  listError.value = ''
  try {
    const response = await resendManagedUserInvitation(user.id)
    await loadUsers()
    showInvitation(response, 'Novo link de primeiro acesso gerado. O link anterior foi invalidado.')
  } catch (error) {
    listError.value = getApiErrorMessage(error, 'Não foi possível gerar outro convite.')
  } finally {
    submitPending.value = false
  }
}

function navigateShell(id) {
  const routes = {
    overview: 'manager-dashboard',
    schedule: 'manager-agenda',
    productivity: 'manager-productivity',
    patients: 'manager-patients',
    reports: 'manager-reports',
    settings: 'manager-settings',
  }
  if (routes[id]) void router.push({ name: routes[id] })
}

onMounted(() => {
  void loadUsers()
})
</script>

<template>
  <div class="manager-users-page">
    <ManagerShell active-page="team" :date-label="dateLabel" @navigate="navigateShell" />

    <main class="manager-users-main">
      <header class="manager-users-intro">
        <div>
          <p class="manager-users-eyebrow">ADMINISTRAÇÃO DA CLÍNICA</p>
          <h1>Gestão de Usuários e Equipe</h1>
          <p>Gerencie os usuários, funções e vínculos da clínica</p>
        </div>
        <UiButton v-if="canManageUsers" @click="openCreate">
          <template #start><Plus :size="17" aria-hidden="true" /></template>
          Novo usuário
        </UiButton>
      </header>

      <section class="manager-users-metrics" aria-label="Resumo da equipe">
        <article v-for="metric in metricCards" :key="metric.label" class="manager-users-metric">
          <span class="manager-users-metric__icon" :class="`manager-users-tone--${metric.tone}`">
            <component :is="metric.icon" :size="18" aria-hidden="true" />
          </span>
          <div>
            <span>{{ metric.label }}</span>
            <strong v-if="listState === 'loading'" class="manager-users-skeleton" aria-label="Carregando indicador"></strong>
            <strong v-else>{{ ['ready', 'refreshing'].includes(listState) ? metric.value : '—' }}</strong>
          </div>
        </article>
      </section>

      <section class="manager-users-panel" aria-labelledby="team-list-title">
        <div class="manager-users-panel__heading">
          <div>
            <p class="manager-users-eyebrow">EQUIPE DA CLÍNICA</p>
            <h2 id="team-list-title">Usuários</h2>
          </div>
          <span v-if="lastUpdated" class="manager-users-updated">
            <RefreshCw :size="14" aria-hidden="true" />
            Atualizado às {{ new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(lastUpdated) }}
          </span>
        </div>

        <form class="manager-users-filters" @submit.prevent="applyFilters">
          <label class="manager-users-search">
            <span>Buscar por nome, e-mail ou identificador</span>
            <span class="manager-users-search__input">
              <Search :size="17" aria-hidden="true" />
              <input v-model="filterDraft.q" type="search" placeholder="Nome, e-mail ou código interno">
            </span>
          </label>
          <label>
            <span>Função</span>
            <select v-model="filterDraft.role">
              <option value="">Todas as funções</option>
              <option value="manager">Gestor</option>
              <option value="dentist">Dentista</option>
              <option value="receptionist">Recepcionista</option>
            </select>
          </label>
          <label>
            <span>Situação</span>
            <select v-model="filterDraft.status">
              <option value="">Todas as situações</option>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
              <option value="pending">Convite pendente</option>
              <option value="expired">Convite expirado</option>
            </select>
          </label>
          <div class="manager-users-filters__actions">
            <UiButton type="button" variant="secondary" size="sm" @click="clearFilters">Limpar filtros</UiButton>
            <UiButton type="submit" size="sm">Aplicar filtros</UiButton>
          </div>
        </form>

        <div v-if="activeFilterLabels.length" class="manager-users-active-filters" aria-label="Filtros ativos">
          <span>Filtros:</span>
          <span v-for="label in activeFilterLabels" :key="label" class="manager-users-filter-chip">{{ label }}</span>
        </div>

        <div v-if="listState === 'denied'" class="manager-users-state" role="alert">
          <Shield :size="24" aria-hidden="true" />
          <strong>Acesso não autorizado</strong>
          <p>Somente um gestor autenticado pode consultar os usuários da clínica.</p>
        </div>
        <div v-else-if="listState === 'loading'" class="manager-users-loading" role="status" aria-label="Carregando usuários">
          <span v-for="row in 5" :key="row" class="manager-users-loading__row"></span>
        </div>
        <div v-else-if="listState === 'error'" class="manager-users-state manager-users-state--error" role="alert">
          <AlertCircle :size="24" aria-hidden="true" />
          <strong>Não foi possível carregar a equipe</strong>
          <p>{{ listError }}</p>
          <UiButton variant="secondary" size="sm" @click="loadUsers">Tentar novamente</UiButton>
        </div>
        <div v-else-if="listState === 'ready' && !items.length" class="manager-users-state">
          <UsersRound :size="24" aria-hidden="true" />
          <strong>{{ total ? 'Nenhum usuário corresponde aos filtros' : 'Nenhum usuário cadastrado' }}</strong>
          <p>{{ total ? 'Limpe ou altere os filtros para ampliar a busca.' : 'Cadastre um usuário para começar a organizar sua equipe.' }}</p>
          <UiButton v-if="!total" size="sm" @click="openCreate">Novo usuário</UiButton>
        </div>
        <template v-else-if="['ready', 'refreshing'].includes(listState)">
          <div class="manager-users-table-wrap" :aria-busy="listState === 'refreshing'">
            <table class="manager-users-table">
              <thead>
                <tr>
                  <th><button type="button" @click="changeSort('name')">Usuário <ChevronDown :size="13" aria-hidden="true" /></button></th>
                  <th>E-mail</th>
                  <th><button type="button" @click="changeSort('role')">Função <ChevronDown :size="13" aria-hidden="true" /></button></th>
                  <th>Unidade</th>
                  <th><button type="button" @click="changeSort('created_at')">Cadastro <ChevronDown :size="13" aria-hidden="true" /></button></th>
                  <th><button type="button" @click="changeSort('status')">Situação <ChevronDown :size="13" aria-hidden="true" /></button></th>
                  <th><span class="visually-hidden">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="user in items" :key="user.id">
                  <td>
                    <button class="manager-users-person" type="button" @click="openDetails(user)">
                      <UiAvatar :name="user.name" size="sm" />
                      <span><strong>{{ user.name }}</strong><small>#{{ user.id }}</small></span>
                    </button>
                  </td>
                  <td>{{ user.email }}</td>
                  <td>{{ roleLabel(user.role) }}</td>
                  <td><span class="manager-users-muted">Clínica vinculada</span></td>
                  <td>{{ formatDate(user.created_at) }}</td>
                  <td><span class="manager-users-status" :class="statusClass(user.status)">{{ statusLabel(user.status) }}</span></td>
                  <td>
                    <div class="manager-users-row-actions">
                      <button type="button" aria-label="Ver detalhes" title="Ver detalhes" @click="openDetails(user)"><UserRound :size="16" /></button>
                      <button v-if="user.role !== 'manager'" type="button" aria-label="Editar nome" title="Editar nome" @click="openEdit(user)"><span aria-hidden="true">✎</span></button>
                      <button
                        v-if="user.role !== 'manager' && user.status === 'expired'"
                        type="button"
                        aria-label="Gerar novo convite"
                        title="Gerar novo convite"
                        :disabled="submitPending"
                        @click="resendInvitation(user)"
                      ><RefreshCw :size="15" /></button>
                      <button
                        v-else-if="user.role !== 'manager' && (user.status === 'active' || user.status === 'inactive')"
                        type="button"
                        :aria-label="user.active ? 'Desativar conta' : 'Reativar conta'"
                        :title="user.active ? 'Desativar conta' : 'Reativar conta'"
                        @click="requestStatusChange(user)"
                      ><span aria-hidden="true">{{ user.active ? '⏻' : '↻' }}</span></button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="manager-users-cards">
            <article v-for="user in items" :key="user.id" class="manager-users-card">
              <div class="manager-users-card__person">
                <UiAvatar :name="user.name" size="md" />
                <div><strong>{{ user.name }}</strong><small>{{ roleLabel(user.role) }} · #{{ user.id }}</small></div>
                <span class="manager-users-status" :class="statusClass(user.status)">{{ statusLabel(user.status) }}</span>
              </div>
              <p>{{ user.email }}</p>
              <small>Cadastro: {{ formatDate(user.created_at) }} · Clínica vinculada</small>
              <div class="manager-users-card__actions">
                <UiButton size="sm" variant="secondary" @click="openDetails(user)">Detalhes</UiButton>
                <UiButton v-if="user.role !== 'manager'" size="sm" variant="secondary" @click="openEdit(user)">Editar</UiButton>
                <UiButton v-if="user.role !== 'manager' && user.status === 'expired'" size="sm" variant="secondary" :disabled="submitPending" @click="resendInvitation(user)">Novo convite</UiButton>
                <UiButton v-else-if="user.role !== 'manager' && (user.status === 'active' || user.status === 'inactive')" size="sm" variant="secondary" @click="requestStatusChange(user)">{{ user.active ? 'Desativar' : 'Reativar' }}</UiButton>
              </div>
            </article>
          </div>

          <footer class="manager-users-pagination">
            <span>{{ total }} usuário(s) · Página {{ pageNumber }} de {{ pageCount }}</span>
            <div>
              <button type="button" aria-label="Página anterior" :disabled="pageNumber <= 1" @click="goToPage(pageNumber - 1)"><ChevronLeft :size="17" /></button>
              <button type="button" aria-label="Próxima página" :disabled="pageNumber >= pageCount" @click="goToPage(pageNumber + 1)"><ChevronRight :size="17" /></button>
            </div>
          </footer>
        </template>
        <p v-if="listError && listState !== 'error'" class="manager-users-inline-error" role="alert">{{ listError }}</p>
      </section>

      <aside class="manager-users-limitations">
        <Shield :size="17" aria-hidden="true" />
        <p>
          <strong>Escopo e segurança:</strong> lista limitada à clínica da sua conta. O modelo atual armazena nome, e-mail, função, situação e data de cadastro; telefone, especialidade, registro profissional, unidades múltiplas e perfis granulares não estão disponíveis. Função e e-mail não podem ser alterados nesta tela.
        </p>
      </aside>
      <p v-if="lastUpdated" class="manager-users-footer">Última atualização dos dados: {{ formatDateTime(lastUpdated) }}.</p>
    </main>

    <UiDialog v-model="createOpen" title="Novo usuário">
      <form ref="createFormRef" class="manager-users-form" @submit.prevent="createUser">
        <p>Informe os dados básicos. A conta será ativada quando a pessoa definir sua própria senha pelo link de primeiro acesso.</p>
        <fieldset>
          <legend>Dados pessoais e acesso</legend>
          <label>
            <span>Nome completo</span>
            <input v-model="createForm.name" type="text" minlength="2" maxlength="160" autocomplete="name" required>
          </label>
          <label>
            <span>E-mail de acesso</span>
            <input v-model="createForm.email" type="email" maxlength="254" autocomplete="email" required>
          </label>
          <label>
            <span>Função</span>
            <select v-model="createForm.role" required>
              <option value="dentist">Dentista</option>
              <option value="receptionist">Recepcionista</option>
            </select>
          </label>
        </fieldset>
        <p v-if="formError" class="manager-users-inline-error" role="alert">{{ formError }}</p>
        <p class="manager-users-form__note">Não há envio automático de e-mail nesta versão. O link temporário será exibido uma única vez para compartilhamento manual.</p>
        <div class="manager-users-form__actions">
          <UiButton type="button" variant="secondary" :disabled="submitPending" @click="createOpen = false">Cancelar</UiButton>
          <UiButton type="submit" :loading="submitPending">Criar usuário</UiButton>
        </div>
      </form>
    </UiDialog>

    <UiDialog v-model="editOpen" title="Editar cadastro">
      <form ref="editFormRef" class="manager-users-form" @submit.prevent="saveEdit">
        <p>Atualize apenas o nome. E-mail e função são dados de identidade e acesso geridos fora deste fluxo.</p>
        <label>
          <span>Nome completo</span>
          <input v-model="editName" type="text" minlength="2" maxlength="160" autocomplete="name" required>
        </label>
        <p v-if="formError" class="manager-users-inline-error" role="alert">{{ formError }}</p>
        <div class="manager-users-form__actions">
          <UiButton type="button" variant="secondary" :disabled="submitPending" @click="editOpen = false">Cancelar</UiButton>
          <UiButton type="submit" :loading="submitPending">Salvar alterações</UiButton>
        </div>
      </form>
    </UiDialog>

    <UiDialog v-model="detailsOpen" title="Detalhes do usuário">
      <div v-if="detailsState === 'loading'" class="manager-users-state" role="status">Carregando detalhes…</div>
      <div v-else-if="detailsState === 'error'" class="manager-users-state manager-users-state--error" role="alert">
        <AlertCircle :size="22" aria-hidden="true" /><p>{{ detailsError }}</p>
      </div>
      <template v-else-if="selectedUser?.user">
        <div class="manager-users-detail-person">
          <UiAvatar :name="selectedUser.user.name" size="lg" />
          <div><h3>{{ selectedUser.user.name }}</h3><span>{{ roleLabel(selectedUser.user.role) }}</span></div>
          <span class="manager-users-status" :class="statusClass(selectedUser.user.status)">{{ statusLabel(selectedUser.user.status) }}</span>
        </div>
        <dl class="manager-users-details">
          <div><dt>E-mail</dt><dd>{{ selectedUser.user.email }}</dd></div>
          <div><dt>Identificador interno</dt><dd>#{{ selectedUser.user.id }}</dd></div>
          <div><dt>Clínica</dt><dd>Vínculo da conta autenticada</dd></div>
          <div><dt>Data de cadastro</dt><dd>{{ formatDateTime(selectedUser.user.created_at) }}</dd></div>
          <div v-if="selectedUser.user.invitation_expires_at"><dt>Convite válido até</dt><dd>{{ formatDateTime(selectedUser.user.invitation_expires_at) }}</dd></div>
        </dl>
        <section class="manager-users-audit" aria-labelledby="manager-users-audit-heading">
          <h3 id="manager-users-audit-heading">Histórico de atividades administrativas</h3>
          <ol v-if="selectedUser.audit.length">
            <li v-for="event in selectedUser.audit" :key="event.id">
              <strong>{{ event.summary }}</strong>
              <span>{{ event.actor_name }} · {{ formatDateTime(event.created_at) }}</span>
            </li>
          </ol>
          <p v-else>Nenhuma alteração administrativa registrada.</p>
        </section>
        <div class="manager-users-detail-actions">
          <UiButton v-if="selectedUser.user.role !== 'manager'" variant="secondary" @click="openEdit(selectedUser.user)">Editar nome</UiButton>
          <UiButton
            v-if="selectedUser.user.role !== 'manager' && (selectedUser.user.status === 'active' || selectedUser.user.status === 'inactive')"
            variant="secondary"
            @click="requestStatusChange(selectedUser.user)"
          >{{ selectedUser.user.active ? 'Desativar' : 'Reativar' }} conta</UiButton>
        </div>
        <p class="manager-users-form__note">Perfis granulares, auditoria completa, último acesso e histórico de login não estão disponíveis nesta versão. Credenciais e tokens não são exibidos.</p>
      </template>
      <template #footer><UiButton variant="secondary" @click="detailsOpen = false">Fechar</UiButton></template>
    </UiDialog>

    <UiDialog v-model="confirmationOpen" :title="confirmationTarget?.active ? 'Desativar conta?' : 'Reativar conta?'">
      <div class="manager-users-confirmation">
        <AlertCircle :size="24" aria-hidden="true" />
        <p v-if="confirmationTarget?.active">
          {{ confirmationTarget.name }} perderá acesso ao sistema. Os registros históricos não serão excluídos. Dentistas com consultas futuras precisam ter a agenda reorganizada antes da desativação.
        </p>
        <p v-else>O acesso de {{ confirmationTarget?.name }} será reativado após a confirmação do servidor.</p>
      </div>
      <p v-if="formError" class="manager-users-inline-error" role="alert">{{ formError }}</p>
      <template #footer>
        <UiButton variant="secondary" :disabled="submitPending" @click="confirmationOpen = false">Cancelar</UiButton>
        <UiButton :variant="confirmationTarget?.active ? 'danger' : 'primary'" :loading="submitPending" @click="confirmStatusChange">
          {{ confirmationTarget?.active ? 'Desativar conta' : 'Reativar conta' }}
        </UiButton>
      </template>
    </UiDialog>

    <UiDialog v-model="invitationOpen" title="Link de primeiro acesso" @close="clearInvitation">
      <div class="manager-users-invitation">
        <span class="manager-users-invitation__icon"><Mail :size="22" aria-hidden="true" /></span>
        <h3>Convite pronto para compartilhar</h3>
        <p>{{ inviteMessage }}</p>
        <label>
          <span>Link válido até {{ formatDateTime(inviteExpiresAt) }}</span>
          <input :value="inviteUrl" type="text" readonly @focus="$event.target.select()">
        </label>
        <p class="manager-users-form__note">Este link concede acesso inicial à conta. Compartilhe somente com a pessoa convidada. Ele expira em 48 horas e não será exibido novamente.</p>
        <p v-if="copyMessage" class="manager-users-copy-message" role="status">{{ copyMessage }}</p>
        <UiButton @click="copyInvitation"><template #start><Clipboard :size="16" aria-hidden="true" /></template>Copiar link</UiButton>
      </div>
    </UiDialog>
  </div>
</template>

<style scoped>
.manager-users-page {
  min-height: 100vh;
  background: var(--color-background);
  color: var(--color-text);
}

.manager-users-main {
  display: grid;
  width: min(100% - 3rem, 88rem);
  gap: var(--space-5);
  margin: 0 auto;
  padding: var(--space-8) 0 var(--space-10);
}

.manager-users-intro,
.manager-users-panel__heading,
.manager-users-person,
.manager-users-pagination,
.manager-users-card__person,
.manager-users-detail-person {
  display: flex;
  align-items: center;
}

.manager-users-intro,
.manager-users-panel__heading,
.manager-users-pagination {
  justify-content: space-between;
  gap: var(--space-4);
}

.manager-users-eyebrow {
  margin: 0 0 var(--space-2);
  color: var(--color-primary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.09em;
}

.manager-users-intro h1 {
  margin: 0;
  font-family: var(--font-heading);
  font-size: clamp(1.7rem, 3vw, 2.25rem);
  letter-spacing: -0.035em;
}

.manager-users-intro p:not(.manager-users-eyebrow) {
  margin: var(--space-2) 0 0;
  color: var(--color-text-secondary);
}

.manager-users-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

.manager-users-metric {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.manager-users-metric > div {
  display: grid;
  min-width: 0;
  gap: var(--space-1);
}

.manager-users-metric > div > span {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.manager-users-metric strong {
  font-family: var(--font-heading);
  font-size: 1.4rem;
}

.manager-users-metric__icon {
  display: grid;
  width: 2.5rem;
  height: 2.5rem;
  flex: 0 0 auto;
  place-items: center;
  border-radius: var(--radius-md);
}

.manager-users-tone--blue { background: var(--color-primary-subtle); color: var(--color-primary); }
.manager-users-tone--green { background: var(--color-success-subtle); color: var(--color-success); }
.manager-users-tone--slate { background: var(--color-surface-muted); color: var(--color-text-secondary); }
.manager-users-tone--teal { background: var(--color-primary-subtle); color: var(--color-primary); }
.manager-users-tone--violet { background: var(--color-blue-50); color: var(--color-blue-800); }
.manager-users-tone--amber { background: var(--color-warning-subtle); color: var(--color-warning); }

.manager-users-skeleton {
  width: 3rem;
  height: 1.5rem;
  border-radius: var(--radius-sm);
  background: var(--color-surface-muted);
  animation: manager-users-pulse 1.2s ease-in-out infinite alternate;
}

.manager-users-panel {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.manager-users-panel__heading h2 {
  margin: 0;
  font-size: var(--font-size-lg);
}

.manager-users-updated {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.manager-users-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: var(--space-3);
}

.manager-users-filters > label {
  display: grid;
  min-width: 10rem;
  flex: 0 1 13rem;
  gap: var(--space-2);
}

.manager-users-filters label > span:first-child,
.manager-users-search > span:first-child,
.manager-users-form label > span {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
}

.manager-users-search {
  flex: 1 1 19rem !important;
}

.manager-users-search__input {
  display: flex;
  min-height: 2.7rem;
  align-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
}

.manager-users-search__input:focus-within {
  border-color: var(--color-focus);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-focus) 24%, transparent);
}

.manager-users-search input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: var(--font-size-sm);
}

.manager-users-filters select,
.manager-users-form input,
.manager-users-form select,
.manager-users-invitation input {
  width: 100%;
  min-height: 2.7rem;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
}

.manager-users-filters__actions {
  display: flex;
  gap: var(--space-2);
}

.manager-users-active-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.manager-users-filter-chip {
  padding: 0.25rem 0.6rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-background);
}

.manager-users-table-wrap {
  overflow-x: auto;
}

.manager-users-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.manager-users-table th {
  padding: var(--space-3);
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  white-space: nowrap;
}

.manager-users-table th button {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
}

.manager-users-table td {
  padding: var(--space-3);
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text);
  font-size: var(--font-size-sm);
}

.manager-users-person {
  gap: var(--space-2);
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.manager-users-person > span:last-child {
  display: grid;
  gap: 0.15rem;
}

.manager-users-person strong {
  font-size: var(--font-size-sm);
}

.manager-users-person small,
.manager-users-muted {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.manager-users-status {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.55rem;
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  font-size: var(--font-size-xs);
  white-space: nowrap;
}

.manager-users-status--active {
  border-color: color-mix(in srgb, var(--color-success) 35%, var(--color-border));
  background: var(--color-success-subtle);
  color: var(--color-success-strong);
}

.manager-users-status--inactive,
.manager-users-status--expired {
  border-color: var(--color-border);
  background: var(--color-surface-muted);
  color: var(--color-text-secondary);
}

.manager-users-status--pending {
  border-color: color-mix(in srgb, var(--color-warning) 35%, var(--color-border));
  background: var(--color-warning-subtle);
  color: var(--color-warning);
}

.manager-users-row-actions {
  display: flex;
  gap: 0.2rem;
}

.manager-users-row-actions button,
.manager-users-pagination button {
  display: grid;
  width: 2.15rem;
  height: 2.15rem;
  place-items: center;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.manager-users-row-actions button:hover,
.manager-users-pagination button:not(:disabled):hover {
  border-color: var(--color-border);
  background: var(--color-background);
  color: var(--color-primary);
}

.manager-users-row-actions button:disabled,
.manager-users-pagination button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.manager-users-cards {
  display: none;
}

.manager-users-pagination {
  padding-top: var(--space-2);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.manager-users-pagination > div {
  display: flex;
  gap: var(--space-1);
}

.manager-users-state {
  display: grid;
  min-height: 13rem;
  justify-items: center;
  align-content: center;
  gap: var(--space-2);
  padding: var(--space-5);
  color: var(--color-text-secondary);
  text-align: center;
}

.manager-users-state > svg {
  color: var(--color-primary);
}

.manager-users-state strong {
  color: var(--color-text);
}

.manager-users-state p {
  max-width: 34rem;
  margin: 0;
  font-size: var(--font-size-sm);
}

.manager-users-state--error > svg {
  color: var(--color-danger);
}

.manager-users-loading {
  display: grid;
  gap: var(--space-2);
}

.manager-users-loading__row {
  min-height: 3.5rem;
  border-radius: var(--radius-sm);
  background: var(--color-surface-muted);
  animation: manager-users-pulse 1.2s ease-in-out infinite alternate;
}

.manager-users-inline-error {
  margin: 0;
  color: var(--color-danger);
  font-size: var(--font-size-sm);
}

.manager-users-limitations {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text-secondary);
}

.manager-users-limitations svg {
  flex: 0 0 auto;
  margin-top: 0.1rem;
  color: var(--color-primary);
}

.manager-users-limitations p {
  margin: 0;
  font-size: var(--font-size-xs);
  line-height: 1.55;
}

.manager-users-limitations strong {
  color: var(--color-text);
}

.manager-users-footer {
  margin: calc(-1 * var(--space-3)) 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  text-align: right;
}

.manager-users-form {
  display: grid;
  gap: var(--space-4);
}

.manager-users-form > p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.55;
}

.manager-users-form fieldset {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.manager-users-form legend {
  padding: 0 var(--space-2);
  color: var(--color-text);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
}

.manager-users-form label,
.manager-users-invitation label {
  display: grid;
  gap: var(--space-2);
}

.manager-users-form__note {
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--color-background);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs) !important;
}

.manager-users-form__actions,
.manager-users-detail-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.manager-users-detail-person {
  flex-wrap: wrap;
  gap: var(--space-3);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.manager-users-detail-person > div {
  flex: 1;
}

.manager-users-detail-person h3 {
  margin: 0;
  font-size: var(--font-size-md);
}

.manager-users-detail-person > div > span {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.manager-users-details {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
  margin: var(--space-4) 0;
}

.manager-users-details > div {
  min-width: 0;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.manager-users-details dt {
  margin-bottom: var(--space-1);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.manager-users-details dd {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: var(--font-size-sm);
}

.manager-users-audit {
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
}

.manager-users-audit h3 {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-sm);
}

.manager-users-audit ol {
  display: grid;
  gap: var(--space-2);
  max-height: 12rem;
  overflow: auto;
  margin: 0;
  padding-left: 1.2rem;
}

.manager-users-audit li {
  padding-left: var(--space-1);
}

.manager-users-audit li strong,
.manager-users-audit li span {
  display: block;
  font-size: var(--font-size-xs);
  line-height: 1.5;
}

.manager-users-audit li span,
.manager-users-audit > p {
  color: var(--color-text-secondary);
}

.manager-users-audit > p {
  margin: 0;
  font-size: var(--font-size-xs);
}

.manager-users-detail-actions {
  margin-top: var(--space-4);
}

.manager-users-confirmation {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}

.manager-users-confirmation svg {
  flex: 0 0 auto;
  color: var(--color-warning);
}

.manager-users-confirmation p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.55;
}

.manager-users-invitation {
  display: grid;
  justify-items: center;
  gap: var(--space-3);
  text-align: center;
}

.manager-users-invitation__icon {
  display: grid;
  width: 3rem;
  height: 3rem;
  place-items: center;
  border-radius: var(--radius-pill);
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}

.manager-users-invitation h3 {
  margin: 0;
  font-size: var(--font-size-md);
}

.manager-users-invitation > p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.5;
}

.manager-users-invitation label {
  width: 100%;
  text-align: left;
}

.manager-users-invitation label > span {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.manager-users-copy-message {
  color: var(--color-success-strong) !important;
}

.manager-users-page :focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

@keyframes manager-users-pulse {
  to { opacity: 0.55; }
}

@media (max-width: 64rem) {
  .manager-users-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 48rem) {
  .manager-users-main {
    width: min(100% - 1.5rem, 88rem);
    gap: var(--space-4);
    padding-top: var(--space-5);
  }

  .manager-users-intro,
  .manager-users-panel__heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .manager-users-intro > :deep(.button) {
    width: 100%;
  }

  .manager-users-panel {
    padding: var(--space-4);
  }

  .manager-users-filters > label,
  .manager-users-search {
    width: 100%;
    flex-basis: 100% !important;
  }

  .manager-users-filters__actions {
    width: 100%;
  }

  .manager-users-filters__actions > * {
    flex: 1;
  }

  .manager-users-table-wrap {
    display: none;
  }

  .manager-users-cards {
    display: grid;
    gap: var(--space-3);
  }

  .manager-users-card {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }

  .manager-users-card__person {
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .manager-users-card__person > div {
    display: grid;
    min-width: 0;
    flex: 1;
  }

  .manager-users-card__person > div strong,
  .manager-users-card > p {
    overflow-wrap: anywhere;
  }

  .manager-users-card__person > div small,
  .manager-users-card > small,
  .manager-users-card > p {
    color: var(--color-text-secondary);
    font-size: var(--font-size-xs);
  }

  .manager-users-card > p {
    margin: 0;
  }

  .manager-users-card__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    padding-top: var(--space-2);
    border-top: 1px solid var(--color-border);
  }

  .manager-users-details {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 28rem) {
  .manager-users-metrics {
    grid-template-columns: 1fr;
  }

  .manager-users-pagination {
    align-items: flex-start;
    flex-direction: column;
  }

  .manager-users-detail-person > .manager-users-status {
    margin-left: 3.5rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .manager-users-skeleton,
  .manager-users-loading__row {
    animation: none;
  }
}
</style>
