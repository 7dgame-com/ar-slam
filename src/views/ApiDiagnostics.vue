<template>
  <div class="diagnostics">
    <div class="diag-header">
      <h2>API 诊断面板</h2>
      <el-button type="primary" :loading="runningAll" @click="runAll">全部测试</el-button>
    </div>

    <!-- 环境信息 -->
    <div class="section">
      <h3>环境信息</h3>
      <div class="info-grid">
        <div class="info-item">
          <span class="label">当前页面地址</span>
          <code>{{ envInfo.location }}</code>
        </div>
        <div class="info-item">
          <span class="label">Origin</span>
          <code>{{ envInfo.origin }}</code>
        </div>
        <div class="info-item">
          <span class="label">sampleApi baseURL</span>
          <code>{{ envInfo.sampleApiBase }}</code>
        </div>
        <div class="info-item">
          <span class="label">mainApi baseURL</span>
          <code>{{ envInfo.mainApiBase }}</code>
        </div>
        <div class="info-item">
          <span class="label">Nginx 上游配置</span>
          <code>{{ envInfo.upstreams || '-' }}</code>
        </div>
        <div class="info-item">
          <span class="label">Token 状态</span>
          <code :class="envInfo.hasToken ? 'ok' : 'warn'">{{ envInfo.hasToken ? '已设置' : '未设置' }}</code>
        </div>
        <div class="info-item">
          <span class="label">是否在 iframe 中</span>
          <code>{{ envInfo.isIframe ? '是' : '否' }}</code>
        </div>
        <div class="info-item">
          <span class="label">容器 hostname</span>
          <code>{{ envInfo.hostname || '-' }}</code>
        </div>
        <div class="info-item">
          <span class="label">容器启动时间</span>
          <code>{{ envInfo.serverBuildTime || '-' }}</code>
        </div>
      </div>
    </div>

    <!-- 反向代理检测 -->
    <div class="section">
      <h3>反向代理连通性检测</h3>
      <p class="hint">直接用 fetch 探测各 Nginx proxy_pass location，检测代理是否正确配置</p>
      <el-button type="primary" :loading="runningProxy" @click="runAllProxy" style="margin-bottom: 12px">全部检测</el-button>
      <el-table :data="proxyTests" stripe border>
        <el-table-column prop="name" label="代理路径" width="220" />
        <el-table-column label="请求 URL" min-width="300">
          <template #default="{ row }">
            <code class="url">{{ row.url }}</code>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="140">
          <template #default="{ row }">
            <el-tag v-if="row.status === 'pending'" type="info" size="small">待检测</el-tag>
            <el-tag v-else-if="row.status === 'loading'" type="warning" size="small">检测中</el-tag>
            <el-tag v-else-if="row.status === 'success'" type="success" size="small">{{ row.httpStatus }} 可达</el-tag>
            <el-tag v-else type="danger" size="small">{{ row.httpStatus || '不可达' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="响应" min-width="380">
          <template #default="{ row }">
            <div v-if="row.responseBody">
              <pre>{{ row.responseBody }}</pre>
            </div>
            <div v-if="row.errorMessage" class="error-msg">❌ {{ row.errorMessage }}</div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="runProxyTest(row)">检测</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 自定义 URL 测试 -->
    <div class="section">
      <h3>自定义 URL 测试</h3>
      <div class="custom-test">
        <el-input v-model="customUrl" placeholder="输入完整或相对 URL" style="flex:1" />
        <el-select v-model="customMethod" style="width: 120px">
          <el-option label="GET" value="GET" />
          <el-option label="POST" value="POST" />
        </el-select>
        <el-button type="primary" @click="runCustom" :loading="customLoading">发送</el-button>
      </div>
      <div v-if="customResult" class="custom-result">
        <div>HTTP {{ customResult.status }} {{ customResult.statusText }}</div>
        <pre>{{ customResult.body }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import sampleApi, { mainApi } from '../api'
import { getToken, isInIframe } from '../utils/token'

const envInfo = reactive({
  location: window.location.href,
  origin: window.location.origin,
  sampleApiBase: sampleApi.defaults.baseURL || '/api/v1/plugin-template',
  mainApiBase: mainApi.defaults.baseURL || '/api/v1',
  hasToken: !!getToken(),
  isIframe: isInIframe(),
  upstreams: '',
  hostname: '',
  serverBuildTime: '',
})

interface ProxyTestItem {
  name: string
  url: string
  status: 'pending' | 'loading' | 'success' | 'error'
  httpStatus: number | string
  responseBody: string
  errorMessage: string
}

const proxyTests = ref<ProxyTestItem[]>([
  { name: '/api/ → Token 验证', url: '/api/v1/plugin/verify-token', status: 'pending', httpStatus: '', responseBody: '', errorMessage: '' },
  { name: '/health → 健康检查', url: '/health', status: 'pending', httpStatus: '', responseBody: '', errorMessage: '' },
  { name: '/debug-env → 调试环境', url: '/debug-env', status: 'pending', httpStatus: '', responseBody: '', errorMessage: '' },
  { name: '/ → 前端静态文件', url: '/', status: 'pending', httpStatus: '', responseBody: '', errorMessage: '' },
])

async function runProxyTest(item: ProxyTestItem) {
  item.status = 'loading'
  item.responseBody = ''
  item.errorMessage = ''
  try {
    const token = getToken()
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    const resp = await fetch(item.url, { headers })
    item.httpStatus = resp.status
    item.status = resp.ok ? 'success' : 'error'
    const text = await resp.text()
    item.responseBody = text.slice(0, 300)
  } catch (err: unknown) {
    item.status = 'error'
    item.errorMessage = err instanceof Error ? err.message : String(err)
  }
}

const runningProxy = ref(false)
async function runAllProxy() {
  runningProxy.value = true
  for (const t of proxyTests.value) {
    await runProxyTest(t)
  }
  runningProxy.value = false
}

const runningAll = ref(false)
async function runAll() {
  runningAll.value = true
  await runAllProxy()
  runningAll.value = false
}

const customUrl = ref('')
const customMethod = ref('GET')
const customLoading = ref(false)
const customResult = ref<{ status: number; statusText: string; body: string } | null>(null)

async function runCustom() {
  if (!customUrl.value) return
  customLoading.value = true
  customResult.value = null
  try {
    const token = getToken()
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    const resp = await fetch(customUrl.value, { method: customMethod.value, headers })
    const text = await resp.text()
    customResult.value = {
      status: resp.status,
      statusText: resp.statusText,
      body: text.slice(0, 1000),
    }
  } catch (err: unknown) {
    customResult.value = { status: 0, statusText: 'Error', body: err instanceof Error ? err.message : String(err) }
  } finally {
    customLoading.value = false
  }
}

onMounted(async () => {
  try {
    const resp = await fetch('/debug-env')
    if (resp.ok) {
      const data = await resp.json()
      const upstreams: string[] = []
      let i = 1
      while (data[`APP_API_${i}_URL`]) {
        upstreams.push(`APP_API_${i}_URL=${data[`APP_API_${i}_URL`]}`)
        i++
      }
      envInfo.upstreams = upstreams.join(' | ')
      envInfo.hostname = data.hostname || ''
      envInfo.serverBuildTime = data.buildTime || ''
    }
  } catch {
    // 静默处理
  }
})
</script>

<style scoped>
.diagnostics {
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--spacing-lg);
}

.diag-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-lg);
}

.section {
  margin-bottom: var(--spacing-xl);
  background: var(--bg-card);
  border-radius: var(--radius-sm);
  padding: var(--spacing-lg);
  border: 1px solid var(--border-color);
}

.section h3 {
  margin-bottom: var(--spacing-md);
  color: var(--text-primary);
}

.hint {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  margin-bottom: var(--spacing-sm);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: var(--spacing-sm);
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--spacing-sm);
  background: var(--bg-secondary);
  border-radius: 8px;
}

.info-item .label {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.info-item code {
  font-size: var(--font-size-sm);
  word-break: break-all;
}

code.ok { color: var(--success-color); }
code.warn { color: var(--warning-color); }

.error-msg {
  color: var(--danger-color);
  font-size: var(--font-size-sm);
}

.custom-test {
  display: flex;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
}

.custom-result {
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: var(--spacing-md);
}

.custom-result pre {
  margin-top: var(--spacing-sm);
  font-size: var(--font-size-sm);
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
