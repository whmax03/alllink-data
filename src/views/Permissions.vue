<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Key, User, Lock, Platform, Monitor, Folder, Checked } from '@element-plus/icons-vue'
import { rbacApi } from '../api'
import { i18n } from '../i18n'

const t = i18n.t

const loading = ref(false)
const saving = ref(false)

interface PermissionItem {
  id: number
  name: string
  code: string
  type: string
  description?: string
}

interface RoleItem {
  id: number
  name: string
  code: string
  description?: string
  permissions: Array<{ id: number; name: string; code: string; type: string }>
}

const roles = ref<RoleItem[]>([])
const permissions = ref<PermissionItem[]>([])
const selectedRoleCode = ref('')

/** 界面上可见并可配置的权限类型（三类分组） */
const VISIBLE_TYPES = ['page', 'tab', 'platform'] as const

// 当前选中角色的勾选状态（本地编辑副本）
const checkedCodes = ref<Set<string>>(new Set())
// 加载时该角色已有的权限码（用于 dirty 判断与保存时保留界面外权限）
const roleInitialCodes = ref<string[]>([])

// 按类型分组（顺序即展示顺序：页面 → Tab → 平台）
const pagePerms = computed(() => permissions.value.filter(p => p.type === 'page'))
const tabPerms = computed(() => permissions.value.filter(p => p.type === 'tab'))
const platformPerms = computed(() => permissions.value.filter(p => p.type === 'platform'))

const selectedRole = computed(() =>
  roles.value.find(r => r.code === selectedRoleCode.value) || null
)

// 统计卡
const stats = computed(() => ({
  roles: roles.value.length,
  perms: permissions.value.length,
  platforms: platformPerms.value.length,
}))

// 是否有未保存修改
const dirty = computed(() => {
  const current = [...checkedCodes.value].sort().join('|')
  const initial = [...roleInitialCodes.value].sort().join('|')
  return current !== initial
})

// 三组权限的勾选数（组标题上展示）
function groupCount(list: PermissionItem[]): string {
  const checked = list.filter(p => checkedCodes.value.has(p.code)).length
  return `${checked}/${list.length}`
}

async function loadRoles(keepSelection = true) {
  const { data } = await rbacApi.roles()
  if (data.code === 200) {
    roles.value = data.data || []
    // 保持当前选中；首次进入默认选第一个角色
    if (keepSelection && selectedRoleCode.value && roles.value.some(r => r.code === selectedRoleCode.value)) {
      applyRoleSelection(selectedRoleCode.value)
    } else if (roles.value.length > 0) {
      selectedRoleCode.value = roles.value[0].code
      applyRoleSelection(selectedRoleCode.value)
    } else {
      selectedRoleCode.value = ''
      checkedCodes.value = new Set()
      roleInitialCodes.value = []
    }
  } else {
    ElMessage.error(data.message || t('perms.loadFailed'))
  }
}

async function loadPermissions() {
  const { data } = await rbacApi.permissions()
  if (data.code === 200) {
    permissions.value = data.data || []
  } else {
    ElMessage.error(data.message || t('perms.loadFailed'))
  }
}

// 选中角色变化：初始化勾选状态（未保存的修改不保留，直接按角色现有权限展示）
function applyRoleSelection(code: string) {
  const role = roles.value.find(r => r.code === code)
  const codes = (role?.permissions || []).map(p => p.code)
  roleInitialCodes.value = codes
  checkedCodes.value = new Set(codes)
}

function handleRoleChange(code: string) {
  selectedRoleCode.value = code
  applyRoleSelection(code)
}

function togglePerm(code: string, checked: boolean) {
  if (checked) {
    checkedCodes.value.add(code)
  } else {
    checkedCodes.value.delete(code)
  }
  // 触发 Set 响应式更新（替换引用）
  checkedCodes.value = new Set(checkedCodes.value)
}

function toggleGroup(list: PermissionItem[], selectAll: boolean) {
  for (const p of list) {
    if (selectAll) checkedCodes.value.add(p.code)
    else checkedCodes.value.delete(p.code)
  }
  checkedCodes.value = new Set(checkedCodes.value)
}

function isGroupAllChecked(list: PermissionItem[]): boolean {
  return list.length > 0 && list.every(p => checkedCodes.value.has(p.code))
}

async function handleSave() {
  if (!selectedRole.value) return
  saving.value = true
  try {
    // 提交的权限 = 界面三类勾选 + 该角色已有但不在界面上的权限（如 data:import/export），
    // 避免覆盖式保存悄悄移除界面上未展示的权限类型
    const preserved = roleInitialCodes.value.filter(code => {
      const perm = permissions.value.find(p => p.code === code)
      return perm ? !VISIBLE_TYPES.includes(perm.type as any) : true
    })
    const merged = [...new Set([...checkedCodes.value, ...preserved])]

    const { data } = await rbacApi.assignPermissions({
      role_code: selectedRole.value.code,
      permission_codes: merged,
    })
    if (data.code === 200) {
      ElMessage.success(t('perms.saved'))
      await loadRoles()
    } else {
      ElMessage.error(data.message || t('perms.saveFailed'))
    }
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || t('perms.saveFailed'))
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  loading.value = true
  try {
    await Promise.all([loadRoles(false), loadPermissions()])
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || t('perms.loadFailed'))
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="perms-container" v-loading="loading">
    <!-- 顶部标题栏 -->
    <div class="page-header-premium">
      <div class="header-left">
        <el-icon class="header-icon"><Key /></el-icon>
        <div class="header-text">
          <h1>{{ t('perms.title') }}</h1>
        </div>
      </div>
      <div class="header-right">
        <el-tag v-if="dirty" type="warning" size="small" effect="plain" class="dirty-tag">
          {{ t('perms.unsavedHint') }}
        </el-tag>
        <el-button
          type="primary"
          :icon="Checked"
          :loading="saving"
          :disabled="!dirty || !selectedRole"
          plain
          round
          @click="handleSave"
        >
          {{ t('perms.save') }}
        </el-button>
      </div>
    </div>

    <!-- 数据概览卡片 -->
    <el-row :gutter="20" class="stats-row">
      <el-col :span="8">
        <div class="stat-card">
          <div class="stat-icon-wrapper blue">
            <el-icon><User /></el-icon>
          </div>
          <div class="stat-info">
            <span class="stat-label">{{ t('perms.roleCount') }}</span>
            <span class="stat-value">{{ stats.roles }}</span>
          </div>
        </div>
      </el-col>
      <el-col :span="8">
        <div class="stat-card">
          <div class="stat-icon-wrapper orange">
            <el-icon><Lock /></el-icon>
          </div>
          <div class="stat-info">
            <span class="stat-label">{{ t('perms.permCount') }}</span>
            <span class="stat-value">{{ stats.perms }}</span>
          </div>
        </div>
      </el-col>
      <el-col :span="8">
        <div class="stat-card">
          <div class="stat-icon-wrapper green">
            <el-icon><Platform /></el-icon>
          </div>
          <div class="stat-info">
            <span class="stat-label">{{ t('perms.platformCount') }}</span>
            <span class="stat-value">{{ stats.platforms }}</span>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 主体内容卡片 -->
    <el-card class="main-content-card" shadow="never">
      <!-- 角色选择器 -->
      <div class="role-selector">
        <span class="role-selector-label">{{ t('perms.selectRole') }}</span>
        <el-radio-group
          v-if="roles.length"
          :model-value="selectedRoleCode"
          @update:model-value="handleRoleChange"
        >
          <el-radio-button
            v-for="role in roles"
            :key="role.code"
            :value="role.code"
          >
            {{ role.name }}
          </el-radio-button>
        </el-radio-group>
        <span v-else class="role-empty">{{ t('perms.noRole') }}</span>
      </div>

      <!-- 角色说明 -->
      <el-alert
        v-if="selectedRole?.code === 'admin'"
        :title="t('perms.adminNote')"
        type="info"
        :closable="false"
        class="role-note"
      />
      <el-alert
        v-else-if="selectedRole?.code === 'viewer'"
        :title="t('perms.viewerNote')"
        type="success"
        :closable="false"
        class="role-note"
      />

      <!-- 权限分组：页面权限 -->
      <div class="perm-section">
        <div class="perm-section-header">
          <el-icon class="section-icon page"><Monitor /></el-icon>
          <div class="section-text">
            <span class="section-title">{{ t('perms.section.page') }}</span>
            <span class="section-count">{{ groupCount(pagePerms) }}</span>
            <span class="section-desc">{{ t('perms.sectionDesc.page') }}</span>
          </div>
          <el-button
            size="small"
            text
            type="primary"
            @click="toggleGroup(pagePerms, !isGroupAllChecked(pagePerms))"
          >
            {{ t('perms.selectAll') }}
          </el-button>
        </div>
        <div v-if="pagePerms.length" class="perm-grid">
          <div
            v-for="perm in pagePerms"
            :key="perm.code"
            class="perm-item"
          >
            <el-checkbox
              :model-value="checkedCodes.has(perm.code)"
              @update:model-value="togglePerm(perm.code, $event as boolean)"
            >
              <span class="perm-name">{{ perm.name }}</span>
              <span class="perm-code">{{ perm.code }}</span>
            </el-checkbox>
          </div>
        </div>
        <div v-else class="perm-empty">-</div>
      </div>

      <!-- 权限分组：Tab 权限 -->
      <div class="perm-section">
        <div class="perm-section-header">
          <el-icon class="section-icon tab"><Folder /></el-icon>
          <div class="section-text">
            <span class="section-title">{{ t('perms.section.tab') }}</span>
            <span class="section-count">{{ groupCount(tabPerms) }}</span>
            <span class="section-desc">{{ t('perms.sectionDesc.tab') }}</span>
          </div>
          <el-button
            size="small"
            text
            type="primary"
            @click="toggleGroup(tabPerms, !isGroupAllChecked(tabPerms))"
          >
            {{ t('perms.selectAll') }}
          </el-button>
        </div>
        <div v-if="tabPerms.length" class="perm-grid">
          <div
            v-for="perm in tabPerms"
            :key="perm.code"
            class="perm-item"
          >
            <el-checkbox
              :model-value="checkedCodes.has(perm.code)"
              @update:model-value="togglePerm(perm.code, $event as boolean)"
            >
              <span class="perm-name">{{ perm.name }}</span>
              <span class="perm-code">{{ perm.code }}</span>
            </el-checkbox>
          </div>
        </div>
        <div v-else class="perm-empty">-</div>
      </div>

      <!-- 权限分组：平台权限 -->
      <div class="perm-section">
        <div class="perm-section-header">
          <el-icon class="section-icon platform"><Platform /></el-icon>
          <div class="section-text">
            <span class="section-title">{{ t('perms.section.platform') }}</span>
            <span class="section-count">{{ groupCount(platformPerms) }}</span>
            <span class="section-desc">{{ t('perms.sectionDesc.platform') }}</span>
          </div>
          <el-button
            size="small"
            text
            type="primary"
            @click="toggleGroup(platformPerms, !isGroupAllChecked(platformPerms))"
          >
            {{ t('perms.selectAll') }}
          </el-button>
        </div>
        <div v-if="platformPerms.length" class="perm-grid">
          <div
            v-for="perm in platformPerms"
            :key="perm.code"
            class="perm-item"
          >
            <el-checkbox
              :model-value="checkedCodes.has(perm.code)"
              @update:model-value="togglePerm(perm.code, $event as boolean)"
            >
              <span class="perm-name">{{ perm.name }}</span>
              <span class="perm-code">{{ perm.code }}</span>
            </el-checkbox>
          </div>
        </div>
        <div v-else class="perm-empty">-</div>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.perms-container {
  padding: 24px;
  background-color: #f8fafc;
  min-height: 100vh;
}

/* 顶部标题栏（与账号/库存页同款） */
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

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.dirty-tag {
  font-weight: 600;
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

/* 角色选择器 */
.role-selector {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #f1f5f9;
  flex-wrap: wrap;
}

.role-selector-label {
  font-size: 14px;
  font-weight: 600;
  color: #475569;
}

.role-empty {
  color: #94a3b8;
  font-size: 13px;
}

.role-note {
  margin-top: 16px;
}

/* 权限分组区块 */
.perm-section {
  margin-top: 20px;
  padding: 4px 0 8px;
}

.perm-section-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.section-icon {
  font-size: 18px;
  padding: 8px;
  border-radius: 10px;
}

.section-icon.page { background: #eff6ff; color: #3b82f6; }
.section-icon.tab { background: #f5f3ff; color: #8b5cf6; }
.section-icon.platform { background: #f0fdf4; color: #22c55e; }

.section-text {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.section-title {
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
}

.section-count {
  font-size: 12px;
  font-weight: 600;
  color: #3b82f6;
  background: #eff6ff;
  padding: 1px 8px;
  border-radius: 999px;
}

.section-desc {
  font-size: 12px;
  color: #94a3b8;
}

/* 权限项网格 */
.perm-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 6px 16px;
  width: 100%;
}

.perm-item {
  display: flex;
  align-items: center;
}

.perm-item :deep(.el-checkbox) {
  height: auto;
  width: 100%;
}

.perm-name {
  font-size: 14px;
  font-weight: 500;
  color: #334155;
}

.perm-code {
  margin-left: 8px;
  font-size: 11px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  color: #94a3b8;
}

.perm-empty {
  color: #94a3b8;
  font-size: 13px;
  padding: 8px 0;
}
</style>
