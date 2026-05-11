import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const threeMock = vi.hoisted(() => {
  const rendererInstances: Array<Record<string, unknown>> = []

  class Vector3 {
    x = 1
    y = 1
    z = 1

    set = vi.fn((x: number, y: number, z: number) => {
      this.x = x
      this.y = y
      this.z = z
      return this
    })

    sub = vi.fn(() => this)
  }

  class WebGLRenderer {
    domElement = document.createElement('canvas')
    setPixelRatio = vi.fn()
    setSize = vi.fn()
    render = vi.fn()
    dispose = vi.fn()

    constructor() {
      rendererInstances.push(this)
    }
  }

  return {
    rendererInstances,
    WebGLRenderer,
    Scene: class {
      background: unknown
      add = vi.fn()
      remove = vi.fn()
    },
    Color: class {
      constructor(public value: number) {}
    },
    PerspectiveCamera: class {
      position = new Vector3()
      aspect = 1
      near = 0.01
      far = 1000
      fov = 45
      updateProjectionMatrix = vi.fn()
    },
    HemisphereLight: class {
      constructor(public skyColor: number, public groundColor: number, public intensity: number) {}
    },
    GridHelper: class {
      constructor(
        public size: number,
        public divisions: number,
        public colorCenterLine: number,
        public colorGrid: number,
      ) {}
    },
    AxesHelper: class {
      constructor(public size: number) {}
    },
    Box3: class {
      setFromObject = vi.fn(() => this)
      getSize = vi.fn(() => new Vector3())
      getCenter = vi.fn(() => new Vector3())
    },
    MathUtils: {
      degToRad: (value: number) => value * Math.PI / 180,
    },
    SRGBColorSpace: 'srgb',
  }
})

const orbitControlsMock = vi.hoisted(() => ({
  instances: [] as Array<{
    enableDamping: boolean
    dampingFactor: number
    target: { set: ReturnType<typeof vi.fn> }
    update: ReturnType<typeof vi.fn>
  }>,
  OrbitControls: class {
    enableDamping = false
    dampingFactor = 0
    target = { set: vi.fn() }
    update = vi.fn()

    constructor() {
      orbitControlsMock.instances.push(this)
    }
  },
}))

const gltfLoaderMock = vi.hoisted(() => ({
  instances: [] as Array<{
    setKTX2Loader: ReturnType<typeof vi.fn>
    load: ReturnType<typeof vi.fn>
  }>,
  GLTFLoader: class {
    setKTX2Loader = vi.fn()
    load = vi.fn()

    constructor() {
      gltfLoaderMock.instances.push(this)
    }
  },
}))

const ktx2LoaderMock = vi.hoisted(() => ({
  instances: [] as Array<{
    setTranscoderPath: ReturnType<typeof vi.fn>
    detectSupport: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
  }>,
  KTX2Loader: class {
    setTranscoderPath = vi.fn(() => this)
    detectSupport = vi.fn(() => this)
    dispose = vi.fn()

    constructor() {
      ktx2LoaderMock.instances.push(this)
    }
  },
}))

vi.mock('three', () => threeMock)
vi.mock('three/examples/jsm/controls/OrbitControls.js', () => orbitControlsMock)
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => gltfLoaderMock)
vi.mock('three/examples/jsm/loaders/KTX2Loader.js', () => ktx2LoaderMock)

describe('GlbPreview', () => {
  beforeEach(() => {
    gltfLoaderMock.instances.length = 0
    ktx2LoaderMock.instances.length = 0
    threeMock.rendererInstances.length = 0
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal('ResizeObserver', class {
      observe = vi.fn()
      disconnect = vi.fn()
    })
  })

  it('configures KTX2 support for GLBs that require KHR_texture_basisu', async () => {
    const { default: GlbPreview } = await import('../components/GlbPreview.vue')

    mount(GlbPreview, {
      props: {
        modelUrl: 'blob:area-target-model',
        modelName: 'optimized.glb',
      },
      attachTo: document.body,
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(ktx2LoaderMock.instances).toHaveLength(1)
    expect(ktx2LoaderMock.instances[0].setTranscoderPath).toHaveBeenCalledWith('/js/three.js/libs/basis/')
    expect(ktx2LoaderMock.instances[0].detectSupport).toHaveBeenCalledWith(threeMock.rendererInstances[0])
    expect(gltfLoaderMock.instances[0].setKTX2Loader).toHaveBeenCalledWith(ktx2LoaderMock.instances[0])
  })
})
