/**
 * 赛狐 API 数据类型定义
 * 拿到正式 API 文档后根据实际字段补充
 */

export interface SaihuShop {
  shop_id: string
  shop_name: string
  platform: string
  marketplace: string
  status: string
}

export interface SaihuOrder {
  order_id: string
  order_no: string
  shop_id: string
  platform: string
  marketplace: string
  order_status: string
  sku: string
  product_name: string
  quantity: number
  currency: string
  amount: number
  order_time: string
  ship_time?: string
  buyer_id?: string
  country?: string
}

export interface SaihuProduct {
  product_id: string
  sku: string
  product_name: string
  category?: string
  image_url?: string
  status?: string
}

export interface SaihuInventory {
  warehouse_id: string
  warehouse_name: string
  sku: string
  available_qty: number
  in_transit_qty?: number
  reserved_qty?: number
}

export interface SaihuFinanceProfit {
  order_id?: string
  shop_id: string
  sku: string
  revenue: number
  product_cost: number
  shipping_cost?: number
  platform_fee?: number
  ads_cost?: number
  other_fee?: number
  refund_amount?: number
  stat_date: string
}

export interface SaihuPageResponse<T> {
  list: T[]
  total: number
  page: number
  page_size: number
}

/** 统一订单状态 */
export enum UnifiedOrderStatus {
  PENDING = 'pending',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  RETURNED = 'returned',
  CANCELLED = 'cancelled',
}

/** 赛狐订单状态 -> 统一状态映射 */
export const SAIHU_STATUS_MAP: Record<string, UnifiedOrderStatus> = {
  Pending: UnifiedOrderStatus.PENDING,
  Unshipped: UnifiedOrderStatus.PENDING,
  Shipped: UnifiedOrderStatus.SHIPPED,
  Delivered: UnifiedOrderStatus.DELIVERED,
  Returned: UnifiedOrderStatus.RETURNED,
  Refunded: UnifiedOrderStatus.RETURNED,
  Cancelled: UnifiedOrderStatus.CANCELLED,
  Canceled: UnifiedOrderStatus.CANCELLED,
}

/** 同步任务状态 */
export type SyncTaskStatus = 'pending' | 'running' | 'success' | 'failed'

/** 同步任务记录 */
export interface SyncTask {
  id: number
  task_type: string
  status: SyncTaskStatus
  started_at: string
  finished_at: string | null
  total_count: number
  success_count: number
  fail_count: number
  error_message: string | null
  created_at: string
}
