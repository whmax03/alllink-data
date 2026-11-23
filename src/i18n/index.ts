/**
 * 轻量级国际化（零依赖，自研）：
 * - 模块级单例 `i18n`：t / setLocale / toggleLocale / locale
 * - localStorage 持久化（ALLINK_LANG），刷新后保持语言选择
 * - t() 在模板/渲染函数中调用时自动收集 reactive 依赖，切换语言全站即时生效
 *
 * 使用方式（组件内）：
 *   import { i18n } from '@/i18n'
 *   i18n.t('nav.inventory')          // 取文案
 *   <LangSwitch />                    // 语言切换按钮组件
 *
 * 非组件模块（如 axios 拦截器）同样直接 import { i18n } 使用。
 */
import { reactive } from 'vue'
import zh from './zh'
import en from './en'

export type Locale = 'zh' | 'en'

const STORAGE_KEY = 'ALLINK_LANG'

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === 'en' ? 'en' : 'zh'
  } catch {
    return 'zh'
  }
}

const state = reactive<{ locale: Locale }>({ locale: initialLocale() })

const packs: Record<Locale, Record<string, string>> = { zh, en }

export const i18n = {
  /** 当前语言（在渲染中访问时自动收集依赖，切换后触发重渲染） */
  get locale(): Locale {
    return state.locale
  },

  /** 取文案；key 缺失时回退显示 key 本身，便于发现漏翻 */
  t(key: string): string {
    const pack = packs[state.locale]
    return pack[key] ?? key
  },

  /** 切换语言并持久化 */
  setLocale(locale: Locale) {
    state.locale = locale
    try {
      localStorage.setItem(STORAGE_KEY, locale)
    } catch {
      /* localStorage 不可用时忽略，仅当前会话生效 */
    }
    // 同步 <html lang>，利于浏览器/读屏器识别
    document.documentElement.setAttribute('lang', locale === 'zh' ? 'zh-CN' : 'en')
  },

  /** 中英互切 */
  toggleLocale() {
    this.setLocale(state.locale === 'zh' ? 'en' : 'zh')
  },
}

/** 组件内习惯用法：const { t } = useI18n()（与 i18n 单例等价） */
export function useI18n() {
  return i18n
}
