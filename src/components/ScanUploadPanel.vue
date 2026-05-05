<template>
  <section class="scan-upload-panel">
    <div class="upload-box">
      <input
        class="file-input"
        type="file"
        accept=".zip,application/zip"
        aria-label="Upload scan ZIP"
        @change="onFileChange"
      >
      <div class="upload-copy">
        <strong>Upload scan ZIP</strong>
        <span>Immersal or Area Target Scanner bundle</span>
      </div>
    </div>

    <label class="field-label" for="provider-select">Provider</label>
    <select id="provider-select" class="provider-select" :value="provider" @change="onProviderChange">
      <option value="auto">Auto detect</option>
      <option value="immersal">Immersal</option>
      <option value="area-target-scanner">Area Target Scanner</option>
    </select>

    <div v-if="isParsing" class="notice parsing">
      <p>Parsing scan package...</p>
    </div>

    <div v-if="parseError" class="notice error">
      <p>{{ parseError }}</p>
    </div>

    <div v-if="uploadNotice" class="notice info">
      <p>{{ uploadNotice }}</p>
    </div>

    <div v-if="isUploading || uploadStage" class="upload-progress" data-test="upload-progress">
      <div class="upload-progress-copy">
        <span>Upload progress</span>
        <strong>{{ uploadStage || 'Preparing upload' }}</strong>
      </div>
      <div class="upload-progress-meter" aria-hidden="true">
        <span :style="{ width: `${uploadProgress}%` }" />
      </div>
      <small>{{ uploadProgress }}%</small>
    </div>

    <div v-if="parsedPackage" class="package-summary">
      <h3>{{ parsedPackage.zipName }}</h3>
      <p>{{ parsedPackage.provider || 'Provider needs selection' }}</p>
      <ul>
        <li v-for="file in parsedPackage.files" :key="file.path">
          <span>{{ file.name }}</span>
          <small>{{ file.extension || 'file' }}</small>
        </li>
      </ul>
    </div>

    <div v-if="parsedPackage?.warnings.length" class="notice warning">
      <p v-for="warning in parsedPackage.warnings" :key="warning">{{ warning }}</p>
    </div>
    <div v-if="parsedPackage?.errors.length" class="notice error">
      <p v-for="error in parsedPackage.errors" :key="error">{{ error }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { LocalizationProvider, ParsedScanPackage } from '../domain/scanTypes'

defineProps<{
  provider: LocalizationProvider
  parsedPackage: ParsedScanPackage | null
  parseError: string
  uploadNotice: string
  isParsing: boolean
  isUploading: boolean
  uploadStage: string
  uploadProgress: number
}>()

const emit = defineEmits<{
  upload: [file: File]
  providerChange: [provider: LocalizationProvider]
}>()

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    emit('upload', file)
    input.value = ''
  }
}

function onProviderChange(event: Event) {
  emit('providerChange', (event.target as HTMLSelectElement).value as LocalizationProvider)
}
</script>

<style scoped>
.scan-upload-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.upload-box {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 112px;
  padding: 18px;
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
}

.file-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.upload-copy {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--text-primary);
}

.upload-copy span,
.package-summary small {
  color: var(--text-muted);
  font-size: var(--font-size-sm);
}

.field-label {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.provider-select {
  height: 34px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 0 10px;
  background: var(--bg-card);
}

.package-summary h3 {
  margin: 0 0 4px;
  font-size: var(--font-size-md);
}

.package-summary ul {
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.package-summary li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 0;
  border-bottom: 1px solid var(--border-color-light);
}

.notice {
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
}

.notice.warning {
  background: #fff7e6;
  color: #ad6800;
}

.notice.parsing {
  background: #e6f4ff;
  color: #0958d9;
}

.notice.info {
  background: #f0fdf4;
  color: #166534;
}

.notice.error {
  background: #fff1f0;
  color: #a8071a;
}

.upload-progress {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px 12px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--primary-color) 24%, var(--border-color));
  border-radius: var(--radius-sm);
  background: var(--primary-light);
  color: var(--text-primary);
}

.upload-progress-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.upload-progress-copy span,
.upload-progress small {
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

.upload-progress-copy strong {
  min-width: 0;
  overflow: hidden;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upload-progress-meter {
  grid-column: 1 / -1;
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
}

.upload-progress-meter span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--primary-color);
  transition: width 160ms ease;
}
</style>
