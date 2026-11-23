import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi, rbacApi } from '../api'

export interface UserInfo {
  id: number | string
  name: string
  email: string
  /** 角色编码列表（登录接口返回；旧缓存缺失时由 ensureRoles 兜底拉取） */
  roles?: string[]
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string>(localStorage.getItem('ALLLINK_TOKEN') || '')
  const user = ref<UserInfo | null>(
    (() => {
      const raw = localStorage.getItem('ALLLINK_USER')
      try {
        return raw ? JSON.parse(raw) : null
      } catch {
        return null
      }
    })()
  )

  const isLoggedIn = computed(() => !!token.value)
  const isAdmin = computed(() => (user.value?.roles || []).includes('admin'))

  function setAuth(t: string, u: UserInfo) {
    token.value = t
    user.value = u
    localStorage.setItem('ALLLINK_TOKEN', t)
    localStorage.setItem('ALLLINK_USER', JSON.stringify(u))
  }

  function clearAuth() {
    token.value = ''
    user.value = null
    localStorage.removeItem('ALLLINK_TOKEN')
    localStorage.removeItem('ALLLINK_USER')
  }

  async function login(email: string, password: string) {
    const { data } = await authApi.login({ email, password })
    if (data.code === 200) {
      setAuth(data.data.access_token, data.data.user)
    }
    return data
  }

  async function register(name: string, email: string, password: string) {
    const { data } = await authApi.register({ name, email, password })
    return data
  }

  async function changePassword(email: string, oldPassword: string, newPassword: string) {
    const { data } = await authApi.changePassword({
      email,
      old_password: oldPassword,
      new_password: newPassword,
    })
    return data
  }

  function logout() {
    clearAuth()
  }

  /**
   * 兼容旧缓存登录态：user 无 roles 时调用 /rbac/me/permissions 补齐。
   * 幂等（roles 已存在直接返回）；失败静默，下次登录会带回。
   */
  async function ensureRoles() {
    if (!token.value || user.value?.roles) return
    try {
      const { data } = await rbacApi.myPermissions()
      if (data.code === 200 && data.data?.roles && user.value) {
        user.value = { ...user.value, roles: data.data.roles }
        localStorage.setItem('ALLLINK_USER', JSON.stringify(user.value))
      }
    } catch {
      /* 静默失败，不影响主流程 */
    }
  }

  return {
    token,
    user,
    isLoggedIn,
    isAdmin,
    setAuth,
    clearAuth,
    login,
    register,
    changePassword,
    logout,
    ensureRoles,
  }
})
