<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { queryApi, inventoryApi, type InventoryExportParams } from '../api'
import dayjs from 'dayjs'
import { Box, Ship, Location, Refresh, Search, CopyDocument, EditPen, Download, SortDown, SortUp, Sort } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { i18n } from '../i18n'
import { useAuthStore } from '../stores/auth'

const t = i18n.t
const authStore = useAuthStore()

const loading = ref(false)
const inventory = ref<any[]>([])
const activeTab = ref('domestic')
const searchSku = ref('')
const currentPage = ref(1)
const pageSize = ref(20)
const total = ref(0)
const totalSkus = ref(0)
const totalStockCount = ref(0)
const warehouseCount = ref(0)

// 海外仓筛选条件
const selectedPlatform = ref('')
const selectedCountry = ref('')
const selectedWarehouseType = ref('')

// 国内仓平台筛选条件
const selectedDomesticPlatform = ref('')

// ---------- 可用库存排序（服务端排序，对整个列表生效） ----------
// '' = 默认（后端按 id 倒序，最新导入在前）；desc = 从大到小；asc = 从小到大
// 注意：列表是分页的，前端排序只会排「当前页」，必须交给后端排序
type StockSortOrder = '' | 'desc' | 'asc'
const stockSortOrder = ref<StockSortOrder>('')

/** 点击列头循环切换：默认 → 降序 → 升序 → 默认 */
function toggleStockSort() {
  stockSortOrder.value =
    stockSortOrder.value === '' ? 'desc' :
    stockSortOrder.value === 'desc' ? 'asc' : ''
  currentPage.value = 1
  loadInventory()
}

/** 排序图标：降序显示 SortDown、升序显示 SortUp、默认显示中性 Sort */
const stockSortIcon = computed(() => {
  if (stockSortOrder.value === 'desc') return SortDown
  if (stockSortOrder.value === 'asc') return SortUp
  return Sort
})

/** 列头 tooltip：说明当前状态与下一步点击的效果 */
const stockSortTip = computed(() => {
  if (stockSortOrder.value === 'desc') return t('inventory.sortDescTip')
  if (stockSortOrder.value === 'asc') return t('inventory.sortAscTip')
  return t('inventory.sortDefaultTip')
})

/** 排序参数：未排序时不传，让后端走默认顺序 */
const sortParams = computed<{ sort_by?: 'stock_qty'; sort_order?: 'asc' | 'desc' }>(() =>
  stockSortOrder.value
    ? { sort_by: 'stock_qty', sort_order: stockSortOrder.value }
    : {}
)

// 国内仓平台选项（按 platform:xxx 权限码过滤；admin 恒全量）
const domesticPlatformOptions = computed(() => [
  { label: '金蝶', value: '金蝶' },
  { label: '澳霖', value: '澳霖' },
].filter(opt => authStore.hasPerm(`platform:${opt.value}`)))

// 海外仓平台选项（按 platform:xxx 权限码过滤；admin 恒全量）
const platformOptions = computed(() => [
  { label: '亚马逊', value: '亚马逊' },
  { label: 'eBay', value: 'eBay' },
  { label: 'Shopee', value: 'Shopee' },
  { label: 'Tiktok', value: 'Tiktok' },
].filter(opt => authStore.hasPerm(`platform:${opt.value}`)))

// ---------- 国内仓/海外仓 Tab 权限显隐 ----------
// 各自按 tab:domestic / tab:overseas 权限码控制；两者皆无时保底显示国内仓（至少一个 Tab，页面结构可用）
const showDomesticTab = computed(() => authStore.hasPerm('tab:domestic') || !authStore.hasPerm('tab:overseas'))
const showOverseasTab = computed(() => authStore.hasPerm('tab:overseas'))

// 当前激活 Tab 无权限时自动切到可见 Tab（权限加载完成后触发；activeTab 变化由既有 watch 触发重载）
watch([showDomesticTab, showOverseasTab], () => {
  if (activeTab.value === 'domestic' && !showDomesticTab.value && showOverseasTab.value) {
    activeTab.value = 'overseas'
  } else if (activeTab.value === 'overseas' && !showOverseasTab.value && showDomesticTab.value) {
    activeTab.value = 'domestic'
  }
}, { immediate: true })

// 平台权限变化后：清掉已选中但已无权限的平台筛选（防残留查询参数；清空会触发既有 watch 重载）
watch(platformOptions, opts => {
  if (selectedPlatform.value && !opts.some(o => o.value === selectedPlatform.value)) {
    selectedPlatform.value = ''
  }
})
watch(domesticPlatformOptions, opts => {
  if (selectedDomesticPlatform.value && !opts.some(o => o.value === selectedDomesticPlatform.value)) {
    selectedDomesticPlatform.value = ''
  }
})

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
    totalSkus: totalSkus.value,
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
      // 可用库存排序（服务端排序，整表生效；未选择时不传，后端默认最新导入在前）
      ...sortParams.value,
    }

    let res;
    if (activeTab.value === 'domestic') {
      // 国内仓：支持平台筛选（金蝶 / 即时库存澳霖汇总）
      if (selectedDomesticPlatform.value) {
        params.platform = selectedDomesticPlatform.value
      }
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

      // console.error('库存数据:', inventory.value)
      totalSkus.value = data.data.totalSkuNum || 0
      total.value = data.data.total || 0
      totalStockCount.value = data.data.totalStock || 0
      warehouseCount.value = data.data.warehouseCount || 0
    }
  } catch (e) {
    console.error('加载库存失败', e)
    // ElMessage.error(t('inventory.loadFailed'))
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  currentPage.value = 1
  loadInventory()
}

// ---------- 备注列：点击编辑图标弹出弹窗编辑 ----------
const remarkDialogVisible = ref(false)
const remarkSaving = ref(false)
// 当前编辑行（保存成功后就地更新 row.remark）
const remarkTarget = ref<any>(null)
const remarkForm = ref('')

function openRemarkDialog(row: any) {
  remarkTarget.value = row
  remarkForm.value = row.remark || ''
  remarkDialogVisible.value = true
}

async function saveRemark() {
  if (!remarkTarget.value || remarkSaving.value) return
  const text = remarkForm.value.trim()
  if (text.length > 500) {
    ElMessage.warning(t('inventory.remarkTooLong'))
    return
  }
  remarkSaving.value = true
  try {
    const { data } = await inventoryApi.updateRemark(remarkTarget.value.id, text)
    if (data.code === 200) {
      // 后端返回的 remark 为 null 表示已清空；就地更新当前行
      remarkTarget.value.remark = (data.data && data.data.remark) || null
      remarkDialogVisible.value = false
      ElMessage.success(t('inventory.remarkSaved'))
    } else {
      ElMessage.error(data.message || t('inventory.remarkSaveFailed'))
    }
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || t('inventory.remarkSaveFailed'))
  } finally {
    remarkSaving.value = false
  }
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

// 国内仓平台切换时重新加载
watch(selectedDomesticPlatform, () => {
  currentPage.value = 1
  loadInventory()
})

function getStockColor(qty: number) {
  if (qty <= 0) return 'danger'
  if (qty < 10) return 'warning'
  return 'success'
}

/** 复制 SKU 编码到剪贴板（带非安全上下文降级兼容） */
async function copySku(sku?: string) {
  if (!sku) {
    ElMessage.warning(t('inventory.noSkuToCopy'))
    return
  }
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(sku)
    } else {
      // 兼容降级：非安全上下文（如 http 局域网访问）时用临时 textarea 复制
      const textarea = document.createElement('textarea')
      textarea.value = sku
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    ElMessage.success(`${t('inventory.copiedPrefix')}${sku}`)
  } catch {
    ElMessage.error(t('inventory.copyFailed'))
  }
}

// ---------- 导出表格 ----------
// 权限：国内仓 export:domestic / 海外仓 export:overseas 各自独立
// 与后端 require_permission 同码，前端只做显隐，后端强制校验
const canExportDomestic = computed(() => authStore.hasPerm('export:domestic'))
const canExportOverseas = computed(() => authStore.hasPerm('export:overseas'))
// 当前 Tab 是否有导出权限（切 Tab 后按钮随之显隐）
const canExport = computed(() =>
  activeTab.value === 'domestic' ? canExportDomestic.value : canExportOverseas.value
)
const exportLoading = ref(false)

/** 当前筛选条件（用于导出与提示），按 Tab 分别收集 */
const currentFilters = computed(() => {
  if (activeTab.value === 'domestic') {
    return {
      sku: searchSku.value || undefined,
      platform: selectedDomesticPlatform.value || undefined,
    }
  }
  return {
    sku: searchSku.value || undefined,
    platform: selectedPlatform.value || undefined,
    // 亚马逊用 warehouse_type（仓库类型）筛选，其他平台用 country；金蝶两者都不用
    warehouse_type: isAmazon.value ? (selectedWarehouseType.value || undefined) : undefined,
    country: (!isAmazon.value && !isKingdee.value) ? (selectedCountry.value || undefined) : undefined,
  }
})

/** 筛选条件的中文描述，用于按钮 tooltip 与导出确认 */
const filterDesc = computed(() => {
  const parts: string[] = []
  const f = currentFilters.value
  if (f.sku) parts.push(`SKU: ${f.sku}`)
  if (f.platform) parts.push(`${t('inventory.platform')}: ${f.platform}`)
  if (f.warehouse_type) parts.push(`${t('inventory.warehouseType')}: ${f.warehouse_type}`)
  if (f.country) parts.push(`国家: ${f.country}`)
  return parts.length ? parts.join(' · ') : ''
})

const hasFilter = computed(() => !!filterDesc.value)

/**
 * 执行导出。
 * mode=filtered：带上当前 Tab 的筛选条件，导出「页面上看到的这批数据」（跨全部分页）
 * mode=all：不带任何筛选，导出当前账号数据权限内的全部库存
 */
async function handleExport(mode: 'filtered' | 'all') {
  if (exportLoading.value) return
  if (!canExport.value) {
    // 提示具体缺哪个仓的导出权限，便于用户找管理员精准开通
    const permName = activeTab.value === 'domestic'
      ? t('perms.node.export:domestic')
      : t('perms.node.export:overseas')
    ElMessage.warning(t('inventory.exportNoPerm').replace('{perm}', permName))
    return
  }

  exportLoading.value = true
  const tip = ElMessage({
    message: t('inventory.exporting'),
    type: 'info',
    duration: 0,
  })
  try {
    const params: InventoryExportParams = mode === 'all'
      ? { mode: 'all', ...sortParams.value }
      // 导出顺序与页面保持一致：带上当前列的排序
      : { mode: 'filtered', ...currentFilters.value, ...sortParams.value }

    const res = activeTab.value === 'domestic'
      ? await queryApi.exportDomesticInventory(params)
      : await queryApi.exportOverseasInventory(params)

    // 后端出错时会返回 JSON（而非文件流），responseType=blob 下需要手动解析出错误文案
    const blob = res.data as Blob
    if (blob.type.includes('application/json')) {
      const text = await blob.text()
      let msg = t('inventory.exportFailed')
      try {
        const json = JSON.parse(text)
        msg = json.message || json.detail || msg
      } catch { /* 非 JSON 时用通用文案 */ }
      ElMessage.error(msg)
      return
    }

    // 文件名优先取后端 Content-Disposition（含中文时是 filename*=UTF-8''...）
    const filename = parseFilename(res.headers?.['content-disposition']) || defaultExportFilename(mode)
    saveBlob(blob, filename)

    const rows = Number(res.headers?.['x-export-rows'] || 0)
    ElMessage.success(t('inventory.exportSuccess').replace('{count}', String(rows || '-').toLocaleString()))
  } catch (e: any) {
    // 403（无权限）/ 400（超上限）等：错误体是 blob，需先读文本
    let msg = t('inventory.exportFailed')
    const data = e?.response?.data
    if (data instanceof Blob) {
      try {
        const json = JSON.parse(await data.text())
        msg = json.message || json.detail || msg
      } catch { /* 保留通用文案 */ }
    } else if (e?.response?.data?.message) {
      msg = e.response.data.message
    } else if (e?.message) {
      msg = e.message
    }
    ElMessage.error(msg)
  } finally {
    tip.close()
    exportLoading.value = false
  }
}

/** 解析 Content-Disposition 中的文件名（兼容 filename*=UTF-8'' 与普通 filename） */
function parseFilename(disposition?: string): string {
  if (!disposition) return ''
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition)
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim())
    } catch {
      /* 解码失败回退到普通 filename */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(disposition)
  return plain?.[1]?.trim() || ''
}

function defaultExportFilename(mode: 'filtered' | 'all'): string {
  const scope = activeTab.value === 'domestic' ? '国内仓' : '海外仓'
  const modeLabel = mode === 'all' ? '全量' : '筛选'
  return `库存_${scope}_${modeLabel}_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`
}

/** 触发浏览器下载 */
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // 稍后释放，避免部分浏览器下载中断
  setTimeout(() => URL.revokeObjectURL(url), 1000)
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
          <h1>{{ t('inventory.title') }}</h1>
        </div>
      </div>
      <div class="header-right">
        <!-- 导出：需 data:export 权限；下拉区分「当前筛选结果」与「全量」 -->
        <el-dropdown
          v-if="canExport"
          trigger="click"
          :disabled="exportLoading"
          @command="handleExport"
        >
          <el-button type="success" :icon="Download" :loading="exportLoading" plain round>
            {{ t('inventory.export') }}
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="filtered" :disabled="!hasFilter">
                <span class="export-item">{{ t('inventory.exportFiltered') }}</span>
                <span class="export-item-hint">
                  {{ hasFilter ? t('inventory.exportCurrentHint').replace('{cond}', filterDesc) : t('inventory.exportNoFilter') }}
                </span>
              </el-dropdown-item>
              <el-dropdown-item command="all" divided>
                <span class="export-item">{{ t('inventory.exportAll') }}</span>
                <span class="export-item-hint">{{ t('inventory.exportAllHint') }}</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button type="primary" :icon="Refresh" @click="loadInventory" :loading="loading" plain round>
          {{ t('inventory.refresh') }}
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
            <span class="stat-label">{{ t('inventory.totalSkus') }}</span>
            <span class="stat-value">{{ totalSkus.toLocaleString() }}</span>
          </div>
        </div>
      </el-col>
      <el-col :span="8">
        <div class="stat-card">
          <div class="stat-icon-wrapper orange">
            <el-icon><Location /></el-icon>
          </div>
          <div class="stat-info">
            <span class="stat-label">{{ t('inventory.warehouseCount') }}</span>
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
            <span class="stat-label">{{ t('inventory.totalStock') }}</span>
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
            <el-tab-pane v-if="showDomesticTab" name="domestic">
              <template #label>
                <span class="tab-label">
                  <el-icon><Location /></el-icon> {{ t('inventory.domestic') }}
                </span>
              </template>
            </el-tab-pane>
            <el-tab-pane v-if="showOverseasTab" name="overseas">
              <template #label>
                <span class="tab-label">
                  <el-icon><Ship /></el-icon> {{ t('inventory.overseas') }}
                </span>
              </template>
            </el-tab-pane>
          </el-tabs>
        </div>

        <div class="toolbar-right">
          <!-- 国内仓：平台筛选 + SKU 搜索 -->
          <div v-if="activeTab === 'domestic'" class="overseas-filters">
            <el-select
              v-model="selectedDomesticPlatform"
              :placeholder="t('inventory.selectPlatform')"
              clearable
              class="filter-select"
            >
              <el-option
                v-for="opt in domesticPlatformOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>

            <el-input
              v-model="searchSku"
              :placeholder="t('inventory.searchPlaceholder')"
              class="premium-search"
              clearable
              @keyup.enter="handleSearch"
              @clear="handleSearch"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
              <template #append>
                <el-button @click="handleSearch" type="primary">{{ t('inventory.searchBtn') }}</el-button>
              </template>
            </el-input>
          </div>

          <!-- 海外仓：条件筛选 + SKU 搜索 -->
          <div v-else class="overseas-filters">
            <!-- 平台选择 -->
            <el-select
              v-model="selectedPlatform"
              :placeholder="t('inventory.selectPlatform')"
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
              :placeholder="t('inventory.warehouseType')"
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
              :placeholder="t('inventory.searchPlaceholder')"
              class="premium-search"
              clearable
              @keyup.enter="handleSearch"
              @clear="handleSearch"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
              <template #append>
                <el-button @click="handleSearch" type="primary">{{ t('inventory.retrieveBtn') }}</el-button>
              </template>
            </el-input>
          </div>
        </div>
      </div>

      <!-- 表格区域 -->
      <div class="table-wrapper-premium">
        
        <!-- 海外仓表格 -->
        <el-table
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
          <el-table-column prop="original_sku" :label="t('inventory.skuCode')" min-width="150">
            <template #default="{ row }">
              <div class="sku-cell" :title="row.original_sku || row.sku">
                <code class="code-text">{{ row.original_sku || row.sku }}</code>
                <el-icon class="copy-icon" :title="t('inventory.copy')" @click="copySku(row.original_sku || row.sku)">
                  <CopyDocument />
                </el-icon>
              </div>
            </template>
          </el-table-column>
          <el-table-column v-if="activeTab === 'domestic'"  prop="original_sku1" :label="t('inventory.trackingNo')" min-width="150">
            <template #default="{ row }">
              <div >{{ row.计划跟踪号 || '-' }}</div>
            </template>
          </el-table-column>
          <el-table-column prop="warehouse_name" :label="t('inventory.warehouseType')" min-width="150">
            <template #default="{ row }">
              <span class="warehouse-text"><el-icon><Ship /></el-icon> {{ row.warehouse.code }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="warehouse_type" :label="t('inventory.platform')" min-width="120" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.warehouse.platform" size="small" effect="plain">{{ row.warehouse.platform }}</el-tag>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column prop="unified_sku" :label="t('inventory.productName')" min-width="150" show-overflow-tooltip >
            <template #default="{ row }">
              {{ row.unified_sku || row.产品标题 || row.name_cn || '-' }}
            </template>
          </el-table-column>
           <el-table-column prop="unified_sku" :label="t('inventory.barcode')" min-width="150" show-overflow-tooltip >
            <template #default="{ row }">
              {{ row.产品条码 || row.条码 || '-' }}
            </template>
          </el-table-column>
          <el-table-column :label="t('inventory.available')" min-width="100" align="right">
            <!-- 列头排序开关：点击循环 默认 → 从大到小 → 从小到大（服务端排序，整表生效） -->
            <template #header>
              <div class="sort-header">
                <span>{{ t('inventory.available') }}</span>
                <el-tooltip :content="stockSortTip" placement="top">
                  <el-icon
                    :class="['sort-icon', { active: !!stockSortOrder }]"
                    @click="toggleStockSort"
                  >
                    <component :is="stockSortIcon" />
                  </el-icon>
                </el-tooltip>
              </div>
            </template>
            <template #default="{ row }">
              <span :class="['stock-value', getStockColor(row.stock_qty)]">
                {{ row.stock_qty }}
              </span>
            </template>
          </el-table-column>
          <!-- <el-table-column prop="in_transit_qty" label="在途库存" min-width="100" align="right">
            <template #default="{ row }">
              <span style="color: #94a3b8">{{ row.in_transit_qty || 0 }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="reserved_qty" label="预留库存" min-width="100" align="right">
            <template #default="{ row }">
              <span style="color: #f59e0b">{{ row.reserved_qty || 0 }}</span>
            </template>
          </el-table-column> -->
          <el-table-column prop="stock_unit" :label="t('inventory.unit')" min-width="120" align="center">
             <template #default="{ row }">
               <span >{{ row.stock_unit || row.产品单位 || row.库存主单位 || '-' }}</span>
             </template>
          </el-table-column>
          <!-- 海外仓专属：责任人（来自责任人对应关系 Excel，经 sku_owner_map 回填，多人用+连接） -->
          <el-table-column v-if="activeTab === 'overseas'" prop="owner" :label="t('inventory.owner')" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">
              {{ row.owner || '-' }}
            </template>
          </el-table-column>
          <!-- 备注：点击编辑图标弹出弹窗编辑；重新导入时按 仓库+SKU 相同自动保留 -->
          <el-table-column prop="remark" :label="t('inventory.remark')" min-width="200">
            <template #default="{ row }">
              <div class="remark-cell">
                <!-- 备注文本悬浮显示完整内容（限宽换行，防超长备注撑满整屏） -->
                <el-tooltip
                  :content="row.remark || '-'"
                  placement="top"
                  :disabled="!row.remark"
                  popper-class="remark-tooltip"
                >
                  <span class="remark-text">{{ row.remark || '-' }}</span>
                </el-tooltip>
                <el-tooltip :content="t('inventory.remarkEditTip')" placement="top">
                  <el-icon class="remark-edit-icon" @click="openRemarkDialog(row)">
                    <EditPen />
                  </el-icon>
                </el-tooltip>
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="t('inventory.importedAt')" min-width="170">
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

    <!-- 编辑备注弹窗 -->
    <el-dialog
      v-model="remarkDialogVisible"
      :title="t('inventory.remarkDialogTitle')"
      width="480px"
      destroy-on-close
    >
      <!-- 目标 SKU 信息 -->
      <div class="remark-dialog-sku">
        <div class="remark-sku-label">SKU</div>
        <code class="code-text">{{ remarkTarget?.original_sku || remarkTarget?.sku || '-' }}</code>
      </div>
      <el-input
        v-model="remarkForm"
        type="textarea"
        :rows="3"
        maxlength="500"
        show-word-limit
        resize="none"
        :placeholder="t('inventory.remarkPlaceholder')"
      />
      <template #footer>
        <el-button round @click="remarkDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" round :loading="remarkSaving" @click="saveRemark">
          {{ t('common.save') }}
        </el-button>
      </template>
    </el-dialog>
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

/* 顶部操作区：导出下拉 + 刷新并排 */
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 导出下拉项：主标题 + 灰色说明两行，说明当前导出范围 */
.export-item {
  display: block;
  font-weight: 600;
  color: #1e293b;
  line-height: 1.4;
}

.export-item-hint {
  display: block;
  font-size: 11px;
  color: #94a3b8;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
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
  word-break: break-word;
}

/* SKU 复制按钮：悬停单元格时浮现 */
.sku-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.copy-icon {
  cursor: pointer;
  color: #94a3b8;
  font-size: 14px;
  flex-shrink: 0;
  /* opacity: 0; */
  transition: opacity 0.2s, color 0.2s, transform 0.2s;
}

.sku-cell:hover .copy-icon {
  opacity: 1;
}

.copy-icon:hover {
  color: #3b82f6;
  transform: scale(1.15);
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

/* 列头排序开关：文字 + 排序图标同行，右对齐贴合数值列 */
.sort-header {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  width: 100%;
}

.sort-icon {
  font-size: 13px;
  color: #cbd5e1;
  cursor: pointer;
  transition: color 0.15s, transform 0.15s;
}

.sort-icon:hover {
  color: #3b82f6;
  transform: scale(1.15);
}

/* 已启用排序时图标高亮，便于一眼看出当前处于排序状态 */
.sort-icon.active {
  color: #3b82f6;
}

.time-text, .date-text {
  color: #94a3b8;
  font-size: 12px;
}

/* 备注列：文本 + 编辑图标；点击图标弹出编辑弹窗 */
.remark-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

.remark-text {
  color: #475569;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 编辑图标：默认浅灰不显眼，hover 变蓝放大提示可点 */
.remark-edit-icon {
  font-size: 15px;
  color: #cbd5e1;
  cursor: pointer;
  flex-shrink: 0;
  transition: color 0.15s, transform 0.15s;
}

.remark-edit-icon:hover {
  color: #3b82f6;
  transform: scale(1.18);
}

/* 备注弹窗 SKU 信息行 */
.remark-dialog-sku {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.remark-sku-label {
  font-size: 12px;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
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

<!-- 全局样式：备注 tooltip 挂在 body 上，scoped 覆盖不到，必须非 scoped -->
<style>
.remark-tooltip {
  /* 限宽 + 强制换行：超长备注（含连续无空格文本）不再横向撑满整屏 */
  max-width: 360px !important;
  word-break: break-all;
  overflow-wrap: anywhere;
  line-height: 1.5;
  /* 限高滚动：极端超长备注不至于占满全屏，区域内滚动看全量 */
  max-height: 240px;
  overflow-y: auto;
}

.remark-tooltip .el-tooltip__content {
  max-height: 240px;
  overflow-y: auto;
}
</style>
