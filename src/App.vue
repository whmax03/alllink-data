<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Box, DataAnalysis, Refresh, ArrowDown, Lock } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useAuthStore } from './stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

// 判断当前路由是否为独立页面（不需要侧边栏布局）
const isStandalonePage = computed(() => {
  return route.meta?.public === true
})

// 菜单配置
const menuItems = [
  { path: '/inventory', label: '库存管理', icon: Box },
  // { path: '/dashboard', label: '数据看板', icon: DataAnalysis },
]

// Tab 标签页管理
interface TabItem {
  title: string
  name: string
  path: string
}

const tabs = ref<TabItem[]>([])
const activeTab = ref('')

// 从本地存储恢复 Tab
const initTabs = () => {
  const savedTabs = localStorage.getItem('ALLINK_TABS')
  if (savedTabs) {
    tabs.value = JSON.parse(savedTabs)
  }
}

// 保存 Tab 到本地存储
const saveTabs = () => {
  localStorage.setItem('ALLINK_TABS', JSON.stringify(tabs.value))
}

// 添加 Tab
const addTab = (toRoute: any) => {
  const { path, meta, name } = toRoute
  // 排除根路径或重定向路径
  if (path === '/') return
  // 排除独立页面（登录/注册/修改密码），不加入 Tab
  if (meta?.public) return

  const title = (meta?.title as string) || (menuItems.find(item => item.path === path)?.label) || (name as string) || '新标签页'
  
  const existingTab = tabs.value.find(tab => tab.path === path)
  if (!existingTab) {
    tabs.value.push({
      title,
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
    ElMessage.warning('至少保留一个标签页')
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
onMounted(() => {
  initTabs()
  if (route.path !== '/' && !route.meta?.public) {
    addTab(route)
  }
})

// 监听路由变化自动添加 Tab
watch(() => route.path, () => {
  addTab(route)
})

// 退出登录
const handleLogout = () => {
  authStore.logout()
  ElMessage.success('已安全退出登录')
  router.push('/login')
}

// 修改密码
const handleChangePassword = () => {
  router.push('/change-password')
}
</script>

<template>
  <!-- 独立页面：登录/注册/修改密码 -->
  <router-view v-if="isStandalonePage" />

  <!-- 主应用布局 -->
  <div v-else class="app-layout-premium">
    <!-- 侧边栏设计 -->
    <aside class="sidebar-premium">
      <div class="brand-section">
        <div class="brand-logo">
          <el-icon><DataAnalysis /></el-icon>
        </div>
        <div class="brand-info">
          <div class="brand-name">AllLink Data</div>
          <div class="brand-version">Enterprise Console</div>
        </div>
      </div>

      <nav class="nav-menu">
        <router-link
          v-for="item in menuItems"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          active-class="is-active"
        >
          <el-icon class="nav-icon"><component :is="item.icon" /></el-icon>
          <span class="nav-label">{{ item.label }}</span>
        </router-link>
      </nav>

      <div class="sidebar-footer">
        <div class="system-status">
          <div class="status-dot"></div>
          <span>系统运行正常</span>
        </div>
      </div>
    </aside>

    <!-- 主内容区 -->
    <div class="main-container">
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
              :label="item.title"
              :name="item.name"
            />
          </el-tabs>
        </div>

        <div class="header-right">
          <el-dropdown trigger="click">
            <div class="user-profile-dropdown">
              <el-avatar :size="32" src="https://core-normal.traeapi.us/api/ide/v1/text_to_image?prompt=minimalist%20avatar%20portrait&image_size=square" />
              <div class="user-meta">
                <span class="user-name">{{ authStore.user?.name || '管理员' }}</span>
                <el-icon><ArrowDown /></el-icon>
              </div>
            </div>
            <template #dropdown>
              <el-dropdown-menu class="premium-dropdown-menu">
                <!-- <el-dropdown-item :icon="User">个人中心</el-dropdown-item>
                <el-dropdown-item :icon="Setting">系统设置</el-dropdown-item> -->
                <el-dropdown-item :icon="Lock" @click="handleChangePassword">修改密码</el-dropdown-item>
                <el-dropdown-item divided :icon="Refresh" @click="handleLogout" class="logout-item">
                  退出登录
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

.sidebar-footer {
  padding: 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.system-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #94a3b8;
}

.status-dot {
  width: 8px;
  height: 8px;
  background-color: #10b981;
  border-radius: 50%;
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
}

/* 主内容区容器 */
.main-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
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
</style>
