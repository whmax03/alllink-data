import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '../router'
import { useAuthStore } from '../stores/auth'
import { i18n } from '../i18n'

/** 前端 API 请求封装 */
const api = axios.create({
  baseURL: '/api',
  timeout: 60000,
})

// 请求拦截器：自动携带 token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ALLLINK_TOKEN')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/**
 * 401 统一处理节流：并发请求同时 401 时，只提示/跳转一次
 * 后端约定：
 *   HTTP 401 + code 10001 → 未登录，请先登录
 *   HTTP 401 + code 10002 → 登录已过期 / Token 无效，请重新登录
 *   HTTP 200 + code 200  → 正常返回数据
 */
let handling401 = false

function handleUnauthorized(error: any) {
  const data = error.response?.data
  const code = data?.code as number | undefined
  const message =
    data?.message ||
    (code === 10001 ? i18n.t('auth401.notLogin') : i18n.t('auth401.expired'))

  // 清除本地登录态（store 与 localStorage 同步清理）
  useAuthStore().clearAuth()

  if (!handling401) {
    handling401 = true
    ElMessage.error(message)

    const current = router.currentRoute.value
    // 已在公开页（登录/注册/改密）时不重复跳转
    if (!current.meta?.public) {
      router.push({ path: '/login', query: { redirect: current.fullPath } })
    }

    // 跳转后重置标志，允许下一次会话周期再处理
    setTimeout(() => {
      handling401 = false
    }, 1000)
  }
}

// 响应拦截器：统一按返回 code 处理 401 场景
api.interceptors.response.use(
  (response) => {
    // HTTP 200 + code 200：正常返回数据，直接放行
    return response
  },
  (error) => {
    const isLoginRequest = (error.config?.url || '').includes('/auth/login')
    if (error.response?.status === 401 && !isLoginRequest) {
      // 未登录(10001) / token 过期或无效(10002)：清登录态并跳转登录页
      handleUnauthorized(error)
    }
    // 登录接口自身的 401（密码错误等）交由登录页自行提示
    return Promise.reject(error)
  }
)

/** 认证相关 API */
export const authApi = {
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  register: (data: { name: string; email: string; password: string }) =>
    api.post('/auth/register', data),
  changePassword: (data: { email: string; old_password: string; new_password: string }) =>
    api.post('/auth/change-password', data),
}

/** 账号管理 API（admin 专用，后端有 admin 守卫） */
export const userApi = {
  list: (params?: { pageNo?: number; pageSize?: number; keyword?: string }) =>
    api.get('/users/', { params }),
  create: (data: { name: string; email: string; password: string }) =>
    api.post('/users/', data),
  remove: (userId: number) =>
    api.delete(`/users/${userId}`),
  resetPassword: (userId: number, newPassword: string) =>
    api.put(`/users/${userId}/password`, { new_password: newPassword }),
}

/** 当前用户角色/权限（旧缓存登录态补 roles 兜底）+ 权限管理页（admin） */
export const rbacApi = {
  myPermissions: () =>
    api.get('/rbac/me/permissions'),
  /** 角色列表（含各自权限码） */
  roles: () =>
    api.get('/rbac/roles'),
  /** 权限列表（可按 type 过滤：page/tab/platform/data） */
  permissions: (params?: { perm_type?: string }) =>
    api.get('/rbac/permissions', { params }),
  /** 给角色覆盖式分配权限 */
  assignPermissions: (data: { role_code: string; permission_codes: string[] }) =>
    api.put('/rbac/roles/permissions', data),
}

/** 同步相关 API */
export const syncApi = {
  orders: (params?: { startTime?: string; endTime?: string }) =>
    api.post('/sync/orders', params),
  products: () =>
    api.post('/sync/products'),
  inventory: () =>
    api.post('/sync/inventory'),
  finance: (params?: { startDate?: string; endDate?: string }) =>
    api.post('/sync/finance', params),
}

/** 查询相关 API */
export const queryApi = {
  dashboard: () =>
    api.get('/query/dashboard'),
  domesticInventory: (params: { pageSize: number; pageNo: number; sku?: string; platform?: string }) =>
    api.get('/inventory/domestic', { params }),
  overseasInventory: (params: { pageSize: number; pageNo: number; sku?: string; warehouse_type?: string; platform?: string; country?: string }) =>
    api.get('/inventory/overseas', { params }),
  orders: (params: { page: number; pageSize: number }) =>
    api.get('/query/orders', { params }),
}
