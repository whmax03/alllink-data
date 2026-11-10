<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { queryApi } from '../api'

const loading = ref(false)
const orders = ref<any[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(20)

async function loadOrders() {
  loading.value = true
  try {
    const { data } = await queryApi.orders({ page: currentPage.value, pageSize: pageSize.value })
    if (data.success) {
      orders.value = data.data || []
      total.value = data.total || 0
    }
  } catch (e) {
    console.error('加载订单失败', e)
  } finally {
    loading.value = false
  }
}

function handlePageChange(page: number) {
  currentPage.value = page
  loadOrders()
}

onMounted(loadOrders)
</script>

<template>
  <div>
    <div class="page-header">
      <h1>订单列表</h1>
      <p>从赛狐同步的订单数据</p>
    </div>

    <div class="chart-card">
      <el-table :data="orders" v-loading="loading" style="width: 100%" size="small">
        <el-table-column prop="saihu_order_no" label="订单号" width="160" />
        <el-table-column prop="shop_name" label="店铺" width="120" />
        <el-table-column prop="platform" label="平台" width="80" />
        <el-table-column prop="order_status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small">{{ row.order_status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="unified_sku" label="SKU" width="120" />
        <el-table-column prop="product_name" label="商品名称" show-overflow-tooltip />
        <el-table-column prop="quantity" label="数量" width="60" align="center" />
        <el-table-column label="金额" width="100" align="right">
          <template #default="{ row }">
            {{ row.currency }} {{ Number(row.original_amount).toFixed(2) }}
          </template>
        </el-table-column>
        <el-table-column label="下单时间" width="160">
          <template #default="{ row }">
            {{ row.order_time ? new Date(row.order_time).toLocaleString('zh-CN') : '-' }}
          </template>
        </el-table-column>
      </el-table>

      <div style="margin-top: 16px; display: flex; justify-content: flex-end">
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="handlePageChange"
        />
      </div>
    </div>
  </div>
</template>
