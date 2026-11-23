<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Lock, Message, DataAnalysis, User } from '@element-plus/icons-vue'
import { useAuthStore } from '../stores/auth'
import { i18n } from '../i18n'
import LangSwitch from '../components/LangSwitch.vue'

const router = useRouter()
const authStore = useAuthStore()
const t = i18n.t

const registerFormRef = ref<FormInstance>()
const loading = ref(false)

const registerForm = reactive({
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
})

const validateConfirmPassword = (_rule: any, value: string, callback: any) => {
  if (value === '') {
    callback(new Error(t('register.confirmRequired')))
  } else if (value !== registerForm.password) {
    callback(new Error(t('register.confirmMismatch')))
  } else {
    callback()
  }
}

// 校验规则文案走 i18n，语言切换后即时生效
const rules = computed<FormRules>(() => ({
  name: [
    { required: true, message: t('register.nameRequired'), trigger: 'blur' },
    { min: 2, max: 20, message: t('register.nameRange'), trigger: 'blur' },
  ],
  email: [
    { required: true, message: t('register.emailRequired'), trigger: 'blur' },
    { type: 'email', message: t('register.emailInvalid'), trigger: 'blur' },
  ],
  password: [
    { required: true, message: t('register.passwordRequired'), trigger: 'blur' },
    { min: 6, max: 32, message: t('register.passwordRange'), trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, validator: validateConfirmPassword, trigger: 'blur' },
  ],
}))

async function handleRegister() {
  if (!registerFormRef.value) return
  await registerFormRef.value.validate(async (valid) => {
    if (!valid) return
    loading.value = true
    try {
      const data = await authStore.register(
        registerForm.name,
        registerForm.email,
        registerForm.password
      )
      if (data.code === 200 || data.success) {
        ElMessage.success(t('register.success'))
        router.push('/login')
      } else {
        ElMessage.error(data.message || t('register.failed'))
      }
    } catch (e: any) {
      ElMessage.error(e.response?.data?.message || t('register.retry'))
    } finally {
      loading.value = false
    }
  })
}

function goToLogin() {
  router.push('/login')
}
</script>

<template>
  <div class="auth-page">
    <!-- 中英文切换：右上角固定 -->
    <div class="auth-lang-switch">
      <LangSwitch variant="dark" />
    </div>

    <div class="auth-bg-decoration">
      <div class="bg-circle circle-1"></div>
      <div class="bg-circle circle-2"></div>
      <div class="bg-circle circle-3"></div>
    </div>

    <div class="auth-card">
      <div class="auth-brand">
        <div class="brand-logo">
          <el-icon><DataAnalysis /></el-icon>
        </div>
        <div class="brand-info">
          <div class="brand-name">AllLink Data</div>
          <div class="brand-subtitle">Enterprise Console</div>
        </div>
      </div>

      <h2 class="auth-title">{{ t('register.title') }}</h2>
      <p class="auth-desc">{{ t('register.desc') }}</p>

      <el-form
        ref="registerFormRef"
        :model="registerForm"
        :rules="rules"
        size="large"
        class="auth-form"
        @keyup.enter="handleRegister"
      >
        <el-form-item prop="name">
          <el-input
            v-model="registerForm.name"
            :placeholder="t('register.namePlaceholder')"
            :prefix-icon="User"
            clearable
          />
        </el-form-item>

        <el-form-item prop="email">
          <el-input
            v-model="registerForm.email"
            :placeholder="t('register.emailPlaceholder')"
            :prefix-icon="Message"
            clearable
          />
        </el-form-item>

        <el-form-item prop="password">
          <el-input
            v-model="registerForm.password"
            type="password"
            :placeholder="t('register.passwordPlaceholder')"
            :prefix-icon="Lock"
            show-password
            clearable
          />
        </el-form-item>

        <el-form-item prop="confirmPassword">
          <el-input
            v-model="registerForm.confirmPassword"
            type="password"
            :placeholder="t('register.confirmPlaceholder')"
            :prefix-icon="Lock"
            show-password
            clearable
          />
        </el-form-item>

        <el-button
          type="primary"
          class="auth-submit-btn"
          :loading="loading"
          @click="handleRegister"
        >
          {{ t('register.submit') }}
        </el-button>
      </el-form>

      <div class="auth-footer">
        <span>{{ t('register.hasAccount') }}</span>
        <el-link type="primary" :underline="false" @click="goToLogin">{{ t('register.backToLogin') }}</el-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  position: relative;
  overflow: hidden;
}

/* 语言切换按钮：固定右上角 */
.auth-lang-switch {
  position: absolute;
  top: 24px;
  right: 24px;
  z-index: 10;
}

.auth-bg-decoration {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.bg-circle {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.15;
}

.circle-1 {
  width: 400px;
  height: 400px;
  background: #3b82f6;
  top: -100px;
  right: -100px;
}

.circle-2 {
  width: 300px;
  height: 300px;
  background: #8b5cf6;
  bottom: -80px;
  left: -80px;
}

.circle-3 {
  width: 200px;
  height: 200px;
  background: #06b6d4;
  top: 40%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.auth-card {
  width: 420px;
  background: white;
  border-radius: 24px;
  padding: 48px 40px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4);
  position: relative;
  z-index: 1;
}

.auth-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 32px;
}

.brand-logo {
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  color: white;
  box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.3);
}

.brand-name {
  font-size: 20px;
  font-weight: 700;
  color: #1e293b;
  letter-spacing: -0.5px;
}

.brand-subtitle {
  font-size: 12px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.auth-title {
  font-size: 26px;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 8px;
}

.auth-desc {
  font-size: 14px;
  color: #64748b;
  margin: 0 0 32px;
}

.auth-form :deep(.el-input__wrapper) {
  border-radius: 10px;
  box-shadow: 0 0 0 1px #e2e8f0 inset !important;
  height: 48px;
}

.auth-form :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px #3b82f6 inset !important;
}

.auth-form :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2) inset, 0 0 0 1px #3b82f6 inset !important;
}

.auth-submit-btn {
  width: 100%;
  height: 48px;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 600;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  border: none;
  margin-top: 8px;
  box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.3);
  transition: all 0.2s;
}

.auth-submit-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 12px -2px rgba(37, 99, 235, 0.4);
}

.auth-footer {
  text-align: center;
  margin-top: 28px;
  font-size: 14px;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
}

.auth-footer .el-link {
  font-size: 14px;
  font-weight: 600;
  margin-left: 4px;
}
</style>
