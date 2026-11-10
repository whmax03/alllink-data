<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { queryApi } from '../api'
import SalesChart from '../components/charts/SalesChart.vue'
import dayjs from 'dayjs'

const loading = ref(true)
const summary = ref({
  todayRevenue: 0,
  todayOrders: 0,
  todayProfit: 0,
  monthRevenue: 0,
  monthOrders: 0,
  monthProfit: 0,
})
const salesTrend = ref<{ date: string; revenue: number; profit: number }[]>([])
const topSkus = ref<{ sku: string; revenue: number; profit: number }[]>([])

async function loadData() {
  loading.value = true
  try {
    const { data } = await queryApi.dashboard()
    if (data.success) {
      summary.value = data.data.summary
      salesTrend.value = data.data.salesTrend
      topSkus.value = data.data.topSkus
    }
  } catch (e) {
    console.error('加载看板数据失败', e)
  } finally {
    loading.value = false
  }
}

function formatMoney(val: number) {
  return `$${val.toFixed(2)}`
}

function formatPercent(num: number, denom: number) {
  if (!denom) return '0%'
  return `${((num / denom) * 100).toFixed(1)}%`
}

onMounted(loadData)
</script>

<template>
  <div>
    <div class="page-header">
      <div style="display: flex; align-items: center; justify-content: space-between">
        <div>
          <h1>数据看板</h1>
          <p>数据更新时间：{{ dayjs().format('YYYY-MM-DD HH:mm') }}</p>
        </div>
        <el-button @click="loadData" :loading="loading">刷新</el-button>
      </div>
    </div>

    <!-- 核心指标 -->
    <div class="card-grid" v-loading="loading">
      <div class="stat-card">
        <div class="label">今日销售额</div>
        <div class="value">{{ formatMoney(summary.todayRevenue) }}</div>
        <div class="sub">{{ summary.todayOrders }} 笔订单</div>
      </div>
      <div class="stat-card">
        <div class="label">今日毛利</div>
        <div class="value text-green">{{ formatMoney(summary.todayProfit) }}</div>
        <div class="sub">利润率 {{ formatPercent(summary.todayProfit, summary.todayRevenue) }}</div>
      </div>
      <div class="stat-card">
        <div class="label">本月销售额</div>
        <div class="value">{{ formatMoney(summary.monthRevenue) }}</div>
        <div class="sub">{{ summary.monthOrders }} 笔订单</div>
      </div>
      <div class="stat-card">
        <div class="label">本月毛利</div>
        <div class="value text-green">{{ formatMoney(summary.monthProfit) }}</div>
        <div class="sub">利润率 {{ formatPercent(summary.monthProfit, summary.monthRevenue) }}</div>
      </div>
    </div>

    <!-- 图表 -->
    <div class="chart-grid-2" style="margin-top: 16px">
      <div class="chart-card">
        <h3>销售额 & 毛利趋势（近30天）</h3>
        <SalesChart :data="salesTrend" />
      </div>
      <div class="chart-card">
        <h3>销量 TOP 10 SKU</h3>
        <el-table :data="topSkus" size="small" style="width: 100%">
          <el-table-column type="index" label="#" width="40" />
          <el-table-column prop="sku" label="SKU" />
          <el-table-column label="销售额" align="right">
            <template #default="{ row }">
              {{ formatMoney(row.revenue) }}
            </template>
          </el-table-column>
          <el-table-column label="毛利" align="right">
            <template #default="{ row }">
              <span class="text-green">{{ formatMoney(row.profit) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="利润率" align="right" width="80">
            <template #default="{ row }">
              {{ formatPercent(row.profit, row.revenue) }}
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </div>
</template>
