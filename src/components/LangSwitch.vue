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

/* 浅色场景（顶部栏，白底）：品牌蓝渐变实心底 + 白字，高辨识度 */
.lang-switch.is-light {
  color: #ffffff;
  border-color: transparent;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.6) 0%, rgba(37, 99, 235, 0.8) 10%);
  box-shadow: 0 2px 4px -1px rgba(37, 99, 235, 0.35);
}

.lang-switch.is-light:hover {
  color: #ffffff;
  border-color: transparent;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.6) 0%, #1e56cc 10%);
  box-shadow: 0 4px 8px -2px rgba(37, 99, 235, 0.45);
  transform: translateY(-1px);
}

.lang-switch.is-light:active {
  transform: translateY(0);
  box-shadow: 0 2px 4px -1px rgba(37, 99, 235, 0.35);
}

/* 深色场景（登录/注册/改密页深色背景）：亮蓝实心底 + 白字，在深色背景上高辨识度 */
.lang-switch.is-dark {
  color: #ffffff;
  border-color: transparent;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  box-shadow: 0 2px 8px -2px rgba(59, 130, 246, 0.55);
}

.lang-switch.is-dark:hover {
  color: #ffffff;
  border-color: transparent;
  background: linear-gradient(135deg, #2f6fe4 0%, #1e56cc 100%);
  box-shadow: 0 4px 12px -2px rgba(59, 130, 246, 0.7);
  transform: translateY(-1px);
}

.lang-switch.is-dark:active {
  transform: translateY(0);
  box-shadow: 0 2px 8px -2px rgba(59, 130, 246, 0.55);
}

.lang-switch-label {
  line-height: 1;
  user-select: none;
}
</style>
