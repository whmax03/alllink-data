<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Box, DataAnalysis, Refresh, ArrowDown, Lock, Fold, Expand, User, Setting, Key, ArrowRight } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useAuthStore } from './stores/auth'
import { i18n } from './i18n'
import LangSwitch from './components/LangSwitch.vue'
import zhLocale from 'element-plus/es/locale/lang/zh-cn'
import enLocale from 'element-plus/es/locale/lang/en'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

// Element Plus 内置组件文案随语言切换（分页器/日历等）
const elLocale = computed(() => (i18n.locale === 'zh' ? zhLocale : enLocale))

// 侧边栏折叠状态
const sidebarCollapsed = ref(localStorage.getItem('ALLINK_SIDEBAR_COLLAPSED') === 'true')

const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value
  localStorage.setItem('ALLINK_SIDEBAR_COLLAPSED', String(sidebarCollapsed.value))
}

// 判断当前路由是否为独立页面（不需要侧边栏布局）
const isStandalonePage = computed(() => {
  return route.meta?.public === true
})

// ---------- Tab 权限自动清理 ----------
// admin 页面的 path 集合：当前用户非 admin 时，这些 Tab 不应存在（自动移除，免手动关闭）
const ADMIN_TAB_PATHS = ['/users', '/permissions']

/**
 * 按当前角色过滤 Tab：
 * - 非 admin：移除所有 admin 专属 Tab（账号管理）
 * - 未登录：清空全部
 * 并持久化；若当前激活 Tab 被移除，自动切到幸存 Tab（优先库存页）
 */
function enforceTabPermissions(): boolean {
  if (!authStore.isLoggedIn) {
    // 未登录：Tab 数据全清，重新登录后从默认页重建
    if (tabs.value.length > 0) {
      tabs.value = []
      saveTabs()
    }
    return false
  }
  if (!authStore.isAdmin) {
    const before = tabs.value.length
    tabs.value = tabs.value.filter(tab => !ADMIN_TAB_PATHS.includes(tab.path))
    if (tabs.value.length !== before) {
      saveTabs()
      // 当前激活 Tab 被清理时，切到首个幸存 Tab（否则库存页）
      const activePath = activeTab.value
      if (!activePath || !tabs.value.some(tab => tab.path === activePath)) {
        const fallback = tabs.value[0]?.path || '/inventory'
        activeTab.value = fallback
        router.push(fallback)
      }
      return true
    }
  }
  return false
}

// 右上角默认头像：取用户名首字符（本地渲染，无外链依赖）
const avatarText = computed(() => {
  const name = authStore.user?.name?.trim()
  return name ? name.charAt(0).toUpperCase() : i18n.t('app.avatarFallback')
})

// 菜单配置（titleKey 走 i18n；基础管理组仅对 admin 显示，置顶）
// 支持两级结构：children 存在时为「基础管理」组菜单，子项为账号/权限管理
interface MenuItem {
  path: string
  titleKey: string
  icon: any
  children?: MenuItem[]
}

const menuItems = computed<MenuItem[]>(() => {
  const items: MenuItem[] = [
    { path: '/inventory', titleKey: 'nav.inventory', icon: Box },
    // { path: '/dashboard', titleKey: 'nav.dashboard', icon: DataAnalysis },
  ]
  if (authStore.isAdmin) {
    // 基础管理（admin 专属，置顶）：账号管理 + 权限管理子菜单
    items.unshift({
      path: '/basic',
      titleKey: 'nav.basic',
      icon: Setting,
      children: [
        { path: '/users', titleKey: 'nav.users', icon: User },
        { path: '/permissions', titleKey: 'nav.permissions', icon: Key },
      ],
    })
  }
  return items
})

// ---------- 侧边栏分组展开状态 ----------
// 组菜单（基础管理）展开/收起；当前路由命中子项时自动展开
const expandedGroups = ref<string[]>([])

function isGroupOpen(item: MenuItem): boolean {
  return expandedGroups.value.includes(item.path)
}

function toggleGroup(path: string) {
  expandedGroups.value = expandedGroups.value.includes(path)
    ? expandedGroups.value.filter(p => p !== path)
    : [...expandedGroups.value, path]
}

// 当前路由位于某组子项内时，确保该组展开（初始化 + 路由变化时同步）
function syncGroupExpansion() {
  for (const item of menuItems.value) {
    if (item.children?.some(child => child.path === route.path)) {
      if (!expandedGroups.value.includes(item.path)) {
        expandedGroups.value = [...expandedGroups.value, item.path]
      }
    }
  }
}

// ---------- 面包屑 ----------
// 从 menuItems 递归推导当前路由的层级链：[首页, ...各级菜单, 当前页]
// 与侧边栏同源同响应式：admin 显隐、语言切换、菜单层级变化自动同步
interface BreadcrumbItem {
  titleKey: string
  path: string
}

function findMenuChain(items: MenuItem[], targetPath: string, chain: MenuItem[]): MenuItem[] | null {
  for (const item of items) {
    const next = [...chain, item]
    if (item.path === targetPath) return next
    if (item.children) {
      const found = findMenuChain(item.children, targetPath, next)
      if (found) return found
    }
  }
  return null
}

const breadcrumbs = computed<BreadcrumbItem[]>(() => {
  const chain = findMenuChain(menuItems.value, route.path, [])
  const items: BreadcrumbItem[] = [
    { titleKey: 'menu.breadcrumbHome', path: '/inventory' },
  ]
  if (chain) {
    for (const node of chain) {
      items.push({ titleKey: node.titleKey, path: node.path })
    }
  }
  return items
})

// Tab 标签页管理（title 存 i18n key，渲染时翻译，切换语言后已存 Tab 同步生效）
interface TabItem {
  titleKey: string
  name: string
  path: string
}

const tabs = ref<TabItem[]>([])
const activeTab = ref('')

// 旧 localStorage 数据兼容：无 titleKey 时按 path 推断
const pathToTitleKey = (path: string): string => {
  const map: Record<string, string> = {
    '/inventory': 'nav.inventory',
    '/dashboard': 'nav.dashboard',
    '/orders': 'nav.orders',
    '/sync': 'nav.sync',
    '/users': 'nav.users',
    '/permissions': 'nav.permissions',
  }
  return map[path] || 'nav.newTab'
}

// 从本地存储恢复 Tab
const initTabs = () => {
  const savedTabs = localStorage.getItem('ALLINK_TABS')
  if (savedTabs) {
    try {
      const parsed = JSON.parse(savedTabs) as Array<Partial<TabItem>>
      tabs.value = parsed
        .filter(item => item && item.path)
        .map(item => ({
          titleKey: item.titleKey || pathToTitleKey(item.path as string),
          name: (item.name as string) || (item.path as string),
          path: item.path as string,
        }))
    } catch {
      tabs.value = []
    }
  }
}

// 保存 Tab 到本地存储
const saveTabs = () => {
  localStorage.setItem('ALLINK_TABS', JSON.stringify(tabs.value))
}

// 添加 Tab
const addTab = (toRoute: any) => {
  const { path, meta } = toRoute
  // 排除根路径或重定向路径
  if (path === '/') return
  // 排除独立页面（登录/注册/修改密码），不加入 Tab
  if (meta?.public) return

  const titleKey = (meta?.titleKey as string) || pathToTitleKey(path)
  
  const existingTab = tabs.value.find(tab => tab.path === path)
  if (!existingTab) {
    tabs.value.push({
      titleKey,
      name: path,
      path
    })
    saveTabs()
  }
  activeTab.value = path
}

// 移除 Tab
const removeTab = (targetName: string) => {
  const tabsList = tabs.value
  let activeName = activeTab.value
  
  if (tabsList.length <= 1) {
    ElMessage.warning(i18n.t('tabs.keepAtLeastOne'))
    return
  }

  if (activeName === targetName) {
    tabsList.forEach((tab, index) => {
      if (tab.name === targetName) {
        const nextTab = tabsList[index + 1] || tabsList[index - 1]
        if (nextTab) {
          activeName = nextTab.name
          router.push(nextTab.path)
        }
      }
    })
  }
  
  activeTab.value = activeName
  tabs.value = tabsList.filter(tab => tab.name !== targetName)
  saveTabs()
}

// 点击 Tab 切换路由
const handleTabClick = (tab: any) => {
  router.push(tab.props.name)
}

// 初始化
onMounted(async () => {
  initTabs()
  if (route.path !== '/' && !route.meta?.public) {
    addTab(route)
  }
  // 旧缓存登录态无 roles 时补齐（admin 菜单显隐依赖），补齐后立即按角色清理残留 Tab
  await authStore.ensureRoles()
  enforceTabPermissions()
  // 当前路由命中基础管理子项时自动展开该组
  syncGroupExpansion()
})

// 监听路由变化自动添加 Tab；进入带 deniedTab 标记的路由时（无权限被守卫弹回），自动清理对应无权限 Tab
watch(() => route.fullPath, () => {
  if (route.query.deniedTab === '1') {
    // 权限不足被拦截：清掉无权限残留 Tab，并移除 URL 上的临时标记（免得刷新重复触发）
    enforceTabPermissions()
    router.replace({ path: route.path, query: { ...route.query, deniedTab: undefined } })
  }
  addTab(route)
  syncGroupExpansion()
})

// 登录身份变化（登录/退出/换号）：按新角色同步清理 Tab（退出时清空，换非 admin 账号时移除账号管理）
watch(
  () => [authStore.isLoggedIn, authStore.user?.id, authStore.user?.roles] as const,
  () => {
    enforceTabPermissions()
  }
)

// 退出登录
const handleLogout = () => {
  authStore.logout()
  ElMessage.success(i18n.t('menu.logoutSuccess'))
  router.push('/login')
}

// 修改密码
const handleChangePassword = () => {
  router.push('/change-password')
}

// 语言切换时同步浏览器标签标题（路由切换场景由 router.afterEach 处理）
watch(() => i18n.locale, () => {
  const key = (route.meta?.titleKey as string) || ''
  document.title = key ? `${i18n.t(key)} · AllLink Data` : 'AllLink Data'
})
</script>

<template>
  <!-- Element Plus 内置文案随语言切换 -->
  <el-config-provider :locale="elLocale">
    <!-- 独立页面：登录/注册/修改密码 -->
    <router-view v-if="isStandalonePage" />

  <!-- 主应用布局 -->
  <div v-else class="app-layout-premium">
    <!-- 侧边栏设计 -->
    <aside class="sidebar-premium" :class="{ collapsed: sidebarCollapsed }">
      <div class="brand-section">
        <!-- 展开状态：图标 + 文案横向排列 -->
        <template v-if="!sidebarCollapsed">
          <div class="brand-logo">
            <el-icon><DataAnalysis /></el-icon>
          </div>
          <div class="brand-info">
            <div class="brand-name">AllLink Data</div>
            <div class="brand-version">Enterprise Console</div>
          </div>
        </template>
        <!-- 折叠状态：图标 + 文案上下排列 -->
        <template v-else>
          <div class="brand-logo">
            <el-icon><DataAnalysis /></el-icon>
          </div>
          <div class="brand-name-collapsed">AllLink</div>
        </template>
      </div>

      <nav class="nav-menu">
        <template v-for="item in menuItems" :key="item.path">
          <!-- 组菜单（基础管理）：展开态为可折叠组头 + 子项；折叠态为 hover 弹出子项列表 -->
          <template v-if="item.children">
            <el-popover
              :width="160"
              placement="right-start"
              trigger="hover"
              :disabled="!sidebarCollapsed"
              :show-after="150"
              :hide-after="100"
              popper-class="sidebar-collapsed-popper"
            >
              <template #reference>
                <div
                  class="nav-item nav-group"
                  :class="{ 'is-group-open': isGroupOpen(item), 'has-active-child': item.children.some(child => child.path === route.path) }"
                  @click="!sidebarCollapsed && toggleGroup(item.path)"
                >
                  <el-icon class="nav-icon"><component :is="item.icon" /></el-icon>
                  <span v-show="!sidebarCollapsed" class="nav-label">{{ i18n.t(item.titleKey) }}</span>
                  <el-icon
                    v-show="!sidebarCollapsed"
                    class="group-arrow"
                    :class="{ open: isGroupOpen(item) }"
                  >
                    <ArrowDown />
                  </el-icon>
                </div>
              </template>
              <div
                v-for="child in item.children"
                :key="child.path"
                class="collapsed-submenu-item"
                :class="{ 'is-active': child.path === route.path }"
                @click="router.push(child.path)"
              >
                <el-icon class="nav-icon"><component :is="child.icon" /></el-icon>
                <span>{{ i18n.t(child.titleKey) }}</span>
              </div>
            </el-popover>
            <!-- 展开态的子菜单列表 -->
            <div v-if="!sidebarCollapsed && isGroupOpen(item)" class="nav-submenu">
              <!-- 高亮用显式路由比对（与组头 has-active-child 同源同响应式），不依赖 router-link active-class -->
              <router-link
                v-for="child in item.children"
                :key="child.path"
                :to="child.path"
                class="nav-subitem"
                :class="{ 'is-active': child.path === route.path }"
              >
                <el-icon class="nav-sub-icon"><component :is="child.icon" /></el-icon>
                <span class="nav-sub-label">{{ i18n.t(child.titleKey) }}</span>
              </router-link>
            </div>
          </template>

          <!-- 单项菜单（库存管理） -->
          <el-popover
            v-else
            :width="140"
            placement="right-start"
            trigger="hover"
            :disabled="!sidebarCollapsed"
            :show-after="150"
            :hide-after="100"
            popper-class="sidebar-collapsed-popper"
          >
            <template #reference>
              <router-link
                :to="item.path"
                class="nav-item"
                active-class="is-active"
              >
                <el-icon class="nav-icon"><component :is="item.icon" /></el-icon>
                <span v-show="!sidebarCollapsed" class="nav-label">{{ i18n.t(item.titleKey) }}</span>
              </router-link>
            </template>
            <div
              class="collapsed-submenu-item"
              @click="router.push(item.path)"
            >
              <el-icon class="nav-icon"><component :is="item.icon" /></el-icon>
              <span>{{ i18n.t(item.titleKey) }}</span>
            </div>
          </el-popover>
        </template>
      </nav>

      <div class="sidebar-footer">
        <div class="collapse-btn" @click="toggleSidebar">
          <el-icon><component :is="sidebarCollapsed ? Expand : Fold" /></el-icon>
          <span v-show="!sidebarCollapsed" class="collapse-label">{{ i18n.t('menu.collapse') }}</span>
        </div>
      </div>
    </aside>

    <!-- 主内容区 -->
    <div class="main-container">
      <!-- 面包屑条：多级菜单层级导航（首页 / 基础管理 / 账号管理） -->
      <div class="breadcrumb-bar">
        <template v-for="(crumb, idx) in breadcrumbs" :key="crumb.path + '-' + idx">
          <span
            v-if="idx > 0"
            class="breadcrumb-sep"
          >
            <el-icon><ArrowRight /></el-icon>
          </span>
          <!-- 最后一级为当前位置（不可点）；其余可点击跳转 -->
          <span
            v-if="idx === breadcrumbs.length - 1"
            class="breadcrumb-item is-current"
          >
            {{ i18n.t(crumb.titleKey) }}
          </span>
          <a
            v-else
            class="breadcrumb-item is-link"
            @click="router.push(crumb.path)"
          >
            {{ i18n.t(crumb.titleKey) }}
          </a>
        </template>
      </div>

      <!-- 顶部固定栏 -->
      <header class="top-header-premium">
        <div class="header-left">
          <el-tabs
            v-model="activeTab"
            type="card"
            class="header-tabs"
            closable
            @tab-remove="removeTab"
            @tab-click="handleTabClick"
          >
            <el-tab-pane
              v-for="item in tabs"
              :key="item.name"
              :label="i18n.t(item.titleKey)"
              :name="item.name"
            />
          </el-tabs>
        </div>

        <div class="header-right">
          <!-- 中英文切换：位于头像左侧 -->
          <LangSwitch variant="light" class="header-lang-switch" />
          <el-dropdown trigger="click">
            <div class="user-profile-dropdown">
              <el-avatar :size="32" class="user-avatar-default">{{ avatarText }}</el-avatar>
              <div class="user-meta">
                <span class="user-name">{{ authStore.user?.name || i18n.t('app.defaultUserName') }}</span>
                <el-icon><ArrowDown /></el-icon>
              </div>
            </div>
            <template #dropdown>
              <el-dropdown-menu class="premium-dropdown-menu">
                <!-- <el-dropdown-item :icon="User">个人中心</el-dropdown-item>
                <el-dropdown-item :icon="Setting">系统设置</el-dropdown-item> -->
                <el-dropdown-item :icon="Lock" @click="handleChangePassword">{{ i18n.t('menu.changePassword') }}</el-dropdown-item>
                <el-dropdown-item divided :icon="Refresh" @click="handleLogout" class="logout-item">
                  {{ i18n.t('menu.logout') }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <!-- 视图区域 -->
      <main class="main-body-premium">
        <router-view v-slot="{ Component }">
          <transition name="fade-slide" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
  </el-config-provider>
</template>

<style>
/* 全局基础样式 */
body {
  margin: 0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background-color: #f8fafc;
  color: #1e293b;
}

.app-layout-premium {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

/* 侧边栏样式 */
.sidebar-premium {
  width: 260px;
  background-color: #1e293b;
  color: white;
  display: flex;
  flex-direction: column;
  box-shadow: 4px 0 10px rgba(0, 0, 0, 0.1);
  z-index: 200;
  transition: width 0.28s ease;
}

.sidebar-premium.collapsed {
  width: 64px;
}

.sidebar-premium.collapsed .brand-section {
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 8px;
  padding: 24px 0 20px;
}

.brand-name-collapsed {
  font-size: 11px;
  font-weight: 700;
  color: #cbd5e1;
  letter-spacing: 0.02em;
  white-space: nowrap;
  line-height: 1;
}

.sidebar-premium.collapsed .nav-item {
  width: 40px;
  height: 40px;
  justify-content: center;
  align-items: center;
  padding: 0;
  margin: 0 auto 4px;
  box-sizing: border-box;
}

.brand-section {
  padding: 32px 24px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-logo {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.3);
}

.brand-name {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.5px;
}

.brand-version {
  font-size: 11px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 2px;
}

.nav-menu {
  flex: 1;
  padding: 0 16px;
}

.sidebar-premium.collapsed .nav-menu {
  padding: 0;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  color: #94a3b8;
  text-decoration: none;
  border-radius: 10px;
  margin-bottom: 4px;
  transition: all 0.2s;
}

.nav-item:hover {
  background-color: rgba(255, 255, 255, 0.05);
  color: white;
}

.nav-item.is-active {
  background-color: #3b82f6;
  color: white;
  box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.2);
}

.nav-icon {
  font-size: 18px;
}

.nav-label {
  font-weight: 500;
  font-size: 14px;
}

/* 组菜单（基础管理）：组头带箭头，可点击折叠 */
.nav-group {
  cursor: pointer;
  user-select: none;
}

.nav-group.is-group-open {
  color: white;
}

/* 命中子菜单路由时，组头与主菜单选中同款高亮（品牌蓝实底），hover 不冲淡激活态 */
.nav-group.has-active-child {
  background-color: #3b82f6;
  color: white;
  box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.2);
}

.nav-group.has-active-child:hover {
  background-color: #3b82f6;
  color: white;
}

.nav-group.has-active-child .group-arrow {
  color: rgba(255, 255, 255, 0.8);
}

.group-arrow {
  margin-left: auto;
  font-size: 12px;
  color: #94a3b8;
  transition: transform 0.2s;
}

.group-arrow.open {
  transform: rotate(180deg);
}

/* 组的子菜单列表（展开态） */
.nav-submenu {
  margin: 0 0 4px 22px;
  padding-left: 10px;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
}

.nav-subitem {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  color: #94a3b8;
  text-decoration: none;
  border-radius: 8px;
  margin-bottom: 2px;
  transition: all 0.2s;
}

.nav-subitem:hover {
  background-color: rgba(255, 255, 255, 0.05);
  color: white;
}

/* 子菜单选中：与主菜单选中同款品牌蓝实底 + 白字，hover 不冲淡 */
.nav-subitem.is-active {
  background-color: #3b82f6;
  color: white;
  box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.2);
}

.nav-subitem.is-active:hover {
  background-color: #3b82f6;
  color: white;
}

.nav-sub-icon {
  font-size: 14px;
}

.nav-sub-label {
  font-weight: 500;
  font-size: 13px;
}

.sidebar-footer {
  padding: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.collapse-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  color: #94a3b8;
  border-radius: 10px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
}

.sidebar-premium.collapsed .collapse-btn {
  justify-content: center;
  padding: 10px 0;
}

.collapse-btn:hover {
  background-color: rgba(255, 255, 255, 0.08);
  color: white;
}

.collapse-btn .el-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.collapse-label {
  white-space: nowrap;
}

/* 主内容区容器 */
.main-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

/* 面包屑条：多级菜单层级导航 */
.breadcrumb-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
  height: 34px;
  padding: 0 24px;
  background-color: white;
  border-bottom: 1px solid #f1f5f9;
  font-size: 12.5px;
  flex-shrink: 0;
}

.breadcrumb-item {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  border-radius: 6px;
  line-height: 1.4;
}

.breadcrumb-item.is-link {
  color: #64748b;
  cursor: pointer;
  transition: color 0.15s, background-color 0.15s;
}

.breadcrumb-item.is-link:hover {
  color: #3b82f6;
  background-color: #eff6ff;
}

.breadcrumb-item.is-current {
  color: #1e293b;
  font-weight: 600;
}

.breadcrumb-sep {
  display: inline-flex;
  align-items: center;
  color: #cbd5e1;
  font-size: 11px;
  margin: 0 2px;
}

/* 顶部固定栏样式 */
.top-header-premium {
  height: 64px;
  background-color: white;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: stretch;
  padding: 0 24px;
  z-index: 150;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05);
}

.header-left {
  flex: 1;
  display: flex;
  align-items: flex-end;
  overflow: hidden;
  margin-right: 20px;
}

.header-tabs {
  width: 100%;
}

.header-tabs :deep(.el-tabs__header) {
  margin: 0;
  border-bottom: none !important;
}

.header-tabs :deep(.el-tabs__nav-scroll) {
  padding-bottom: 0;
}

.header-tabs :deep(.el-tabs__nav) {
  border: none !important;
  display: flex;
  align-items: flex-end;
  gap: 4px;
}

.header-tabs :deep(.el-tabs__item) {
  height: 40px;
  line-height: 40px;
  border: 1px solid #e2e8f0 !important;
  border-bottom: none !important;
  border-radius: 10px 10px 0 0 !important;
  background: #f8fafc;
  color: #64748b;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
  padding: 0 20px !important;
  margin: 0 !important;
  position: relative;
  top: 1px; /* 覆盖在 header border 上 */
}

.header-tabs :deep(.el-tabs__item:hover) {
  color: #3b82f6;
  background-color: white;
}

.header-tabs :deep(.el-tabs__item.is-active) {
  background-color: white !important;
  color: #3b82f6 !important;
  border-color: #e2e8f0 !important;
  font-weight: 600;
}

.header-tabs :deep(.el-tabs__item.is-active::after) {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  right: 0;
  height: 2px;
  background-color: white;
  z-index: 2;
}

.header-tabs :deep(.el-tabs__item .is-icon-close) {
  font-size: 12px;
  margin-left: 10px;
  color: #94a3b8;
  transition: all 0.2s;
}

.header-tabs :deep(.el-tabs__item.is-active .is-icon-close) {
  color: #64748b;
}

.header-tabs :deep(.el-tabs__item .is-icon-close:hover) {
  background-color: #ef4444 !important;
  color: white !important;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-lang-switch {
  flex-shrink: 0;
}

.user-profile-dropdown {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  border-radius: 12px;
  cursor: pointer;
  transition: background-color 0.2s;
}

/* 默认头像：用户名首字 + 品牌渐变（替代原外链生成图） */
.el-avatar.user-avatar-default {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: #ffffff;
  font-weight: 600;
  font-size: 15px;
  letter-spacing: 0;
  user-select: none;
  box-shadow: 0 2px 4px -1px rgba(37, 99, 235, 0.3);
}

.user-profile-dropdown:hover {
  background-color: #f1f5f9;
}

.user-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #334155;
}

.user-name {
  font-size: 14px;
  font-weight: 600;
  color: #334155;
}

.premium-dropdown-menu {
  border-radius: 12px !important;
  padding: 8px !important;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1) !important;
}

.logout-item {
  color: #ef4444 !important;
}

/* 视图主体 */
.main-body-premium {
  flex: 1;
  overflow-y: auto;
  background-color: #f8fafc;
}

/* 页面切换动画 */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s ease;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* 侧边栏折叠时弹出菜单样式（渲染在 body 下，需全局样式） */
.sidebar-collapsed-popper.el-popover.el-popper {
  padding: 6px !important;
  border-radius: 10px !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
}

.collapsed-submenu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: #334155;
  transition: all 0.15s;
}

.collapsed-submenu-item:hover {
  background-color: #eff6ff;
  color: #3b82f6;
}

/* 折叠态弹出子菜单当前路由项：品牌蓝实底 + 白字（与主菜单选中同款） */
.collapsed-submenu-item.is-active {
  background-color: #3b82f6;
  color: #ffffff;
}

.collapsed-submenu-item.is-active:hover {
  background-color: #3b82f6;
  color: #ffffff;
}

.collapsed-submenu-item .el-icon {
  font-size: 16px;
}
</style>
