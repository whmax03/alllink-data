import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi, rbacApi } from '../api'

export interface UserInfo {
  id: number | string
  name: string
  email: string
  /** 角色编码列表（登录接口返回；旧缓存缺失时由 ensureRoles 兜底拉取） */
  roles?: string[]
  /** 权限码列表（与 roles 同级返回；admin 为全部权限码） */
  permissions?: string[]
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
  /** 权限码集合（Set 查询 O(1)；admin 为全量） */
  const permissionSet = computed(() => new Set(user.value?.permissions || []))

  /**
   * 判断当前用户是否拥有某权限码（前端显隐控制）。
   * - admin 恒真（后端口径：admin 拥有全部权限）
   * - permissions 缺失（旧缓存）时返回 true 避免误隐藏，由 ensurePermissions 兜底拉取后修正
   */
  const hasPerm = (code: string): boolean => {
    if (isAdmin.value) return true
    const perms = user.value?.permissions
    if (!perms) return true // 尚未加载：先展示，兜底拉取后修正
    return permissionSet.value.has(code)
  }

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
   * 兼容旧缓存登录态：user 无 roles 时调用 /rbac/me/permissions 补齐 roles 与 permissions。
   * 幂等（roles 已存在直接返回）；失败静默，下次登录会带回。
   */
  async function ensureRoles() {
    if (!token.value || user.value?.roles) return
    try {
      const { data } = await rbacApi.myPermissions()
      if (data.code === 200 && data.data?.roles && user.value) {
        user.value = {
          ...user.value,
          roles: data.data.roles,
          permissions: data.data.permissions || [],
        }
        localStorage.setItem('ALLLINK_USER', JSON.stringify(user.value))
      }
    } catch {
      /* 静默失败，不影响主流程 */
    }
  }

  /**
   * 强制刷新当前登录态的 roles 与 permissions（账号角色被管理员调整后调用）。
   * 菜单显隐、Tab 权限清理、路由守卫均依赖这两个字段，刷新后即时生效。
   */
  async function refreshLoginState() {
    if (!token.value || !user.value) return
    try {
      const { data } = await rbacApi.myPermissions()
      if (data.code === 200 && data.data?.roles) {
        user.value = {
          ...user.value,
          roles: data.data.roles,
          permissions: data.data.permissions || [],
        }
        localStorage.setItem('ALLLINK_USER', JSON.stringify(user.value))
      }
    } catch {
      /* 静默失败，保持现有登录态 */
    }
  }

  /**
   * 权限码缺失（旧缓存登录态无 permissions）时拉取补齐；幂等。
   * 页面入口/路由守卫调用；admin 无需（恒真）。
   */
  async function ensurePermissions() {
    if (!token.value || !user.value || user.value.permissions) return
    await refreshLoginState()
  }

  return {
    token,
    user,
    isLoggedIn,
    isAdmin,
    permissionSet,
    hasPerm,
    setAuth,
    clearAuth,
    login,
    register,
    changePassword,
    logout,
    ensureRoles,
    refreshLoginState,
    ensurePermissions,
  }
})
