import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { i18n } from '../i18n'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { titleKey: 'auth.loginTitle', public: true },
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('../views/Register.vue'),
    meta: { titleKey: 'auth.registerTitle', public: true },
  },
  {
    path: '/change-password',
    name: 'ChangePassword',
    component: () => import('../views/ChangePassword.vue'),
    meta: { titleKey: 'auth.changePasswordTitle', public: true },
  },
  {
    path: '/',
    redirect: '/inventory'
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('../views/Dashboard.vue'),
    meta: { titleKey: 'nav.dashboard' },
  },
  {
    path: '/orders',
    name: 'Orders',
    component: () => import('../views/Orders.vue'),
    meta: { titleKey: 'nav.orders' },
  },
  {
    path: '/inventory',
    name: 'Inventory',
    component: () => import('../views/Inventory.vue'),
    meta: { titleKey: 'nav.inventory' },
  },
  {
    path: '/sync',
    name: 'Sync',
    component: () => import('../views/Sync.vue'),
    meta: { titleKey: 'nav.sync' },
  },
  {
    path: '/users',
    name: 'Users',
    component: () => import('../views/Users.vue'),
    meta: { titleKey: 'nav.users', requiresAdmin: true },
  },
  {
    path: '/permissions',
    name: 'Permissions',
    component: () => import('../views/Permissions.vue'),
    meta: { titleKey: 'nav.permissions', requiresAdmin: true },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// 全局前置守卫：未登录跳登录页；admin 页面校验角色（旧缓存登录态先补齐 roles）
// 权限不足时的跳转带上 deniedTab 标记，App.vue 读取后会自动关闭该无权限残留 Tab
router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore()
  const isPublic = to.meta?.public === true

  if (!isPublic && !authStore.isLoggedIn) {
    next({ name: 'Login', query: { redirect: to.fullPath } })
  } else if (isPublic && authStore.isLoggedIn && (to.name === 'Login' || to.name === 'Register')) {
    // 已登录时不允许访问登录/注册页，跳转首页
    next('/')
  } else if (to.meta?.requiresAdmin) {
    // 旧缓存登录态可能缺 roles，先幂等补齐再判断
    await authStore.ensureRoles()
    if (!authStore.isAdmin) {
      next({ path: '/inventory', query: { deniedTab: '1' } })
    } else {
      next()
    }
  } else {
    next()
  }
})

// 页面标题随路由与语言同步（带 AllLink Data 后缀）
// 注：语言切换时标题更新由 App.vue 中的 locale watcher 触发，路由切换时由 afterEach 触发
function syncDocumentTitle() {
  const key = (router.currentRoute.value.meta?.titleKey as string) || ''
  document.title = key ? `${i18n.t(key)} · AllLink Data` : 'AllLink Data'
}

router.afterEach(() => syncDocumentTitle())

export default router
