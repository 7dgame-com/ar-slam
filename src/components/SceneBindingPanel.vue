<template>
  <section class="scene-binding-panel">
    <div class="scene-toolbar">
      <input
        :value="search"
        type="search"
        placeholder="Search scenes"
        aria-label="Search scenes"
        @input="emitSearch"
      >
      <select
        :value="sort"
        class="sort-select"
        data-test="scene-sort"
        aria-label="Sort scenes"
        @change="emitSort"
      >
        <option value="-created_at">Newest first</option>
        <option value="created_at">Oldest first</option>
        <option value="name">Name</option>
      </select>
      <button type="button" class="secondary-button" @click="$emit('refresh')">Refresh</button>
    </div>

    <p v-if="error" class="error-text">{{ error }}</p>

    <div class="scene-list">
      <div
        v-for="scene in scenes"
        :key="scene.id"
        class="scene-button"
        :class="{ active: selectedSceneIds.includes(scene.id), disabled: Boolean(scene.boundSpaceId) }"
        :data-test="`scene-${scene.id}`"
        :aria-disabled="Boolean(scene.boundSpaceId)"
        role="button"
        tabindex="0"
        @click="handleSceneClick(scene)"
        @keydown.enter.prevent="handleSceneClick(scene)"
        @keydown.space.prevent="handleSceneClick(scene)"
      >
        <div class="scene-thumbnail">
          <img
            v-if="scene.thumbnailUrl"
            :src="scene.thumbnailUrl"
            :alt="scene.name"
            :data-test="`scene-thumbnail-${scene.id}`"
          >
          <span v-else :data-test="`scene-thumbnail-${scene.id}`">{{ scene.name.slice(0, 1) || '#' }}</span>
        </div>
        <strong>{{ scene.name }}</strong>
        <button
          v-if="scene.boundSpaceId"
          type="button"
          class="secondary-button unbind-button"
          :data-test="`unbind-${scene.id}`"
          :disabled="unbindingSceneId === scene.id"
          @click.stop="$emit('unbindScene', scene.id)"
        >
          {{ unbindingSceneId === scene.id ? 'Unbinding' : 'Unbind' }}
        </button>
      </div>
      <p v-if="!loading && scenes.length === 0" class="empty-text">No scenes found</p>
    </div>

    <div class="pager">
      <button
        type="button"
        class="secondary-button"
        :disabled="loading || pagination.page <= 1"
        @click="$emit('pageChange', pagination.page - 1)"
      >
        Previous
      </button>
      <span>Page {{ pagination.page }} / {{ pagination.pageCount }}</span>
      <button
        type="button"
        class="secondary-button"
        :disabled="loading || pagination.page >= pagination.pageCount"
        @click="$emit('pageChange', pagination.page + 1)"
      >
        Next
      </button>
    </div>

    <button
      type="button"
      class="draft-button"
      data-test="upload-bind"
      :disabled="!canSubmitBinding || submitting"
      @click="$emit('submitBinding')"
    >
      {{ submitting ? 'Binding' : loading ? 'Loading scenes' : 'Bind' }}
    </button>

    <div v-if="submitting || uploadStage" class="upload-progress" data-test="upload-progress">
      <span>{{ uploadStage || 'Preparing upload' }}</span>
      <strong>{{ uploadProgress }}%</strong>
    </div>

    <pre v-if="bindingResult" class="draft-json">Binding Result
{{ JSON.stringify(bindingResult, null, 2) }}</pre>
  </section>
</template>

<script setup lang="ts">
import type { BindingResult, SceneOption, ScenePagination } from '../domain/scanTypes'
import type { SceneSort } from '../domain/scanTypes'

defineProps<{
  scenes: SceneOption[]
  selectedSceneIds: string[]
  pagination: ScenePagination
  loading: boolean
  error: string
  search: string
  sort: SceneSort
  canSubmitBinding: boolean
  submitting: boolean
  unbindingSceneId: string
  uploadStage: string
  uploadProgress: number
  bindingResult: BindingResult | null
}>()

const emit = defineEmits<{
  toggleScene: [sceneId: string]
  pageChange: [page: number]
  searchChange: [search: string]
  sortChange: [sort: SceneSort]
  refresh: []
  submitBinding: []
  unbindScene: [sceneId: string]
}>()

function emitSearch(event: Event) {
  emit('searchChange', (event.target as HTMLInputElement).value)
}

function emitSort(event: Event) {
  emit('sortChange', (event.target as HTMLSelectElement).value as SceneSort)
}

function handleSceneClick(scene: SceneOption) {
  if (scene.boundSpaceId) return
  emit('toggleScene', scene.id)
}
</script>

<style scoped>
.scene-binding-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.scene-toolbar,
.pager {
  display: flex;
  align-items: center;
  gap: 8px;
}

.scene-toolbar input,
.sort-select {
  min-width: 0;
  height: 34px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 0 10px;
  box-sizing: border-box;
}

.scene-toolbar input {
  flex: 1;
}

.sort-select {
  width: 116px;
  background: var(--bg-card);
  color: var(--text-primary);
}

.scene-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.scene-button {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  border-radius: var(--radius-sm);
  padding: 8px;
  cursor: pointer;
}

.scene-button.active {
  border-color: var(--primary-color);
  background: var(--primary-light);
}

.scene-button.disabled {
  cursor: default;
}

.scene-thumbnail {
  width: 48px;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--primary-light);
  color: var(--primary-color);
  display: grid;
  place-items: center;
  font-weight: var(--font-weight-bold);
}

.scene-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.scene-button strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.error-text {
  color: var(--danger-color, #dc2626);
}

.empty-text {
  color: var(--text-muted);
  font-size: var(--font-size-sm);
}

.draft-button {
  height: 36px;
  border: 0;
  border-radius: var(--radius-sm);
  background: var(--primary-color);
  color: #fff;
  cursor: pointer;
}

.draft-button:disabled {
  background: var(--text-placeholder);
  cursor: not-allowed;
}

.upload-progress {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--primary-light);
  color: var(--text-primary);
  font-size: var(--font-size-sm);
}

.secondary-button {
  height: 34px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  color: var(--text-primary);
  padding: 0 10px;
  cursor: pointer;
}

.secondary-button:disabled {
  color: var(--text-placeholder);
  cursor: not-allowed;
}

.unbind-button {
  width: 72px;
  padding: 0 8px;
}

.draft-json {
  max-height: 220px;
  overflow: auto;
  padding: 12px;
  border-radius: var(--radius-sm);
  background: #111827;
  color: #d1fae5;
  font-size: 12px;
}
</style>
