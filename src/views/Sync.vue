<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { syncApi, queryApi } from '../api'
import type { SyncTask } from '../types'
import { ElMessage } from 'element-plus'

const loading = ref(false)
const syncing = ref<string | null>(null)
const tasks = ref<SyncTask[]>([])

const syncButtons = [
  { type: 'products', label: '同步商品', desc: '拉取赛狐商品列表', icon: '📦' },
  { type: 'orders', label: '同步订单', desc: '拉取最近24小时订单', icon: '🛒' },
  { type: 'inventory', label: '同步库存', desc: '拉取当前库存快照', icon: '🏠' },
  { type: 'finance', label: '同步财务', desc: '拉取最近30天利润数据', icon: '💰' },
]

async function triggerSync(type: string) {
  syncing.value = type
  try {
    let res: any
    switch (type) {
      case 'orders':
        res = await syncApi.orders()
        break
      case 'products':
        res = await syncApi.products()
        break
      case 'inventory':
        res = await syncApi.inventory()
        break
      case 'finance':
        res = await syncApi.finance()
        break
    }
    if (res!.data.success) {
      ElMessage.success(res!.data.message)
    } else {
      ElMessage.error(res!.data.message)
    }
  } catch (e: any) {
    ElMessage.error(`同步失败: ${e.message}`)
  } finally {
    syncing.value = null
    loadTasks()
  }
}

async function loadTasks() {
  loading.value = true
  try {
    const { data } = await queryApi.dashboard()
    if (data.success) {
      tasks.value = data.data.tasks || []
    }
  } catch {
    // 如果 dashboard 接口失败，可能是数据库还没建表
  } finally {
    loading.value = false
  }
}

function getStatusTag(status: string) {
  const map: Record<string, { type: string; label: string }> = {
    success: { type: 'success', label: '成功' },
    failed: { type: 'danger', label: '失败' },
    running: { type: 'primary', label: '进行中' },
    pending: { type: 'info', label: '等待中' },
  }
  return map[status] || { type: 'info', label: status }
}

function getTaskLabel(type: string) {
  const map: Record<string, string> = {
    orders: '订单',
    products: '商品',
    inventory: '库存',
    finance: '财务',
  }
  return map[type] || type
}

function formatTime(time: string | null) {
  if (!time) return '-'
  return new Date(time).toLocaleString('zh-CN')
}

function getDuration(task: SyncTask) {
  if (!task.started_at || !task.finished_at) return '-'
  const seconds = Math.round(
    (new Date(task.finished_at).getTime() - new Date(task.started_at).getTime()) / 1000,
  )
  return `${seconds}秒`
}

onMounted(loadTasks)
</script>

<template>
  <div>
    <div class="page-header">
      <h1>数据同步管理</h1>
      <p>从赛狐 ERP 拉取数据到本地数据中台</p>
    </div>

    <!-- 同步操作卡片 -->
    <div class="card-grid">
      <div class="stat-card" v-for="btn in syncButtons" :key="btn.type">
        <div style="font-size: 28px">{{ btn.icon }}</div>
        <div class="label" style="margin-top: 8px; font-size: 15px; font-weight: 500">
          {{ btn.label }}
        </div>
        <div class="sub">{{ btn.desc }}</div>
        <el-button
          type="primary"
          size="small"
          style="margin-top: 12px; width: 100%"
          :loading="syncing === btn.type"
          :disabled="syncing !== null"
          @click="triggerSync(btn.type)"
        >
          {{ syncing === btn.type ? '同步中...' : '开始同步' }}
        </el-button>
      </div>
    </div>

    <!-- 同步历史 -->
    <div class="chart-card" style="margin-top: 24px">
      <h3>同步历史记录</h3>
      <el-table :data="tasks" v-loading="loading" style="width: 100%" size="small">
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            {{ getTaskLabel(row.task_type) }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusTag(row.status).type" size="small">
              {{ getStatusTag(row.status).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="total_count" label="总数" width="80" />
        <el-table-column prop="success_count" label="成功" width="80" />
        <el-table-column label="开始时间">
          <template #default="{ row }">
            {{ formatTime(row.started_at) }}
          </template>
        </el-table-column>
        <el-table-column label="耗时" width="80">
          <template #default="{ row }">
            {{ getDuration(row) }}
          </template>
        </el-table-column>
        <el-table-column prop="error_message" label="错误信息" show-overflow-tooltip />
      </el-table>
      <div v-if="tasks.length === 0 && !loading" style="text-align: center; padding: 40px; color: #999">
        暂无同步记录，请先执行同步操作
      </div>
    </div>
  </div>
</template>
