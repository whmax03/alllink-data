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
    meta: { titleKey: 'nav.inventory', perm: 'page:inventory' },
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
    meta: { titleKey: 'nav.users', requiresAdmin: true, perm: 'page:users' },
  },
  {
    path: '/permissions',
    name: 'Permissions',
    component: () => import('../views/Permissions.vue'),
    meta: { titleKey: 'nav.permissions', requiresAdmin: true, perm: 'page:rbac' },
  },
  {
    path: '/roles',
    name: 'Roles',
    component: () => import('../views/Roles.vue'),
    meta: { titleKey: 'nav.roles', requiresAdmin: true },
  },
  // 404 兜底：独立页面（不入 Tab、不进主布局），无任何页面权限的用户也会落到这里
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('../views/NotFound.vue'),
    meta: { titleKey: 'notFound.title', public: true },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// 全局前置守卫：未登录跳登录页；admin 页面校验角色；带 perm 的页面按权限码校验
// 权限不足时的跳转带上 deniedTab 标记，App.vue 读取后会自动关闭该无权限残留 Tab
// 用户无任何可访问页面（无库存权限且非 admin）时跳 404，避免空壳布局
router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore()
  const isPublic = to.meta?.public === true

  if (!isPublic && !authStore.isLoggedIn) {
    next({ name: 'Login', query: { redirect: to.fullPath } })
  } else if (isPublic && authStore.isLoggedIn && (to.name === 'Login' || to.name === 'Register')) {
    // 已登录时不允许访问登录/注册页，跳转首页
    next('/')
  } else if (to.name === 'NotFound') {
    // 404 页直接放行（未登录也可见，页面内提供回登录入口）
    next()
  } else if (to.meta?.requiresAdmin) {
    // 旧缓存登录态可能缺 roles/permissions，先幂等补齐再判断
    await authStore.ensureRoles()
    await authStore.ensurePermissions()
    if (!authStore.isAdmin) {
      next({ name: 'NotFound' })
    } else {
      next()
    }
  } else if (to.meta?.perm) {
    // 页面权限码校验（旧缓存缺 permissions 先补齐）
    await authStore.ensurePermissions()
    if (!authStore.hasPerm(to.meta.perm as string)) {
      // 目标即库存页时跳 404：不再放行兑底（空壳页面 + 空菜单的体验不可接受）；404 页提供回首页入口
      if (to.path === '/inventory') {
        next({ name: 'NotFound' })
      } else {
        // 其他无权限页：有库存权限则弹回库存页（deniedTab 标记驱动残留 Tab 清理），否则 404
        if (authStore.hasPerm('page:inventory')) {
          next({ path: '/inventory', query: { deniedTab: '1' } })
        } else {
          next({ name: 'NotFound' })
        }
      }
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
