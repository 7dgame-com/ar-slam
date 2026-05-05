<template>
  <div class="app-layout">
    <!-- 侧边栏遮罩 -->
    <div
      v-if="sidebarOpen && hasAny()"
      class="sidebar-overlay"
      @click="sidebarOpen = false"
    />

    <!-- 抽屉式侧边栏 -->
    <aside v-if="hasAny()" class="sidebar" :class="{ open: sidebarOpen }">
      <div class="sidebar-header">
        <span class="sidebar-title">{{ $t('pluginMeta.name') }}</span>
        <button class="sidebar-close" @click="sidebarOpen = false">
          <el-icon><Close /></el-icon>
        </button>
      </div>
      <nav class="sidebar-nav">
        <router-link
          v-if="can('workbench-access')"
          to="/workbench"
          class="sidebar-item"
          :class="{ active: $route.path === '/workbench' }"
          @click="sidebarOpen = false"
        >
          <el-icon><Location /></el-icon>
          <span>{{ $t('nav.workbench') }}</span>
        </router-link>
      </nav>
    </aside>

    <!-- 主内容区 -->
    <div class="main-area">
      <header class="navbar">
        <button v-if="hasAny()" class="menu-btn" @click="sidebarOpen = true">
          <el-icon :size="20"><Fold /></el-icon>
        </button>
        <h1 class="navbar-title">{{ navbarTitle }}</h1>
        <div class="navbar-spacer" />
        <div v-if="userInfo" class="user-info">
          <el-icon><User /></el-icon>
          <span>{{ userInfo.nickname || userInfo.username }}</span>
          <el-tag size="small" v-for="role in userInfo.roles" :key="role">{{ role }}</el-tag>
        </div>
      </header>
      <main class="content">
        <div v-if="!ready" class="loading-state">
          <el-icon class="is-loading" :size="24"><Loading /></el-icon>
        </div>
        <div v-else-if="!hasAny()" class="no-permission">
          <el-empty :description="$t('permission.noPermission')" />
        </div>
        <router-view v-else />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Close, User, Fold, Location, Loading } from '@element-plus/icons-vue'
import { useAuthSession } from '../composables/useAuthSession'
import { usePermissions } from '../composables/usePermissions'

const { user } = useAuthSession()
const { fetchPermissions, can, hasAny, loaded } = usePermissions()
const route = useRoute()
const { t } = useI18n()

const sidebarOpen = ref(false)
const userInfo = computed(() => user.value)
const ready = ref(false)
const navbarTitle = computed(() => {
  if (typeof route.meta.titleKey === 'string') {
    return t(route.meta.titleKey)
  }
  return route.meta.title || t('pluginMeta.name')
})

onMounted(async () => {
  try {
    await fetchPermissions()
  } catch {
    // 静默失败，不影响页面使用
  } finally {
    ready.value = true
  }
})
</script>

<style scoped>
.app-layout {
  min-height: 100vh;
  background: var(--bg-page);
}

.sidebar-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 998;
  transition: opacity var(--transition-normal);
}

.sidebar {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  width: 260px;
  background: var(--bg-card);
  border-right: 1px solid var(--border-color);
  box-shadow: var(--shadow-lg);
  z-index: 999;
  transform: translateX(-100%);
  transition: transform var(--transition-normal);
  display: flex;
  flex-direction: column;
}

.sidebar.open {
  transform: translateX(0);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);
}

.sidebar-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--primary-color);
}

.sidebar-close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  padding: var(--spacing-xs);
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.sidebar-close:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.sidebar-nav {
  flex: 1;
  padding: var(--spacing-sm);
  overflow-y: auto;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 12px var(--spacing-md);
  color: var(--text-secondary);
  text-decoration: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  margin-bottom: var(--spacing-xs);
  border: none;
  background: none;
  width: 100%;
  font-size: var(--font-size-md);
  font-family: var(--font-family);
}

.sidebar-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.sidebar-item.active {
  background: var(--primary-light);
  color: var(--primary-color);
  font-weight: var(--font-weight-medium);
}

.main-area {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.navbar {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-lg);
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
  height: 56px;
}

.menu-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  padding: var(--spacing-xs);
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
}

.menu-btn:hover {
  color: var(--primary-color);
  background: var(--bg-hover);
}

.navbar-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.navbar-spacer {
  flex: 1;
}

.user-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.content {
  flex: 1;
  padding: var(--spacing-lg);
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--text-muted);
}

.no-permission {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
}
</style>
