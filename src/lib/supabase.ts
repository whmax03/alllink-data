import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase 客户端
 *
 * - supabaseAdmin: 最高权限，仅在 server 端使用
 * - supabaseBrowser: 浏览器端使用，权限受限
 */

let _admin: SupabaseClient | null = null
let _browser: SupabaseClient | null = null

/** 服务端用（最高权限） */
export function getSupabaseAdmin(url: string, serviceKey: string): SupabaseClient {
  if (!_admin) {
    _admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return _admin
}

/** 浏览器端用（权限受限） */
export function getSupabaseBrowser(url: string, anonKey: string): SupabaseClient {
  if (!_browser) {
    _browser = createClient(url, anonKey)
  }
  return _browser
}
