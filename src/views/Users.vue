<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { UserFilled, Search, Plus, Lock, Delete, Avatar, EditPen, Clock, User } from '@element-plus/icons-vue'
import { userApi, rbacApi } from '../api'
import { useAuthStore } from '../stores/auth'
import { i18n } from '../i18n'

const t = (key: string, vars?: Record<string, string | number>) => {
  let text = i18n.t(key)
  if (vars) {
    Object.entries(vars).forEach(([k, v]) => {
      text = text.replace(`{${k}}`, String(v))
    })
  }
  return text
}
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

/** 是否为 admin 账号（admin 角色账号不支持改姓名/删号） */
function isAdminAccount(row: any): boolean {
  return (row?.roles || []).includes('admin')
}

/**
 * 统一提取后端错误文案。
 * 兼容两种后端：{code,success,message} 与 FastAPI 的 {detail: '...'} / {detail: [{msg}]}
 */
function errorText(data: any, fallbackKey: string): string {
  if (!data) return t(fallbackKey)
  if (typeof data.message === 'string' && data.message) return data.message
  const detail = data.detail
  if (typeof detail === 'string' && detail) return detail
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d: any) => {
        const raw = String(d?.msg || '')
        // 去掉 pydantic 的 "Value error, " 前缀
        return raw.replace(/^Value error,\s*/i, '')
      })
      .filter(Boolean)
    if (msgs.length) return msgs.join('；')
  }
  return t(fallbackKey)
}

// ---------- 修改姓名对话框 ----------
const nameDialogVisible = ref(false)
const nameLoading = ref(false)
const nameFormRef = ref<FormInstance>()
const nameTarget = ref<any>(null)
const nameForm = reactive({ name: '' })

const nameRules = computed<FormRules>(() => ({
  name: [
    { required: true, message: t('users.nameRequired'), trigger: 'blur' },
    { min: 2, max: 20, message: t('users.nameRange'), trigger: 'blur' },
  ],
}))

function openNameDialog(row: any) {
  if (isAdminAccount(row)) {
    ElMessage.warning(t('users.adminProtected'))
    return
  }
  nameTarget.value = row
  nameForm.name = row.name || ''
  nameDialogVisible.value = true
}

async function handleEditName() {
  if (!nameFormRef.value || !nameTarget.value) return
  await nameFormRef.value.validate(async (valid) => {
    if (!valid) return
    const newName = nameForm.name.trim()
    if (newName === (nameTarget.value.name || '')) {
      ElMessage.info(t('users.editNameSame'))
      return
    }
    nameLoading.value = true
    try {
      const { data } = await userApi.updateName(nameTarget.value.id, {
        name: newName,
      })
      if (data.code === 200) {
        ElMessage.success(t('users.editNameSuccess'))
        nameDialogVisible.value = false
        // 改的是自己：同步本地登录态与顶部展示的姓名
        if (nameTarget.value.id === authStore.user?.id && authStore.user) {
          const updated = { ...authStore.user, name: newName }
          authStore.user = updated
          localStorage.setItem('ALLLINK_USER', JSON.stringify(updated))
        }
        loadAccounts()
      } else {
        ElMessage.error(errorText(data, 'users.updateNameFailed'))
      }
    } catch (e: any) {
      ElMessage.error(errorText(e.response?.data, 'users.updateNameFailed'))
    } finally {
      nameLoading.value = false
    }
  })
}

// ---------- 姓名修改日志（点击姓名打开抽屉查看） ----------
const logDrawerVisible = ref(false)
const logLoading = ref(false)
const logTarget = ref<any>(null)
const nameLogs = ref<any[]>([])

/**
 * 点击姓名：打开该账号的修改日志抽屉。
 * admin 账号姓名不可修改，也就永远没有修改记录，直接提示不走接口。
 */
async function openLogDrawer(row: any) {
  if (isAdminAccount(row)) {
    ElMessage.warning(t('users.adminProtected'))
    return
  }
  logTarget.value = row
  nameLogs.value = []
  logDrawerVisible.value = true
  logLoading.value = true
  try {
    const { data } = await userApi.nameLogs(row.id)
    if (data.code === 200) {
      nameLogs.value = data.data?.list || []
    } else {
      ElMessage.error(errorText(data, 'users.loadLogsFailed'))
    }
  } catch (e: any) {
    ElMessage.error(errorText(e.response?.data, 'users.loadLogsFailed'))
  } finally {
    logLoading.value = false
  }
}

/** 时间格式化：2026-11-27 11:41:30（兼容 "2026-11-27 11:41:30" 与 ISO 字符串） */
function formatTime(val: string): string {
  if (!val) return '-'
  // 后端返回 "YYYY-MM-DD HH:mm:ss"，Safari/iOS 不认这种带空格的格式，统一换成 T
  const normalized = val.includes('T') ? val : val.replace(' ', 'T')
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return val
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// ---------- 分配角色对话框 ----------
const roleDialogVisible = ref(false)
const roleLoading = ref(false)
const roleTarget = ref<any>(null)
// 全部可分配角色列表（id/name/code/description）
const roleOptions = ref<any[]>([])
// 列表加载中（首次打开拉一次全量，之后复用缓存）
const roleOptionsLoading = ref(false)
// 角色搜索关键词（角色多了以后靠它快速定位，不用滚）
const roleKeyword = ref('')
// 勾选的角色编码集合
const checkedRoleCodes = ref<string[]>([])

/** 按关键词过滤后的角色列表（匹配名称 / 编码 / 描述） */
const filteredRoleOptions = computed(() => {
  const kw = roleKeyword.value.trim().toLowerCase()
  if (!kw) return roleOptions.value
  return roleOptions.value.filter((r: any) =>
    [r.name, r.code, r.description].some(v => String(v || '').toLowerCase().includes(kw))
  )
})

/** 已勾选数量（提交条数提示，让用户明确这一存会覆盖成什么） */
const checkedCount = computed(() => checkedRoleCodes.value.length)

/** 目标账号当前已有的角色（过滤掉 admin，用于「当前角色」回显） */
const targetCurrentRoles = computed(() =>
  (roleTarget.value?.roles || []).filter((c: string) => c !== 'admin')
)

/** 目标账号是否本来就是 admin（提交时后端会保留，前端给出说明避免误解） */
const targetIsAdminAccount = computed(() => (roleTarget.value?.roles || []).includes('admin'))

async function loadRoleOptions() {
  // 已有缓存直接复用，避免每次打开弹窗都请求
  if (roleOptions.value.length) return
  roleOptionsLoading.value = true
  try {
    // 接口 pageSize 上限 500。角色超过一页时继续翻页拉全量，避免「角色多了勾不到」
    const size = 500
    const all: any[] = []
    let pageNo = 1
    // 最多翻 10 页（5000 个角色）兜底，防后端异常导致死循环
    for (; pageNo <= 10; pageNo++) {
      const { data } = await rbacApi.roles({ pageNo, pageSize: size })
      if (data.code !== 200) {
        ElMessage.error(data.message || t('roles.loadFailed'))
        break
      }
      const list = data.data?.list || []
      all.push(...list)
      const totalCount = Number(data.data?.total || 0)
      if (list.length < size || all.length >= totalCount) break
    }
    // 不提供 admin 角色的分配入口：列表中排除（已有 admin 的账号提交时后端保留，不会误摘）
    roleOptions.value = all.filter((r: any) => r.code !== 'admin')
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || t('roles.loadFailed'))
  } finally {
    roleOptionsLoading.value = false
  }
}

async function openRoleDialog(row: any) {
  roleTarget.value = row
  checkedRoleCodes.value = [...(row.roles || [])]
  roleKeyword.value = ''
  roleDialogVisible.value = true
  await loadRoleOptions()
}

/** 全选当前（过滤后的）列表：只加不减，不会误清掉已勾选项 */
function selectAllFiltered() {
  const codes = filteredRoleOptions.value.map((r: any) => r.code).filter((c: string) => c !== 'admin')
  checkedRoleCodes.value = [...new Set([...checkedRoleCodes.value, ...codes])]
}

/** 清空勾选（admin 角色由后端保留，不受影响） */
function clearChecked() {
  checkedRoleCodes.value = []
}

async function handleAssignRoles() {
  if (!roleTarget.value) return
  roleLoading.value = true
  try {
    // 覆盖式分配：勾选的角色码全量提交。
    // admin 不在可勾选列表中：目标账号原本已有 admin 角色时静默保留（防止覆盖式保存误摘/自降权锁死系统）
    const targetHadAdmin = (roleTarget.value.roles || []).includes('admin')
    const submitCodes = targetHadAdmin
      ? [...new Set([...checkedRoleCodes.value.filter(c => c !== 'admin'), 'admin'])]
      : checkedRoleCodes.value.filter(c => c !== 'admin')
    const { data } = await rbacApi.assignUserRoles({
      user_id: roleTarget.value.id,
      role_codes: submitCodes,
    })
    if (data.code === 200) {
      ElMessage.success(t('users.assignRoleSuccess'))
      roleDialogVisible.value = false
      // 若改的是当前登录账号：同步刷新本地登录态（roles/permissions + 菜单/Tab 权限即时生效）
      if (roleTarget.value.id === authStore.user?.id) {
        await authStore.refreshLoginState()
      }
      await loadAccounts()
    } else {
      ElMessage.error(data.message || t('users.loadFailed'))
    }
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || t('users.loadFailed'))
  } finally {
    roleLoading.value = false
  }
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
        <el-button
          v-if="authStore.hasPerm('action:users:create')"
          type="primary"
          :icon="Plus"
          @click="openCreateDialog"
          plain
          round
        >
          {{ t('users.addAccount') }}
        </el-button>
      </div>
    </div>

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
          <el-table-column prop="name" :label="t('users.name')" min-width="190">
            <template #default="{ row }">
              <div class="user-cell">
                <span class="avatar-mini">{{ (row.name || '?').charAt(0).toUpperCase() }}</span>
                <!-- 姓名可点击：点击查看该账号的姓名修改日志（admin 账号不可改姓名，无记录，禁用） -->
                <el-tooltip
                  :content="isAdminAccount(row) ? t('users.adminProtected') : t('users.logClickTip')"
                  placement="top"
                >
                  <span
                    :class="['user-name-text', 'clickable', { disabled: isAdminAccount(row) }]"
                    @click="openLogDrawer(row)"
                  >
                    {{ row.name }}
                  </span>
                </el-tooltip>
                <el-tag v-if="row.id === authStore.user?.id" size="small" type="info" effect="plain" class="self-tag">
                  {{ t('users.selfTag') }}
                </el-tag>
                <!-- 姓名内联编辑：admin 账号不支持修改，按钮禁用并给出提示 -->
                <el-tooltip
                  :content="isAdminAccount(row) ? t('users.adminProtected') : t('users.editName')"
                  placement="top"
                >
                  <el-button
                    class="name-edit-btn"
                    size="small"
                    link
                    :icon="EditPen"
                    :disabled="isAdminAccount(row)"
                    @click="openNameDialog(row)"
                  />
                </el-tooltip>
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
          <el-table-column :label="t('users.actions')" min-width="400" align="center" fixed="right">
            <template #default="{ row }">
              <el-button
                size="small"
                :icon="Avatar"
                type="primary"
                plain
                round
                :disabled="isAdminAccount(row)"
                @click="openRoleDialog(row)"
              >
                {{ t('users.assignRole') }}
              </el-button>
              <!-- admin 账号不支持改姓名：按钮不渲染（后端同样拦截） -->
              <el-button
                v-if="!isAdminAccount(row)"
                size="small"
                :icon="EditPen"
                plain
                round
                @click="openNameDialog(row)"
              >
                {{ t('users.editName') }}
              </el-button>
              <el-button
                v-if="authStore.hasPerm('action:users:reset_password')"
                size="small"
                :icon="Lock"
                plain
                round
                @click="openResetDialog(row)"
              >
                {{ t('users.resetPassword') }}
              </el-button>
              <!-- admin 角色账号禁止删除：不渲染删除按钮（后端亦有禁删 admin 守卫） -->
              <el-button
                v-if="authStore.hasPerm('action:users:delete')"
                size="small"
                :icon="Delete"
                type="danger"
                plain
                round
                :disabled="isAdminAccount(row)"
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

    <!-- 分配角色对话框 -->
    <el-dialog
      v-model="roleDialogVisible"
      :title="t('users.assignRoleDialog.title')"
      width="520px"
      align-center
      destroy-on-close
    >
      <div class="role-dialog-body">
        <!-- 目标账号信息 -->
        <div class="role-target-box">
          <span class="role-target-avatar">{{ (roleTarget?.name || '?').charAt(0).toUpperCase() }}</span>
          <div class="role-target-text">
            <p class="role-target-name">{{ roleTarget?.name }}</p>
            <p class="role-target-email">{{ roleTarget?.email }}</p>
          </div>
          <el-tag size="small" type="info" effect="plain">
            {{ t('users.assignRoleDialog.currentCount', { n: targetCurrentRoles.length }) }}
          </el-tag>
        </div>
        <p class="reset-desc">{{ t('users.assignRoleDialog.desc') }}</p>
        <el-alert
          v-if="targetIsAdminAccount"
          type="warning"
          :closable="false"
          show-icon
          class="role-admin-alert"
          :title="t('users.assignRoleDialog.adminKeep')"
        />

        <!-- 搜索 + 批量操作：角色多了靠搜索定位，不用一路滚 -->
        <div class="role-toolbar">
          <el-input
            v-model="roleKeyword"
            :placeholder="t('users.assignRoleDialog.searchPlaceholder')"
            clearable
            size="default"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-button size="default" plain round :disabled="!filteredRoleOptions.length" @click="selectAllFiltered">
            {{ t('users.assignRoleDialog.selectAll') }}
          </el-button>
          <el-button size="default" plain round :disabled="!checkedCount" @click="clearChecked">
            {{ t('users.assignRoleDialog.clearAll') }}
          </el-button>
        </div>

        <!-- 角色列表：固定最大高度 + 内部滚动，角色再多也不会把弹窗撑出屏幕 -->
        <div v-loading="roleOptionsLoading" class="role-scroll">
          <el-checkbox-group
            v-if="filteredRoleOptions.length"
            v-model="checkedRoleCodes"
            class="role-checkbox-group"
          >
            <div
              v-for="role in filteredRoleOptions"
              :key="role.code"
              class="role-option"
              :class="{ checked: checkedRoleCodes.includes(role.code) }"
            >
              <el-checkbox :value="role.code">
                <span class="role-option-name">{{ role.name }}</span>
                <span class="role-option-code">{{ role.code }}</span>
              </el-checkbox>
              <p v-if="role.description" class="role-option-desc">{{ role.description }}</p>
            </div>
          </el-checkbox-group>
          <el-empty
            v-else-if="!roleOptionsLoading"
            :description="roleKeyword ? t('users.assignRoleDialog.noMatch') : t('users.assignRoleDialog.empty')"
            :image-size="60"
          />
        </div>
      </div>
      <template #footer>
        <div class="role-dialog-footer">
          <span class="role-footer-hint">
            {{ t('users.assignRoleDialog.checkedHint', { n: checkedCount }) }}
          </span>
          <div class="role-footer-actions">
            <el-button round @click="roleDialogVisible = false">{{ t('users.assignRoleDialog.cancel') }}</el-button>
            <el-button type="primary" round :loading="roleLoading" @click="handleAssignRoles">
              {{ t('users.assignRoleDialog.submit') }}
            </el-button>
          </div>
        </div>
      </template>
    </el-dialog>

    <!-- 修改姓名对话框 -->
    <el-dialog
      v-model="nameDialogVisible"
      :title="t('users.editNameDialog.title')"
      width="440px"
      destroy-on-close
    >
      <p class="reset-target">{{ nameTarget?.email }}</p>
      <p class="reset-desc">{{ t('users.nameRange') }}</p>
      <el-form
        ref="nameFormRef"
        :model="nameForm"
        :rules="nameRules"
        label-position="top"
        class="dialog-form"
        @submit.prevent
      >
        <el-form-item :label="t('users.editNameDialog.current')">
          <el-input :model-value="nameTarget?.name || ''" disabled />
        </el-form-item>
        <el-form-item :label="t('users.editNameDialog.newName')" prop="name">
          <el-input
            v-model="nameForm.name"
            :placeholder="t('users.nameRequired')"
            maxlength="20"
            show-word-limit
            clearable
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button round @click="nameDialogVisible = false">{{ t('users.editNameDialog.cancel') }}</el-button>
        <el-button type="primary" round :loading="nameLoading" @click="handleEditName">
          {{ t('users.editNameDialog.submit') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 姓名修改日志抽屉（点击姓名打开） -->
    <el-drawer
      v-model="logDrawerVisible"
      :title="t('users.logDialog.title')"
      size="460px"
      destroy-on-close
    >
      <div class="log-header">
        <div class="log-target">
          <span class="log-avatar">{{ (logTarget?.name || '?').charAt(0).toUpperCase() }}</span>
          <div>
            <p class="reset-target">{{ logTarget?.name }}</p>
            <p class="log-email">{{ logTarget?.email }}</p>
          </div>
        </div>
        <el-tag size="small" type="info" effect="plain">
          {{ t('users.logCount', { n: nameLogs.length }) }}
        </el-tag>
      </div>

      <el-timeline v-if="nameLogs.length" v-loading="logLoading" class="log-timeline">
        <el-timeline-item
          v-for="log in nameLogs"
          :key="log.id"
          :timestamp="formatTime(log.created_at)"
          placement="top"
          type="primary"
          hide-timestamp
        >
          <div class="log-item">
            <div class="log-item-head">
              <el-icon class="log-clock"><Clock /></el-icon>
              <span class="log-time">{{ formatTime(log.created_at) }}</span>
              <span class="log-operator">
                <el-icon><User /></el-icon>
                {{ log.operator_name || log.operator || '-' }}
              </span>
            </div>
            <div class="log-change">
              <span class="log-old">{{ log.old_name || '-' }}</span>
              <span class="log-arrow">→</span>
              <span class="log-new">{{ log.new_name || '-' }}</span>
            </div>
          </div>
        </el-timeline-item>
      </el-timeline>
      <el-empty v-else :description="t('users.logDialog.empty')" :image-size="70" v-loading="logLoading" />

      <template #footer>
        <el-button round @click="logDrawerVisible = false">{{ t('common.close') }}</el-button>
      </template>
    </el-drawer>
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

/* 姓名可点击查看修改日志：hover 变蓝 + 虚线下划线暗示可点 */
.user-name-text.clickable {
  cursor: pointer;
  border-bottom: 1px dashed transparent;
  transition: color 0.15s, border-color 0.15s;
}

.user-name-text.clickable:hover {
  color: #3b82f6;
  border-bottom-color: #93c5fd;
}

/* admin 账号不可查看/修改姓名：保持普通文本外观 */
.user-name-text.clickable.disabled {
  cursor: not-allowed;
  color: #334155;
  border-bottom-color: transparent;
}

.self-tag {
  margin-left: 6px;
}

/* 姓名内联编辑按钮：默认淡显，行悬停时强调 */
.name-edit-btn {
  margin-left: 2px;
  color: #94a3b8;
  opacity: 0.65;
  transition: opacity 0.2s, color 0.2s;
}

:deep(.premium-table-row:hover) .name-edit-btn:not(.is-disabled) {
  opacity: 1;
  color: #3b82f6;
}

.name-edit-btn.is-disabled {
  opacity: 0.3;
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
.reset-targetBox {
  max-height: 500px;
  overflow-y: auto;
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

/* ---------- 分配角色弹窗：角色再多也不撑爆 ---------- */
.role-dialog-body {
  display: flex;
  flex-direction: column;
  /* 与下方列表最大高度联动，保证弹窗整体不超过视口 */
  min-height: 0;
}

/* 目标账号信息条 */
.role-target-box {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  margin-bottom: 12px;
  background: #f8fafc;
  border: 1px solid #f1f5f9;
  border-radius: 12px;
}

.role-target-avatar {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  user-select: none;
}

.role-target-text {
  min-width: 0;
  flex: 1;
}

.role-target-name {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-target-email {
  margin: 2px 0 0;
  font-size: 12px;
  color: #94a3b8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-admin-alert {
  margin-bottom: 12px;
}

/* 搜索 + 全选/清空 */
.role-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.role-toolbar .el-input {
  flex: 1;
}

/* 列表滚动区：固定上限高度，超出内部滚动（不是整页/整弹窗滚动） */
.role-scroll {
  max-height: 320px;
  min-height: 120px;
  overflow-y: auto;
  padding-right: 4px;
  border: 1px solid #f1f5f9;
  border-radius: 12px;
  padding: 8px;
  background: #fff;
}

/* 细滚动条 */
.role-scroll::-webkit-scrollbar {
  width: 6px;
}

.role-scroll::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}

.role-scroll::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

/* 分配角色对话框：角色选项卡片 */
.role-checkbox-group {
  display: block;
  width: 100%;
}

.role-option {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 0 12px 10px;
  margin-bottom: 8px;
  transition: border-color 0.2s, background-color 0.2s;
}

.role-option:last-child {
  margin-bottom: 0;
}

.role-option:hover {
  border-color: #93c5fd;
  background-color: #f8fafc;
}

/* 已选中：高亮边框，扫一眼就知道选了哪些 */
.role-option.checked {
  border-color: #3b82f6;
  background-color: #eff6ff;
}

.role-option-name {
  font-weight: 600;
  color: #334155;
  font-size: 14px;
}

.role-option-code {
  margin-left: 8px;
  font-size: 11px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  color: #94a3b8;
}

.role-option-desc {
  margin: 4px 0 4px 24px;
  font-size: 12px;
  color: #94a3b8;
  /* 描述超长时最多两行截断，避免单条卡片过高 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 底部：左侧已选数量提示，右侧按钮 */
.role-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.role-footer-hint {
  font-size: 12px;
  color: #64748b;
}

.role-footer-actions {
  display: flex;
  gap: 8px;
}

/* ---------- 姓名修改日志对话框 ---------- */
.log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  margin-bottom: 16px;
  background: #f8fafc;
  border: 1px solid #f1f5f9;
  border-radius: 12px;
}

.log-target {
  display: flex;
  align-items: center;
  gap: 12px;
}

.log-avatar {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.log-email {
  margin: 2px 0 0;
  font-size: 12px;
  color: #94a3b8;
}

.log-timeline {
  max-height: 420px;
  overflow-y: auto;
  padding: 4px 4px 0;
}

:deep(.log-timeline .el-timeline-item__tail) {
  border-left-color: #e2e8f0;
}

:deep(.log-timeline .el-timeline-item__node) {
  background-color: #3b82f6;
}

.log-item {
  background: #fff;
  border: 1px solid #f1f5f9;
  border-radius: 10px;
  padding: 10px 14px;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.03);
}

.log-item-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 12px;
  color: #64748b;
}

.log-clock,
.log-operator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.log-operator {
  margin-left: auto;
  color: #475569;
  font-weight: 500;
  gap: 4px;
}

.log-change {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  font-size: 14px;
}

.log-old {
  color: #94a3b8;
  text-decoration: line-through;
}

.log-arrow {
  color: #cbd5e1;
  font-size: 13px;
}

.log-new {
  color: #1e293b;
  font-weight: 600;
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
