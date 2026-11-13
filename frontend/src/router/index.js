import { createRouter, createWebHistory } from 'vue-router'
import { getAccessToken, getSessionUser } from '../services/auth-session'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'login',
      meta: {
        title: 'Entrar — Zen',
        description: 'Acesse com segurança o sistema de gestão odontológica Zen.',
      },
      component: () => import('../views/LoginPage.vue'),
    },
    {
      path: '/primeiro-acesso',
      name: 'user-first-access',
      meta: {
        title: 'Definir senha — Zen',
        description: 'Configure com segurança sua senha de primeiro acesso.',
      },
      component: () => import('../views/UserFirstAccess.vue'),
    },
    {
      path: '/design-system',
      name: 'design-system',
      meta: {
        title: 'Design system — Zen',
        description: 'Conheça os tokens, componentes Vue e padrões de interface acessíveis da Zen.',
      },
      component: () => import('../views/DesignSystem.vue'),
    },
    {
      path: '/gestor',
      name: 'manager-dashboard',
      meta: {
        title: 'Dashboard do Gestor — Zen',
        description: 'Acompanhe os indicadores operacionais e a agenda da clínica.',
        requiresAuth: true,
        roles: ['manager'],
      },
      component: () => import('../views/ManagerDashboard.vue'),
    },
    {
      path: '/gestor/agenda',
      name: 'manager-agenda',
      meta: {
        title: 'Visão Geral da Agenda — Zen',
        description: 'Acompanhe os agendamentos e a disponibilidade da clínica.',
        requiresAuth: true,
        roles: ['manager'],
      },
      component: () => import('../views/ManagerAgenda.vue'),
    },
    {
      path: '/gestor/equipe',
      name: 'manager-team',
      meta: {
        title: 'Gestão de Usuários e Equipe — Zen',
        description: 'Gerencie os usuários vinculados à clínica.',
        requiresAuth: true,
        roles: ['manager'],
      },
      component: () => import('../views/ManagerUsers.vue'),
    },
    {
      path: '/gestor/produtividade',
      name: 'manager-productivity',
      meta: {
        title: 'Produtividade da Equipe — Zen',
        description: 'Acompanhe os indicadores operacionais dos profissionais.',
        requiresAuth: true,
        roles: ['manager'],
      },
      component: () => import('../views/ManagerProductivity.vue'),
    },
    {
      path: '/gestor/pacientes',
      name: 'manager-patients',
      meta: {
        title: 'Gestão de Pacientes — Zen',
        description: 'Acompanhe e consulte a base de pacientes da clínica.',
        requiresAuth: true,
        roles: ['manager'],
      },
      component: () => import('../views/ManagerPatients.vue'),
    },
    {
      path: '/gestor/relatorios',
      name: 'manager-reports',
      meta: {
        title: 'Relatórios Gerenciais — Zen',
        description: 'Consulte relatórios gerenciais sobre a operação da clínica.',
        requiresAuth: true,
        roles: ['manager'],
      },
      component: () => import('../views/ManagerReports.vue'),
    },
    {
      path: '/gestor/configuracoes',
      name: 'manager-settings',
      meta: {
        title: 'Configurações — Zen',
        description: 'Gerencie sua conta e personalize suas preferências no Zen.',
        requiresAuth: true,
        roles: ['manager'],
      },
      component: () => import('../views/ReceptionGeneralSettings.vue'),
    },
    {
      path: '/recepcao',
      name: 'reception-dashboard',
      meta: {
        title: 'Dashboard da Recepção — Zen',
        description: 'Painel da recepção para acompanhar a agenda e os pacientes da Zen.',
        requiresAuth: true,
        roles: ['receptionist'],
      },
      component: () => import('../views/ReceptionDashboard.vue'),
    },
    {
      path: '/dentista',
      name: 'dentist-dashboard',
      meta: {
        title: 'Dashboard da Dentista — Zen',
        description: 'Acompanhe sua agenda e rotina clínica no portal Zen.',
        requiresAuth: true,
        roles: ['dentist'],
      },
      component: () => import('../views/DentistDashboard.vue'),
    },
    {
      path: '/dentista/agenda',
      name: 'dentist-agenda',
      meta: {
        title: 'Minha Agenda — Zen',
        description: 'Consulte sua agenda clínica e os agendamentos autorizados.',
        requiresAuth: true,
        roles: ['dentist'],
      },
      component: () => import('../views/DentistAgenda.vue'),
    },
    {
      path: '/dentista/pacientes',
      name: 'dentist-patients',
      meta: {
        title: 'Pacientes — Zen',
        description: 'Consulte pacientes vinculados à sua agenda e acompanhe os atendimentos autorizados.',
        requiresAuth: true,
        roles: ['dentist'],
      },
      component: () => import('../views/DentistPatients.vue'),
    },
    {
      path: '/dentista/odontograma',
      name: 'dentist-odontogram',
      meta: {
        title: 'Odontograma — Zen',
        description: 'Consulte e registre condições odontológicas de pacientes autorizados.',
        requiresAuth: true,
        roles: ['dentist'],
      },
      component: () => import('../views/DentistOdontogram.vue'),
    },
    {
      path: '/dentista/planos-de-tratamento',
      name: 'dentist-treatment-plans',
      meta: {
        title: 'Planos de Tratamento — Zen',
        description: 'Planeje procedimentos e acompanhe a evolução clínica dos pacientes autorizados.',
        requiresAuth: true,
        roles: ['dentist'],
      },
      component: () => import('../views/DentistTreatmentPlans.vue'),
    },
    {
      path: '/dentista/documentos',
      name: 'dentist-clinical-documents',
      meta: {
        title: 'Receitas e Documentos — Zen',
        description: 'Consulte e prepare rascunhos de documentos clínicos para pacientes autorizados.',
        requiresAuth: true,
        roles: ['dentist'],
      },
      component: () => import('../views/DentistClinicalDocuments.vue'),
    },
    {
      path: '/dentista/historico',
      name: 'dentist-appointment-history',
      meta: {
        title: 'Histórico de Atendimentos — Zen',
        description: 'Consulte atendimentos anteriores e os registros clínicos autorizados.',
        requiresAuth: true,
        roles: ['dentist'],
      },
      component: () => import('../views/DentistAppointmentHistory.vue'),
    },
    {
      path: '/dentista/configuracoes',
      name: 'dentist-settings',
      meta: {
        title: 'Configurações — Zen',
        description: 'Gerencie sua conta e personalize suas preferências no Zen.',
        requiresAuth: true,
        roles: ['dentist'],
      },
      component: () => import('../views/ReceptionGeneralSettings.vue'),
    },
    {
      path: '/recepcao/agenda',
      name: 'reception-agenda',
      meta: {
        title: 'Agenda — Zen',
        description: 'Consulte e gerencie os agendamentos da clínica Zen.',
        requiresAuth: true,
        roles: ['receptionist'],
      },
      component: () => import('../views/ReceptionAgenda.vue'),
    },
    {
      path: '/recepcao/pacientes',
      name: 'reception-patients',
      meta: {
        title: 'Pacientes — Zen',
        description: 'Consulte e atualize os cadastros administrativos de pacientes da clínica Zen.',
        requiresAuth: true,
        roles: ['receptionist'],
      },
      component: () => import('../views/ReceptionPatients.vue'),
    },
    {
      path: '/recepcao/check-in',
      name: 'reception-checkin',
      meta: {
        title: 'Check-in de pacientes — Zen',
        description: 'Registre as chegadas e acompanhe a fila de atendimento da clínica Zen.',
        requiresAuth: true,
        roles: ['receptionist'],
      },
      component: () => import('../views/ReceptionCheckin.vue'),
    },
    {
      path: '/recepcao/confirmacoes',
      name: 'reception-confirmations',
      meta: {
        title: 'Confirmações — Zen',
        description: 'Acompanhe e atualize as confirmações de consultas da clínica Zen.',
        requiresAuth: true,
        roles: ['receptionist'],
      },
      component: () => import('../views/ReceptionConfirmations.vue'),
    },
    {
      path: '/recepcao/historico',
      name: 'reception-history',
      meta: {
        title: 'Histórico de Consultas — Zen',
        description: 'Consulte o histórico administrativo e os registros de agenda da clínica Zen.',
        requiresAuth: true,
        roles: ['receptionist'],
      },
      component: () => import('../views/ReceptionHistory.vue'),
    },
    {
      path: '/recepcao/notificacoes',
      name: 'reception-notification-settings',
      meta: {
        title: 'Configurações de Notificações — Zen',
        description: 'Personalize as preferências de notificações da recepção da clínica Zen.',
        requiresAuth: true,
        roles: ['receptionist'],
      },
      component: () => import('../views/ReceptionNotificationSettings.vue'),
    },
    {
      path: '/recepcao/configuracoes',
      name: 'reception-general-settings',
      meta: {
        title: 'Configurações — Zen',
        description: 'Gerencie sua conta e personalize as preferências da interface Zen.',
        requiresAuth: true,
        roles: ['receptionist'],
      },
      component: () => import('../views/ReceptionGeneralSettings.vue'),
    },
  ],
})

router.beforeEach((to) => {
  if (to.meta.requiresAuth && !getAccessToken()) {
    return { name: 'login', query: { next: to.fullPath } }
  }
  const user = getSessionUser()
  if (to.meta.roles && user && !to.meta.roles.includes(user.role)) {
    return { name: 'login' }
  }
  if (to.name === 'login' && getAccessToken() && user?.role === 'receptionist') {
    return { name: 'reception-dashboard' }
  }
  if (to.name === 'login' && getAccessToken() && user?.role === 'dentist') {
    return { name: 'dentist-dashboard' }
  }
  if (to.name === 'login' && getAccessToken() && user?.role === 'manager') {
    return { name: 'manager-dashboard' }
  }
})

router.afterEach((to, _from, failure) => {
  if (failure) return
  document.title = to.meta.title
  document.querySelector('meta[name="description"]').content = to.meta.description
})

export default router
