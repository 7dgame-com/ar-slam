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
      <button type="button" class="secondary-button" @click="$emit('refresh')">Refresh</button>
    </div>

    <p v-if="error" class="error-text">{{ error }}</p>

    <div class="scene-list">
      <button
        v-for="scene in scenes"
        :key="scene.id"
        type="button"
        class="scene-button"
        :class="{ active: selectedSceneIds.includes(scene.id), disabled: Boolean(scene.boundSlamId) }"
        :data-test="`scene-${scene.id}`"
        :disabled="Boolean(scene.boundSlamId)"
        @click="$emit('toggleScene', scene.id)"
      >
        <strong>{{ scene.name }}</strong>
        <span>{{ scene.description || `Scene #${scene.id}` }}</span>
        <span v-if="scene.boundSlamId" class="bound-text">Bound to {{ scene.boundSlamName || scene.boundSlamId }}</span>
      </button>
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
      data-test="create-draft"
      :disabled="!canCreateDraft"
      @click="$emit('createDraft')"
    >
      {{ loading ? 'Loading scenes' : 'Create binding draft' }}
    </button>

    <pre v-if="bindingDraft" class="draft-json">Binding Draft
{{ JSON.stringify(bindingDraft, null, 2) }}</pre>
  </section>
</template>

<script setup lang="ts">
import type { BindingDraft, SceneOption, ScenePagination } from '../domain/scanTypes'

defineProps<{
  scenes: SceneOption[]
  selectedSceneIds: string[]
  pagination: ScenePagination
  loading: boolean
  error: string
  search: string
  canCreateDraft: boolean
  bindingDraft: BindingDraft | null
}>()

const emit = defineEmits<{
  toggleScene: [sceneId: string]
  pageChange: [page: number]
  searchChange: [search: string]
  refresh: []
  createDraft: []
}>()

function emitSearch(event: Event) {
  emit('searchChange', (event.target as HTMLInputElement).value)
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

.scene-toolbar input {
  min-width: 0;
  flex: 1;
  height: 34px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 0 10px;
  box-sizing: border-box;
}

.scene-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.scene-button {
  text-align: left;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  border-radius: var(--radius-sm);
  padding: 12px;
  cursor: pointer;
}

.scene-button.active {
  border-color: var(--primary-color);
  background: var(--primary-light);
}

.scene-button.disabled {
  opacity: 0.62;
  cursor: not-allowed;
}

.scene-button strong,
.scene-button span {
  display: block;
}

.scene-button span {
  margin-top: 4px;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
}

.bound-text,
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
