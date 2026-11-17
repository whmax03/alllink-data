<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { queryApi } from '../api'
import dayjs from 'dayjs'
import { Box, Ship, Location, Refresh, Search } from '@element-plus/icons-vue'

const loading = ref(false)
const inventory = ref<any[]>([])
const activeTab = ref('domestic')
const searchSku = ref('')
const currentPage = ref(1)
const pageSize = ref(20)
const total = ref(0)
const totalStockCount = ref(0)
const warehouseCount = ref(0)

// 海外仓筛选条件
const selectedPlatform = ref('')
const selectedCountry = ref('')
const selectedWarehouseType = ref('')

// 平台选项
const platformOptions = [
  { label: '亚马逊', value: '亚马逊' },
  { label: 'eBay', value: 'eBay' },
  { label: 'Shopee', value: 'Shopee' },
  { label: 'Tiktok', value: 'Tiktok' },
  { label: '金蝶', value: '金蝶' },
]

// 各平台对应的国家映射
const countryMap: Record<string, { label: string; value: string }[]> = {
  'eBay': [
    { label: '澳大利亚-AU', value: 'AU' },
    { label: '英国-UK', value: 'UK' },
  ],
  'Shopee': [
    { label: '菲律宾', value: '菲律宾' },
    { label: '马来西亚', value: '马来西亚' },
    { label: '泰国', value: '泰国' },
    { label: '印尼', value: '印度尼西亚' },
  ],
  'Tiktok': [
    { label: '马来西亚', value: '马来西亚' },
    { label: '泰国', value: '泰国' },
  ],
}

// 当前平台对应的国家列表（动态计算）
const countryOptions = computed(() => {
  return selectedPlatform.value ? (countryMap[selectedPlatform.value] || []) : []
})

// 仓库类型选项（主要用于亚马逊平台）
const warehouseTypeOptions = [
  { label: '中邮英国', value: '中邮英国' },
  { label: '中邮德国', value: '中邮德国' },
  { label: 'VC海外仓德国站', value: 'VC海外仓德国站' },
  { label: '派速捷德国', value: '派速捷德国' },
  { label: '字米美国', value: '字米美国' },
  // { label: 'FBA德国', value: 'FBA德国' },
  { label: '字米前置转运仓美国', value: '字米前置转运仓美国' },
]

// 亚马逊平台：使用 warehouse_type 搜索
const isAmazon = computed(() => selectedPlatform.value === '亚马逊')

// 金蝶平台：独立平台，只有 platform 参数，无 warehouse_type / country
const isKingdee = computed(() => selectedPlatform.value === '金蝶')

// 是否需要显示仓库类型选择器（仅亚马逊）
const showWarehouseType = computed(() => isAmazon.value)

// 是否需要显示国家选择器（非亚马逊且非金蝶，且已选平台）
const showCountry = computed(() => !isAmazon.value && !isKingdee.value && !!selectedPlatform.value)

// 统计数据
const stats = computed(() => {
  return {
    totalSkus: total.value,
    totalStock: totalStockCount.value,
    warehouseCount: warehouseCount.value
  }
})

async function loadInventory() {
  loading.value = true
  try {
    const params: any = {
      pageSize: pageSize.value,
      pageNo: currentPage.value,
      sku: searchSku.value || undefined,
    }

    let res;
    if (activeTab.value === 'domestic') {
      res = await queryApi.domesticInventory(params)
    } else {
      // 海外仓：根据平台类型传递不同筛选参数
      // 所有平台都传 platform；亚马逊额外支持 warehouse_type；非亚马逊非金蝶额外支持 country
      if (selectedPlatform.value) {
        params.platform = selectedPlatform.value
      }
      if (isAmazon.value && selectedWarehouseType.value) {
        params.warehouse_type = selectedWarehouseType.value
      }
      if (!isAmazon.value && !isKingdee.value && selectedCountry.value) {
        params.country = selectedCountry.value
      }
      res = await queryApi.overseasInventory(params)
    }

    const { data } = res
    if (data.code === 200 || data.success) {
      inventory.value = data.data.list || []

      inventory.value.forEach(async item => {
        Object.assign(item, { ...item.raw_data })
      })

      console.error('库存数据:', inventory.value)
      total.value = data.data.total || 0
      totalStockCount.value = data.data.totalStock || 0
      warehouseCount.value = data.data.warehouseCount || 0
    }
  } catch (e) {
    console.error('加载库存失败', e)
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  currentPage.value = 1
  loadInventory()
}

function handlePageChange(val: number) {
  currentPage.value = val
  loadInventory()
}

function handleSizeChange(val: number) {
  pageSize.value = val
  currentPage.value = 1
  loadInventory()
}

// 平台切换时：亚马逊清除 country 并使用 warehouse_type；金蝶清除两者；其他清除 warehouse_type 并重置 country
watch(selectedPlatform, (newVal) => {
  if (newVal === '亚马逊') {
    selectedCountry.value = ''
  } else if (newVal === '金蝶') {
    selectedCountry.value = ''
    selectedWarehouseType.value = ''
  } else {
    selectedWarehouseType.value = ''
    selectedCountry.value = '' // 不同平台国家列表不同，需重置
  }
  currentPage.value = 1
  loadInventory()
})

watch(selectedCountry, () => {
  currentPage.value = 1
  loadInventory()
})

watch(selectedWarehouseType, () => {
  currentPage.value = 1
  loadInventory()
})

watch(activeTab, () => {
  currentPage.value = 1
  loadInventory()
})

function getStockColor(qty: number) {
  if (qty <= 0) return 'danger'
  if (qty < 10) return 'warning'
  return 'success'
}

onMounted(loadInventory)
</script>

<template>
  <div class="inventory-container">
    <!-- 顶部标题栏 -->
    <div class="page-header-premium">
      <div class="header-left">
        <el-icon class="header-icon"><Box /></el-icon>
        <div class="header-text">
          <h1>库存管理控制台</h1>
          <p>实时掌控全球仓储数据快照</p>
        </div>
      </div>
      <div class="header-right">
        <el-button type="primary" :icon="Refresh" @click="loadInventory" :loading="loading" plain round>
          刷新数据
        </el-button>
      </div>
    </div>

    <!-- 数据概览卡片 -->
    <el-row :gutter="20" class="stats-row">
      <el-col :span="8">
        <div class="stat-card">
          <div class="stat-icon-wrapper blue">
            <el-icon><Box /></el-icon>
          </div>
          <div class="stat-info">
            <span class="stat-label">SKU 总数</span>
            <span class="stat-value">{{ total.toLocaleString() }}</span>
          </div>
        </div>
      </el-col>
      <el-col :span="8">
        <div class="stat-card">
          <div class="stat-icon-wrapper orange">
            <el-icon><Location /></el-icon>
          </div>
          <div class="stat-info">
            <span class="stat-label">覆盖仓库</span>
            <span class="stat-value">{{ stats.warehouseCount }}</span>
          </div>
        </div>
      </el-col>
      <el-col :span="8">
        <div class="stat-card">
          <div class="stat-icon-wrapper green">
            <el-icon><Ship /></el-icon>
          </div>
          <div class="stat-info">
            <span class="stat-label">库存总量</span>
            <span class="stat-value">{{ stats.totalStock.toLocaleString() }}</span>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 主体内容卡片 -->
    <el-card class="main-content-card" shadow="never">
      <!-- 筛选工具栏 -->
      <div class="filter-toolbar">
        <div class="toolbar-left">
          <el-tabs v-model="activeTab" class="modern-tabs">
            <el-tab-pane name="domestic">
              <template #label>
                <span class="tab-label">
                  <el-icon><Location /></el-icon> 国内仓
                </span>
              </template>
            </el-tab-pane>
            <el-tab-pane name="overseas">
              <template #label>
                <span class="tab-label">
                  <el-icon><Ship /></el-icon> 海外仓
                </span>
              </template>
            </el-tab-pane>
          </el-tabs>
        </div>

        <div class="toolbar-right">
          <!-- 国内仓：仅 SKU 搜索 -->
          <el-input
            v-if="activeTab === 'domestic'"
            v-model="searchSku"
            placeholder="输入物料编码或名称查询..."
            class="premium-search"
            clearable
            @keyup.enter="handleSearch"
            @clear="handleSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
            <template #append>
              <el-button @click="handleSearch" type="primary">检索</el-button>
            </template>
          </el-input>

          <!-- 海外仓：条件筛选 + SKU 搜索 -->
          <div v-else class="overseas-filters">
            <!-- 平台选择 -->
            <el-select
              v-model="selectedPlatform"
              placeholder="选择平台"
              clearable
              class="filter-select"
            >
              <el-option
                v-for="opt in platformOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>

            <!-- 亚马逊平台：显示 warehouse_type 筛选 -->
            <el-select
              v-if="showWarehouseType"
              v-model="selectedWarehouseType"
              placeholder="选择仓库类型"
              clearable
              class="filter-select"
            >
              <el-option
                v-for="opt in warehouseTypeOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>

            <!-- 非亚马逊且非金蝶平台：显示 country 筛选 -->
            <el-select
              v-else-if="showCountry"
              v-model="selectedCountry"
              placeholder="选择国家"
              clearable
              class="filter-select"
            >
              <el-option
                v-for="opt in countryOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>

            <el-input
              v-model="searchSku"
              placeholder="输入 SKU 编码查询..."
              class="premium-search"
              clearable
              @keyup.enter="handleSearch"
              @clear="handleSearch"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
              <template #append>
                <el-button @click="handleSearch" type="primary">检索</el-button>
              </template>
            </el-input>
          </div>
        </div>
      </div>

      <!-- 表格区域 -->
      <div class="table-wrapper-premium">
        <!-- 国内仓表格 -->
        <el-table
          v-if="activeTab === 'domestic'"
          :data="inventory"
          v-loading="loading"
          style="width: 100%"
          height="calc(100vh - 460px)"
          row-class-name="premium-table-row"
          header-cell-class-name="premium-table-header"
        >
          <el-table-column label="NO." min-width="70" align="center">
            <template #default="{ $index }">
              <span class="index-badge">{{ (currentPage - 1) * pageSize + $index + 1 }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="material_code" label="物料编码" min-width="140">
            <template #default="{ row }">
              <code class="code-text">{{ row.material_code || row.original_sku }}</code>
            </template>
          </el-table-column>
          <el-table-column prop="material_name" label="物料名称" min-width="220" show-overflow-tooltip>
            <template #default="{ row }">
              {{ row.material_name || row.unified_sku }}
            </template>
          </el-table-column>
          <el-table-column prop="spec_model" label="规格型号" min-width="160" show-overflow-tooltip />
          <el-table-column prop="plan_tracking_no" label="计划跟踪号" min-width="160" />
          <el-table-column prop="warehouse_name" label="仓库" min-width="140">
            <template #default="{ row }">
              <span class="warehouse-text"><el-icon><Location /></el-icon> {{ row.warehouse_name }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="stock_unit" label="单位" min-width="80" align="center" />
          <el-table-column label="库存量" min-width="110" align="right">
            <template #default="{ row }">
              <span :class="['stock-value', getStockColor(row.stock_qty || row.available_qty)]">
                {{ row.stock_qty || row.available_qty }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="导入时间" min-width="170">
            <template #default="{ row }">
              <span class="time-text">{{ row.imported_at ? new Date(row.imported_at).toLocaleString('zh-CN') : (row.snapshot_time ? new Date(row.snapshot_time).toLocaleString('zh-CN') : '-') }}</span>
            </template>
          </el-table-column>
        </el-table>

        <!-- 海外仓表格 -->
        <el-table
          v-else
          :data="inventory"
          v-loading="loading"
          style="width: 100%"
          height="calc(100vh - 460px)"
          row-class-name="premium-table-row"
          header-cell-class-name="premium-table-header"
        >
          <el-table-column label="NO." min-width="70" align="center">
            <template #default="{ $index }">
              <span class="index-badge">{{ (currentPage - 1) * pageSize + $index + 1 }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="original_sku" label="SKU 编码" min-width="150">
            <template #default="{ row }">
              <code class="code-text">{{ row.original_sku || row.sku }}</code>
            </template>
          </el-table-column>
          <el-table-column prop="warehouse_name" label="仓库类型" min-width="150">
            <template #default="{ row }">
              <span class="warehouse-text"><el-icon><Ship /></el-icon> {{ row.warehouse.code }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="warehouse_type" label="平台" min-width="120" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.warehouse.platform" size="small" effect="plain">{{ row.warehouse.platform }}</el-tag>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column prop="unified_sku" label="中文品名" min-width="200" show-overflow-tooltip >
            <template #default="{ row }">
              {{ row.unified_sku || row.产品标题 || row.name_cn || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="可用库存" min-width="100" align="right">
            <template #default="{ row }">
              <span :class="['stock-value', getStockColor(row.available_qty)]">
                {{ row.available_qty }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="in_transit_qty" label="在途库存" min-width="100" align="right">
            <template #default="{ row }">
              <span style="color: #94a3b8">{{ row.in_transit_qty || 0 }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="reserved_qty" label="预留库存" min-width="100" align="right">
            <template #default="{ row }">
              <span style="color: #f59e0b">{{ row.reserved_qty || 0 }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="stock_unit" label="单位" min-width="80" align="center">
             <template #default="{ row }">
              <span >{{ row.stock_unit || row.产品单位 || row.库存主单位 || '-' }}</span>
            </template>
            </el-table-column>
          <el-table-column label="导入时间" min-width="170">
            <template #default="{ row }">
              <span class="time-text">{{ row.imported_at ? dayjs(row.imported_at).format('YYYY-MM-DD HH:mm:ss') : '-' }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 分页区域 -->
      <div class="pagination-premium">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"
          background
        />
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.inventory-container {
  padding: 24px;
  background-color: #f8fafc;
  min-height: 100vh;
}

/* 顶部标题栏设计 */
.page-header-premium {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.header-icon {
  font-size: 32px;
  color: #3b82f6;
  background: #eff6ff;
  padding: 12px;
  border-radius: 12px;
  box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.1);
}

.header-text h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: #1e293b;
  letter-spacing: -0.5px;
}

.header-text p {
  margin: 4px 0 0;
  font-size: 14px;
  color: #64748b;
}

/* 统计卡片设计 */
.stats-row {
  margin-bottom: 24px;
}

.stat-card {
  background: white;
  border-radius: 16px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 20px;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05);
  transition: transform 0.2s, box-shadow 0.2s;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05);
}

.stat-icon-wrapper {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}

.stat-icon-wrapper.blue { background: #eff6ff; color: #3b82f6; }
.stat-icon-wrapper.orange { background: #fff7ed; color: #f97316; }
.stat-icon-wrapper.green { background: #f0fdf4; color: #22c55e; }

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-label {
  font-size: 13px;
  font-weight: 500;
  color: #94a3b8;
  margin-bottom: 4px;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #1e293b;
}

/* 主内容卡片 */
.main-content-card {
  border-radius: 20px;
  border: none;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05) !important;
}

/* 筛选工具栏 */
.filter-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid #f1f5f9;
  flex-wrap: wrap;
  gap: 12px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 24px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.overseas-filters {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-select {
  width: 160px;
}

.modern-tabs :deep(.el-tabs__header) {
  margin: 0;
  border-bottom: none;
}

.modern-tabs :deep(.el-tabs__nav-wrap::after) {
  display: none;
}

.tab-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}

.premium-search {
  width: 280px;
}

:deep(.filter-select .el-input__wrapper),
:deep(.premium-search .el-input__wrapper) {
  height: 32px !important;
  box-sizing: border-box;
}

.premium-search :deep(.el-input__wrapper) {
  border-radius: 10px 0 0 10px;
  box-shadow: 0 0 0 1px #e2e8f0 inset !important;
}

:deep(.premium-search .el-input-group__append) {
  height: 32px !important;
  padding: 0 12px;
  background-color: #3b82f6;
  border-color: #3b82f6;
  color: white;
  border-radius: 0 10px 10px 0;
  font-weight: 600;
}

/* 表格样式 */
.table-wrapper-premium {
  margin-bottom: 20px;
}

:deep(.premium-table-header) {
  background-color: #f8fafc !important;
  color: #475569 !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 12px;
  letter-spacing: 0.05em;
  padding: 12px 0 !important;
}

:deep(.premium-table-row) {
  transition: background-color 0.2s;
}

:deep(.premium-table-row:hover) {
  background-color: #f1f5f9 !important;
}

.index-badge {
  background: #f1f5f9;
  color: #64748b;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  font-family: monospace;
}

.code-text {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  background: #f1f5f9;
  padding: 2px 6px;
  border-radius: 4px;
  color: #334155;
  font-size: 13px;
}

.warehouse-text {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #475569;
  font-weight: 500;
}

.stock-value {
  font-weight: 700;
  font-family: 'Inter', sans-serif;
}

.stock-value.success { color: #10b981; }
.stock-value.warning { color: #f59e0b; }
.stock-value.danger { color: #ef4444; }

.time-text, .date-text {
  color: #94a3b8;
  font-size: 12px;
}

/* 分页 */
.pagination-premium {
  display: flex;
  justify-content: flex-end;
  padding-top: 10px;
}

:deep(.el-pagination.is-background .el-pager li:not(.is-active)) {
  background-color: white;
  border: 1px solid #e2e8f0;
}

:deep(.el-pagination.is-background .el-pager li.is-active) {
  background-color: #3b82f6;
}
</style>
