<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-vue-next'
import UiButton from '../components/ui/UiButton.vue'
import UiFormField from '../components/ui/UiFormField.vue'
import UiIconButton from '../components/ui/UiIconButton.vue'
import UiInput from '../components/ui/UiInput.vue'
import UiToast from '../components/ui/UiToast.vue'
import UiToothIcon from '../components/ui/UiToothIcon.vue'
import { login } from '../services/auth'
import { getApiErrorMessage } from '../services/api'
import { setSession } from '../services/auth-session'
import { getCachedUserPreferences, getUserPreferences } from '../services/user-preferences'

const route = useRoute()
const router = useRouter()
const email = ref('')
const password = ref('')
const passwordVisible = ref(false)
const submitAttempted = ref(false)
const toastVisible = ref(false)
const toastMessage = ref('')
const toastVariant = ref('info')
const toastKey = ref(0)
const loginForm = ref(null)
const isSubmitting = ref(false)

function showToast(message, variant = 'info') {
  toastMessage.value = message
  toastVariant.value = variant
  toastVisible.value = true
  toastKey.value += 1
}

async function submitLogin() {
  submitAttempted.value = true
  if (!loginForm.value.checkValidity()) {
    loginForm.value.reportValidity()
    return
  }

  isSubmitting.value = true
  try {
    const session = await login({ email: email.value.trim(), password: password.value })
    if (!['receptionist', 'dentist', 'manager'].includes(session.user.role)) {
      showToast('Seu perfil ainda não possui uma tela disponível neste sistema.', 'warning')
      return
    }
    setSession(session)
    const defaultHome = session.user.role === 'dentist'
      ? 'dentist-dashboard'
      : session.user.role === 'manager'
        ? 'manager-dashboard'
        : 'reception-dashboard'
    let homePage = defaultHome
    try {
      homePage = (await getUserPreferences(session.user.id)).homePage
    } catch (error) {
      let fallbackMessage = ''
      try {
        homePage = getCachedUserPreferences(session.user.id).homePage
      } catch (cacheError) {
        homePage = defaultHome
        fallbackMessage = cacheError instanceof Error ? ` ${cacheError.message}` : ''
      }
      showToast(
        error instanceof Error
          ? `${error.message} Será usada a página inicial disponível localmente.${fallbackMessage}`
          : `Não foi possível sincronizar as preferências. Será usada a página inicial disponível localmente.${fallbackMessage}`,
        'warning',
      )
    }
    const nextPath = typeof route.query.next === 'string' ? route.query.next : ''
    const validNextPath = session.user.role === 'dentist'
      ? nextPath.startsWith('/dentista')
      : session.user.role === 'manager'
        ? nextPath.startsWith('/gestor')
        : nextPath.startsWith('/recepcao')
    await router.replace(validNextPath ? nextPath : { name: homePage })
  } catch (error) {
    showToast(getApiErrorMessage(error, 'Não foi possível entrar.'), 'danger')
  } finally {
    isSubmitting.value = false
  }
}

function showRecoveryGuidance() {
  showToast('A recuperação de senha ainda não está conectada. Solicite ajuda à gerente da clínica.')
}
</script>

<template>
  <main class="login-page">
    <section class="login-story" aria-labelledby="login-story-title">
      <a class="login-brand" href="/" aria-label="Zen, início">
        <span class="login-brand__mark"><UiToothIcon :size="22" /></span>
        <span>Zen</span>
      </a>

      <div class="login-story__content">
        <span class="login-story__eyebrow">
          <span aria-hidden="true"></span>
          Gestão odontológica, com mais leveza
        </span>
        <h1 id="login-story-title">Mais organização para cuidar de <em>cada sorriso.</em></h1>
        <p>
          A rotina da clínica em harmonia: agendamentos, atendimentos e gestão reunidos em um só
          lugar.
        </p>

        <ul class="login-roles" aria-label="Áreas atendidas pelo sistema">
          <li><span aria-hidden="true">01</span> Recepção</li>
          <li><span aria-hidden="true">02</span> Dentistas</li>
          <li><span aria-hidden="true">03</span> Gestão</li>
        </ul>
      </div>

      <div class="login-story__footer">
        <ShieldCheck :size="18" aria-hidden="true" />
        <span>Um ambiente para a rotina da equipe Zen.</span>
      </div>

      <div class="login-orbit login-orbit--outer" aria-hidden="true"></div>
      <div class="login-orbit login-orbit--inner" aria-hidden="true"></div>
      <span class="login-decoration login-decoration--one" aria-hidden="true">✳</span>
      <span class="login-decoration login-decoration--two" aria-hidden="true">+</span>
    </section>

    <section class="login-panel" aria-labelledby="login-title">
      <div class="login-panel__top">
        <span class="login-panel__secure"
          ><LockKeyhole :size="15" aria-hidden="true" /> Acesso da equipe</span
        >
        <a class="login-help-link" href="/design-system">Design system</a>
      </div>

      <div class="login-form-wrap">
        <div class="login-heading">
          <span class="login-heading__icon"><UiToothIcon :size="22" /></span>
          <p class="login-eyebrow">Acesse a Zen</p>
          <h2 id="login-title">Entre na sua conta</h2>
          <p>Acesse seu ambiente de trabalho com suas credenciais.</p>
        </div>

        <form ref="loginForm" class="login-form" novalidate @submit.prevent="submitLogin">
          <UiFormField
            label="E-mail profissional"
            :error="
              submitAttempted && !email
                ? 'Informe seu e-mail profissional.'
                : submitAttempted && !loginForm?.elements.namedItem('email')?.validity.valid
                  ? 'Informe um e-mail válido.'
                  : ''
            "
            required
          >
            <template #default="{ id, describedBy, invalid, required }">
              <UiInput
                :id="id"
                v-model="email"
                type="email"
                name="email"
                autocomplete="username"
                inputmode="email"
                placeholder="voce@exemplo.com.br"
                :aria-describedby="describedBy"
                :aria-required="required"
                :required="required"
                :invalid="invalid"
              />
            </template>
          </UiFormField>

          <UiFormField
            label="Senha"
            :error="submitAttempted && !password ? 'Informe sua senha.' : ''"
            required
          >
            <template #default="{ id, describedBy, invalid, required }">
              <div class="login-password">
                <UiInput
                  :id="id"
                  v-model="password"
                  name="password"
                  :type="passwordVisible ? 'text' : 'password'"
                  autocomplete="current-password"
                  placeholder="Digite sua senha"
                  :aria-describedby="describedBy"
                  :aria-required="required"
                  :required="required"
                  :invalid="invalid"
                />
                <UiIconButton
                  class="login-password__toggle"
                  :label="passwordVisible ? 'Ocultar senha' : 'Mostrar senha'"
                  :aria-pressed="passwordVisible"
                  @click="passwordVisible = !passwordVisible"
                >
                  <EyeOff v-if="passwordVisible" :size="18" aria-hidden="true" />
                  <Eye v-else :size="18" aria-hidden="true" />
                </UiIconButton>
              </div>
            </template>
          </UiFormField>

          <button class="login-recovery" type="button" @click="showRecoveryGuidance">
            Esqueci minha senha
          </button>

          <UiButton class="login-submit" type="submit" size="lg" :loading="isSubmitting">
            Acessar sistema
            <LockKeyhole :size="16" aria-hidden="true" />
          </UiButton>
        </form>

        <p class="login-privacy">
          <ShieldCheck :size="15" aria-hidden="true" />
          Acesso seguro à plataforma Zen.
        </p>
      </div>

      <footer class="login-panel__footer">
        <span>© {{ new Date().getFullYear() }} Zen</span>
        <span>Gestão odontológica integrada</span>
      </footer>
    </section>
    <UiToast
      :key="toastKey"
      v-model="toastVisible"
      :message="toastMessage"
      :variant="toastVariant"
    />
  </main>
</template>

<style scoped>
.login-page {
  display: grid;
  min-height: 100vh;
  min-height: 100svh;
  grid-template-columns: minmax(0, 1.04fr) minmax(28rem, 0.96fr);
  background: var(--color-surface);
}

.login-story {
  position: relative;
  display: flex;
  min-height: 100%;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
  padding: clamp(var(--space-8), 6vw, var(--space-16));
  background:
    radial-gradient(ellipse at 85% 90%, rgb(40 120 181 / 18%), transparent 40%),
    var(--color-blue-900);
  color: var(--color-text-inverse);
  isolation: isolate;
}

:global(:root[data-theme='dark'] .login-story) {
  background:
    radial-gradient(ellipse at 85% 90%, rgb(40 120 181 / 24%), transparent 42%),
    linear-gradient(145deg, #0d2432, #12354a 58%, #102b3c);
  color: #f4f8fb;
}

:global(:root[data-theme='dark'][data-high-contrast='true'] .login-story) {
  background: #000;
  color: #fff;
}

.login-brand {
  position: relative;
  z-index: 1;
  display: inline-flex;
  width: fit-content;
  min-height: 44px;
  align-items: center;
  gap: var(--space-3);
  color: var(--color-text-inverse);
  font-size: var(--font-size-sm);
  letter-spacing: var(--letter-spacing-tight);
}

.login-brand strong {
  font-weight: var(--font-weight-semibold);
}

.login-brand__mark {
  display: grid;
  width: 2.5rem;
  height: 2.5rem;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 35%);
  border-radius: 50%;
  color: var(--color-blue-100);
}

:global(:root[data-theme='dark'] .login-brand__mark) {
  color: #b7dcf3;
}

.login-story__content {
  position: relative;
  z-index: 1;
  width: min(100%, 38rem);
  margin-block: var(--space-16);
}

.login-story__eyebrow {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-6);
  color: var(--color-blue-100);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  letter-spacing: var(--letter-spacing-wide);
  text-transform: uppercase;
}

:global(:root[data-theme='dark'] .login-story__eyebrow) {
  color: #d5e7f3;
}

.login-story__eyebrow span {
  width: 1.25rem;
  height: 1px;
  background: #8dc4e8;
}

.login-story h1 {
  max-width: 11ch;
  margin: 0;
  font-family: var(--font-heading);
  font-size: clamp(2.5rem, 4.2vw, 4.25rem);
  font-weight: var(--font-weight-semibold);
  letter-spacing: var(--letter-spacing-tight);
  line-height: var(--line-height-tight);
}

.login-story h1 em {
  color: #a8d6f2;
  font-style: normal;
}

:global(:root[data-theme='dark'][data-high-contrast='true'] .login-story h1 em) {
  color: #fff;
}

.login-story__content > p {
  max-width: 32rem;
  margin: var(--space-6) 0 0;
  color: #d2e2ee;
  font-size: var(--font-size-md);
  line-height: var(--line-height-relaxed);
}

:global(:root[data-theme='dark'] .login-story__content > p),
:global(:root[data-theme='dark'] .login-story__footer) {
  color: #dceaf3;
}

.login-roles {
  display: grid;
  gap: var(--space-3);
  margin: var(--space-8) 0 0;
  padding: 0;
  color: #e5eff6;
  font-size: var(--font-size-sm);
  list-style: none;
}

.login-roles li {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.login-roles li span {
  display: inline-grid;
  width: 1.75rem;
  height: 1.75rem;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 24%);
  border-radius: 50%;
  color: #a8d6f2;
  font-size: 0.625rem;
  font-weight: var(--font-weight-semibold);
}

.login-story__footer {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: #d2e2ee;
  font-size: var(--font-size-xs);
}

.login-story__footer svg {
  flex: none;
  color: #a8d6f2;
}

.login-orbit {
  position: absolute;
  z-index: -1;
  right: -12rem;
  bottom: -19rem;
  aspect-ratio: 1;
  border: 1px solid rgb(255 255 255 / 9%);
  border-radius: 50%;
  pointer-events: none;
}

.login-orbit--outer {
  width: min(55vw, 44rem);
}

.login-orbit--inner {
  right: -7rem;
  bottom: -14rem;
  width: min(40vw, 32rem);
  border-color: rgb(255 255 255 / 12%);
}

.login-decoration {
  position: absolute;
  z-index: -1;
  color: #a8d6f2;
  opacity: 0.75;
}

.login-decoration--one {
  top: 28%;
  right: 12%;
  font-size: 2rem;
}

.login-decoration--two {
  right: 18%;
  bottom: 26%;
  font-size: 2.5rem;
  font-weight: 200;
}

.login-panel {
  display: flex;
  min-width: 0;
  flex-direction: column;
  justify-content: space-between;
  padding: clamp(var(--space-6), 5vw, var(--space-12));
  background: var(--color-background);
}

.login-panel__top,
.login-panel__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.login-panel__secure {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
}

.login-panel__secure svg {
  color: var(--color-success);
}

.login-help-link {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  text-decoration: underline;
  text-decoration-color: transparent;
  text-underline-offset: 3px;
  transition:
    color var(--transition-fast),
    text-decoration-color var(--transition-fast);
}

.login-help-link:hover {
  color: var(--color-primary);
  text-decoration-color: currentcolor;
}

.login-form-wrap {
  width: min(100%, 27rem);
  align-self: center;
  padding-block: var(--space-12);
}

.login-heading {
  margin-bottom: var(--space-8);
}

.login-heading__icon {
  display: grid;
  width: 2.75rem;
  height: 2.75rem;
  margin-bottom: var(--space-6);
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-primary);
  box-shadow: var(--shadow-sm);
}

.login-eyebrow {
  margin: 0 0 var(--space-2);
  color: var(--color-primary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  letter-spacing: var(--letter-spacing-wide);
  text-transform: uppercase;
}

.login-heading h2 {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-heading);
  font-size: clamp(var(--font-size-2xl), 3vw, var(--font-size-3xl));
  font-weight: var(--font-weight-semibold);
  letter-spacing: var(--letter-spacing-tight);
  line-height: var(--line-height-heading);
}

.login-heading > p:last-child {
  margin: var(--space-3) 0 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.login-form {
  display: grid;
  gap: var(--space-5);
}

.login-password {
  position: relative;
}

.login-password :deep(.input) {
  padding-right: 3.25rem;
}

.login-password__toggle {
  position: absolute;
  top: 50%;
  right: var(--space-1);
  width: 2.5rem;
  min-width: 2.5rem;
  height: 2.5rem;
  transform: translateY(-50%);
}

.login-password__toggle:active:not(:disabled) {
  transform: translateY(-50%) scale(0.96);
}

.login-recovery {
  justify-self: end;
  min-height: 2.75rem;
  margin-top: calc(-1 * var(--space-4));
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-primary);
  cursor: pointer;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  text-align: right;
}

.login-recovery:hover {
  color: var(--color-primary-hover);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.login-submit {
  width: 100%;
  margin-top: var(--space-1);
}

.login-privacy {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  margin: var(--space-6) 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-body);
}

.login-privacy svg {
  flex: none;
  margin-top: 2px;
  color: var(--color-success);
}

.login-panel__footer {
  color: var(--color-text-muted);
  font-size: 0.6875rem;
}

@media (max-width: 56.25rem) {
  .login-page {
    grid-template-columns: minmax(0, 0.9fr) minmax(24rem, 1.1fr);
  }

  .login-story {
    padding: var(--space-8);
  }

  .login-story h1 {
    font-size: clamp(2.25rem, 5vw, 3.25rem);
  }

  .login-panel {
    padding: var(--space-8);
  }
}

@media (max-width: 50rem) {
  .login-page {
    grid-template-columns: 1fr;
  }

  .login-story {
    min-height: auto;
    padding: var(--space-10) clamp(var(--space-6), 8vw, var(--space-12));
  }

  .login-story__content {
    margin: var(--space-12) 0;
  }

  .login-story h1 {
    max-width: 18ch;
    font-size: clamp(2.5rem, 6vw, 3.5rem);
  }

  .login-panel {
    min-height: 42rem;
    padding: var(--space-8) clamp(var(--space-6), 8vw, var(--space-12));
  }
}

@media (max-width: 42.5rem) {
  .login-page {
    grid-template-columns: 1fr;
  }

  .login-story {
    min-height: auto;
    padding: var(--space-5) var(--space-6) var(--space-6);
  }

  .login-brand {
    font-size: var(--font-size-xs);
  }

  .login-brand__mark {
    width: 2.25rem;
    height: 2.25rem;
  }

  .login-story__content {
    margin: var(--space-10) 0 var(--space-8);
  }

  .login-story__eyebrow {
    margin-bottom: var(--space-4);
    font-size: 0.625rem;
  }

  .login-story h1 {
    max-width: 17ch;
    font-size: clamp(2rem, 9vw, 2.75rem);
  }

  .login-story__content > p {
    margin-top: var(--space-4);
    font-size: var(--font-size-sm);
  }

  .login-roles {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-2);
    margin-top: var(--space-5);
    font-size: 0.6875rem;
  }

  .login-roles li {
    align-items: flex-start;
    flex-direction: column;
    gap: var(--space-2);
  }

  .login-story__footer {
    font-size: 0.6875rem;
  }

  .login-orbit--outer {
    right: -9rem;
    bottom: -23rem;
    width: 29rem;
  }

  .login-orbit--inner {
    right: -5rem;
    bottom: -19rem;
    width: 22rem;
  }

  .login-panel {
    min-height: 33rem;
    padding: var(--space-5) var(--space-6) var(--space-4);
  }

  .login-form-wrap {
    padding-block: var(--space-10);
  }

  .login-heading {
    margin-bottom: var(--space-6);
  }

  .login-heading__icon {
    margin-bottom: var(--space-4);
  }

  .login-panel__footer {
    flex-wrap: wrap;
    font-size: 0.625rem;
  }
}

@media (max-width: 22.5rem) {
  .login-roles {
    grid-template-columns: 1fr;
  }

  .login-roles li {
    align-items: center;
    flex-direction: row;
  }

  .login-panel__top,
  .login-panel__footer {
    align-items: flex-start;
    flex-direction: column;
    gap: var(--space-2);
  }
}

@media (max-height: 42rem) and (min-width: 50.0625rem) {
  .login-story,
  .login-panel {
    min-height: 42rem;
  }

  .login-story__content {
    margin-block: var(--space-10);
  }
}

@media (prefers-reduced-motion: reduce) {
  .login-help-link {
    transition: none;
  }
}
</style>
