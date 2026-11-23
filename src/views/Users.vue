<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { User, UserFilled, Search, Plus, Lock, Delete } from '@element-plus/icons-vue'
import { userApi } from '../api'
import { useAuthStore } from '../stores/auth'
import { i18n } from '../i18n'

const t = i18n.t
const authStore = useAuthStore()

const loading = ref(false)
const accounts = ref<any[]>([])
const searchKeyword = ref('')

// 服务端分页（后端 /users/ 分页返回 list+total+adminCount+memberCount）
const currentPage = ref(1)
const pageSize = ref(20)

// 统计（后端返回，跟随 keyword 过滤口径）
const stats = ref({ total: 0, admins: 0, members: 0 })

// 拉取账号列表（服务端分页 + keyword 过滤）
async function loadAccounts() {
  loading.value = true
  try {
    const { data } = await userApi.list({
      pageNo: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchKeyword.value || undefined,
    })
    if (data.code === 200) {
      const d = data.data || {}
      accounts.value = d.list || []
      stats.value = {
        total: d.total || 0,
        admins: d.adminCount || 0,
        members: d.memberCount || 0,
      }
    } else {
      ElMessage.error(data.message || t('users.loadFailed'))
    }
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || t('users.loadFailed'))
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  currentPage.value = 1
  loadAccounts()
}

function handlePageChange(val: number) {
  currentPage.value = val
  loadAccounts()
}

function handleSizeChange(val: number) {
  pageSize.value = val
  currentPage.value = 1
  loadAccounts()
}

// ---------- 新增账号对话框 ----------
const createDialogVisible = ref(false)
const createLoading = ref(false)
const createFormRef = ref<FormInstance>()
const createForm = reactive({
  name: '',
  email: '',
  password: '',
})

const createRules = computed<FormRules>(() => ({
  name: [
    { required: true, message: t('users.nameRequired'), trigger: 'blur' },
    { min: 2, max: 20, message: t('users.nameRange'), trigger: 'blur' },
  ],
  email: [
    { required: true, message: t('users.emailRequired'), trigger: 'blur' },
    { type: 'email', message: t('users.emailInvalid'), trigger: 'blur' },
  ],
  password: [
    { required: true, message: t('users.passwordRequired'), trigger: 'blur' },
    { min: 6, max: 32, message: t('users.passwordRange'), trigger: 'blur' },
  ],
}))

function openCreateDialog() {
  createForm.name = ''
  createForm.email = ''
  createForm.password = ''
  createDialogVisible.value = true
}

async function handleCreate() {
  if (!createFormRef.value) return
  await createFormRef.value.validate(async (valid) => {
    if (!valid) return
    createLoading.value = true
    try {
      const { data } = await userApi.create({
        name: createForm.name,
        email: createForm.email,
        password: createForm.password,
      })
      if (data.code === 200) {
        ElMessage.success(t('users.createSuccess'))
        createDialogVisible.value = false
        loadAccounts()
      } else {
        ElMessage.error(data.message || t('users.loadFailed'))
      }
    } catch (e: any) {
      ElMessage.error(e.response?.data?.message || t('users.loadFailed'))
    } finally {
      createLoading.value = false
    }
  })
}

// ---------- 重置密码对话框 ----------
const resetDialogVisible = ref(false)
const resetLoading = ref(false)
const resetFormRef = ref<FormInstance>()
const resetTarget = ref<any>(null)
const resetForm = reactive({ newPassword: '' })

const resetRules = computed<FormRules>(() => ({
  newPassword: [
    { required: true, message: t('users.passwordRequired'), trigger: 'blur' },
    { min: 6, max: 32, message: t('users.passwordRange'), trigger: 'blur' },
  ],
}))

function openResetDialog(row: any) {
  resetTarget.value = row
  resetForm.newPassword = ''
  resetDialogVisible.value = true
}

async function handleReset() {
  if (!resetFormRef.value || !resetTarget.value) return
  await resetFormRef.value.validate(async (valid) => {
    if (!valid) return
    resetLoading.value = true
    try {
      const { data } = await userApi.resetPassword(resetTarget.value.id, resetForm.newPassword)
      if (data.code === 200) {
        ElMessage.success(t('users.resetSuccess'))
        resetDialogVisible.value = false
        loadAccounts()
      } else {
        ElMessage.error(data.message || t('users.loadFailed'))
      }
    } catch (e: any) {
      ElMessage.error(e.response?.data?.message || t('users.loadFailed'))
    } finally {
      resetLoading.value = false
    }
  })
}

// ---------- 删除账号 ----------
async function handleDelete(row: any) {
  try {
    await ElMessageBox.confirm(
      `${t('users.deleteConfirm')}（${row.name} · ${row.email}）`,
      t('common.confirm'),
      {
        confirmButtonText: t('users.delete'),
        cancelButtonText: t('users.addDialog.cancel'),
        type: 'warning',
      }
    )
  } catch {
    return // 用户取消
  }
  try {
    const { data } = await userApi.remove(row.id)
    if (data.code === 200) {
      ElMessage.success(t('users.deleteSuccess'))
      // 删的是当前页最后一条且不在第1页时，回退一页再拉取
      if (accounts.value.length === 1 && currentPage.value > 1) {
        currentPage.value -= 1
      }
      loadAccounts()
    } else {
      ElMessage.error(data.message || t('users.loadFailed'))
    }
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || t('users.loadFailed'))
  }
}

// 角色展示文案
function roleLabel(code: string): string {
  if (code === 'admin') return t('users.roleAdmin')
  if (code === 'viewer') return t('users.roleViewer')
  return code
}

onMounted(loadAccounts)
</script>

<template>
  <div class="users-container">
    <!-- 顶部标题栏 -->
    <div class="page-header-premium">
      <div class="header-left">
        <el-icon class="header-icon"><UserFilled /></el-icon>
        <div class="header-text">
          <h1>{{ t('users.title') }}</h1>
        </div>
      </div>
      <div class="header-right">
        <el-button type="primary" :icon="Plus" @click="openCreateDialog" plain round>
          {{ t('users.addAccount') }}
        </el-button>
      </div>
    </div>

    <!-- 数据概览卡片 -->
    <el-row :gutter="20" class="stats-row">
      <el-col :span="8">
        <div class="stat-card">
          <div class="stat-icon-wrapper blue">
            <el-icon><UserFilled /></el-icon>
          </div>
          <div class="stat-info">
            <span class="stat-label">{{ t('users.totalAccounts') }}</span>
            <span class="stat-value">{{ stats.total }}</span>
          </div>
        </div>
      </el-col>
      <el-col :span="8">
        <div class="stat-card">
          <div class="stat-icon-wrapper orange">
            <el-icon><Lock /></el-icon>
          </div>
          <div class="stat-info">
            <span class="stat-label">{{ t('users.adminCount') }}</span>
            <span class="stat-value">{{ stats.admins }}</span>
          </div>
        </div>
      </el-col>
      <el-col :span="8">
        <div class="stat-card">
          <div class="stat-icon-wrapper green">
            <el-icon><User /></el-icon>
          </div>
          <div class="stat-info">
            <span class="stat-label">{{ t('users.memberCount') }}</span>
            <span class="stat-value">{{ stats.members }}</span>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 主体内容卡片 -->
    <el-card class="main-content-card" shadow="never">
      <!-- 筛选工具栏 -->
      <div class="filter-toolbar">
        <div class="toolbar-left">
          <el-input
            v-model="searchKeyword"
            :placeholder="t('users.searchPlaceholder')"
            class="premium-search"
            clearable
            @keyup.enter="handleSearch"
            @clear="handleSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
            <template #append>
              <el-button @click="handleSearch" type="primary">{{ t('users.searchBtn') }}</el-button>
            </template>
          </el-input>
        </div>
      </div>

      <!-- 表格区域 -->
      <div class="table-wrapper-premium">
        <el-table
          :data="accounts"
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
          <el-table-column prop="name" :label="t('users.name')" min-width="140">
            <template #default="{ row }">
              <div class="user-cell">
                <span class="avatar-mini">{{ (row.name || '?').charAt(0).toUpperCase() }}</span>
                <span class="user-name-text">{{ row.name }}</span>
                <el-tag v-if="row.id === authStore.user?.id" size="small" type="info" effect="plain" class="self-tag">
                  {{ t('users.selfTag') }}
                </el-tag>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="email" :label="t('users.email')" min-width="220">
            <template #default="{ row }">
              <span class="email-text">{{ row.email }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="roles" :label="t('users.roles')" min-width="140" align="center">
            <template #default="{ row }">
              <template v-if="(row.roles || []).length">
                <el-tag
                  v-for="code in row.roles"
                  :key="code"
                  size="small"
                  :type="code === 'admin' ? 'danger' : 'success'"
                  effect="plain"
                  class="role-tag"
                >
                  {{ roleLabel(code) }}
                </el-tag>
              </template>
              <span v-else class="role-none">{{ t('users.roleNone') }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('users.passwordStatus')" min-width="110" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.has_password" size="small" type="success" effect="plain">
                {{ t('users.passwordSet') }}
              </el-tag>
              <el-tag v-else size="small" type="warning" effect="plain">
                {{ t('users.passwordNone') }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('users.actions')" min-width="200" align="center" fixed="right">
            <template #default="{ row }">
              <el-button
                size="small"
                :icon="Lock"
                plain
                round
                @click="openResetDialog(row)"
              >
                {{ t('users.resetPassword') }}
              </el-button>
              <!-- admin 角色账号禁止删除：不渲染删除按钮（后端亦无此限制，前端为唯一拦截层之一，另有后端禁删当前账号守卫） -->
              <el-button
                size="small"
                :icon="Delete"
                type="danger"
                plain
                round
                :disabled="(row.roles || []).includes('admin')"
                @click="handleDelete(row)"
              >
                {{ t('users.delete') }}
              </el-button>
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
          :total="stats.total"
          @current-change="handlePageChange"
          @size-change="handleSizeChange"
          background
        />
      </div>
    </el-card>

    <!-- 新增账号对话框 -->
    <el-dialog
      v-model="createDialogVisible"
      :title="t('users.addDialog.title')"
      width="440px"
      destroy-on-close
    >
      <el-form
        ref="createFormRef"
        :model="createForm"
        :rules="createRules"
        label-position="top"
        class="dialog-form"
      >
        <el-form-item :label="t('users.addDialog.name')" prop="name">
          <el-input v-model="createForm.name" :placeholder="t('users.nameRequired')" clearable />
        </el-form-item>
        <el-form-item :label="t('users.addDialog.email')" prop="email">
          <el-input v-model="createForm.email" :placeholder="t('users.emailRequired')" clearable />
        </el-form-item>
        <el-form-item :label="t('users.addDialog.password')" prop="password">
          <el-input
            v-model="createForm.password"
            type="password"
            :placeholder="t('users.passwordRequired')"
            show-password
            clearable
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button round @click="createDialogVisible = false">{{ t('users.addDialog.cancel') }}</el-button>
        <el-button type="primary" round :loading="createLoading" @click="handleCreate">
          {{ t('users.addDialog.submit') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 重置密码对话框 -->
    <el-dialog
      v-model="resetDialogVisible"
      :title="t('users.resetDialog.title')"
      width="440px"
      destroy-on-close
    >
      <p class="reset-target">
        {{ resetTarget?.name }} · {{ resetTarget?.email }}
      </p>
      <p class="reset-desc">{{ t('users.resetDialog.desc') }}</p>
      <el-form
        ref="resetFormRef"
        :model="resetForm"
        :rules="resetRules"
        label-position="top"
        class="dialog-form"
        @submit.prevent
      >
        <el-form-item :label="t('users.resetDialog.newPassword')" prop="newPassword">
          <el-input
            v-model="resetForm.newPassword"
            type="password"
            :placeholder="t('users.passwordRequired')"
            show-password
            clearable
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button round @click="resetDialogVisible = false">{{ t('users.resetDialog.cancel') }}</el-button>
        <el-button type="primary" round :loading="resetLoading" @click="handleReset">
          {{ t('users.resetDialog.submit') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.users-container {
  padding: 24px;
  background-color: #f8fafc;
  min-height: 100vh;
}

/* 顶部标题栏（与库存页同款） */
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

/* 统计卡片 */
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

.premium-search {
  width: 320px;
}

:deep(.premium-search .el-input__wrapper) {
  height: 32px !important;
  box-sizing: border-box;
}

:deep(.premium-search .el-input__wrapper) {
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

/* 表格 */
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

/* 用户单元格：迷你头像 + 姓名 */
.user-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.avatar-mini {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  user-select: none;
}

.user-name-text {
  font-weight: 600;
  color: #334155;
  font-size: 14px;
}

.self-tag {
  margin-left: 6px;
}

.email-text {
  color: #475569;
  font-size: 13px;
}

.role-tag {
  margin-right: 4px;
}

.role-none {
  color: #94a3b8;
  font-size: 12px;
}

/* 对话框 */
.dialog-form {
  padding: 0 8px;
}

.reset-target {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
}

.reset-desc {
  margin: 0 0 16px;
  font-size: 13px;
  color: #64748b;
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
