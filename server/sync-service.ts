/**
 * 同步服务 — 核心业务逻辑
 *
 * 负责从赛狐 API 拉取数据，清洗后存入 Supabase。
 * 每个方法对应一个业务模块的同步。
 */

import type { SaihuClient } from '../src/lib/saihu.js'
import { getSupabaseAdmin } from '../src/lib/supabase.js'
import { chunk, convertToCNY } from '../src/lib/utils.js'
import dayjs from 'dayjs'
import type { SupabaseClient } from '@supabase/supabase-js'

export class SyncService {
  private saihu: SaihuClient
  private db: SupabaseClient

  constructor(saihu: SaihuClient, supabaseUrl: string, supabaseKey: string) {
    this.saihu = saihu
    this.db = getSupabaseAdmin(supabaseUrl, supabaseKey)
  }

  /** 创建同步任务记录 */
  private async createTask(taskType: string) {
    const { data, error } = await this.db
      .from('sync_tasks')
      .insert({ task_type: taskType, status: 'running', started_at: new Date().toISOString() })
      .select()
      .single()
    if (error) throw error
    return data
  }

  /** 更新同步任务状态 */
  private async updateTask(taskId: number, updates: Record<string, any>) {
    await this.db.from('sync_tasks').update(updates).eq('id', taskId)
  }

  /** 同步订单 */
  async syncOrders(startTime?: string, endTime?: string) {
    const start = startTime || dayjs().subtract(1, 'day').format('YYYY-MM-DD HH:mm:ss')
    const end = endTime || dayjs().format('YYYY-MM-DD HH:mm:ss')

    const task = await this.createTask('orders')

    const allOrders = await this.saihu.fetchAll(
      (page, pageSize) => this.saihu.getOrders({ startTime: start, endTime: end, page, pageSize }),
      100,
      (cur, total) => console.log(`[Sync Orders] ${cur}/${total}`),
    )

    // 存入 ODS 层
    const odsRecords = allOrders.map((o: any) => ({
      raw_data: o,
      saihu_order_id: o.order_id,
      saihu_order_no: o.order_no,
      shop_id: o.shop_id,
      sync_task_id: task.id,
    }))
    for (const batch of chunk(odsRecords, 100)) {
      await this.db.from('ods_saihu_orders').upsert(batch, { onConflict: 'saihu_order_id' })
    }

    await this.updateTask(task.id, {
      status: 'success',
      finished_at: new Date().toISOString(),
      total_count: allOrders.length,
      success_count: allOrders.length,
      cursor_value: end,
    })

    return { taskId: task.id, total: allOrders.length, timeRange: { start, end } }
  }

  /** 同步商品 */
  async syncProducts() {
    const task = await this.createTask('products')

    const allProducts = await this.saihu.fetchAll(
      (page, pageSize) => this.saihu.getProducts({ page, pageSize }),
      100,
    )

    // ODS 层
    const odsRecords = allProducts.map((p: any) => ({
      raw_data: p,
      saihu_product_id: p.product_id,
      saihu_sku: p.sku,
      sync_task_id: task.id,
    }))
    for (const batch of chunk(odsRecords, 100)) {
      await this.db.from('ods_saihu_products').upsert(batch, { onConflict: 'saihu_product_id' })
    }

    // DWD 层
    const dwdRecords = allProducts.map((p: any) => ({
      saihu_product_id: p.product_id,
      saihu_sku: p.sku,
      unified_sku: p.sku,
      product_name: p.product_name,
      category: p.category,
      image_url: p.image_url,
      status: p.status || 'active',
    }))
    for (const batch of chunk(dwdRecords, 100)) {
      await this.db.from('dwd_products').upsert(batch, { onConflict: 'saihu_product_id' })
    }

    await this.updateTask(task.id, {
      status: 'success',
      finished_at: new Date().toISOString(),
      total_count: allProducts.length,
      success_count: allProducts.length,
    })

    return { taskId: task.id, total: allProducts.length }
  }

  /** 同步库存 */
  async syncInventory() {
    const task = await this.createTask('inventory')

    const allInventory = await this.saihu.fetchAll(
      (page, pageSize) => this.saihu.getInventory({ page, pageSize }),
      100,
    )

    const dwdRecords = allInventory.map((item: any) => ({
      saihu_warehouse_id: item.warehouse_id,
      warehouse_name: item.warehouse_name,
      warehouse_type: item.warehouse_name?.includes('FBA') ? 'fba' : 'local',
      unified_sku: item.sku,
      original_sku: item.sku,
      available_qty: item.available_qty,
      in_transit_qty: item.in_transit_qty || 0,
      reserved_qty: item.reserved_qty || 0,
      snapshot_time: new Date().toISOString(),
    }))

    // 库存是全量覆盖：先清空再插入
    await this.db.from('dwd_inventory').delete().neq('id', 0)
    for (const batch of chunk(dwdRecords, 100)) {
      await this.db.from('dwd_inventory').insert(batch)
    }

    await this.updateTask(task.id, {
      status: 'success',
      finished_at: new Date().toISOString(),
      total_count: allInventory.length,
      success_count: allInventory.length,
    })

    return { taskId: task.id, total: allInventory.length }
  }

  /** 同步财务利润数据 */
  async syncFinance(startDate?: string, endDate?: string) {
    const start = startDate || dayjs().subtract(30, 'day').format('YYYY-MM-DD')
    const end = endDate || dayjs().format('YYYY-MM-DD')

    const task = await this.createTask('finance')

    const allFinance = await this.saihu.fetchAll(
      (page, pageSize) => this.saihu.getFinanceProfit({ startDate: start, endDate: end, page, pageSize }),
      100,
    )

    const dwdRecords = allFinance.map((item: any) => {
      const grossProfit =
        item.revenue -
        (item.product_cost || 0) -
        (item.shipping_cost || 0) -
        (item.platform_fee || 0) -
        (item.ads_cost || 0) -
        (item.other_fee || 0) +
        (item.refund_amount || 0)
      const margin = item.revenue > 0 ? grossProfit / item.revenue : 0
      return {
        saihu_order_id: item.order_id,
        shop_id: item.shop_id,
        unified_sku: item.sku,
        revenue: item.revenue,
        product_cost: item.product_cost || 0,
        shipping_cost: item.shipping_cost || 0,
        platform_fee: item.platform_fee || 0,
        ads_cost: item.ads_cost || 0,
        other_fee: item.other_fee || 0,
        refund_amount: item.refund_amount || 0,
        gross_profit: grossProfit,
        profit_margin: margin,
        currency: 'USD',
        cny_revenue: convertToCNY(item.revenue, 'USD'),
        cny_gross_profit: convertToCNY(grossProfit, 'USD'),
        stat_date: item.stat_date,
      }
    })

    for (const batch of chunk(dwdRecords, 100)) {
      await this.db.from('dwd_finance_profit').upsert(batch)
    }

    await this.updateTask(task.id, {
      status: 'success',
      finished_at: new Date().toISOString(),
      total_count: allFinance.length,
      success_count: allFinance.length,
    })

    return { taskId: task.id, total: allFinance.length, dateRange: { start, end } }
  }
}
