<template>
  <div class="glb-preview">
    <div ref="containerRef" class="preview-canvas" />
    <div v-if="!modelUrl" class="preview-message empty-preview" aria-live="polite">
      Upload a valid scan package to preview the GLB model.
    </div>
    <div v-else-if="errorMessage" class="preview-message error-preview" aria-live="polite">
      {{ errorMessage }}
    </div>
    <div v-else class="preview-label">
      {{ modelName || 'GLB model' }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
// @ts-ignore -- this Three.js package version does not include bundled declarations.
import * as THREE from 'three'
// @ts-ignore -- declarations are not available in the installed Three.js package.
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
// @ts-ignore -- declarations are not available in the installed Three.js package.
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const props = defineProps<{
  modelUrl: string | null
  modelName: string
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const errorMessage = ref('')

type DisposableResource = { dispose: () => void }
type MaterialResource = DisposableResource | DisposableResource[]
type TextureResource = DisposableResource & {
  isTexture?: boolean
  image?: unknown
}
type MeshResource = {
  isMesh?: boolean
  geometry?: DisposableResource
  material?: MaterialResource
}
type PreviewObject = {
  position: {
    sub: (vector: unknown) => void
  }
  traverse: (callback: (child: MeshResource) => void) => void
}

let renderer: any = null
let scene: any = null
let camera: any = null
let controls: any = null
let resizeObserver: ResizeObserver | null = null
let animationFrame = 0
let currentModel: PreviewObject | null = null
let loadRequestId = 0

function initScene() {
  if (!containerRef.value || renderer) return

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0xf7f9fc)

  camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000)
  camera.position.set(3, 2.2, 3)

  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.domElement.className = 'preview-renderer'
  containerRef.value.appendChild(renderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08

  const light = new THREE.HemisphereLight(0xffffff, 0x667085, 2.4)
  scene.add(light)
  scene.add(new THREE.GridHelper(10, 20, 0xd0d5dd, 0xeaecf0))
  scene.add(new THREE.AxesHelper(1.5))

  resize()
  window.addEventListener('resize', resize)
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => resize())
    resizeObserver.observe(containerRef.value)
  }
  animate()
}

function resize() {
  if (!containerRef.value || !renderer || !camera) return

  const rect = containerRef.value.getBoundingClientRect()
  const width = Math.max(rect.width, 1)
  const height = Math.max(rect.height, 1)
  renderer.setSize(width, height, false)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
}

function animate() {
  animationFrame = window.requestAnimationFrame(animate)
  controls?.update()
  if (renderer && scene && camera) {
    renderer.render(scene, camera)
  }
}

function isMesh(object: MeshResource): object is MeshResource {
  return object.isMesh === true
}

function isTexture(value: unknown): value is TextureResource {
  return Boolean(
    value
    && typeof value === 'object'
    && (value as TextureResource).isTexture
    && typeof (value as TextureResource).dispose === 'function',
  )
}

function closeImageBitmap(image: unknown) {
  if (
    typeof ImageBitmap !== 'undefined'
    && image instanceof ImageBitmap
    && typeof image.close === 'function'
  ) {
    image.close()
  }
}

function disposeTexture(texture: TextureResource) {
  closeImageBitmap(texture.image)
  texture.dispose()
}

function disposeMaterial(material: MaterialResource, disposedTextures = new Set<TextureResource>()) {
  if (Array.isArray(material)) {
    material.forEach((item) => disposeMaterial(item, disposedTextures))
    return
  }

  Object.values(material).forEach((value) => {
    if (!isTexture(value) || disposedTextures.has(value)) return

    disposedTextures.add(value)
    disposeTexture(value)
  })
  material.dispose()
}

function disposeObject(object: PreviewObject) {
  const disposedTextures = new Set<TextureResource>()

  object.traverse((child) => {
    if (!isMesh(child)) return

    child.geometry?.dispose()
    if (child.material) {
      disposeMaterial(child.material, disposedTextures)
    }
  })
}

function clearModel() {
  if (!currentModel) return

  scene?.remove(currentModel)
  disposeObject(currentModel)
  currentModel = null
}

async function captureScreenshot(): Promise<Blob | null> {
  if (!renderer || !scene || !camera || !currentModel || errorMessage.value) {
    return null
  }

  controls?.update()
  renderer.render(scene, camera)

  return new Promise((resolve) => {
    renderer.domElement.toBlob((blob: Blob | null) => {
      resolve(blob)
    }, 'image/png')
  })
}

function fitCameraToObject(object: PreviewObject) {
  if (!camera || !controls) return

  const box = new THREE.Box3().setFromObject(object)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxSize = Math.max(size.x, size.y, size.z, 1)
  const fitDistance = maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))
  const distance = fitDistance * 1.8

  object.position.sub(center)
  camera.position.set(distance, distance * 0.72, distance)
  camera.near = Math.max(distance / 100, 0.01)
  camera.far = distance * 100
  camera.updateProjectionMatrix()
  controls.target.set(0, 0, 0)
  controls.update()
}

async function loadModel(url: string | null) {
  const requestId = ++loadRequestId
  errorMessage.value = ''

  await nextTick()
  initScene()
  clearModel()

  if (!url || !scene) return

  const loader = new GLTFLoader()
  loader.load(
    url,
    (gltf: { scene: PreviewObject }) => {
      if (requestId !== loadRequestId || !scene) {
        disposeObject(gltf.scene)
        return
      }

      currentModel = gltf.scene
      scene.add(gltf.scene)
      fitCameraToObject(gltf.scene)
      resize()
    },
    undefined,
    () => {
      if (requestId === loadRequestId) {
        errorMessage.value = 'GLB model could not be loaded.'
      }
    },
  )
}

watch(() => props.modelUrl, loadModel, { immediate: true })

defineExpose({
  captureScreenshot,
})

onBeforeUnmount(() => {
  loadRequestId += 1
  window.removeEventListener('resize', resize)
  resizeObserver?.disconnect()
  resizeObserver = null
  if (animationFrame) {
    window.cancelAnimationFrame(animationFrame)
  }
  clearModel()
  controls?.dispose()
  renderer?.dispose()
  renderer?.domElement.remove()
  renderer = null
  scene = null
  camera = null
  controls = null
})
</script>

<style scoped>
.glb-preview {
  position: relative;
  min-height: 500px;
  height: 100%;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: #f7f9fc;
}

.preview-canvas {
  position: absolute;
  inset: 0;
}

:deep(.preview-renderer) {
  display: block;
  width: 100%;
  height: 100%;
}

.preview-message,
.preview-label {
  position: absolute;
  left: 14px;
  top: 14px;
  max-width: calc(100% - 28px);
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.92);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.4;
  box-shadow: var(--shadow-sm);
}

.empty-preview {
  color: var(--text-muted);
}

.error-preview {
  color: #a8071a;
}
</style>
