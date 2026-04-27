import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkbenchView from '../views/WorkbenchView.vue'
import type { ParsedScanPackage } from '../domain/scanTypes'

const parserMock = vi.hoisted(() => ({
  parseScanPackage: vi.fn(),
}))
const apiMock = vi.hoisted(() => ({
  fetchVerseScenes: vi.fn(),
  fetchSceneBindings: vi.fn(),
  createSceneBindings: vi.fn(),
}))
const uploadMock = vi.hoisted(() => ({
  uploadScanPackageToMain: vi.fn(),
}))

vi.mock('../domain/scanPackageParser', () => ({
  parseScanPackage: parserMock.parseScanPackage,
}))

vi.mock('../api', () => ({
  fetchVerseScenes: apiMock.fetchVerseScenes,
  fetchSceneBindings: apiMock.fetchSceneBindings,
  createSceneBindings: apiMock.createSceneBindings,
}))

vi.mock('../services/mainResourceUpload', () => ({
  uploadScanPackageToMain: uploadMock.uploadScanPackageToMain,
}))

vi.mock('../components/GlbPreview.vue', () => ({
  default: {
    props: ['modelUrl', 'modelName'],
    setup(_props: unknown, { expose }: { expose: (exposed: Record<string, unknown>) => void }) {
      expose({
        captureScreenshot: vi.fn(async () => new Blob(['thumb'], { type: 'image/png' })),
      })
      return {}
    },
    template: '<div data-test="glb-preview">{{ modelName }}</div>',
  },
}))

function parsedPackage(overrides: Partial<ParsedScanPackage> = {}): ParsedScanPackage {
  const zipName = overrides.zipName || 'room.zip'
  const modelName = overrides.modelFile?.name || 'room.glb'
  const localizationName = overrides.localizationFiles?.[0]?.name || 'map.bytes'

  return {
    id: `pkg-${zipName}`,
    zipName,
    provider: 'immersal',
    files: [
      { path: modelName, name: modelName, extension: 'glb', size: 10, role: 'model' },
      { path: localizationName, name: localizationName, extension: 'bytes', size: 20, role: 'localization' },
    ],
    modelFile: { path: modelName, name: modelName, extension: 'glb', size: 10, role: 'model' },
    localizationFiles: [
      { path: localizationName, name: localizationName, extension: 'bytes', size: 20, role: 'localization' },
    ],
    warnings: [],
    errors: [],
    needsManualSelection: false,
    modelBlobUrl: `blob:${modelName}`,
    ...overrides,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

function mountWorkbench() {
  return mount(WorkbenchView, {
    global: {
      mocks: {
        $t: (key: string) => key,
      },
      stubs: {
        ElButton: { template: '<button type="button" @click="$emit(`click`)"><slot /></button>' },
        ElCard: { template: '<section><slot name="header" /><slot /></section>' },
        ElOption: true,
        ElSelect: { template: '<select><slot /></select>' },
        ElTag: { template: '<span><slot /></span>' },
        ElAlert: { template: '<div><slot /></div>' },
        ElEmpty: { template: '<div />' },
        ElInput: { template: '<input />' },
        ElRadioGroup: { template: '<div><slot /></div>' },
        ElRadioButton: { template: '<button type="button"><slot /></button>' },
      },
    },
  })
}

async function flushAsync(wrapper: VueWrapper) {
  await Promise.resolve()
  await Promise.resolve()
  await wrapper.vm.$nextTick()
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}

async function uploadFile(wrapper: VueWrapper, fileName: string) {
  const input = wrapper.find<HTMLInputElement>('input[type="file"]')
  const file = new File(['zip'], fileName, { type: 'application/zip' })
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  await flushAsync(wrapper)
  return file
}

describe('WorkbenchView', () => {
  beforeEach(() => {
    parserMock.parseScanPackage.mockReset()
    apiMock.fetchVerseScenes.mockReset()
    apiMock.fetchSceneBindings.mockReset()
    apiMock.createSceneBindings.mockReset()
    uploadMock.uploadScanPackageToMain.mockReset()
    apiMock.fetchVerseScenes.mockResolvedValue({
      scenes: [
        { id: '101', name: '旗舰店展厅', description: '上海 / 1F' },
        { id: '102', name: '培训教室', description: '深圳 / Lab A' },
      ],
      pagination: { page: 1, perPage: 10, pageCount: 2, totalCount: 12 },
    })
    apiMock.fetchSceneBindings.mockResolvedValue([])
    apiMock.createSceneBindings.mockResolvedValue({
      spaceId: 701,
      verseIds: [101, 102],
    })
    uploadMock.uploadScanPackageToMain.mockResolvedValue({
      spaceId: 701,
      spaceName: 'room.zip',
      cosPrefix: 'ar-slam-localization/pkg-room.zip',
      runtimeFileId: 14,
      modelFileId: 11,
      thumbnailFileId: 13,
      localizationFileIds: [12],
    })
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
  })

  it('shows backend scenes, uploads the package, creates a space, and binds multiple scenes', async () => {
    parserMock.parseScanPackage.mockResolvedValue(parsedPackage())
    const wrapper = mountWorkbench()
    const input = wrapper.find('input[type="file"]')

    expect(input.attributes('aria-label')).toBe('Upload scan ZIP')
    await flushAsync(wrapper)
    expect(apiMock.fetchVerseScenes).toHaveBeenCalledWith({ page: 1, perPage: 10, search: '' })
    expect(wrapper.text()).toContain('旗舰店展厅')
    expect(wrapper.text()).toContain('Page 1 / 2')

    const file = await uploadFile(wrapper, 'room.zip')

    expect(wrapper.text()).toContain('room.zip')
    expect(wrapper.text()).toContain('room.glb')
    expect(wrapper.text()).toContain('map.bytes')

    await wrapper.find('[data-test="scene-101"]').trigger('click')
    await wrapper.find('[data-test="scene-102"]').trigger('click')
    await wrapper.find('[data-test="upload-bind"]').trigger('click')
    await flushAsync(wrapper)

    expect(uploadMock.uploadScanPackageToMain).toHaveBeenCalledWith(expect.objectContaining({
      sourceFile: file,
      parsedPackage: expect.objectContaining({ zipName: 'room.zip' }),
      thumbnailBlob: expect.any(Blob),
    }))
    expect(apiMock.createSceneBindings).toHaveBeenCalledWith({
      spaceId: 701,
      verseIds: ['101', '102'],
    })
    expect(wrapper.text()).toContain('Binding Result')
    expect(wrapper.text()).toContain('"spaceId": 701')
  })

  it('shows upload progress while the main resource upload is running', async () => {
    const upload = deferred<{
      spaceId: number
      spaceName: string
      cosPrefix: string
      runtimeFileId: number
      modelFileId: number
      thumbnailFileId: number
      localizationFileIds: number[]
    }>()
    uploadMock.uploadScanPackageToMain.mockImplementation(({ onProgress }) => {
      onProgress({ stage: 'Uploading room/model.glb', percent: 45 })
      return upload.promise
    })
    parserMock.parseScanPackage.mockResolvedValue(parsedPackage())
    const wrapper = mountWorkbench()

    await flushAsync(wrapper)
    await uploadFile(wrapper, 'room.zip')
    await wrapper.find('[data-test="scene-101"]').trigger('click')
    await wrapper.find('[data-test="upload-bind"]').trigger('click')
    await flushAsync(wrapper)

    expect(wrapper.text()).toContain('Uploading room/model.glb')
    expect(wrapper.text()).toContain('45%')

    upload.resolve({
      spaceId: 701,
      spaceName: 'room.zip',
      cosPrefix: 'ar-slam-localization/pkg-room.zip',
      runtimeFileId: 14,
      modelFileId: 11,
      thumbnailFileId: 13,
      localizationFileIds: [12],
    })
    await flushAsync(wrapper)
  })

  it('does not allow selecting a scene that is already bound to another SLAM package', async () => {
    apiMock.fetchSceneBindings.mockResolvedValue([
      { sceneId: '101', spaceId: '702', spaceName: '旧定位包' },
    ])
    parserMock.parseScanPackage.mockResolvedValue(parsedPackage())
    const wrapper = mountWorkbench()

    await flushAsync(wrapper)
    expect(wrapper.text()).toContain('Bound to 旧定位包')

    await uploadFile(wrapper, 'room.zip')
    await wrapper.find('[data-test="scene-101"]').trigger('click')

    expect(wrapper.find('[data-test="upload-bind"]').attributes('disabled')).toBeDefined()
  })

  it('refreshes scenes when binding creation fails because a scene was claimed concurrently', async () => {
    parserMock.parseScanPackage.mockResolvedValue(parsedPackage())
    apiMock.createSceneBindings.mockRejectedValueOnce(new Error('Scene is already bound.'))
    const wrapper = mountWorkbench()

    await flushAsync(wrapper)
    await uploadFile(wrapper, 'room.zip')
    await wrapper.find('[data-test="scene-101"]').trigger('click')
    await wrapper.find('[data-test="upload-bind"]').trigger('click')
    await flushAsync(wrapper)
    await flushAsync(wrapper)

    expect(wrapper.text()).toContain('Scene is already bound.')
    expect(apiMock.fetchVerseScenes).toHaveBeenCalledTimes(2)
  })

  it('shows parse errors and clears stale parsed package data', async () => {
    parserMock.parseScanPackage
      .mockResolvedValueOnce(parsedPackage())
      .mockRejectedValueOnce(new Error('Only .zip scan packages are supported.'))
    const wrapper = mountWorkbench()

    await uploadFile(wrapper, 'room.zip')
    expect(wrapper.text()).toContain('room.zip')
    expect(wrapper.text()).toContain('room.glb')

    await uploadFile(wrapper, 'broken.zip')

    expect(wrapper.text()).toContain('Only .zip scan packages are supported.')
    expect(wrapper.text()).not.toContain('room.zip')
    expect(wrapper.text()).not.toContain('room.glb')
    expect(wrapper.text()).not.toContain('map.bytes')
  })

  it('keeps the latest parse result and revokes stale blobs when parses finish out of order', async () => {
    const firstParse = deferred<ParsedScanPackage>()
    const secondParse = deferred<ParsedScanPackage>()
    parserMock.parseScanPackage
      .mockReturnValueOnce(firstParse.promise)
      .mockReturnValueOnce(secondParse.promise)
    const wrapper = mountWorkbench()

    await uploadFile(wrapper, 'room.zip')
    await wrapper.find('select#provider-select').setValue('area-target-scanner')
    await flushAsync(wrapper)

    expect(parserMock.parseScanPackage).toHaveBeenNthCalledWith(1, expect.any(File), 'auto')
    expect(parserMock.parseScanPackage).toHaveBeenNthCalledWith(2, expect.any(File), 'area-target-scanner')

    secondParse.resolve(parsedPackage({
      zipName: 'current-room.zip',
      modelFile: { path: 'current.glb', name: 'current.glb', extension: 'glb', size: 10, role: 'model' },
    }))
    await flushAsync(wrapper)

    expect(wrapper.text()).toContain('current-room.zip')
    expect(wrapper.text()).toContain('current.glb')

    firstParse.resolve(parsedPackage({
      zipName: 'stale-room.zip',
      modelFile: { path: 'stale.glb', name: 'stale.glb', extension: 'glb', size: 10, role: 'model' },
    }))
    await flushAsync(wrapper)

    expect(wrapper.text()).toContain('current-room.zip')
    expect(wrapper.text()).toContain('current.glb')
    expect(wrapper.text()).not.toContain('stale-room.zip')
    expect(wrapper.text()).not.toContain('stale.glb')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:stale.glb')
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:current.glb')
  })

  it('revokes a parse result that resolves after unmount', async () => {
    const pendingParse = deferred<ParsedScanPackage>()
    parserMock.parseScanPackage.mockReturnValueOnce(pendingParse.promise)
    const wrapper = mountWorkbench()

    await uploadFile(wrapper, 'room.zip')
    wrapper.unmount()

    pendingParse.resolve(parsedPackage({
      zipName: 'after-unmount.zip',
      modelFile: {
        path: 'after-unmount.glb',
        name: 'after-unmount.glb',
        extension: 'glb',
        size: 10,
        role: 'model',
      },
    }))
    await flushPromises()

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:after-unmount.glb')
    expect(wrapper.text()).not.toContain('after-unmount.zip')
  })
})
