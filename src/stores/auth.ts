import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi } from '../api'

export interface UserInfo {
  id: number | string
  name: string
  email: string
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
    if (data.code === 200 || data.success) {
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

  return {
    token,
    user,
    isLoggedIn,
    setAuth,
    clearAuth,
    login,
    register,
    changePassword,
    logout,
  }
})
