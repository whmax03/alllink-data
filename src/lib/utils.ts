import { SAIHU_STATUS_MAP, UnifiedOrderStatus } from '../types/index.js'

/** SKU映射缓存 */
const skuCache = new Map<string, string>()

/** 币种换算（简化版，实际应查汇率表） */
const RATES: Record<string, number> = {
  USD: 7.2,
  EUR: 7.8,
  GBP: 9.1,
  JPY: 0.048,
  CAD: 5.3,
  AUD: 4.7,
  CNY: 1,
}

export function convertToCNY(amount: number, currency: string): number {
  return amount * (RATES[currency] || 1)
}

export function mapOrderStatus(saihuStatus: string): UnifiedOrderStatus {
  return SAIHU_STATUS_MAP[saihuStatus] || UnifiedOrderStatus.PENDING
}

/** 数组分片 */
export function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

/** 格式化金额 */
export function formatMoney(val: number): string {
  return `$${val.toFixed(2)}`
}

/** 格式化百分比 */
export function formatPercent(val: number): string {
  return `${(val * 100).toFixed(1)}%`
}
