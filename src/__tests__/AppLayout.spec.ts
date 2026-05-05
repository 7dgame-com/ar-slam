import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import i18n from '../i18n'

const apiMock = vi.hoisted(() => ({
  verifyCurrentToken: vi.fn(),
}))

vi.mock('../api/index', () => ({
  verifyCurrentToken: apiMock.verifyCurrentToken,
}))

async function flushAsync() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

async function mountLayout() {
  const { default: AppLayout } = await import('../layout/AppLayout.vue')
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        component: AppLayout,
        children: [
          {
            path: 'workbench',
            component: { template: '<div data-test="protected-workbench">protected workbench</div>' },
          },
        ],
      },
    ],
  })
  await router.push('/workbench')
  await router.isReady()

  return mount({ template: '<router-view />' }, {
    global: {
      plugins: [router, i18n],
      mocks: { $t: (key: string) => key },
      stubs: {
        ElEmpty: { props: ['description'], template: '<div data-test="empty">{{ description }}</div>' },
        ElIcon: { template: '<span><slot /></span>' },
        ElTag: { template: '<span><slot /></span>' },
        Close: true,
        Fold: true,
        Loading: true,
        Location: true,
        User: true,
      },
    },
  })
}

async function mountLocalizedLayout() {
  const { default: AppLayout } = await import('../layout/AppLayout.vue')
  i18n.global.locale.value = 'zh-CN'
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        component: AppLayout,
        children: [
          {
            path: 'workbench',
            component: { template: '<div data-test="protected-workbench">protected workbench</div>' },
            meta: { titleKey: 'workbench.title' },
          },
        ],
      },
    ],
  })
  await router.push('/workbench')
  await router.isReady()

  return mount({ template: '<router-view />' }, {
    global: {
      plugins: [router, i18n],
      stubs: {
        ElEmpty: { props: ['description'], template: '<div data-test="empty">{{ description }}</div>' },
        ElIcon: { template: '<span><slot /></span>' },
        ElTag: { template: '<span><slot /></span>' },
        Close: true,
        Fold: true,
        Loading: true,
        Location: true,
        User: true,
      },
    },
  })
}

describe('AppLayout', () => {
  beforeEach(() => {
    vi.resetModules()
    apiMock.verifyCurrentToken.mockReset()
  })

  it('does not render protected workbench content when session verification fails', async () => {
    apiMock.verifyCurrentToken.mockRejectedValue(new Error('invalid token'))

    const wrapper = await mountLayout()
    await flushAsync()

    expect(wrapper.find('[data-test="protected-workbench"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('permission.noPermission')
  })

  it('does not render an in-plugin language switcher', async () => {
    apiMock.verifyCurrentToken.mockResolvedValue({
      id: 'u-1',
      username: 'operator',
      roles: ['user'],
    })

    const wrapper = await mountLocalizedLayout()
    await flushAsync()

    expect(wrapper.find('[data-test="language-select"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('定位工作台')
  })
})
