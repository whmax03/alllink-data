import axios from 'axios'

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

// 响应拦截器：统一处理 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('ALLLINK_TOKEN')
      localStorage.removeItem('ALLLINK_USER')
      window.location.href = '/login'
    }
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
  domesticInventory: (params: { pageSize: number; pageNo: number; sku?: string }) =>
    api.get('/inventory/domestic', { params }),
  overseasInventory: (params: { pageSize: number; pageNo: number; sku?: string }) =>
    api.get('/inventory/overseas', { params }),
  transitInventory: (params: { pageSize: number; pageNo: number; sku?: string }) =>
    api.get('/inventory/transit/inventory', { params }),
  orders: (params: { page: number; pageSize: number }) =>
    api.get('/query/orders', { params }),
}
