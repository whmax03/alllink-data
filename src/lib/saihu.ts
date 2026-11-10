import CryptoJS from 'crypto-js'
import axios, { type AxiosInstance } from 'axios'
import type {
  SaihuShop,
  SaihuOrder,
  SaihuProduct,
  SaihuInventory,
  SaihuFinanceProfit,
  SaihuPageResponse,
} from '../types/index.js'

/**
 * 赛狐 API 签名生成
 *
 * 签名规则（通用模板，拿到正式文档后以实际算法为准）：
 * 1. 请求参数按 key 字典序排序
 * 2. 拼接成 key1=value1&key2=value2 格式
 * 3. 末尾拼接 timestamp 和 secret
 * 4. HMAC-SHA256 签名，转大写
 */
export function generateSignature(
  params: Record<string, string | number>,
  appSecret: string,
  timestamp: string,
): string {
  const sortedEntries = Object.entries(params)
    .filter(([, v]) => v !== '' && v !== null && v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))

  const paramStr = sortedEntries.map(([k, v]) => `${k}=${v}`).join('&')
  const signStr = `${paramStr}&timestamp=${timestamp}&secret=${appSecret}`

  // 如果文档要求 MD5，改为：CryptoJS.MD5(signStr).toString().toUpperCase()
  return CryptoJS.HmacSHA256(signStr, appSecret).toString().toUpperCase()
}

export function getTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString()
}

/**
 * 赛狐 API 客户端类
 * 封装签名认证、请求拦截、分页拉取
 */
export class SaihuClient {
  private http: AxiosInstance
  private clientId: string
  private clientSecret: string

  constructor(clientId: string, clientSecret: string, baseUrl: string) {
    this.clientId = clientId
    this.clientSecret = clientSecret

    this.http = axios.create({
      baseURL: baseUrl,
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    })

    // 请求拦截：自动加签名
    this.http.interceptors.request.use((config) => {
      const timestamp = getTimestamp()
      const allParams: Record<string, string | number> = {
        client_id: this.clientId,
        timestamp,
        ...(config.params || {}),
        ...(config.data || {}),
      }
      const signature = generateSignature(allParams, this.clientSecret, timestamp)
      config.headers['X-Client-Id'] = this.clientId
      config.headers['X-Timestamp'] = timestamp
      config.headers['X-Signature'] = signature
      return config
    })

    // 响应拦截：统一错误处理
    this.http.interceptors.response.use(
      (res) => res,
      (err) => {
        if (err.response) {
          console.error('[Saihu API Error]', err.response.status, JSON.stringify(err.response.data))
        }
        return Promise.reject(err)
      },
    )
  }

  private async get<T = any>(path: string, params: Record<string, any> = {}): Promise<T> {
    const res = await this.http.get(path, { params })
    return this.handleResponse(res.data)
  }

  private handleResponse(data: any): any {
    if (data.code === 0 || data.code === 200 || data.success === true) {
      return data.data ?? data.result ?? data
    }
    throw new SaihuApiError(data.code, data.msg || data.message || 'Unknown error')
  }

  // ==================== 业务接口 ====================

  async getShops(): Promise<SaihuShop[]> {
    return this.get('/shop/list')
  }

  async getOrders(params: {
    startTime?: string
    endTime?: string
    page?: number
    pageSize?: number
    shopId?: string
  }): Promise<SaihuPageResponse<SaihuOrder>> {
    return this.get('/order/list', {
      start_time: params.startTime,
      end_time: params.endTime,
      page: params.page || 1,
      page_size: params.pageSize || 100,
      shop_id: params.shopId,
    })
  }

  async getProducts(params: {
    page?: number
    pageSize?: number
  }): Promise<SaihuPageResponse<SaihuProduct>> {
    return this.get('/product/list', {
      page: params.page || 1,
      page_size: params.pageSize || 100,
    })
  }

  async getInventory(params: {
    warehouseId?: string
    page?: number
    pageSize?: number
  }): Promise<SaihuPageResponse<SaihuInventory>> {
    return this.get('/warehouse/inventory', {
      warehouse_id: params.warehouseId,
      page: params.page || 1,
      page_size: params.pageSize || 100,
    })
  }

  async getFinanceProfit(params: {
    startDate: string
    endDate: string
    shopId?: string
    page?: number
    pageSize?: number
  }): Promise<SaihuPageResponse<SaihuFinanceProfit>> {
    return this.get('/finance/profit', {
      start_date: params.startDate,
      end_date: params.endDate,
      shop_id: params.shopId,
      page: params.page || 1,
      page_size: params.pageSize || 100,
    })
  }

  // ==================== 分页工具 ====================

  async fetchAll<T>(
    fetchFn: (page: number, pageSize: number) => Promise<{ list: T[]; total: number }>,
    pageSize = 100,
    onProgress?: (cur: number, total: number) => void,
  ): Promise<T[]> {
    const all: T[] = []
    let page = 1
    while (true) {
      const res = await fetchFn(page, pageSize)
      all.push(...res.list)
      onProgress?.(all.length, res.total)
      if (all.length >= res.total || res.list.length === 0) break
      page++
      await this.sleep(200)
    }
    return all
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms))
  }
}

export class SaihuApiError extends Error {
  code: number
  constructor(code: number, msg: string) {
    super(msg)
    this.code = code
    this.name = 'SaihuApiError'
  }
}

/** 单例工厂 */
let _instance: SaihuClient | null = null
export function getSaihuClient(clientId: string, clientSecret: string, baseUrl: string): SaihuClient {
  if (!_instance) {
    _instance = new SaihuClient(clientId, clientSecret, baseUrl)
  }
  return _instance
}
