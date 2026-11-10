/**
 * 后端 API 路由入口
 *
 * 基于 Vite 的 configureServer 中间件实现。
 * 在开发模式下，所有 /api/* 请求由这里处理。
 * 生产部署时，用单独的 Express 服务器运行此文件。
 */

import type { Connect } from 'vite'
import { getSaihuClient } from '../src/lib/saihu.js'
import { getSupabaseAdmin } from '../src/lib/supabase.js'
import { SyncService } from './sync-service.js'
import { CREATE_TABLES_SQL } from './db-schema.js'
import dayjs from 'dayjs'
import CryptoJS from 'crypto-js'

type Env = Record<string, string>

export function createApiRouter(env: Env): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const url = new URL(req.url || '', 'http://localhost')
    const path = url.pathname
    const method = req.method || 'GET'
    console.error('API 请求', { path, method, query: url.searchParams.toString() })

    // CORS 头
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    // 解析请求体
    let body: any = {}
    if (method === 'POST') {
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        chunks.push(chunk as Buffer)
      }
      try {
        body = JSON.parse(Buffer.concat(chunks).toString())
      } catch {
        body = {}
      }
    }

    try {
      // ==================== 认证接口 ====================
      if (path.startsWith('/auth/')) {
        const supabase = getSupabaseAdmin(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
        const JWT_SECRET = env.JWT_SECRET || 'alllink-data-secret-2024'

        // 生成简单 JWT token
        function generateToken(payload: Record<string, any>): string {
          const header = { alg: 'HS256', typ: 'JWT' }
          const base64url = (obj: any) =>
            btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
          const headerStr = base64url(header)
          const payloadStr = base64url({ ...payload, iat: Date.now() })
          const signature = CryptoJS.HmacSHA256(`${headerStr}.${payloadStr}`, JWT_SECRET).toString(CryptoJS.enc.Base64url)
          return `${headerStr}.${payloadStr}.${signature}`
        }

        // 验证 JWT token
        function verifyToken(token: string): Record<string, any> | null {
          try {
            const parts = token.split('.')
            if (parts.length !== 3) return null
            const [headerStr, payloadStr, signature] = parts
            const expectedSig = CryptoJS.HmacSHA256(`${headerStr}.${payloadStr}`, JWT_SECRET).toString(CryptoJS.enc.Base64url)
            if (signature !== expectedSig) return null
            const payload = JSON.parse(atob(payloadStr.replace(/-/g, '+').replace(/_/g, '/')))
            return payload
          } catch {
            return null
          }
        }

        // 密码哈希（SHA-256 + salt）
        function hashPassword(password: string): string {
          const salt = 'alllink-salt-2024'
          return CryptoJS.SHA256(salt + password).toString()
        }

        // 登录
        if (path === '/auth/login' && method === 'POST') {
          const { email, password } = body
          if (!email || !password) {
            return json(res, { code: 400, message: '邮箱和密码不能为空' }, 400)
          }

          const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .limit(1)

          if (error) {
            return json(res, { code: 500, message: '数据库查询失败: ' + error.message }, 500)
          }

          if (!users || users.length === 0) {
            return json(res, { code: 401, message: '邮箱或密码错误' }, 401)
          }

          const user = users[0]
          const hashedInput = hashPassword(password)

          if (user.password_hash !== hashedInput) {
            return json(res, { code: 401, message: '邮箱或密码错误' }, 401)
          }

          // 更新最后登录时间
          await supabase
            .from('users')
            .update({ last_login_at: new Date().toISOString() })
            .eq('id', user.id)

          const token = generateToken({ userId: user.id, email: user.email, role: user.role })

          return json(res, {
            code: 200,
            success: true,
            message: '登录成功',
            data: {
              access_token: token,
              token_type: 'bearer',
              user: {
                id: user.id,
                name: user.name || user.username || '',
                email: user.email || '',
              },
            },
          })
        }

        // 注册
        if (path === '/auth/register' && method === 'POST') {
          const { name, email, password } = body
          if (!name || !email || !password) {
            return json(res, { code: 400, message: '姓名、邮箱和密码不能为空' }, 400)
          }
          if (name.length < 2 || name.length > 20) {
            return json(res, { code: 400, message: '姓名长度 2-20 个字符' }, 400)
          }
          if (password.length < 6 || password.length > 32) {
            return json(res, { code: 400, message: '密码长度 6-32 个字符' }, 400)
          }

          // 检查邮箱是否已存在
          const { data: existing } = await supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .limit(1)

          if (existing && existing.length > 0) {
            return json(res, { code: 409, message: '该邮箱已注册' }, 409)
          }

          // 插入新用户
          const { data: newUser, error: insertError } = await supabase
            .from('users')
            .insert({
              username: name,
              name,
              email,
              password_hash: hashPassword(password),
              role: 'user',
            })
            .select()
            .single()

          if (insertError) {
            return json(res, { code: 500, message: '注册失败: ' + insertError.message }, 500)
          }

          return json(res, {
            code: 200,
            success: true,
            message: '注册成功',
            data: {
              id: newUser.id,
              name: newUser.name || newUser.username || '',
              email: newUser.email || '',
            },
          })
        }

        // 修改密码
        if (path === '/auth/change-password' && method === 'POST') {
          const { email, old_password, new_password } = body
          if (!email || !old_password || !new_password) {
            return json(res, { code: 400, message: '邮箱、旧密码和新密码不能为空' }, 400)
          }
          if (new_password.length < 6 || new_password.length > 32) {
            return json(res, { code: 400, message: '新密码长度 6-32 个字符' }, 400)
          }

          // 通过邮箱查询用户
          const { data: users } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .limit(1)

          if (!users || users.length === 0) {
            return json(res, { code: 404, message: '该邮箱未注册' }, 404)
          }

          const currentUser = users[0]
          if (currentUser.password_hash !== hashPassword(old_password)) {
            return json(res, { code: 400, message: '旧密码不正确' }, 400)
          }

          // 更新密码
          const { error: updateError } = await supabase
            .from('users')
            .update({ password_hash: hashPassword(new_password), updated_at: new Date().toISOString() })
            .eq('id', currentUser.id)

          if (updateError) {
            return json(res, { code: 500, message: '密码修改失败: ' + updateError.message }, 500)
          }

          return json(res, {
            code: 200,
            success: true,
            data: {
              message: '密码修改成功',
            },
          })
        }
      }

      // ==================== 健康检查 ====================
      if (path === '/health') {
        return json(res, { status: 'ok', time: new Date().toISOString() })
      }

      // ==================== 数据库初始化 ====================
      if (path === '/init-db' && method === 'POST') {
        const supabase = getSupabaseAdmin(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
        const { error } = await supabase.rpc('exec_sql', { sql: CREATE_TABLES_SQL }).maybeSingle()
        // 如果 rpc 不支持，提示用户去 SQL Editor 手动执行
        if (error) {
          return json(res, {
            success: false,
            message: '请复制 SQL 到 Supabase SQL Editor 手动执行',
            sql: CREATE_TABLES_SQL,
            error: error.message,
          })
        }
        return json(res, { success: true, message: '数据库表创建成功' })
      }

      // ==================== 同步接口 ====================
      if (path.startsWith('/sync/')) {
        const saihu = getSaihuClient(
          env.SAIHU_CLIENT_ID,
          env.SAIHU_CLIENT_SECRET,
          env.SAIHU_API_BASE_URL,
        )
        const syncService = new SyncService(saihu, env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

        if (path === '/sync/orders' && method === 'POST') {
          const result = await syncService.syncOrders(body.startTime, body.endTime)
          return json(res, { success: true, message: `同步成功 ${result.total} 条订单`, data: result })
        }

        if (path === '/sync/products' && method === 'POST') {
          const result = await syncService.syncProducts()
          return json(res, { success: true, message: `同步成功 ${result.total} 个商品`, data: result })
        }

        if (path === '/sync/inventory' && method === 'POST') {
          const result = await syncService.syncInventory()
          return json(res, { success: true, message: `同步成功 ${result.total} 条库存`, data: result })
        }

        if (path === '/sync/finance' && method === 'POST') {
          const result = await syncService.syncFinance(body.startDate, body.endDate)
          return json(res, { success: true, message: `同步成功 ${result.total} 条财务数据`, data: result })
        }
      }

      // ==================== 数据查询接口 ====================
      if (path.startsWith('/query/')) {
        const supabase = getSupabaseAdmin(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

        if (path === '/query/dashboard') {
          const today = dayjs().format('YYYY-MM-DD')
          const monthStart = dayjs().startOf('month').format('YYYY-MM-DD')
          const thirtyAgo = dayjs().subtract(30, 'day').format('YYYY-MM-DD')

          const [todayRes, monthRes, trendRes, skuRes, tasksRes] = await Promise.all([
            supabase.from('dwd_finance_profit').select('revenue, gross_profit, saihu_order_id').eq('stat_date', today),
            supabase.from('dwd_finance_profit').select('revenue, gross_profit').gte('stat_date', monthStart).lte('stat_date', today),
            supabase.from('dwd_finance_profit').select('stat_date, revenue, gross_profit').gte('stat_date', thirtyAgo).lte('stat_date', today).order('stat_date', { ascending: true }),
            supabase.from('dwd_finance_profit').select('unified_sku, revenue, gross_profit').gte('stat_date', thirtyAgo).order('revenue', { ascending: false }).limit(10),
            supabase.from('sync_tasks').select('*').order('created_at', { ascending: false }).limit(20),
          ])

          const todayData = todayRes.data || []
          const monthData = monthRes.data || []
          const trendData = trendRes.data || []
          const skuData = skuRes.data || []

          // 聚合趋势
          const trendMap = new Map<string, { revenue: number; profit: number }>()
          trendData.forEach((d: any) => {
            const date = d.stat_date
            if (!trendMap.has(date)) trendMap.set(date, { revenue: 0, profit: 0 })
            const item = trendMap.get(date)!
            item.revenue += Number(d.revenue)
            item.profit += Number(d.gross_profit)
          })

          // 聚合 Top SKU
          const skuMap = new Map<string, { revenue: number; profit: number }>()
          skuData.forEach((d: any) => {
            if (!skuMap.has(d.unified_sku)) skuMap.set(d.unified_sku, { revenue: 0, profit: 0 })
            const item = skuMap.get(d.unified_sku)!
            item.revenue += Number(d.revenue)
            item.profit += Number(d.gross_profit)
          })

          return json(res, {
            success: true,
            data: {
              summary: {
                todayRevenue: todayData.reduce((s: number, d: any) => s + Number(d.revenue), 0),
                todayOrders: todayData.length,
                todayProfit: todayData.reduce((s: number, d: any) => s + Number(d.gross_profit), 0),
                monthRevenue: monthData.reduce((s: number, d: any) => s + Number(d.revenue), 0),
                monthOrders: monthData.length,
                monthProfit: monthData.reduce((s: number, d: any) => s + Number(d.gross_profit), 0),
              },
              salesTrend: Array.from(trendMap.entries()).map(([date, v]) => ({
                date: date.slice(5),
                revenue: Math.round(v.revenue),
                profit: Math.round(v.profit),
              })),
              topSkus: Array.from(skuMap.entries())
                .map(([sku, v]) => ({ sku, ...v }))
                .sort((a, b) => b.revenue - a.revenue)
                .slice(0, 10),
              tasks: tasksRes.data || [],
            },
          })
        }

        if (path === '/query/inventory') {
          const supabase2 = supabase
          const { data, error } = await supabase2
            .from('dwd_inventory')
            .select('*')
            .order('available_qty', { ascending: false })
            .limit(100)
          if (error) return json(res, { success: false, error: error.message }, 500)
          return json(res, { success: true, data })
        }

        if (path === '/query/orders') {
          const page = Number(url.searchParams.get('page') || '1')
          const pageSize = Number(url.searchParams.get('pageSize') || '20')
          const start = (page - 1) * pageSize
          const { data, error, count } = await supabase
            .from('dwd_orders')
            .select('*', { count: 'exact' })
            .order('order_time', { ascending: false })
            .range(start, start + pageSize - 1)
          if (error) return json(res, { success: false, error: error.message }, 500)
          return json(res, { success: true, data, total: count, page, pageSize })
        }
      }

      // 没匹配到任何路由
      return json(res, { error: `Not found: ${method} ${path}` }, 404)
    } catch (err: any) {
      console.error('[API Error]', err)
      return json(res, { success: false, message: err.message || 'Internal error', error: err.toString() }, 500)
    }
  }
}

/** JSON 响应工具 */
function json(res: any, data: any, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}
