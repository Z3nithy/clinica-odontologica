<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import {
  Bell,
  BellRing,
  Check,
  CheckCircle2,
  Clock3,
  Info,
  LockKeyhole,
  RotateCcw,
  Save,
  ShieldCheck,
} from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import ReceptionShell from '../components/ReceptionShell.vue'
import UiAlert from '../components/ui/UiAlert.vue'
import UiButton from '../components/ui/UiButton.vue'
import UiDialog from '../components/ui/UiDialog.vue'
import UiSwitch from '../components/ui/UiSwitch.vue'
import UiToast from '../components/ui/UiToast.vue'
import { getNotificationPreferences, saveNotificationPreferences } from '../services/reception'

const categoryGroups = [
  {
    id: 'agenda',
    title: 'Agenda',
    description: 'Agendamentos e mudanças na agenda da clínica.',
    events: [
      [
        'new_appointment',
        'Nova consulta agendada',
        'Quando um novo horário for incluído na agenda.',
      ],
      ['appointment_cancelled', 'Consulta cancelada', 'Quando um agendamento for cancelado.'],
      [
        'appointment_rescheduled',
        'Consulta reagendada',
        'Quando a data ou o horário de uma consulta mudar.',
      ],
      [
        'appointment_changed',
        'Alteração de horário ou dentista',
        'Quando houver uma mudança nos dados da consulta.',
      ],
      [
        'appointment_upcoming',
        'Consulta próxima do horário',
        'Aviso antecipado antes do horário agendado.',
      ],
      [
        'appointment_confirmation_pending',
        'Aguardando confirmação',
        'Quando uma consulta estiver pendente de confirmação.',
      ],
      [
        'patient_will_not_attend',
        'Paciente informou que não comparecerá',
        'Quando essa resposta for registrada pela equipe.',
      ],
    ],
  },
  {
    id: 'reception',
    title: 'Check-in e recepção',
    description: 'Chegadas, fila e atendimento na recepção.',
    events: [
      [
        'patient_arrived',
        'Paciente chegou à clínica',
        'Quando a chegada for registrada no check-in.',
      ],
      [
        'patient_waiting',
        'Paciente aguardando atendimento',
        'Quando o paciente entrar na fila de espera.',
      ],
      [
        'patient_waiting_too_long',
        'Tempo de espera elevado',
        'Quando uma espera prolongada for sinalizada pelo sistema.',
      ],
      [
        'walk_in_patient',
        'Paciente sem agendamento',
        'Quando o fluxo de atendimento sem horário estiver habilitado.',
      ],
    ],
  },
  {
    id: 'confirmations',
    title: 'Confirmações de consultas',
    description: 'Respostas e pendências de confirmação.',
    events: [
      [
        'patient_confirmed',
        'Paciente confirmou presença',
        'Quando a confirmação for recebida e registrada.',
      ],
      [
        'reschedule_requested',
        'Solicitação de reagendamento',
        'Quando o paciente solicitar uma nova data ou horário.',
      ],
      [
        'reminder_unanswered',
        'Sem resposta ao lembrete',
        'Quando não houver resposta ao lembrete enviado.',
      ],
      [
        'reminder_failed',
        'Falha no envio de lembrete',
        'Quando o sistema registrar uma falha de envio.',
      ],
    ],
  },
  {
    id: 'communications',
    title: 'Comunicação com pacientes',
    description: 'Mensagens recebidas por serviços integrados.',
    events: [
      [
        'integration_message_received',
        'Mensagem recebida',
        'Quando uma integração habilitada receber uma mensagem.',
      ],
    ],
  },
  {
    id: 'system',
    title: 'Sistema e integrações',
    description: 'Falhas importantes e avisos administrativos.',
    events: [
      [
        'important_operation_failed',
        'Falha em operação importante',
        'Quando uma operação essencial não puder ser concluída.',
      ],
      [
        'integration_unavailable',
        'Serviço integrado indisponível',
        'Quando um serviço conectado ficar indisponível.',
      ],
      [
        'manager_announcement',
        'Aviso administrativo',
        'Quando um comunicado do gestor estiver disponível.',
      ],
    ],
  },
]

const channels = [
  { id: 'in_app', label: 'No sistema', available: true },
  { id: 'browser', label: 'Navegador', available: true },
  { id: 'email', label: 'E-mail', available: false },
  { id: 'whatsapp', label: 'WhatsApp', available: false },
  { id: 'sms', label: 'SMS', available: false },
]

function createDefaults() {
  const events = Object.fromEntries(
    categoryGroups.flatMap((group) => group.events.map(([id]) => [id, true])),
  )
  const eventChannels = Object.fromEntries(
    Object.keys(events).map((id) => [
      id,
      { in_app: true, browser: false, email: false, whatsapp: false, sms: false },
    ]),
  )
  return {
    enabled: true,
    sound: false,
    show_in_app: true,
    keep_important: true,
    quiet_hours_enabled: false,
    quiet_start: '18:00',
    quiet_end: '08:00',
    upcoming_reminder_minutes: 30,
    repeat_limit: 1,
    group_similar: true,
    categories: Object.fromEntries(categoryGroups.map(({ id }) => [id, true])),
    events,
    priorities: Object.fromEntries(
      Object.keys(events).map((id) => [
        id,
        id === 'important_operation_failed' ? 'important' : 'informative',
      ]),
    ),
    channels: eventChannels,
  }
}

function mergeSettings(value) {
  const defaults = createDefaults()
  return {
    ...defaults,
    ...value,
    categories: { ...defaults.categories, ...value.categories },
    events: { ...defaults.events, ...value.events },
    priorities: { ...defaults.priorities, ...value.priorities },
    channels: Object.fromEntries(
      Object.entries(defaults.channels).map(([id, fallback]) => [
        id,
        { ...fallback, ...value.channels?.[id] },
      ]),
    ),
  }
}

const state = ref('loading')
const settings = ref(createDefaults())
const originalSettings = ref('')
const busy = ref(false)
const resetOpen = ref(false)
const alert = ref(null)
const browserSupported = ref(false)
const browserPermission = ref('unsupported')
const toastVisible = ref(false)
const toastMessage = ref('')
const toastVariant = ref('info')
const toastKey = ref(0)
const router = useRouter()

const hasChanges = computed(() => JSON.stringify(settings.value) !== originalSettings.value)
const dateLabel = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}).format(new Date())

function snapshot() {
  originalSettings.value = JSON.stringify(settings.value)
}

function showToast(message, variant = 'info') {
  toastMessage.value = message
  toastVariant.value = variant
  toastVisible.value = true
  toastKey.value += 1
}

async function loadSettings() {
  state.value = 'loading'
  alert.value = null
  try {
    const response = await getNotificationPreferences()
    settings.value = mergeSettings(response.preferences)
    snapshot()
    state.value = 'ready'
  } catch {
    state.value = 'error'
    alert.value = {
      variant: 'danger',
      title: 'Não foi possível carregar as preferências',
      message: 'Verifique sua conexão e tente novamente. Nenhuma configuração foi alterada.',
    }
    showToast(alert.value.message, 'danger')
  }
}

function isCategoryActive(group) {
  return settings.value.enabled && settings.value.categories[group.id]
}

function setCategory(group, enabled) {
  settings.value.categories[group.id] = enabled
}

function isEventActive(group, eventId) {
  return isCategoryActive(group) && settings.value.events[eventId]
}

function channelAvailable(channelId) {
  if (channelId === 'in_app') return settings.value.show_in_app
  if (channelId === 'browser')
    return browserSupported.value && browserPermission.value === 'granted'
  return false
}

function channelStatus(channelId) {
  if (channelId === 'in_app') return 'Disponível na interface'
  if (channelId === 'browser') {
    if (!browserSupported.value) return 'Não suportado neste navegador'
    if (browserPermission.value === 'denied') return 'Permissão bloqueada no navegador'
    if (browserPermission.value === 'granted') return 'Autorizado nesta sessão'
    return 'Aguardando autorização'
  }
  return 'Integração não configurada'
}

async function requestBrowserPermission() {
  if (!browserSupported.value) return
  try {
    browserPermission.value = await Notification.requestPermission()
    if (browserPermission.value === 'granted') {
      alert.value = null
      showToast(
        'Permissão concedida. O canal do navegador pode ser selecionado enquanto esta aplicação estiver aberta.',
        'success',
      )
    } else {
      alert.value = null
      showToast(
        'Permissão não concedida. Você pode revisá-la nas configurações do navegador.',
        'warning',
      )
    }
  } catch {
    alert.value = null
    showToast(
      'Não foi possível solicitar a permissão. Verifique as configurações do navegador e tente novamente.',
      'danger',
    )
  }
}

function toggleChannel(eventId, channelId) {
  if (!channelAvailable(channelId) && !settings.value.channels[eventId][channelId]) return
  settings.value.channels[eventId][channelId] = !settings.value.channels[eventId][channelId]
}

async function saveSettings() {
  if (!hasChanges.value || busy.value) return
  busy.value = true
  alert.value = null
  try {
    const response = await saveNotificationPreferences(settings.value)
    settings.value = mergeSettings(response.preferences)
    snapshot()
    showToast(
      'Preferências de notificação salvas com sucesso. Os eventos operacionais ainda dependem da integração da clínica.',
      'success',
    )
  } catch (error) {
    const detail = error?.response?.data?.detail
    showToast(
      typeof detail === 'string'
        ? detail
        : 'Não foi possível salvar as preferências. Suas alterações continuam nesta tela; verifique a conexão e tente novamente.',
      'danger',
    )
  } finally {
    busy.value = false
  }
}

function restoreDefaults() {
  settings.value = createDefaults()
  resetOpen.value = false
  alert.value = {
    variant: 'info',
    title: 'Padrões restaurados nesta tela',
    message: 'As alterações só serão aplicadas depois de salvar.',
  }
}

function testNotification() {
  if (!settings.value.enabled) {
    showToast('Ative as notificações do sistema para executar o teste.', 'warning')
    return
  }

  const browserEvents = categoryGroups
    .filter((group) => isCategoryActive(group))
    .flatMap((group) => group.events.map(([id]) => id))
    .filter(
      (id) =>
        channelAvailable('browser') &&
        settings.value.events[id] &&
        settings.value.channels[id].browser,
    )
  const inAppEnabled =
    settings.value.show_in_app &&
    categoryGroups.some(
      (group) =>
        isCategoryActive(group) &&
        group.events.some(
          ([id]) => settings.value.events[id] && settings.value.channels[id].in_app,
        ),
    )

  if (!inAppEnabled && !browserEvents.length) {
    showToast('Nenhum canal disponível está ativo para os eventos selecionados.', 'warning')
    return
  }

  if (browserEvents.length) {
    try {
      const notification = new Notification('Zen · Teste de notificação', {
        body: 'Este é um teste. Nenhum dado de paciente foi incluído.',
        icon: '/favicon.ico',
        tag: 'zen-notification-preferences-test',
      })
      notification.onclick = () => {
        window.focus()
        notification.close()
      }
    } catch {
      showToast('O navegador não conseguiu exibir a notificação de teste.', 'danger')
      return
    }
  }

  const message =
    browserEvents.length && inAppEnabled
      ? 'Teste exibido no navegador e confirmado na interface.'
      : browserEvents.length
        ? 'Teste exibido no navegador. Alertas operacionais ainda dependem da integração da clínica.'
        : 'Prévia de teste confirmada na interface. Alertas operacionais ainda dependem da integração da clínica.'
  showToast(message, 'success')
}

function handleNavigation(id) {
  const routes = {
    overview: 'reception-dashboard',
    schedule: 'reception-agenda',
    'patient-list': 'reception-patients',
    checkin: 'reception-checkin',
    confirmations: 'reception-confirmations',
    history: 'reception-history',
  }
  if (routes[id]) void router.push({ name: routes[id] })
}

function handleBeforeUnload(event) {
  if (!hasChanges.value) return
  event.preventDefault()
  event.returnValue = ''
}

onBeforeRouteLeave(() => {
  if (!hasChanges.value) return true
  return window.confirm('Há alterações não salvas. Deseja sair sem salvar?')
})

onMounted(() => {
  browserSupported.value = window.isSecureContext && 'Notification' in window
  browserPermission.value = browserSupported.value ? Notification.permission : 'unsupported'
  window.addEventListener('beforeunload', handleBeforeUnload)
  void loadSettings()
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
})
</script>

<template>
  <div class="notification-settings-page">
    <ReceptionShell active-page="notifications" :date-label="dateLabel" @navigate="handleNavigation" />

    <main class="notification-settings-main">
      <section class="notification-settings-intro" aria-labelledby="notification-settings-title">
        <div>
          <p class="notification-eyebrow">PREFERÊNCIAS DA CONTA</p>
          <h1 id="notification-settings-title">Configurações de Notificações</h1>
          <p>Personalize os avisos que você recebe durante a rotina da clínica</p>
        </div>
        <div class="notification-intro-actions">
          <UiButton
            variant="secondary"
            :disabled="state !== 'ready' || busy"
            @click="resetOpen = true"
          >
            <template #start><RotateCcw :size="16" aria-hidden="true" /></template>
            Restaurar padrão
          </UiButton>
          <UiButton
            :disabled="state !== 'ready' || !hasChanges"
            :loading="busy"
            @click="saveSettings"
          >
            <template #start><Save :size="16" aria-hidden="true" /></template>
            Salvar alterações
          </UiButton>
        </div>
      </section>

      <UiAlert
        v-if="alert"
        class="notification-alert"
        :variant="alert.variant"
        :title="alert.title"
        live
      >
        {{ alert.message }}
        <UiButton
          v-if="state === 'error'"
          class="notification-retry"
          variant="secondary"
          size="sm"
          @click="loadSettings"
        >
          Tentar novamente
        </UiButton>
      </UiAlert>

      <div v-if="state === 'loading'" class="notification-loading" role="status" aria-live="polite">
        <span class="notification-spinner" aria-hidden="true"></span>
        <span>Carregando suas preferências...</span>
      </div>

      <template v-else-if="state === 'ready'">
        <UiAlert v-if="hasChanges" variant="warning" title="Alterações não salvas">
          Suas preferências serão aplicadas depois que você salvar.
        </UiAlert>

        <UiAlert variant="info" title="Integrações disponíveis">
          As preferências são salvas por usuário. O sistema ainda não possui eventos operacionais de
          notificação, e-mail, WhatsApp ou SMS conectados; esses canais não serão apresentados como
          ativos.
        </UiAlert>

        <div class="notification-layout">
          <div class="notification-settings-column">
            <section class="notification-panel" aria-labelledby="general-title">
              <div class="notification-panel-heading">
                <span class="notification-icon"><Bell :size="19" aria-hidden="true" /></span>
                <div>
                  <h2 id="general-title">Preferências gerais</h2>
                  <p>Controle como os avisos devem aparecer nesta conta.</p>
                </div>
              </div>

              <div class="notification-general-list">
                <div class="notification-setting-row">
                  <div>
                    <strong>Notificações do sistema</strong>
                    <p>Ativa ou pausa suas preferências de aviso.</p>
                  </div>
                  <UiSwitch v-model="settings.enabled" label="Ativar notificações do sistema" />
                </div>
                <div class="notification-setting-row">
                  <div>
                    <strong>Exibir na interface</strong>
                    <p>Permite avisos dentro do portal quando os eventos estiverem integrados.</p>
                  </div>
                  <UiSwitch
                    v-model="settings.show_in_app"
                    label="Exibir notificações na interface"
                    :disabled="!settings.enabled"
                  />
                </div>
                <div class="notification-setting-row">
                  <div>
                    <strong>Manter avisos importantes destacados</strong>
                    <p>Preferência para alertas importantes disponíveis no sistema.</p>
                  </div>
                  <UiSwitch
                    v-model="settings.keep_important"
                    label="Manter avisos importantes destacados"
                    :disabled="!settings.enabled"
                  />
                </div>
                <div class="notification-setting-row">
                  <div>
                    <strong>Som dos alertas</strong>
                    <p>Preferência armazenada; depende da integração de alertas do sistema.</p>
                  </div>
                  <UiSwitch
                    v-model="settings.sound"
                    label="Ativar som dos alertas"
                    :disabled="!settings.enabled"
                  />
                </div>
                <div class="notification-setting-row notification-setting-row--permission">
                  <div>
                    <strong>Notificação do navegador</strong>
                    <p>{{ channelStatus('browser') }}. Não envia alertas em segundo plano.</p>
                  </div>
                  <UiButton
                    v-if="browserPermission !== 'granted' && browserSupported"
                    variant="secondary"
                    size="sm"
                    @click="requestBrowserPermission"
                  >
                    Autorizar navegador
                  </UiButton>
                  <span
                    v-else
                    class="notification-status"
                    :class="{ 'notification-status--ready': browserPermission === 'granted' }"
                  >
                    <CheckCircle2
                      v-if="browserPermission === 'granted'"
                      :size="15"
                      aria-hidden="true"
                    />
                    {{ browserPermission === 'granted' ? 'Autorizado' : 'Indisponível' }}
                  </span>
                </div>
              </div>
            </section>

            <section class="notification-panel" aria-labelledby="frequency-title">
              <div class="notification-panel-heading">
                <span class="notification-icon notification-icon--blue"
                  ><Clock3 :size="19" aria-hidden="true"
                /></span>
                <div>
                  <h2 id="frequency-title">Frequência e prioridade</h2>
                  <p>Defina preferências para alertas futuros, quando suportados.</p>
                </div>
              </div>
              <div class="notification-frequency-grid">
                <label class="notification-field">
                  <span>Antecedência de consultas próximas</span>
                  <select
                    v-model.number="settings.upcoming_reminder_minutes"
                    :disabled="!settings.enabled"
                  >
                    <option :value="15">15 minutos</option>
                    <option :value="30">30 minutos</option>
                    <option :value="60">60 minutos</option>
                  </select>
                </label>
                <label class="notification-field">
                  <span>Limite de repetição</span>
                  <select v-model.number="settings.repeat_limit" :disabled="!settings.enabled">
                    <option :value="0">Não repetir</option>
                    <option :value="1">1 repetição</option>
                    <option :value="2">2 repetições</option>
                    <option :value="3">3 repetições</option>
                    <option :value="5">Até 5 repetições</option>
                  </select>
                </label>
                <div class="notification-setting-row notification-frequency-option">
                  <div>
                    <strong>Agrupar avisos semelhantes</strong>
                    <p>Reduz a repetição de avisos parecidos.</p>
                  </div>
                  <UiSwitch
                    v-model="settings.group_similar"
                    label="Agrupar notificações semelhantes"
                    :disabled="!settings.enabled"
                  />
                </div>
                <div class="notification-setting-row notification-frequency-option">
                  <div>
                    <strong>Horário de silêncio</strong>
                    <p>
                      Preferência para notificações não urgentes, ainda sem aplicação operacional.
                    </p>
                  </div>
                  <UiSwitch
                    v-model="settings.quiet_hours_enabled"
                    label="Ativar horário de silêncio"
                    :disabled="!settings.enabled"
                  />
                </div>
                <template v-if="settings.quiet_hours_enabled">
                  <label class="notification-field">
                    <span>Início do silêncio</span>
                    <input
                      v-model="settings.quiet_start"
                      type="time"
                      :disabled="!settings.enabled"
                    />
                  </label>
                  <label class="notification-field">
                    <span>Fim do silêncio</span>
                    <input v-model="settings.quiet_end" type="time" :disabled="!settings.enabled" />
                  </label>
                </template>
              </div>
            </section>

            <section
              v-for="group in categoryGroups"
              :key="group.id"
              class="notification-panel notification-category"
              :aria-labelledby="`category-${group.id}`"
              :class="{ 'notification-category--off': !isCategoryActive(group) }"
            >
              <div class="notification-category-heading">
                <div>
                  <p class="notification-category-kicker">CATEGORIA</p>
                  <h2 :id="`category-${group.id}`">{{ group.title }}</h2>
                  <p>{{ group.description }}</p>
                </div>
                <UiSwitch
                  :model-value="settings.categories[group.id]"
                  :label="`Ativar categoria ${group.title}`"
                  :disabled="!settings.enabled"
                  @update:model-value="setCategory(group, $event)"
                />
              </div>

              <p v-if="!isCategoryActive(group)" class="notification-category-note">
                Eventos e canais individuais estão pausados; suas escolhas foram preservadas.
              </p>

              <div
                v-for="[eventId, title, description] in group.events"
                :key="eventId"
                class="notification-event"
              >
                <div class="notification-event-main">
                  <div class="notification-event-copy">
                    <strong>{{ title }}</strong>
                    <p>{{ description }}</p>
                  </div>
                  <div class="notification-event-controls">
                    <label class="notification-priority">
                      <span>Prioridade</span>
                      <select
                        v-model="settings.priorities[eventId]"
                        :disabled="!isEventActive(group, eventId)"
                      >
                        <option value="informative">Informativo</option>
                        <option value="important">Importante</option>
                        <option value="urgent">Urgente</option>
                      </select>
                    </label>
                    <UiSwitch
                      :model-value="settings.events[eventId]"
                      :label="`Notificar: ${title}`"
                      :disabled="!isCategoryActive(group)"
                      @update:model-value="settings.events[eventId] = $event"
                    />
                  </div>
                </div>
                <div class="notification-channel-list" :aria-label="`Canais para ${title}`">
                  <button
                    v-for="channel in channels"
                    :key="channel.id"
                    type="button"
                    class="notification-channel"
                    :class="{
                      'notification-channel--selected': settings.channels[eventId][channel.id],
                      'notification-channel--disabled':
                        (!channelAvailable(channel.id) &&
                          !settings.channels[eventId][channel.id]) ||
                        !isEventActive(group, eventId),
                    }"
                    :disabled="
                      (!channelAvailable(channel.id) && !settings.channels[eventId][channel.id]) ||
                      !isEventActive(group, eventId)
                    "
                    :aria-pressed="settings.channels[eventId][channel.id]"
                    :aria-label="`${channel.label} para ${title}: ${settings.channels[eventId][channel.id] ? 'ativo' : 'inativo'}. ${channelStatus(channel.id)}`"
                    :title="channelStatus(channel.id)"
                    @click="toggleChannel(eventId, channel.id)"
                  >
                    <Check
                      v-if="settings.channels[eventId][channel.id]"
                      :size="12"
                      aria-hidden="true"
                    />
                    {{ channel.label }}
                    <span v-if="!channel.available" class="visually-hidden">
                      (integração não configurada)</span
                    >
                  </button>
                </div>
              </div>
            </section>
          </div>

          <aside class="notification-preview-column" aria-label="Prévia e informações dos canais">
            <section class="notification-preview-card">
              <div class="notification-preview-heading">
                <span class="notification-icon notification-icon--preview"
                  ><BellRing :size="18" aria-hidden="true"
                /></span>
                <div>
                  <h2>Prévia da notificação</h2>
                  <p>Exemplo sem dados de pacientes</p>
                </div>
              </div>
              <div class="notification-preview">
                <div class="notification-preview__brand">
                  <span class="notification-preview__mark"
                    ><Bell :size="14" aria-hidden="true"
                  /></span>
                  <span>Zen <small>· Recepção</small></span>
                  <span class="notification-preview__time">agora</span>
                </div>
                <strong>Nova atividade na agenda</strong>
                <p>Uma atualização está disponível para a equipe da recepção.</p>
              </div>
              <UiButton
                class="notification-test-button"
                variant="secondary"
                :disabled="!settings.enabled"
                @click="testNotification"
              >
                <template #start><BellRing :size="15" aria-hidden="true" /></template>
                Testar notificação
              </UiButton>
              <p class="notification-preview-caption">
                A prévia é ilustrativa. Ela não representa um evento real nem contém informações
                clínicas.
              </p>
            </section>

            <section class="notification-channel-card" aria-labelledby="channel-status-title">
              <div class="notification-channel-card__heading">
                <ShieldCheck :size="18" aria-hidden="true" />
                <h2 id="channel-status-title">Canais e permissões</h2>
              </div>
              <ul class="notification-channel-status-list">
                <li>
                  <span
                    ><span class="notification-dot notification-dot--available"></span>No
                    sistema</span
                  ><strong>Preferência disponível</strong>
                </li>
                <li>
                  <span
                    ><span
                      class="notification-dot"
                      :class="{ 'notification-dot--available': browserPermission === 'granted' }"
                    ></span
                    >Navegador</span
                  ><strong>{{ channelStatus('browser') }}</strong>
                </li>
                <li>
                  <span><span class="notification-dot"></span>E-mail</span
                  ><strong>Não configurado</strong>
                </li>
                <li>
                  <span><span class="notification-dot"></span>WhatsApp / SMS</span
                  ><strong>Não configurado</strong>
                </li>
              </ul>
              <p class="notification-admin-note">
                <LockKeyhole :size="15" aria-hidden="true" /> Solicite ao responsável autorizado a
                configuração de integrações externas.
              </p>
            </section>

            <UiAlert variant="info" title="Privacidade">
              Esta tela armazena somente preferências da conta. Nenhum dado de paciente é incluído
              na prévia ou no teste.
            </UiAlert>
          </aside>
        </div>
      </template>

      <div
        v-if="state === 'ready' && hasChanges"
        class="notification-save-bar notification-save-bar--visible"
      >
        <span><Info :size="16" aria-hidden="true" /> Você tem alterações não salvas</span>
        <UiButton :loading="busy" @click="saveSettings">
          <template #start><Save :size="15" aria-hidden="true" /></template>
          Salvar alterações
        </UiButton>
      </div>

      <UiDialog v-model="resetOpen" title="Restaurar preferências padrão?">
        <p class="notification-confirm-copy">
          As escolhas desta tela voltarão aos padrões da conta. Essa alteração não será salva até
          você selecionar
          <strong>Salvar alterações</strong>.
        </p>
        <div class="notification-dialog-actions">
          <UiButton variant="secondary" @click="resetOpen = false">Manter configurações</UiButton>
          <UiButton @click="restoreDefaults">Restaurar padrão</UiButton>
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
.notification-settings-page {
  min-height: 100vh;
  padding-bottom: 5.5rem;
  background: var(--color-background);
}

.notification-settings-main {
  width: min(100% - 2.5rem, 78rem);
  margin: 0 auto;
  padding: clamp(1.5rem, 3vw, 2.5rem) 0 3rem;
}

.notification-settings-intro {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}

.notification-eyebrow,
.notification-category-kicker {
  margin: 0 0 0.4rem;
  color: var(--color-primary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.09em;
}

.notification-settings-intro h1 {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-heading);
  font-size: clamp(1.55rem, 2.2vw, 2rem);
  line-height: 1.2;
}

.notification-settings-intro > div:first-child > p:last-child {
  margin: 0.55rem 0 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.notification-intro-actions,
.notification-dialog-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.625rem;
}

.notification-alert {
  margin-bottom: 1rem;
}

.notification-retry {
  margin: 0.5rem 0 0 0.5rem;
}

.notification-loading {
  display: flex;
  min-height: 18rem;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  color: var(--color-text-secondary);
}

.notification-spinner {
  width: 1.25rem;
  height: 1.25rem;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: notification-spin 0.8s linear infinite;
}

.notification-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 19rem;
  align-items: start;
  gap: 1.25rem;
  margin-top: 1rem;
}

.notification-settings-column,
.notification-preview-column {
  display: grid;
  gap: 1rem;
  min-width: 0;
}

.notification-preview-column {
  position: sticky;
  top: 1rem;
}

.notification-panel,
.notification-preview-card,
.notification-channel-card {
  min-width: 0;
  padding: clamp(1rem, 2vw, 1.35rem);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.notification-panel-heading,
.notification-preview-heading {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 1.15rem;
}

.notification-icon {
  display: grid;
  width: 2.4rem;
  height: 2.4rem;
  flex: 0 0 auto;
  place-items: center;
  border-radius: var(--radius-md);
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}

.notification-icon--blue {
  background: var(--color-blue-50);
  color: var(--color-blue-700);
}

.notification-icon--preview {
  background: var(--color-success-subtle);
  color: var(--color-success-strong);
}

.notification-panel-heading h2,
.notification-preview-heading h2,
.notification-channel-card h2,
.notification-category-heading h2 {
  margin: 0;
  color: var(--color-text);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
}

.notification-panel-heading p,
.notification-preview-heading p,
.notification-category-heading > div > p:last-child {
  margin: 0.28rem 0 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.45;
}

.notification-general-list {
  border-top: 1px solid var(--color-border);
}

.notification-setting-row {
  display: flex;
  min-height: 4.4rem;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.8rem 0;
  border-bottom: 1px solid var(--color-border);
}

.notification-setting-row:last-child {
  border-bottom: 0;
}

.notification-setting-row > div:first-child {
  min-width: 0;
}

.notification-settings-page :deep(.switch-field > span:last-child) {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.notification-setting-row strong,
.notification-event-copy strong {
  color: var(--color-text);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
}

.notification-setting-row p,
.notification-event-copy p {
  margin: 0.2rem 0 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  line-height: 1.45;
}

.notification-status {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.35rem;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.notification-status--ready {
  color: var(--color-success-strong);
}

.notification-frequency-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.notification-field {
  display: grid;
  gap: 0.4rem;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
}

.notification-field select,
.notification-field input {
  width: 100%;
  min-height: 2.65rem;
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
}

.notification-field select:focus-visible,
.notification-field input:focus-visible,
.notification-channel:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--color-primary) 28%, transparent);
  outline-offset: 2px;
}

.notification-field select:disabled,
.notification-field input:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.notification-frequency-option {
  min-height: 4.1rem;
  padding: 0.2rem 0;
  border-bottom: 0;
}

.notification-category-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--color-border);
}

.notification-category-heading .notification-category-kicker {
  margin-bottom: 0.22rem;
}

.notification-category--off {
  background: color-mix(in srgb, var(--color-surface) 80%, var(--color-background));
}

.notification-category-note {
  margin: 0.8rem 0 0;
  padding: 0.65rem 0.75rem;
  border-radius: var(--radius-sm);
  background: var(--color-background);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.notification-event {
  padding-top: 1rem;
  margin-top: 0.85rem;
  border-top: 1px solid var(--color-border);
}

.notification-event-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.notification-event-controls {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.8rem;
}

.notification-priority {
  display: grid;
  gap: 0.18rem;
  color: var(--color-text-muted);
  font-size: 0.65rem;
}

.notification-priority select {
  max-width: 7.8rem;
  min-height: 1.9rem;
  padding: 0.22rem 0.3rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font: inherit;
}

.notification-priority select:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--color-primary) 28%, transparent);
  outline-offset: 2px;
}

.notification-priority select:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.notification-event-copy {
  min-width: 0;
}

.notification-channel-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.65rem;
}

.notification-channel {
  display: inline-flex;
  min-height: 1.85rem;
  align-items: center;
  gap: 0.22rem;
  padding: 0.2rem 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 0.69rem;
  cursor: pointer;
  transition:
    color var(--transition-fast),
    background var(--transition-fast),
    border-color var(--transition-fast);
}

.notification-channel--selected {
  border-color: color-mix(in srgb, var(--color-primary) 35%, var(--color-border));
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}

.notification-channel:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.notification-preview-card {
  padding: 1.15rem;
}

.notification-preview-heading {
  margin-bottom: 1rem;
}

.notification-preview-heading h2 {
  font-size: var(--font-size-sm);
}

.notification-preview-heading p {
  font-size: var(--font-size-xs);
}

.notification-preview {
  padding: 0.9rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-background);
}

.notification-preview__brand {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
}

.notification-preview__brand small {
  font-weight: var(--font-weight-regular);
}

.notification-preview__mark {
  display: grid;
  width: 1.5rem;
  height: 1.5rem;
  place-items: center;
  border-radius: 0.4rem;
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}

.notification-preview__time {
  margin-left: auto;
  font-weight: var(--font-weight-regular);
}

.notification-preview > strong {
  display: block;
  margin-top: 0.75rem;
  color: var(--color-text);
  font-size: var(--font-size-sm);
}

.notification-preview > p,
.notification-preview-caption {
  margin: 0.28rem 0 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  line-height: 1.5;
}

.notification-test-button {
  width: 100%;
  margin-top: 0.8rem;
}

.notification-preview-caption {
  margin-top: 0.7rem;
  color: var(--color-text-muted);
}

.notification-channel-card__heading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--color-primary);
}

.notification-channel-card h2 {
  font-size: var(--font-size-sm);
}

.notification-channel-status-list {
  display: grid;
  gap: 0.85rem;
  padding: 0;
  margin: 1rem 0 0;
  list-style: none;
}

.notification-channel-status-list li,
.notification-channel-status-list li > span {
  display: flex;
  align-items: center;
}

.notification-channel-status-list li {
  justify-content: space-between;
  gap: 0.5rem;
  color: var(--color-text);
  font-size: var(--font-size-xs);
}

.notification-channel-status-list li > span {
  gap: 0.4rem;
}

.notification-channel-status-list strong {
  color: var(--color-text-secondary);
  font-size: 0.68rem;
  font-weight: var(--font-weight-medium);
  text-align: right;
}

.notification-dot {
  width: 0.45rem;
  height: 0.45rem;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--color-text-muted);
}

.notification-dot--available {
  background: var(--color-green-600);
}

.notification-admin-note {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  padding-top: 0.85rem;
  margin: 0.95rem 0 0;
  border-top: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  line-height: 1.45;
}

.notification-admin-note svg {
  flex: 0 0 auto;
}

.notification-save-bar {
  position: fixed;
  z-index: var(--z-sticky);
  right: max(1.25rem, calc((100vw - 78rem) / 2));
  bottom: 1rem;
  left: max(1.25rem, calc((100vw - 78rem) / 2));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.65rem 0.8rem 0.65rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-lg);
  transition:
    transform var(--transition-fast),
    opacity var(--transition-fast);
}

.notification-save-bar > span {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.notification-save-bar--visible > span {
  color: var(--color-text);
}

.notification-confirm-copy {
  margin: 0;
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.notification-confirm-copy strong {
  color: var(--color-text);
}

.notification-dialog-actions {
  margin-top: 1.25rem;
}

@keyframes notification-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 65rem) {
  .notification-layout {
    grid-template-columns: minmax(0, 1fr) 17rem;
  }
}

@media (max-width: 52rem) {
  .notification-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .notification-preview-column {
    position: static;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .notification-preview-column > :last-child {
    grid-column: 1 / -1;
  }
}

@media (max-width: 38rem) {
  .notification-settings-main {
    width: min(100% - 1.25rem, 78rem);
    padding-top: 1.25rem;
  }

  .notification-settings-intro {
    align-items: flex-start;
    flex-direction: column;
    gap: 1rem;
  }

  .notification-intro-actions {
    width: 100%;
    justify-content: stretch;
  }

  .notification-intro-actions > :deep(.button) {
    flex: 1;
    justify-content: center;
  }

  .notification-frequency-grid,
  .notification-preview-column {
    grid-template-columns: minmax(0, 1fr);
  }

  .notification-preview-column > :last-child {
    grid-column: auto;
  }

  .notification-setting-row {
    align-items: flex-start;
  }

  .notification-setting-row--permission {
    flex-wrap: wrap;
  }

  .notification-setting-row--permission > div {
    flex-basis: 100%;
  }

  .notification-save-bar {
    right: 0.5rem;
    bottom: 0.5rem;
    left: 0.5rem;
    padding: 0.55rem;
  }

  .notification-save-bar > span {
    max-width: 45%;
    line-height: 1.3;
  }

  .notification-category-heading {
    align-items: flex-start;
  }

  .notification-event-main {
    align-items: flex-start;
    flex-direction: column-reverse;
  }

  .notification-event-controls {
    width: 100%;
    justify-content: space-between;
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
