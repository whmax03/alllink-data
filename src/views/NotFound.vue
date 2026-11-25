<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Back } from '@element-plus/icons-vue'
import { useAuthStore } from '../stores/auth'
import { i18n } from '../i18n'

const router = useRouter()
const authStore = useAuthStore()
const t = i18n.t

// 当前用户可访问的首页（第一个有权限的页面）；未登录或无任何页面权限时回登录页
const homePath = computed(() => {
  if (!authStore.isLoggedIn) return '/login'
  if (authStore.hasPerm('page:inventory')) return '/inventory'
  if (authStore.isAdmin) return '/users'
  // 无任何可用页面权限：回登录页（404 页会提示权限不足）
  return '/login'
})

function goHome() {
  router.push(homePath.value)
}
</script>

<template>
  <div class="not-found-page">
    <div class="nf-bg-decoration">
      <div class="bg-circle circle-1"></div>
      <div class="bg-circle circle-2"></div>
      <div class="bg-circle circle-3"></div>
    </div>

    <div class="nf-card">
      <div class="nf-code">404</div>
      <div class="nf-title">{{ t('notFound.title') }}</div>
      <div class="nf-desc">{{ t('notFound.desc') }}</div>
      <el-button type="primary" :icon="Back" round size="large" @click="goHome">
        {{ t('notFound.backHome') }}
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.not-found-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%);
  position: relative;
  overflow: hidden;
}

/* 背景装饰圆（与登录页同款风格） */
.nf-bg-decoration {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.bg-circle {
  position: absolute;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(37, 99, 235, 0.04));
}

.circle-1 { width: 420px; height: 420px; top: -140px; right: -120px; }
.circle-2 { width: 320px; height: 320px; bottom: -100px; left: -80px; }
.circle-3 { width: 180px; height: 180px; top: 30%; left: 12%; }

.nf-card {
  position: relative;
  text-align: center;
  padding: 56px 72px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 24px;
  box-shadow: 0 8px 30px rgba(59, 130, 246, 0.12);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.nf-code {
  font-size: 96px;
  font-weight: 800;
  line-height: 1;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  letter-spacing: -2px;
}

.nf-title {
  font-size: 22px;
  font-weight: 700;
  color: #1e293b;
}

.nf-desc {
  font-size: 14px;
  color: #64748b;
  margin-bottom: 12px;
  max-width: 340px;
}
</style>
