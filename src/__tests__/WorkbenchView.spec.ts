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
  fetchExistingSpaces: vi.fn(),
  deleteSpaceRecord: vi.fn(),
  updateSpaceRecord: vi.fn(),
  fetchSceneBindings: vi.fn(),
  createSceneBindings: vi.fn(),
  deleteSceneBinding: vi.fn(),
}))
const uploadMock = vi.hoisted(() => ({
  uploadScanPackageToMain: vi.fn(),
}))

vi.mock('../domain/scanPackageParser', () => ({
  parseScanPackage: parserMock.parseScanPackage,
}))

vi.mock('../api', () => ({
  fetchVerseScenes: apiMock.fetchVerseScenes,
  fetchExistingSpaces: apiMock.fetchExistingSpaces,
  deleteSpaceRecord: apiMock.deleteSpaceRecord,
  updateSpaceRecord: apiMock.updateSpaceRecord,
  fetchSceneBindings: apiMock.fetchSceneBindings,
  createSceneBindings: apiMock.createSceneBindings,
  deleteSceneBinding: apiMock.deleteSceneBinding,
}))

vi.mock('../services/mainResourceUpload', () => ({
  uploadScanPackageToMain: uploadMock.uploadScanPackageToMain,
}))

vi.mock('../components/GlbPreview.vue', () => ({
  default: {
    emits: ['modelLoaded'],
    props: ['modelUrl', 'modelName'],
    setup(_props: unknown, { expose }: { expose: (exposed: Record<string, unknown>) => void }) {
      expose({
        captureScreenshot: vi.fn(async () => new Blob(['thumb'], { type: 'image/png' })),
      })
      return {}
    },
    template: '<button type="button" data-test="glb-preview" :data-model-url="modelUrl || ``" @click="$emit(`modelLoaded`)">{{ modelName }}</button>',
  },
}))

function parsedPackage(overrides: Partial<ParsedScanPackage> = {}): ParsedScanPackage {
  const zipName = overrides.zipName || 'room.zip'
  const modelName = overrides.modelFile?.name || 'room.glb'
  const localizationName = overrides.localizationFiles?.[0]?.name || 'map.bytes'

  return {
    id: `pkg-${zipName}`,
    zipMd5: `pkg-${zipName}`,
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
    apiMock.fetchExistingSpaces.mockReset()
    apiMock.deleteSpaceRecord.mockReset()
    apiMock.updateSpaceRecord.mockReset()
    apiMock.fetchSceneBindings.mockReset()
    apiMock.createSceneBindings.mockReset()
    apiMock.deleteSceneBinding.mockReset()
    uploadMock.uploadScanPackageToMain.mockReset()
    apiMock.fetchVerseScenes.mockResolvedValue({
      scenes: [
        {
          id: '101',
          name: '旗舰店展厅',
          description: '{"name":"旗舰店展厅","description":"上海 / 1F"}',
          thumbnailUrl: 'https://cdn.example.com/scene-101.png',
        },
        {
          id: '102',
          name: '培训教室',
          description: '{"name":"培训教室","description":"深圳 / Lab A"}',
          thumbnailUrl: 'https://cdn.example.com/scene-102.png',
        },
      ],
      pagination: { page: 1, perPage: 10, pageCount: 2, totalCount: 12 },
    })
    apiMock.fetchExistingSpaces.mockResolvedValue([{
      spaceId: 801,
      spaceName: 'A 馆定位包',
      zipMd5: 'zip-md5-a',
      cosPrefix: 'spaces/zip-md5-a',
      modelFileId: 31,
      thumbnailFileId: 33,
      localizationFileIds: [32],
      provider: 'immersal',
      thumbnailUrl: 'https://cdn.example.com/spaces/a.png',
      modelUrl: 'https://cdn.example.com/spaces/space-a.glb',
      modelName: 'space-a.glb',
    }])
    apiMock.deleteSpaceRecord.mockResolvedValue('')
    apiMock.updateSpaceRecord.mockResolvedValue({ id: 801, name: 'A 馆定位包 v2' })
    apiMock.fetchSceneBindings.mockResolvedValue([])
    apiMock.deleteSceneBinding.mockResolvedValue({ code: 0 })
    apiMock.createSceneBindings.mockResolvedValue({
      spaceId: 701,
      verseIds: [101, 102],
    })
    uploadMock.uploadScanPackageToMain.mockResolvedValue({
      spaceId: 701,
      spaceName: 'room.zip',
      zipMd5: 'pkg-room-md5',
      cosPrefix: 'spaces/pkg-room-md5',
      modelFileId: 11,
      thumbnailFileId: 13,
      localizationFileIds: [12],
    })
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
  })

  it('shows backend scenes, uploads the package after GLB preview load, creates a space, and binds multiple scenes', async () => {
    parserMock.parseScanPackage.mockResolvedValue(parsedPackage())
    const wrapper = mountWorkbench()
    const input = wrapper.find('input[type="file"]')

    expect(input.attributes('aria-label')).toBe('Upload scan ZIP')
    await flushAsync(wrapper)
    expect(apiMock.fetchVerseScenes).toHaveBeenCalledWith({ page: 1, perPage: 10, search: '', sort: '-created_at' })
    expect(wrapper.text()).toContain('旗舰店展厅')
    expect(wrapper.text()).not.toContain('上海 / 1F')
    expect(wrapper.find('[data-test="scene-thumbnail-101"]').attributes('src')).toBe('https://cdn.example.com/scene-101.png')
    expect(wrapper.text()).toContain('Page 1 / 2')

    const file = await uploadFile(wrapper, 'room.zip')

    expect(wrapper.text()).toContain('room.zip')
    expect(wrapper.text()).toContain('room.glb')
    expect(wrapper.text()).toContain('map.bytes')

    await wrapper.find('[data-test="glb-preview"]').trigger('click')
    await flushAsync(wrapper)

    expect(uploadMock.uploadScanPackageToMain).toHaveBeenCalledTimes(1)
    expect(uploadMock.uploadScanPackageToMain).toHaveBeenCalledWith(expect.objectContaining({
      sourceFile: file,
      parsedPackage: expect.objectContaining({ zipName: 'room.zip' }),
      thumbnailBlob: expect.any(Blob),
    }))

    await wrapper.find('[data-test="scene-101"]').trigger('click')
    await wrapper.find('[data-test="scene-102"]').trigger('click')
    expect(wrapper.find('[data-test="upload-bind"]').text()).toBe('Bind')
    await wrapper.find('[data-test="upload-bind"]').trigger('click')
    await flushAsync(wrapper)

    expect(uploadMock.uploadScanPackageToMain).toHaveBeenCalledTimes(1)
    expect(apiMock.createSceneBindings).toHaveBeenCalledWith({
      spaceId: 701,
      verseIds: ['101', '102'],
    })
    expect(wrapper.text()).toContain('Binding Result')
    expect(wrapper.text()).toContain('"spaceId": 701')
  })

  it('uploads the provider-cleaned ZIP returned by the parser', async () => {
    const cleanZipFile = new File(['clean zip'], 'room.zip', { type: 'application/zip' })
    parserMock.parseScanPackage.mockResolvedValue({
      ...parsedPackage(),
      cleanZipFile,
    } as ParsedScanPackage & { cleanZipFile: File })
    const wrapper = mountWorkbench()

    const originalFile = await uploadFile(wrapper, 'room.zip')
    await wrapper.find('[data-test="glb-preview"]').trigger('click')
    await flushAsync(wrapper)

    const uploadParams = uploadMock.uploadScanPackageToMain.mock.calls[0]?.[0] as { sourceFile: File }
    expect(uploadParams.sourceFile).toBe(cleanZipFile)
    expect(uploadParams.sourceFile).not.toBe(originalFile)
  })

  it('lists reusable spaces and binds selected scenes with a previous space without uploading again', async () => {
    const wrapper = mountWorkbench()

    await flushAsync(wrapper)

    expect(apiMock.fetchExistingSpaces).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('A 馆定位包')
    expect(wrapper.text()).toContain('zip-md5-a')
    expect(wrapper.find('[data-test="space-thumbnail-801"]').attributes('src')).toBe('https://cdn.example.com/spaces/a.png')

    expect(wrapper.find('[data-test="delete-space-801"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="edit-space-801"]').exists()).toBe(true)
    await wrapper.find('[data-test="space-801"]').trigger('click')
    expect(wrapper.find('[data-test="space-modal-801"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="glb-preview"]').attributes('data-model-url')).toBe('https://cdn.example.com/spaces/space-a.glb')
    expect(wrapper.text()).toContain('space-a.glb')

    await wrapper.find('[data-test="scene-101"]').trigger('click')

    expect(wrapper.find('[data-test="upload-bind"]').attributes('disabled')).toBeUndefined()
    await wrapper.find('[data-test="upload-bind"]').trigger('click')
    await flushAsync(wrapper)

    expect(uploadMock.uploadScanPackageToMain).not.toHaveBeenCalled()
    expect(apiMock.createSceneBindings).toHaveBeenCalledWith({
      spaceId: 801,
      verseIds: ['101'],
    })
    expect(wrapper.text()).toContain('Binding Result')
    expect(wrapper.text()).toContain('"spaceId": 801')
  })

  it('opens a management modal for an existing space and renames it', async () => {
    const wrapper = mountWorkbench()

    await flushAsync(wrapper)
    await wrapper.find('[data-test="edit-space-801"]').trigger('click')

    expect(wrapper.find('[data-test="space-modal-801"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="use-space-801"]').exists()).toBe(false)
    const nameInput = wrapper.find<HTMLInputElement>('[data-test="space-name-input-801"]')
    expect(nameInput.element.value).toBe('A 馆定位包')

    await nameInput.setValue('A 馆定位包 v2')
    await wrapper.find('[data-test="save-space-801"]').trigger('click')
    await flushAsync(wrapper)

    expect(apiMock.updateSpaceRecord).toHaveBeenCalledWith(801, { name: 'A 馆定位包 v2' })
    expect(wrapper.find('[data-test="space-modal-801"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="space-801"]').text()).toContain('A 馆定位包 v2')
  })

  it('refreshes scene binding space names after renaming a space', async () => {
    apiMock.fetchSceneBindings
      .mockResolvedValueOnce([{ sceneId: '101', spaceId: '801', spaceName: 'A 馆定位包' }])
      .mockResolvedValueOnce([{ sceneId: '101', spaceId: '801', spaceName: 'A 馆定位包 v2' }])
    const wrapper = mountWorkbench()

    await flushAsync(wrapper)
    expect(wrapper.find('[data-test="scene-101"]').text()).toContain('A 馆定位包')

    await wrapper.find('[data-test="edit-space-801"]').trigger('click')
    await wrapper.find<HTMLInputElement>('[data-test="space-name-input-801"]').setValue('A 馆定位包 v2')
    await wrapper.find('[data-test="save-space-801"]').trigger('click')
    await flushAsync(wrapper)
    await flushAsync(wrapper)

    expect(apiMock.updateSpaceRecord).toHaveBeenCalledWith(801, { name: 'A 馆定位包 v2' })
    expect(apiMock.fetchVerseScenes).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-test="scene-101"]').text()).toContain('A 馆定位包 v2')
  })

  it('confirms deletion inline and clears the preview and binding target', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    apiMock.fetchExistingSpaces
      .mockResolvedValueOnce([{
        spaceId: 801,
        spaceName: 'A 馆定位包',
        zipMd5: 'zip-md5-a',
        cosPrefix: 'spaces/zip-md5-a',
        modelFileId: 31,
        thumbnailFileId: 33,
        localizationFileIds: [32],
        provider: 'immersal',
        thumbnailUrl: 'https://cdn.example.com/spaces/a.png',
        modelUrl: 'https://cdn.example.com/spaces/space-a.glb',
        modelName: 'space-a.glb',
      }])
      .mockResolvedValueOnce([])
    apiMock.fetchSceneBindings
      .mockResolvedValueOnce([{ sceneId: '101', spaceId: '801', spaceName: 'A 馆定位包' }])
      .mockResolvedValueOnce([])
    const wrapper = mountWorkbench()

    await flushAsync(wrapper)
    await wrapper.find('[data-test="space-801"]').trigger('click')
    expect(wrapper.find('[data-test="glb-preview"]').attributes('data-model-url')).toBe('https://cdn.example.com/spaces/space-a.glb')
    expect(wrapper.find('[data-test="scene-101"]').attributes('aria-disabled')).toBe('true')
    expect(wrapper.find('[data-test="unbind-101"]').exists()).toBe(true)

    expect(wrapper.find('[data-test="delete-space-801"]').exists()).toBe(false)
    await wrapper.find('[data-test="edit-space-801"]').trigger('click')
    await wrapper.find('[data-test="modal-delete-space-801"]').trigger('click')
    await flushAsync(wrapper)

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(apiMock.deleteSpaceRecord).not.toHaveBeenCalled()
    expect(wrapper.find('[data-test="modal-confirm-delete-space-801"]').exists()).toBe(true)

    await wrapper.find('[data-test="modal-confirm-delete-space-801"]').trigger('click')
    await flushAsync(wrapper)

    expect(apiMock.deleteSpaceRecord).toHaveBeenCalledWith(801)
    expect(wrapper.find('[data-test="space-801"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="glb-preview"]').attributes('data-model-url')).toBe('')
    expect(wrapper.find('[data-test="scene-101"]').attributes('aria-disabled')).toBe('false')
    expect(wrapper.find('[data-test="unbind-101"]').exists()).toBe(false)

    await wrapper.find('[data-test="scene-101"]').trigger('click')
    expect(wrapper.find('[data-test="upload-bind"]').attributes('disabled')).toBeDefined()

    confirmSpy.mockRestore()
  })

  it('uses an existing space and skips upload when a dropped ZIP has already been uploaded', async () => {
    parserMock.parseScanPackage.mockResolvedValue(parsedPackage({
      zipName: 'same-room.zip',
      zipMd5: 'zip-md5-a',
    }))
    const wrapper = mountWorkbench()

    await flushAsync(wrapper)
    await uploadFile(wrapper, 'same-room.zip')

    expect(apiMock.fetchExistingSpaces).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('already exists')
    expect(wrapper.text()).toContain('A 馆定位包')
    expect(wrapper.find('[data-test="glb-preview"]').attributes('data-model-url')).toBe('https://cdn.example.com/spaces/space-a.glb')

    await wrapper.find('[data-test="glb-preview"]').trigger('click')
    await flushAsync(wrapper)

    expect(uploadMock.uploadScanPackageToMain).not.toHaveBeenCalled()
  })

  it('treats a second upload with the same zip md5 as duplicate without running upload again', async () => {
    apiMock.fetchExistingSpaces.mockResolvedValue([])
    parserMock.parseScanPackage.mockResolvedValue(parsedPackage({
      zipName: 'room.zip',
      zipMd5: 'pkg-room-md5',
    }))
    const wrapper = mountWorkbench()

    await flushAsync(wrapper)
    await uploadFile(wrapper, 'room.zip')
    await wrapper.find('[data-test="glb-preview"]').trigger('click')
    await flushAsync(wrapper)

    expect(uploadMock.uploadScanPackageToMain).toHaveBeenCalledTimes(1)

    await uploadFile(wrapper, 'room.zip')

    expect(wrapper.text()).toContain('already exists')
    await wrapper.find('[data-test="glb-preview"]').trigger('click')
    await flushAsync(wrapper)

    expect(uploadMock.uploadScanPackageToMain).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('room.zip')
  })

  it('does not upload a stale parsed package while a replacement ZIP is still parsing', async () => {
    const replacementParse = deferred<ParsedScanPackage>()
    parserMock.parseScanPackage
      .mockResolvedValueOnce(parsedPackage({
        zipName: 'first-room.zip',
        zipMd5: 'first-md5',
      }))
      .mockReturnValueOnce(replacementParse.promise)
    const wrapper = mountWorkbench()

    await flushAsync(wrapper)
    await uploadFile(wrapper, 'first-room.zip')
    expect(wrapper.text()).toContain('first-room.zip')

    await uploadFile(wrapper, 'same-room.zip')
    await wrapper.find('[data-test="glb-preview"]').trigger('click')
    await flushAsync(wrapper)

    expect(uploadMock.uploadScanPackageToMain).not.toHaveBeenCalled()

    replacementParse.resolve(parsedPackage({
      zipName: 'same-room.zip',
      zipMd5: 'zip-md5-a',
    }))
    await flushAsync(wrapper)

    expect(wrapper.text()).toContain('already exists')
    expect(uploadMock.uploadScanPackageToMain).not.toHaveBeenCalled()
  })

  it('shows upload progress while the main resource upload is running', async () => {
    const upload = deferred<{
      spaceId: number
      spaceName: string
      zipMd5: string
      cosPrefix: string
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
    await wrapper.find('[data-test="glb-preview"]').trigger('click')
    await flushAsync(wrapper)

    const progress = wrapper.find('[data-test="upload-progress"]')
    expect(progress.exists()).toBe(true)
    expect(progress.text()).toContain('Uploading room/model.glb')
    expect(progress.text()).toContain('45%')
    expect(progress.element.closest('.scan-upload-panel')).not.toBeNull()
    expect(progress.element.closest('.scene-binding-panel')).toBeNull()

    upload.resolve({
      spaceId: 701,
      spaceName: 'room.zip',
      zipMd5: 'pkg-room-md5',
      cosPrefix: 'spaces/pkg-room-md5',
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
    expect(wrapper.find('[data-test="unbind-101"]').exists()).toBe(true)
    const boundScene = wrapper.find('[data-test="scene-101"]')
    expect(boundScene.classes()).toContain('bound')
    expect(boundScene.text()).toContain('旧定位包')

    await uploadFile(wrapper, 'room.zip')
    await wrapper.find('[data-test="scene-101"]').trigger('click')

    expect(wrapper.find('[data-test="upload-bind"]').attributes('disabled')).toBeDefined()
  })

  it('pins bound scenes to the top and can unbind the current user binding', async () => {
    apiMock.fetchSceneBindings
      .mockResolvedValueOnce([
        { sceneId: '102', spaceId: '702', spaceName: '旧定位包' },
      ])
      .mockResolvedValueOnce([])
    parserMock.parseScanPackage.mockResolvedValue(parsedPackage())
    const wrapper = mountWorkbench()

    await flushAsync(wrapper)

    const sceneButtons = wrapper.findAll('.scene-button')
    expect(sceneButtons[0].attributes('data-test')).toBe('scene-102')
    expect(sceneButtons[1].attributes('data-test')).toBe('scene-101')

    await wrapper.find('[data-test="unbind-102"]').trigger('click')
    await flushAsync(wrapper)

    expect(apiMock.deleteSceneBinding).toHaveBeenCalledWith('102')
    expect(apiMock.fetchVerseScenes).toHaveBeenCalledTimes(2)
  })

  it('reloads scenes with the selected sort order', async () => {
    parserMock.parseScanPackage.mockResolvedValue(parsedPackage())
    const wrapper = mountWorkbench()

    await flushAsync(wrapper)
    await wrapper.find('[data-test="scene-sort"]').setValue('created_at')
    await flushAsync(wrapper)

    expect(apiMock.fetchVerseScenes).toHaveBeenLastCalledWith({
      page: 1,
      perPage: 10,
      search: '',
      sort: 'created_at',
    })
  })

  it('refreshes scenes when binding creation fails because a scene was claimed concurrently', async () => {
    parserMock.parseScanPackage.mockResolvedValue(parsedPackage())
    apiMock.createSceneBindings.mockRejectedValueOnce(new Error('Scene is already bound.'))
    const wrapper = mountWorkbench()

    await flushAsync(wrapper)
    await uploadFile(wrapper, 'room.zip')
    await wrapper.find('[data-test="glb-preview"]').trigger('click')
    await flushAsync(wrapper)
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
