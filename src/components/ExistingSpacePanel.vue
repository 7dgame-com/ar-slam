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
          <button
            type="button"
            class="secondary-button edit-button"
            :data-test="`edit-space-${space.spaceId}`"
            :disabled="deletingSpaceId === space.spaceId"
            @click.stop="openSpaceModal(space)"
          >
            Edit
          </button>
        </span>
      </div>

      <p v-if="!loading && spaces.length === 0" class="empty-text">No spaces found</p>
    </div>

    <div
      v-if="managingSpace"
      class="space-modal-backdrop"
      data-test="space-modal-backdrop"
      @click.self="closeSpaceModal"
    >
      <div
        class="space-modal"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`space-modal-title-${managingSpace.spaceId}`"
        :data-test="`space-modal-${managingSpace.spaceId}`"
      >
        <header class="space-modal-header">
          <div>
            <p class="space-modal-kicker">Space</p>
            <h4 :id="`space-modal-title-${managingSpace.spaceId}`">{{ managingSpace.spaceName }}</h4>
          </div>
          <button type="button" class="icon-button" aria-label="Close" @click="closeSpaceModal">&times;</button>
        </header>

        <label class="field-label" :for="`space-name-${managingSpace.spaceId}`">Name</label>
        <input
          :id="`space-name-${managingSpace.spaceId}`"
          v-model="draftSpaceName"
          class="space-name-input"
          type="text"
          :data-test="`space-name-input-${managingSpace.spaceId}`"
        >
        <p v-if="modalError" class="error-text">{{ modalError }}</p>

        <dl class="space-details">
          <div>
            <dt>Provider</dt>
            <dd>{{ managingSpace.provider || 'space' }}</dd>
          </div>
          <div v-if="managingSpace.zipMd5">
            <dt>ZIP MD5</dt>
            <dd>{{ managingSpace.zipMd5 }}</dd>
          </div>
          <div v-if="managingSpace.modelName">
            <dt>Model</dt>
            <dd>{{ managingSpace.modelName }}</dd>
          </div>
          <div>
            <dt>Localization files</dt>
            <dd>{{ managingSpace.localizationFileIds.length }}</dd>
          </div>
        </dl>

        <footer class="space-modal-actions">
          <button
            type="button"
            class="primary-button"
            :data-test="`save-space-${managingSpace.spaceId}`"
            :disabled="!canSaveSpace || modalBusy"
            @click="saveManagedSpace"
          >
            {{ updatingSpaceId === managingSpace.spaceId ? 'Saving' : 'Save' }}
          </button>
          <template v-if="confirmingModalDelete">
            <button
              type="button"
              class="delete-button confirm"
              :data-test="`modal-confirm-delete-space-${managingSpace.spaceId}`"
              :disabled="modalBusy"
              @click="deleteManagedSpace"
            >
              {{ deletingSpaceId === managingSpace.spaceId ? 'Deleting' : 'Confirm delete' }}
            </button>
            <button
              type="button"
              class="cancel-button"
              :disabled="modalBusy"
              @click="confirmingModalDelete = false"
            >
              Cancel
            </button>
          </template>
          <button
            v-else
            type="button"
            class="delete-button"
            :data-test="`modal-delete-space-${managingSpace.spaceId}`"
            :disabled="modalBusy"
            @click="confirmingModalDelete = true"
          >
            Delete
          </button>
        </footer>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ExistingSpaceOption } from '../domain/scanTypes'

const props = defineProps<{
  spaces: ExistingSpaceOption[]
  loading: boolean
  error: string
  selectedSpaceId: number | null
  deletingSpaceId: number | null
  updatingSpaceId: number | null
}>()

const emit = defineEmits<{
  refresh: []
  selectSpace: [space: ExistingSpaceOption]
  deleteSpace: [space: ExistingSpaceOption]
  updateSpaceName: [space: ExistingSpaceOption, name: string]
}>()

const confirmingModalDelete = ref(false)
const managingSpace = ref<ExistingSpaceOption | null>(null)
const draftSpaceName = ref('')
const modalError = ref('')

const trimmedDraftName = computed(() => draftSpaceName.value.trim())
const modalBusy = computed(() => Boolean(
  managingSpace.value
    && (
      props.deletingSpaceId === managingSpace.value.spaceId
      || props.updatingSpaceId === managingSpace.value.spaceId
    )
))
const canSaveSpace = computed(() => Boolean(
  managingSpace.value
    && trimmedDraftName.value
    && trimmedDraftName.value !== managingSpace.value.spaceName
))

function openSpaceModal(space: ExistingSpaceOption) {
  managingSpace.value = space
  draftSpaceName.value = space.spaceName
  confirmingModalDelete.value = false
  modalError.value = ''
}

function closeSpaceModal() {
  if (modalBusy.value) return

  managingSpace.value = null
  confirmingModalDelete.value = false
  modalError.value = ''
}

function saveManagedSpace() {
  if (!managingSpace.value || modalBusy.value) return

  if (!trimmedDraftName.value) {
    modalError.value = 'Space name is required.'
    return
  }

  if (trimmedDraftName.value === managingSpace.value.spaceName) {
    closeSpaceModal()
    return
  }

  emit('updateSpaceName', managingSpace.value, trimmedDraftName.value)
  closeSpaceModal()
}

function deleteManagedSpace() {
  if (!managingSpace.value || modalBusy.value) return

  emit('deleteSpace', managingSpace.value)
  closeSpaceModal()
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

.space-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.35);
}

.space-modal {
  width: min(460px, 100%);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  box-shadow: var(--shadow-lg);
  color: var(--text-primary);
  padding: 18px;
}

.space-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.space-modal-kicker {
  margin: 0 0 4px;
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
}

.space-modal-header h4 {
  margin: 0;
  font-size: var(--font-size-lg);
  line-height: 1.3;
}

.icon-button {
  width: 30px;
  height: 30px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
}

.field-label {
  display: block;
  margin-bottom: 6px;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.space-name-input {
  width: 100%;
  height: 36px;
  box-sizing: border-box;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  color: var(--text-primary);
  font: inherit;
  padding: 0 10px;
}

.space-name-input:focus {
  border-color: var(--primary-color);
  outline: none;
}

.space-details {
  display: grid;
  gap: 10px;
  margin: 16px 0;
}

.space-details div {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 10px;
  align-items: baseline;
}

.space-details dt {
  color: var(--text-muted);
  font-size: var(--font-size-xs);
}

.space-details dd {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.space-modal-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.primary-button {
  height: 30px;
  border: 0;
  border-radius: var(--radius-sm);
  background: var(--primary-color);
  color: #fff;
  padding: 0 10px;
  cursor: pointer;
}

.primary-button:disabled {
  background: var(--text-placeholder);
  cursor: not-allowed;
}
</style>
