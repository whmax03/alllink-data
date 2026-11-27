<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { ElTree } from 'element-plus'
import { Key, Checked } from '@element-plus/icons-vue'
import { rbacApi } from '../api'
import { useAuthStore } from '../stores/auth'
import { i18n } from '../i18n'

const t = i18n.t
const authStore = useAuthStore()
const route = useRoute()

const loading = ref(false)
const saving = ref(false)

interface RoleItem {
  id: number
  name: string
  code: string
  description?: string
  permissions: Array<{ id: number; name: string; code: string; type: string }>
}

const roles = ref<RoleItem[]>([])
const selectedRoleCode = ref('')
const treeRef = ref<InstanceType<typeof ElTree>>()

// ---------- 权限树结构（展示层结构，节点 code 对应后端权限码） ----------
// 树的层级：模块 → 子功能 → 细粒度权限（页面/Tab/操作/平台）
// 组节点（有 children 且无 code）是纯展示容器，不对应后端权限码
// 节点显示名全部走 i18n 硬编码（与后端种子名同义），树即时渲染、不依赖权限列表接口
interface TreeNode {
  key: string          // 树节点唯一 key（组节点用 'group:xxx'，叶子用权限码）
  label: string        // 显示名（i18n，跟随中英文切换）
  code?: string        // 叶子节点对应的后端权限码；组节点无
  children?: TreeNode[]
}

function permName(code: string): string {
  return t(`perms.node.${code}`)
}

/** 权限树（结构在前端定义，节点名走 i18n 跟随中英文切换；code 对应后端权限码） */
const permTree = computed<TreeNode[]>(() => [
  {
    key: 'group:inventory',
    label: t('nav.inventory'),
    children: [
      {
        key: 'page:inventory',
        label: permName('page:inventory'),
        code: 'page:inventory',
        children: [
          {
            key: 'tab:domestic',
            label: permName('tab:domestic'),
            code: 'tab:domestic',
            children: [
              { key: 'platform:金蝶', label: permName('platform:金蝶'), code: 'platform:金蝶' },
              { key: 'platform:澳霖', label: permName('platform:澳霖'), code: 'platform:澳霖' },
              // 导出权限：与「查看」分开，勾了才看得到并调得动国内仓导出
              { key: 'export:domestic', label: t('inventory.export'), code: 'export:domestic' },
            ],
          },
          {
            key: 'tab:overseas',
            label: permName('tab:overseas'),
            code: 'tab:overseas',
            children: [
              { key: 'platform:亚马逊', label: permName('platform:亚马逊'), code: 'platform:亚马逊' },
              { key: 'platform:eBay', label: permName('platform:eBay'), code: 'platform:eBay' },
              { key: 'platform:Shopee', label: permName('platform:Shopee'), code: 'platform:Shopee' },
              { key: 'platform:Tiktok', label: permName('platform:Tiktok'), code: 'platform:Tiktok' },
              // 导出权限：与「查看」分开，勾了才看得到并调得动海外仓导出
              { key: 'export:overseas', label: t('inventory.export'), code: 'export:overseas' },
            ],
          },
        ],
      },
    ],
  },
  // {
  //   key: 'group:basic',
  //   label: t('nav.basic'),
  //   children: [
  //     {
  //       key: 'group:users',
  //       label: t('nav.users'),
//       children: [
  //         { key: 'page:users', label: permName('page:users'), code: 'page:users' },
  //         { key: 'action:users:create', label: permName('action:users:create'), code: 'action:users:create' },
  //         { key: 'action:users:reset_password', label: permName('action:users:reset_password'), code: 'action:users:reset_password' },
  //         { key: 'action:users:delete', label: permName('action:users:delete'), code: 'action:users:delete' },
  //       ],
  //     },
  //     {
  //       key: 'group:rbac',
  //       label: t('nav.permissions'),
  //       children: [
  //         { key: 'page:rbac', label: permName('page:rbac'), code: 'page:rbac' },
  //       ],
  //     },
  //   ],
  // },
])

/** 树上出现过的全部权限码（含带 children 的非叶子节点，如 tab:* 的 key 即权限码） */
const treeKnownCodes = computed<string[]>(() => {
  const codes: string[] = []
  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      if (n.children) walk(n.children)
      if (n.code) codes.push(n.code)
    }
  }
  walk(permTree.value)
  return codes
})

/**
 * 权限码 → 祖先链权限码映射（近 → 远）
 * 例：platform:亚马逊 → ['tab:overseas', 'page:inventory']
 * 组容器节点（group:*）无 code，天然不参与继承
 */
const parentCodeMap = computed<Record<string, string[]>>(() => {
  const map: Record<string, string[]> = {}
  const walk = (nodes: TreeNode[], ancestors: string[]) => {
    for (const n of nodes) {
      if (n.code) map[n.code] = [...ancestors]
      const nextAncestors = n.code ? [n.code, ...ancestors] : ancestors
      if (n.children) walk(n.children, nextAncestors)
    }
  }
  walk(permTree.value, [])
  return map
})

/**
 * 权限码 → 自身 + 全部祖先权限码（含自己）
 * 勾选任一节点时，其上游父级权限会一并带上，避免「只给了子权限、父级页面/Tab 进不去」
 */
const ancestorCodesOf = computed<Record<string, string[]>>(() => {
  const map: Record<string, string[]> = {}
  for (const [code, parents] of Object.entries(parentCodeMap.value)) {
    map[code] = [code, ...parents]
  }
  return map
})

/** 树上叶子权限码（无 children 的节点；tab:* 容器码不在此列）——回显专用 */
const treeLeafCodes = computed<string[]>(() => {
  const codes: string[] = []
  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      if (n.children) walk(n.children)
      else if (n.code) codes.push(n.code)
    }
  }
  walk(permTree.value)
  return codes
})

const selectedRole = computed(() =>
  roles.value.find(r => r.code === selectedRoleCode.value) || null
)

/** admin 角色拥有全部权限，禁止修改：选中 admin 时树只读、保存禁用 */
const isReadonlyAdmin = computed(() => selectedRole.value?.code === 'admin')

// 加载时该角色已有的权限码（保存时保留树上未展示的权限，如 data:*）
const roleInitialCodes = ref<string[]>([])

/**
 * 初始权限码（树上部分）补齐祖先后的口径。
 * 历史数据里可能存在「只有平台权限、没有 tab/page 权限」的脏数据，
 * dirty 比对必须与保存/回显同一口径，否则一进页面就误判「有未保存修改」。
 */
const initialTreeCodes = computed<string[]>(() => {
  const onTree = roleInitialCodes.value.filter(code => treeKnownCodes.value.includes(code))
  const withAncestors = onTree.flatMap(code => ancestorCodesOf.value[code] || [code])
  return [...new Set(withAncestors)]
})

// 是否有未保存修改（比对树上勾选权限码集合 vs 初始树上权限码集合，同一继承口径）
const dirty = computed(() => {
  const current = getCurrentCheckedCodes().sort().join('|')
  const initial = [...initialTreeCodes.value].sort().join('|')
  return current !== initial
})

/**
 * 从 el-tree 取当前勾选的权限码：
 * - 全选节点：含非叶子（勾「国内仓Tab」时 tab:domestic + 平台码一并收上）
 * - 半选节点也计入（部分勾选平台时保留 tab 权限）
 * - 勾选任一子节点时，自动补齐其全部祖先权限码（如勾 platform:亚马逊 → 带上
 *   tab:overseas 与 page:inventory），避免「只有子权限、父级页面/Tab 进不去」
 * - 组容器（group:*）无 code 自然被过滤
 */
function getCurrentCheckedCodes(): string[] {
  if (!treeRef.value) return []
  const checked = (treeRef.value.getCheckedNodes(false) as TreeNode[]).map(n => n.code)
  const half = (treeRef.value.getHalfCheckedNodes() as TreeNode[]).map(n => n.code)
  const picked = [...checked, ...half].filter(Boolean) as string[]

  // 展开为「自身 + 祖先链」
  const withAncestors = picked.flatMap(code => ancestorCodesOf.value[code] || [code])
  return [...new Set(withAncestors)]
}

async function loadRoles(keepSelection = true) {
  // 拉全量（角色数量小，下拉/树需要完整清单；pageSize 默认 100 同全量）
  const { data } = await rbacApi.roles({ pageNo: 1, pageSize: 100 })
  if (data.code === 200) {
    roles.value = data.data?.list || []
    if (keepSelection && selectedRoleCode.value && roles.value.some(r => r.code === selectedRoleCode.value)) {
      applyRoleSelection(selectedRoleCode.value)
    } else if (roles.value.length > 0) {
      selectedRoleCode.value = roles.value[0].code
      applyRoleSelection(selectedRoleCode.value)
    } else {
      selectedRoleCode.value = ''
    }
  } else {
    ElMessage.error(data.message || t('perms.loadFailed'))
  }
}

/**
 * 回显时的「精确置位」：把节点标记为勾选，但**不向下级联**子节点。
 *
 * el-tree 的 setChecked(key, checked, deep) 在非严格模式下会级联；
 * 而 check-strictly 是 prop，靠 watch 异步同步到 store，同一 tick 内改它并不可靠。
 * 这里直接调节点自身的 setChecked(value, deep=false, recursion=false)：
 * - deep=false → 不动子节点（兄弟平台不会被误勾）
 * - recursion=false → 不触发父链重算（父级勾选状态由叶子自行汇总）
 */
function setCheckedExact(key: string) {
  const tree = treeRef.value as any
  const node = tree?.store?.getNode?.(key)
  if (!node) return false
  // 已经是「全选」时无需再动（避免把已正确的父级改成半选）
  if (node.checked && !node.indeterminate) return true
  node.setChecked(true, false, false)
  return true
}

/** 选中角色变化：把角色的权限码设置到树勾选（等树渲染完成后同步），并查询权限详情 */
async function applyRoleSelection(_code: string) {
  const role = roles.value.find(r => r.code === selectedRoleCode.value)
  roleInitialCodes.value = (role?.permissions || []).map(p => p.code)
  await nextTick()
  if (!treeRef.value) return
  treeRef.value.setCheckedKeys([])
  // 回显只勾叶子码：tab:* 容器码不传，由 el-tree 依据子节点勾选自动呈现半选/全选。
  // 若把容器码传给 setCheckedKeys，非严格模式会向下级联勾选全部平台子节点
  // （保存后其他平台也自动勾上的根因，且再点保存会把全量平台写进数据库）。
  const leafOnTree = roleInitialCodes.value.filter(code => treeLeafCodes.value.includes(code))
  treeRef.value.setCheckedKeys(leafOnTree)

  // 历史脏数据补偿：角色「有平台权限、却没有父级 tab/page 权限」时，
  // 树上的父级只会呈现半选（视觉上像已授权，实际后端没有），
  // 这里把缺失的祖先权限精确补勾，保证「勾子即勾父」的口径前后一致。
  const orphanParents: string[] = []
  for (const code of roleInitialCodes.value.filter(code => treeKnownCodes.value.includes(code))) {
    for (const parent of parentCodeMap.value[code] || []) {
      if (!roleInitialCodes.value.includes(parent)) orphanParents.push(parent)
    }
  }
  for (const key of new Set(orphanParents)) setCheckedExact(key)

  // 同步查询该角色的权限详情（详情面板渲染）
  loadRoleDetail()
}

// ---------- 权限详情面板（选中角色时查询并渲染） ----------
interface RoleDetail {
  id: number
  name: string
  code: string
  description?: string
  is_admin: boolean
  permissions: Array<{ id: number; name: string; code: string; type: string }>
}

const detailLoading = ref(false)
const roleDetail = ref<RoleDetail | null>(null)

async function loadRoleDetail() {
  const role = roles.value.find(r => r.code === selectedRoleCode.value)
  if (!role) {
    roleDetail.value = null
    return
  }
  detailLoading.value = true
  try {
    const { data } = await rbacApi.rolePermissionDetail(role.id)
    if (data.code === 200) {
      roleDetail.value = data.data || null
    } else {
      ElMessage.error(data.message || t('perms.loadFailed'))
    }
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || t('perms.loadFailed'))
  } finally {
    detailLoading.value = false
  }
}

function handleRoleChange(code: string) {
  selectedRoleCode.value = code
  applyRoleSelection(code)
}

async function handleSave() {
  if (!selectedRole.value) return
  if (isReadonlyAdmin.value) return // admin 角色禁止修改权限
  saving.value = true
  try {
    // 提交的权限 = 树上勾选/半选的权限码（含 tab:*，半选保留防覆盖式保存丢 Tab 权限）
    // ∪ 该角色已有但树上未展示的权限（如 data:*，避免覆盖式保存悄悄清掉）
    const preserved = roleInitialCodes.value.filter(code => !treeKnownCodes.value.includes(code))
    const merged = [...new Set([...getCurrentCheckedCodes(), ...preserved])]

    const { data } = await rbacApi.assignPermissions({
      role_code: selectedRole.value.code,
      permission_codes: merged,
    })
    if (data.code === 200) {
      ElMessage.success(t('perms.saved'))
      // 同步当前登录态：若当前账号绑定了被改角色，roles/permissions 立即生效（菜单/Tab/按钮显隐响应）
      await authStore.refreshLoginState()
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
      console.log('authStore-->', authStore)

  try {
    // 只拉角色列表（树节点名走 i18n 硬编码，不再依赖权限列表接口，树即时渲染）
    await loadRoles(false)
    // 角色管理页点击角色名称跳转：携带 roleCode 参数时选中对应角色
    // （loadRoles(false) 已默认选第一个角色，此处覆盖为指定角色；角色不存在则保持默认）
    const roleCode = route.query.roleCode as string | undefined
    if (roleCode && roles.value.some(r => r.code === roleCode) && selectedRoleCode.value !== roleCode) {
      handleRoleChange(roleCode)
    }
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
          :disabled="!dirty || !selectedRole || isReadonlyAdmin"
          plain
          round
          @click="handleSave"
        >
          {{ t('perms.save') }}
        </el-button>
      </div>
    </div>


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

      <!-- 角色说明（admin 只读提示） -->
      <el-alert
        v-if="isReadonlyAdmin"
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

      <!-- 权限树（admin 选中时只读禁用：勾选框置灰、树背景变淡） -->
      <div class="perm-tree-section">
        <div class="perm-tree-header">
          <span class="tree-title">{{ t('perms.treeTitle') }}</span>
          <span class="tree-hint">{{ t('perms.treeHint') }}</span>
        </div>
        <el-tree
          ref="treeRef"
          :data="permTree"
          node-key="key"
          show-checkbox
          default-expand-all
          :expand-on-click-node="false"
          :check-strictly="false"
          :class="['perm-tree', { 'is-readonly': isReadonlyAdmin }]"
          :props="{ disabled: () => isReadonlyAdmin }"
        >
          <template #default="{ data }">
            <div class="tree-node">
              <span class="node-label" :class="{ 'is-group': !data.code }">{{ data.label }}</span>
              <span v-if="data.code" class="node-code">{{ data.code }}</span>
            </div>
          </template>
        </el-tree>
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

/* 权限树区块 */
.perm-tree-section {
  margin-top: 20px;
}

/* 权限详情面板 */
.perm-detail-section {
  margin-top: 16px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px 16px;
  background: #ffffff;
  min-height: 60px;
}

.perm-detail-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.detail-icon {
  font-size: 15px;
  color: #3b82f6;
  background: #eff6ff;
  padding: 6px;
  border-radius: 8px;
}

.detail-title {
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
}

.detail-role-name {
  font-size: 14px;
  font-weight: 600;
  color: #334155;
}

.detail-role-code {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  background: #f1f5f9;
  padding: 1px 8px;
  border-radius: 4px;
  color: #64748b;
  font-size: 11px;
}

.detail-count {
  margin-left: auto;
  font-size: 12px;
  font-weight: 600;
  color: #3b82f6;
  background: #eff6ff;
  padding: 2px 10px;
  border-radius: 999px;
}

.detail-desc {
  margin: 10px 0 0;
  font-size: 12.5px;
  color: #64748b;
}

.detail-admin-alert {
  margin-top: 10px;
}

.detail-groups {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.detail-group {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.detail-group-label {
  flex-shrink: 0;
  width: 76px;
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 3px 8px;
  text-align: center;
}

.detail-group-items {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.detail-perm-tag {
  cursor: help;
}

.detail-empty {
  margin: 8px 0 0;
  font-size: 13px;
  color: #94a3b8;
}

.perm-tree-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.tree-title {
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
}

.tree-hint {
  font-size: 12px;
  color: #94a3b8;
}

.perm-tree {
  --el-tree-node-content-height: 36px;
  border: 1px solid #f1f5f9;
  border-radius: 12px;
  padding: 10px 12px;
  background: #fafcff;
}

.perm-tree :deep(.el-tree-node__content) {
  border-radius: 8px;
}

.perm-tree :deep(.el-tree-node__content:hover) {
  background-color: #eff6ff;
}

/* admin 只读态：树置灰 */
.perm-tree.is-readonly {
  background: #f8fafc;
}

.perm-tree.is-readonly :deep(.el-tree-node__content:hover) {
  background-color: transparent;
}

/* 树节点：组节点加粗，叶子节点右侧显示权限码 */
.tree-node {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.node-label {
  font-size: 14px;
  color: #334155;
}

.node-label.is-group {
  font-weight: 700;
  color: #1e293b;
}

.node-code {
  font-size: 11px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  color: #94a3b8;
  background: #f1f5f9;
  padding: 1px 6px;
  border-radius: 4px;
}
</style>
