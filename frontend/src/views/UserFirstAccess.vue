<script setup>
import { computed, onMounted, ref } from 'vue'
import { CheckCircle2, Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import { acceptManagedUserInvitation } from '../services/manager-users'
import { getApiErrorMessage } from '../services/api'
import UiButton from '../components/ui/UiButton.vue'
import UiToothIcon from '../components/ui/UiToothIcon.vue'

const route = useRoute()
const router = useRouter()
const token = ref('')
const password = ref('')
const passwordConfirmation = ref('')
const passwordVisible = ref(false)
const confirmationVisible = ref(false)
const submitting = ref(false)
const errorMessage = ref('')
const complete = ref(false)
const form = ref(null)
const passwordsMatch = computed(() => password.value === passwordConfirmation.value)

async function submit() {
  errorMessage.value = ''
  if (!form.value?.reportValidity()) return
  if (!passwordsMatch.value) {
    errorMessage.value = 'As senhas não conferem.'
    return
  }
  submitting.value = true
  try {
    await acceptManagedUserInvitation({ token: token.value, password: password.value })
    complete.value = true
    token.value = ''
    password.value = ''
    passwordConfirmation.value = ''
    window.history.replaceState({}, '', window.location.pathname)
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, 'Não foi possível concluir o primeiro acesso.')
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  const hash = route.hash.startsWith('#') ? route.hash.slice(1) : route.hash
  token.value = new URLSearchParams(hash).get('token') || ''
})
</script>

<template>
  <main class="first-access-page">
    <section class="first-access-card" aria-labelledby="first-access-title">
      <a class="first-access-brand" href="/" aria-label="Zen — página inicial">
        <span><UiToothIcon :size="21" aria-hidden="true" /></span> Zen
      </a>
      <template v-if="complete">
        <span class="first-access-success-icon"><CheckCircle2 :size="27" aria-hidden="true" /></span>
        <p class="first-access-eyebrow">PRIMEIRO ACESSO CONCLUÍDO</p>
        <h1 id="first-access-title">Senha configurada</h1>
        <p class="first-access-description">Sua conta foi ativada. Você já pode acessar o sistema com seu e-mail e a nova senha.</p>
        <UiButton @click="router.replace({ name: 'login' })">Ir para o login</UiButton>
      </template>
      <template v-else>
        <span class="first-access-key"><KeyRound :size="23" aria-hidden="true" /></span>
        <p class="first-access-eyebrow">ACESSO SEGURO ZEN</p>
        <h1 id="first-access-title">Defina sua senha</h1>
        <p class="first-access-description">Crie uma senha para ativar sua conta. O link de primeiro acesso é individual, válido por 48 horas e pode ser usado uma única vez.</p>
        <div v-if="!token" class="first-access-error" role="alert">
          Este link não contém um convite válido. Solicite um novo à gestão da clínica.
        </div>
        <form v-else ref="form" class="first-access-form" @submit.prevent="submit">
          <label>
            <span>Nova senha</span>
            <span class="first-access-password">
              <input
                v-model="password"
                :type="passwordVisible ? 'text' : 'password'"
                minlength="12"
                maxlength="128"
                autocomplete="new-password"
                required
              >
              <button type="button" :aria-label="passwordVisible ? 'Ocultar senha' : 'Mostrar senha'" @click="passwordVisible = !passwordVisible">
                <EyeOff v-if="passwordVisible" :size="17" aria-hidden="true" />
                <Eye v-else :size="17" aria-hidden="true" />
              </button>
            </span>
            <small>Mínimo de 12 caracteres, com letra minúscula, maiúscula e número.</small>
          </label>
          <label>
            <span>Confirme a senha</span>
            <span class="first-access-password">
              <input
                v-model="passwordConfirmation"
                :type="confirmationVisible ? 'text' : 'password'"
                minlength="12"
                maxlength="128"
                autocomplete="new-password"
                required
              >
              <button type="button" :aria-label="confirmationVisible ? 'Ocultar confirmação' : 'Mostrar confirmação'" @click="confirmationVisible = !confirmationVisible">
                <EyeOff v-if="confirmationVisible" :size="17" aria-hidden="true" />
                <Eye v-else :size="17" aria-hidden="true" />
              </button>
            </span>
          </label>
          <p v-if="passwordConfirmation && !passwordsMatch" class="first-access-error" role="alert">As senhas não conferem.</p>
          <p v-if="errorMessage" class="first-access-error" role="alert">{{ errorMessage }}</p>
          <UiButton type="submit" :loading="submitting">Ativar minha conta</UiButton>
        </form>
      </template>
      <p class="first-access-security"><ShieldCheck :size="15" aria-hidden="true" /> Sua senha é protegida e nunca fica visível para a clínica.</p>
    </section>
  </main>
</template>

<style scoped>
.first-access-page {
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: var(--space-5);
  background:
    radial-gradient(ellipse at 10% 12%, color-mix(in srgb, var(--color-primary) 12%, transparent), transparent 38%),
    var(--color-background);
  color: var(--color-text);
}

.first-access-card {
  display: grid;
  width: min(100%, 30rem);
  justify-items: center;
  gap: var(--space-4);
  padding: clamp(var(--space-5), 7vw, var(--space-8));
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-surface);
  box-shadow: var(--shadow-lg);
  text-align: center;
}

.first-access-brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
  color: var(--color-text);
  font-family: var(--font-heading);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  text-decoration: none;
}

.first-access-brand > span,
.first-access-key,
.first-access-success-icon {
  display: grid;
  width: 3rem;
  height: 3rem;
  place-items: center;
  border-radius: var(--radius-lg);
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}

.first-access-eyebrow {
  margin: 0;
  color: var(--color-primary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.09em;
}

.first-access-card h1 {
  margin: calc(-1 * var(--space-2)) 0 0;
  font-family: var(--font-heading);
  font-size: var(--font-size-xl);
}

.first-access-description {
  max-width: 24rem;
  margin: calc(-1 * var(--space-2)) 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.55;
}

.first-access-form {
  display: grid;
  width: 100%;
  gap: var(--space-4);
  text-align: left;
}

.first-access-form label {
  display: grid;
  gap: var(--space-2);
}

.first-access-form label > span:first-child {
  color: var(--color-text);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
}

.first-access-password {
  display: flex;
  min-height: 2.8rem;
  align-items: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.first-access-password:focus-within {
  border-color: var(--color-focus);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-focus) 24%, transparent);
}

.first-access-password input {
  width: 100%;
  min-width: 0;
  padding: 0 var(--space-3);
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--color-text);
  font: inherit;
}

.first-access-password button {
  display: grid;
  width: 2.7rem;
  height: 2.7rem;
  flex: 0 0 auto;
  place-items: center;
  border: 0;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.first-access-form small {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.first-access-error {
  margin: 0;
  color: var(--color-danger);
  font-size: var(--font-size-sm);
  line-height: 1.5;
}

.first-access-security {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  margin: var(--space-2) 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.first-access-security svg {
  flex: 0 0 auto;
  color: var(--color-primary);
}

.first-access-page :focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
