/**
 * Supabase 建表 SQL
 *
 * 在 Supabase → SQL Editor 中执行以下语句创建所有表。
 * 执行完成后即可开始同步数据。
 */

export const CREATE_TABLES_SQL = `
-- ============================================
-- 0. 用户表
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(50),
  email VARCHAR(100) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'user',
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 1. 同步任务记录表
-- ============================================
CREATE TABLE IF NOT EXISTS sync_tasks (
  id BIGSERIAL PRIMARY KEY,
  task_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  total_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0,
  error_message TEXT,
  cursor_value VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. ODS层 - 赛狐原始订单数据
-- ============================================
CREATE TABLE IF NOT EXISTS ods_saihu_orders (
  id BIGSERIAL PRIMARY KEY,
  raw_data JSONB NOT NULL,
  saihu_order_id VARCHAR(100),
  saihu_order_no VARCHAR(100),
  shop_id VARCHAR(100),
  sync_task_id BIGINT REFERENCES sync_tasks(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(saihu_order_id)
);

-- ============================================
-- 3. DWD层 - 清洗后的标准订单表
-- ============================================
CREATE TABLE IF NOT EXISTS dwd_orders (
  id BIGSERIAL PRIMARY KEY,
  saihu_order_id VARCHAR(100) UNIQUE,
  saihu_order_no VARCHAR(100),
  shop_id VARCHAR(100),
  shop_name VARCHAR(200),
  platform VARCHAR(50),
  marketplace VARCHAR(50),
  order_status VARCHAR(50),
  unified_sku VARCHAR(100),
  original_sku VARCHAR(100),
  product_name VARCHAR(500),
  quantity INTEGER,
  currency VARCHAR(10),
  original_amount DECIMAL(18,4),
  cny_amount DECIMAL(18,4),
  order_time TIMESTAMPTZ,
  ship_time TIMESTAMPTZ,
  buyer_id VARCHAR(200),
  country VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. ODS层 - 赛狐原始商品数据
-- ============================================
CREATE TABLE IF NOT EXISTS ods_saihu_products (
  id BIGSERIAL PRIMARY KEY,
  raw_data JSONB NOT NULL,
  saihu_product_id VARCHAR(100),
  saihu_sku VARCHAR(100),
  sync_task_id BIGINT REFERENCES sync_tasks(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(saihu_product_id)
);

-- ============================================
-- 5. DWD层 - 标准商品表
-- ============================================
CREATE TABLE IF NOT EXISTS dwd_products (
  id BIGSERIAL PRIMARY KEY,
  saihu_product_id VARCHAR(100) UNIQUE,
  saihu_sku VARCHAR(100),
  unified_sku VARCHAR(100),
  product_name VARCHAR(500),
  category VARCHAR(200),
  image_url TEXT,
  status VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 6. SKU映射表（核心！）
-- ============================================
CREATE TABLE IF NOT EXISTS sku_mapping (
  id BIGSERIAL PRIMARY KEY,
  unified_sku VARCHAR(100) NOT NULL,
  saihu_sku VARCHAR(100),
  kingdee_sku VARCHAR(100),
  lingxing_sku VARCHAR(100),
  product_name VARCHAR(500),
  category VARCHAR(200),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(unified_sku)
);

-- ============================================
-- 7. DWD层 - 标准库存表
-- ============================================
CREATE TABLE IF NOT EXISTS dwd_inventory (
  id BIGSERIAL PRIMARY KEY,
  saihu_warehouse_id VARCHAR(100),
  warehouse_name VARCHAR(200),
  warehouse_type VARCHAR(50),
  unified_sku VARCHAR(100),
  original_sku VARCHAR(100),
  available_qty INTEGER DEFAULT 0,
  in_transit_qty INTEGER DEFAULT 0,
  reserved_qty INTEGER DEFAULT 0,
  snapshot_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 8. DWD层 - 财务利润表
-- ============================================
CREATE TABLE IF NOT EXISTS dwd_finance_profit (
  id BIGSERIAL PRIMARY KEY,
  saihu_order_id VARCHAR(100),
  shop_id VARCHAR(100),
  shop_name VARCHAR(200),
  unified_sku VARCHAR(100),
  revenue DECIMAL(18,4),
  product_cost DECIMAL(18,4),
  shipping_cost DECIMAL(18,4),
  platform_fee DECIMAL(18,4),
  ads_cost DECIMAL(18,4),
  other_fee DECIMAL(18,4),
  refund_amount DECIMAL(18,4),
  gross_profit DECIMAL(18,4),
  profit_margin DECIMAL(8,4),
  currency VARCHAR(10),
  cny_revenue DECIMAL(18,4),
  cny_gross_profit DECIMAL(18,4),
  stat_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 9. 汇总表 - 按天/店铺维度
-- ============================================
CREATE TABLE IF NOT EXISTS dws_daily_summary (
  id BIGSERIAL PRIMARY KEY,
  stat_date DATE NOT NULL,
  shop_id VARCHAR(100),
  shop_name VARCHAR(200),
  platform VARCHAR(50),
  total_orders INTEGER DEFAULT 0,
  total_revenue DECIMAL(18,4) DEFAULT 0,
  total_cny_revenue DECIMAL(18,4) DEFAULT 0,
  total_cost DECIMAL(18,4) DEFAULT 0,
  total_ads DECIMAL(18,4) DEFAULT 0,
  total_profit DECIMAL(18,4) DEFAULT 0,
  total_cny_profit DECIMAL(18,4) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(stat_date, shop_id)
);

-- ============================================
-- 索引
-- ============================================
CREATE INDEX IF NOT EXISTS idx_ods_orders_saihu_id ON ods_saihu_orders(saihu_order_id);
CREATE INDEX IF NOT EXISTS idx_dwd_orders_status ON dwd_orders(order_status);
CREATE INDEX IF NOT EXISTS idx_dwd_orders_time ON dwd_orders(order_time);
CREATE INDEX IF NOT EXISTS idx_dwd_orders_sku ON dwd_orders(unified_sku);
CREATE INDEX IF NOT EXISTS idx_dwd_orders_shop ON dwd_orders(shop_id);
CREATE INDEX IF NOT EXISTS idx_sku_mapping_saihu ON sku_mapping(saihu_sku);
CREATE INDEX IF NOT EXISTS idx_dwd_inventory_sku ON dwd_inventory(unified_sku);
CREATE INDEX IF NOT EXISTS idx_dwd_finance_date ON dwd_finance_profit(stat_date);
CREATE INDEX IF NOT EXISTS idx_dws_summary_date ON dws_daily_summary(stat_date);

-- ============================================
-- 测试数据（SKU映射）
-- ============================================
INSERT INTO sku_mapping (unified_sku, saihu_sku, product_name, category) VALUES
('CB-001', 'SF-AMZ-001', '无线蓝牙耳机-黑色', '3C电子'),
('CB-002', 'SF-AMZ-002', '手机保护壳-透明', '手机配件'),
('CB-003', 'SF-AMZ-003', 'LED台灯-白色', '家居照明')
ON CONFLICT (unified_sku) DO NOTHING;
`
