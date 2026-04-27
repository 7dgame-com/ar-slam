<template>
  <section class="existing-space-panel">
    <div class="space-header">
      <h3>Existing spaces</h3>
      <button type="button" class="secondary-button" :disabled="loading" @click="$emit('refresh')">
        {{ loading ? 'Loading' : 'Refresh' }}
      </button>
    </div>

    <p v-if="error" class="error-text">{{ error }}</p>

    <div class="space-list">
      <div
        v-for="space in spaces"
        :key="space.spaceId"
        class="space-row"
        :class="{ active: selectedSpaceId === space.spaceId }"
        :data-test="`space-${space.spaceId}`"
        role="button"
        tabindex="0"
        @click="$emit('selectSpace', space)"
        @keydown.enter.prevent="$emit('selectSpace', space)"
        @keydown.space.prevent="$emit('selectSpace', space)"
      >
        <span class="space-thumbnail">
          <img
            v-if="space.thumbnailUrl"
            :src="space.thumbnailUrl"
            :alt="space.spaceName"
            :data-test="`space-thumbnail-${space.spaceId}`"
          >
          <span v-else :data-test="`space-thumbnail-${space.spaceId}`">{{ space.spaceName.slice(0, 1) || '#' }}</span>
        </span>
        <span class="space-copy">
          <strong>{{ space.spaceName }}</strong>
          <small>{{ space.provider || 'space' }}<template v-if="space.zipMd5"> / {{ space.zipMd5 }}</template></small>
        </span>
        <span class="space-actions">
          <template v-if="confirmingSpaceId === space.spaceId">
            <button
              type="button"
              class="delete-button confirm"
              :data-test="`confirm-delete-space-${space.spaceId}`"
              :disabled="deletingSpaceId === space.spaceId"
              @click.stop="confirmDelete(space)"
            >
              {{ deletingSpaceId === space.spaceId ? 'Deleting' : 'Confirm' }}
            </button>
            <button
              type="button"
              class="cancel-button"
              :data-test="`cancel-delete-space-${space.spaceId}`"
              :disabled="deletingSpaceId === space.spaceId"
              @click.stop="confirmingSpaceId = null"
            >
              Cancel
            </button>
          </template>
          <button
            v-else
            type="button"
            class="delete-button"
            :data-test="`delete-space-${space.spaceId}`"
            :disabled="deletingSpaceId === space.spaceId"
            @click.stop="confirmingSpaceId = space.spaceId"
          >
            Delete
          </button>
        </span>
      </div>

      <p v-if="!loading && spaces.length === 0" class="empty-text">No spaces found</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { ExistingSpaceOption } from '../domain/scanTypes'

defineProps<{
  spaces: ExistingSpaceOption[]
  loading: boolean
  error: string
  selectedSpaceId: number | null
  deletingSpaceId: number | null
}>()

const emit = defineEmits<{
  refresh: []
  selectSpace: [space: ExistingSpaceOption]
  deleteSpace: [space: ExistingSpaceOption]
}>()

const confirmingSpaceId = ref<number | null>(null)

function confirmDelete(space: ExistingSpaceOption) {
  confirmingSpaceId.value = null
  emit('deleteSpace', space)
}
</script>

<style scoped>
.existing-space-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color-light);
}

.space-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.space-header h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--font-size-md);
}

.space-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.space-row {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
}

.space-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.delete-button,
.cancel-button {
  height: 30px;
  border-radius: var(--radius-sm);
  padding: 0 8px;
  cursor: pointer;
}

.delete-button {
  border: 1px solid #fecaca;
  background: #fff1f2;
  color: #be123c;
}

.delete-button.confirm {
  background: #be123c;
  color: #fff;
}

.cancel-button {
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
}

.delete-button:disabled,
.cancel-button:disabled {
  color: var(--text-placeholder);
  cursor: not-allowed;
}

.space-row.active {
  border-color: var(--primary-color);
  background: var(--primary-light);
}

.space-thumbnail {
  display: grid;
  place-items: center;
  width: 42px;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--primary-light);
  color: var(--primary-color);
  font-weight: var(--font-weight-bold);
}

.space-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.space-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.space-copy strong,
.space-copy small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.space-copy small,
.empty-text {
  color: var(--text-muted);
  font-size: var(--font-size-sm);
}

.error-text {
  color: var(--danger-color, #dc2626);
}

.secondary-button {
  height: 30px;
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
</style>
