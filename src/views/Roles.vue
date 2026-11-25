<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { UserFilled, Plus, Edit, Delete } from '@element-plus/icons-vue'
import { rbacApi } from '../api'
import { i18n } from '../i18n'

const t = i18n.t
const router = useRouter()

const loading = ref(false)
const roles = ref<any[]>([])

// 服务端分页（后端 /rbac/roles 返回 list+total）
const currentPage = ref(1)
const pageSize = ref(20)
const total = ref(0)

interface RoleRow {
  id: number
  name: string
  code: string
  description?: string
  user_count?: number
  permissions: Array<{ id: number; name: string; code: string; type: string }>
}

async function loadRoles() {
  loading.value = true
  try {
    const { data } = await rbacApi.roles({
      pageNo: currentPage.value,
      pageSize: pageSize.value,
    })
    if (data.code === 200) {
      roles.value = data.data?.list || []
      total.value = data.data?.total || 0
    } else {
      ElMessage.error(data.message || t('roles.loadFailed'))
    }
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || t('roles.loadFailed'))
  } finally {
    loading.value = false
  }
}

function handlePageChange(val: number) {
  currentPage.value = val
  loadRoles()
}

function handleSizeChange(val: number) {
  pageSize.value = val
  currentPage.value = 1
  loadRoles()
}

// ---------- 绑定账号弹窗 ----------
const usersDialogVisible = ref(false)
const usersLoading = ref(false)
const usersDialogRole = ref<RoleRow | null>(null)
// 绑定该角色的账号列表（后端白名单字段：id/name/email/roles）
const boundAccounts = ref<any[]>([])

async function openUsersDialog(row: RoleRow) {
  usersDialogRole.value = row
  boundAccounts.value = []
  usersDialogVisible.value = true
  usersLoading.value = true
  try {
    const { data } = await rbacApi.roleUsers(row.id)
    if (data.code === 200) {
      boundAccounts.value = data.data?.users || []
    } else {
      ElMessage.error(data.message || t('roles.loadFailed'))
    }
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || t('roles.loadFailed'))
  } finally {
    usersLoading.value = false
  }
}

// 点击角色名称：跳转权限管理页并选中该角色（传 roleCode）
function goPermissions(row: RoleRow) {
  router.push({ path: '/permissions', query: { roleCode: row.code } })
}

// ---------- 新增/编辑角色对话框 ----------
const dialogVisible = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const dialogLoading = ref(false)
const formRef = ref<FormInstance>()
const editingRoleId = ref<number | null>(null)
const form = reactive({
  name: '',
  code: '',
  description: '',
})

const rules = computed<FormRules>(() => ({
  name: [
    { required: true, message: t('roles.nameRequired'), trigger: 'blur' },
    { min: 2, max: 20, message: t('roles.nameRange'), trigger: 'blur' },
  ],
  code: [
    { required: true, message: t('roles.codeRequired'), trigger: 'blur' },
    { pattern: /^[A-Za-z0-9_]{2,30}$/, message: t('roles.codeInvalid'), trigger: 'blur' },
  ],
}))

function openCreateDialog() {
  dialogMode.value = 'create'
  editingRoleId.value = null
  form.name = ''
  form.code = ''
  form.description = ''
  dialogVisible.value = true
}

function openEditDialog(row: RoleRow) {
  if (row.code === 'admin') {
    ElMessage.warning(t('roles.adminForbidden'))
    return
  }
  dialogMode.value = 'edit'
  editingRoleId.value = row.id
  form.name = row.name
  form.code = row.code
  form.description = row.description || ''
  dialogVisible.value = true
}

async function handleSubmit() {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    dialogLoading.value = true
    try {
      if (dialogMode.value === 'create') {
        const { data } = await rbacApi.createRole({
          name: form.name,
          code: form.code,
          description: form.description || undefined,
        })
        if (data.code === 200) {
          ElMessage.success(t('roles.createSuccess'))
          dialogVisible.value = false
          await loadRoles()
        } else {
          ElMessage.error(data.message || t('roles.loadFailed'))
        }
      } else if (editingRoleId.value != null) {
        const { data } = await rbacApi.updateRole(editingRoleId.value, {
          name: form.name,
          code: form.code,
          description: form.description || undefined,
        })
        if (data.code === 200) {
          ElMessage.success(t('roles.updateSuccess'))
          dialogVisible.value = false
          await loadRoles()
        } else {
          ElMessage.error(data.message || t('roles.loadFailed'))
        }
      }
    } catch (e: any) {
      ElMessage.error(e.response?.data?.message || t('roles.loadFailed'))
    } finally {
      dialogLoading.value = false
    }
  })
}

// ---------- 删除角色 ----------
async function handleDelete(row: RoleRow) {
  if (row.code === 'admin') {
    ElMessage.warning(t('roles.adminForbidden'))
    return
  }
  try {
    await ElMessageBox.confirm(
      `${t('roles.deleteConfirm')}（${row.name} · ${row.code}）`,
      t('common.confirm'),
      {
        confirmButtonText: t('roles.delete'),
        cancelButtonText: t('roles.addDialog.cancel'),
        type: 'warning',
      }
    )
  } catch {
    return // 用户取消
  }
  try {
    const { data } = await rbacApi.removeRole(row.id)
    if (data.code === 200) {
      ElMessage.success(t('roles.deleteSuccess'))
      await loadRoles()
    } else {
      ElMessage.error(data.message || t('roles.loadFailed'))
    }
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || t('roles.loadFailed'))
  }
}

onMounted(loadRoles)
</script>

<template>
  <div class="roles-container">
    <!-- 顶部标题栏 -->
    <div class="page-header-premium">
      <div class="header-left">
        <el-icon class="header-icon"><UserFilled /></el-icon>
        <div class="header-text">
          <h1>{{ t('roles.title') }}</h1>
          <p>{{ t('roles.subtitle') }}</p>
        </div>
      </div>
      <div class="header-right">
        <el-button type="primary" :icon="Plus" @click="openCreateDialog" plain round>
          {{ t('roles.addRole') }}
        </el-button>
      </div>
    </div>

    <!-- 主体内容卡片 -->
    <el-card class="main-content-card" shadow="never">
      <!-- 表格区域 -->
      <div class="table-wrapper-premium">
        <el-table
          :data="roles"
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
          <el-table-column prop="name" :label="t('roles.roleName')" min-width="160">
            <template #default="{ row }">
              <div class="role-cell">
                <!-- 点击角色名称：跳权限管理页并选中该角色 -->
                <span
                  class="role-name-text is-link"
                  :title="t('roles.goPermsTip')"
                  @click="goPermissions(row)"
                >{{ row.name }}</span>
                <el-tooltip v-if="row.code === 'admin'" :content="t('roles.adminBadgeTip')" placement="top">
                  <el-tag size="small" type="danger" effect="dark" class="admin-tag">
                    {{ t('roles.adminTag') }}
                  </el-tag>
                </el-tooltip>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="code" :label="t('roles.roleCode')" min-width="140">
            <template #default="{ row }">
              <code class="code-text">{{ row.code }}</code>
            </template>
          </el-table-column>
          <el-table-column prop="description" :label="t('roles.roleDesc')" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="desc-text">{{ row.description || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('roles.boundUsers')" min-width="110" align="center">
            <template #default="{ row }">
              <!-- 点击绑定账号数弹窗查看明细（接口返回 user_count） -->
              <span
                class="bound-count is-link"
                @click="openUsersDialog(row)"
              >{{ row.user_count ?? 0 }}</span>
            </template>
          </el-table-column>
         
          <el-table-column :label="t('roles.actions')" min-width="180" align="center" fixed="right">
            <template #default="{ row }">
              <!-- admin 角色禁止编辑与删除 -->
              <el-button
                size="small"
                :icon="Edit"
                plain
                round
                :disabled="row.code === 'admin'"
                @click="openEditDialog(row)"
              >
                {{ t('roles.edit') }}
              </el-button>
              <el-button
                size="small"
                :icon="Delete"
                type="danger"
                plain
                round
                :disabled="row.code === 'admin'"
                @click="handleDelete(row)"
              >
                {{ t('roles.delete') }}
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
          :total="total"
          @current-change="handlePageChange"
          @size-change="handleSizeChange"
          background
        />
      </div>
    </el-card>

    <!-- 绑定账号弹窗：点击绑定账号数量查看该角色下的账号明细 -->
    <el-dialog
      v-model="usersDialogVisible"
      :title="`${t('roles.usersDialog.title')} · ${usersDialogRole?.name || ''}`"
      width="520px"
      destroy-on-close
    >
      <div v-loading="usersLoading" class="bound-users-body">
        <el-table
          v-if="boundAccounts.length"
          :data="boundAccounts"
          style="width: 100%"
          row-class-name="premium-table-row"
          header-cell-class-name="premium-table-header"
        >
          <el-table-column label="NO." width="70" align="center">
            <template #default="{ $index }">
              <span class="index-badge">{{ $index + 1 }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="name" :label="t('roles.usersDialog.name')" min-width="120">
            <template #default="{ row }">
              <div class="user-cell">
                <span class="avatar-mini">{{ (row.name || '?').charAt(0).toUpperCase() }}</span>
                <span class="user-name-text">{{ row.name }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="email" :label="t('roles.usersDialog.email')" min-width="200">
            <template #default="{ row }">
              <span class="email-text">{{ row.email }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('users.roles')" min-width="140" align="center">
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
                  {{ code }}
                </el-tag>
              </template>
              <span v-else class="role-none">{{ t('users.roleNone') }}</span>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-else-if="!usersLoading" :description="t('roles.usersDialog.empty')" />
      </div>
      <template #footer>
        <el-button round @click="usersDialogVisible = false">{{ t('users.addDialog.cancel') }}</el-button>
      </template>
    </el-dialog>

    <!-- 新增/编辑角色对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? t('roles.addDialog.title') : t('roles.editDialog.title')"
      width="440px"
      destroy-on-close
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        class="dialog-form"
      >
        <el-form-item :label="t('roles.addDialog.name')" prop="name">
          <el-input v-model="form.name" :placeholder="t('roles.nameRequired')" clearable />
        </el-form-item>
        <el-form-item :label="t('roles.addDialog.code')" prop="code">
          <el-input
            v-model="form.code"
            :placeholder="t('roles.addDialog.code')"
            :disabled="dialogMode === 'edit'"
            clearable
          />
        </el-form-item>
        <el-form-item :label="t('roles.addDialog.desc')" prop="description">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="2"
            maxlength="100"
            show-word-limit
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button round @click="dialogVisible = false">{{ t('roles.addDialog.cancel') }}</el-button>
        <el-button type="primary" round :loading="dialogLoading" @click="handleSubmit">
          {{ dialogMode === 'create' ? t('roles.addDialog.submit') : t('roles.editDialog.submit') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.roles-container {
  padding: 24px;
  background-color: #f8fafc;
  min-height: 100vh;
}

/* 顶部标题栏（与账号/权限页同款） */
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

/* 表格（与账号管理页同款：固定高度滚动，分页条贴底） */
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

/* 角色单元格 */
.role-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.role-name-text {
  font-weight: 600;
  color: #334155;
  font-size: 14px;
}

/* 角色名称可点击：蓝色链接样式，hover 加深 + 下划线（点击跳权限管理页选中该角色） */
.role-name-text.is-link {
  color: #3b82f6;
  cursor: pointer;
  border-radius: 6px;
  padding: 1px 4px;
  transition: color 0.15s, background-color 0.15s;
}

.role-name-text.is-link:hover {
  color: #2563eb;
  background-color: #eff6ff;
  text-decoration: underline;
}

.admin-tag {
  cursor: help;
}

.code-text {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  background: #f1f5f9;
  padding: 2px 6px;
  border-radius: 4px;
  color: #334155;
  font-size: 13px;
}

.desc-text {
  color: #475569;
  font-size: 13px;
}

.bound-count,
.perm-count {
  font-weight: 700;
  color: #1e293b;
}

/* 绑定账号数可点击：蓝色链接样式，hover 加深 + 下划线 */
.bound-count.is-link {
  color: #3b82f6;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 6px;
  transition: color 0.15s, background-color 0.15s;
}

.bound-count.is-link:hover {
  color: #2563eb;
  background-color: #eff6ff;
  text-decoration: underline;
}

/* 绑定账号弹窗内账号单元格（与账号管理页同款） */
.bound-users-body {
  min-height: 120px;
}

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

/* 分页（与账号/库存页同款） */
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

/* 对话框 */
.dialog-form {
  padding: 0 8px;
}
</style>
