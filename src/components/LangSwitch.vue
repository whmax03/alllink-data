<script setup lang="ts">
import { computed } from 'vue'
import { i18n } from '../i18n'

/**
 * 中英文切换按钮：
 * - 显示"对面语言"（当前中文显示 EN，当前英文显示 中文），点击互切
 * - variant="dark" 用于深色背景（登录/注册/改密独立页），默认浅色用于顶部栏
 */
const props = defineProps<{ variant?: 'light' | 'dark' }>()

const label = computed(() => (i18n.locale === 'zh' ? 'EN' : '中文'))
const tooltip = computed(() => i18n.t('common.switchLang'))
const isDark = computed(() => props.variant === 'dark')
</script>

<template>
  <button
    class="lang-switch"
    :class="isDark ? 'is-dark' : 'is-light'"
    type="button"
    :title="tooltip"
    :aria-label="tooltip"
    @click="i18n.toggleLocale()"
  >
    <span class="lang-switch-label">{{ label }}</span>
  </button>
</template>

<style scoped>
.lang-switch {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  min-width: 44px;
  padding: 0 10px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
  background: transparent;
  font-family: inherit;
}

/* 浅色场景（顶部栏，白底） */
.lang-switch.is-light {
  color: #475569;
  border-color: #e2e8f0;
  background-color: #ffffff;
}

.lang-switch.is-light:hover {
  color: #3b82f6;
  border-color: #3b82f6;
  background-color: #eff6ff;
}

/* 深色场景（登录/注册/改密页深色背景） */
.lang-switch.is-dark {
  color: #cbd5e1;
  border-color: rgba(255, 255, 255, 0.25);
  background-color: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(4px);
}

.lang-switch.is-dark:hover {
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.6);
  background-color: rgba(255, 255, 255, 0.18);
}

.lang-switch-label {
  line-height: 1;
  user-select: none;
}
</style>
