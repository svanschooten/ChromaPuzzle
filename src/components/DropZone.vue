<script setup>
import { ref } from 'vue';

const props = defineProps({
  accept: { type: String, default: '' },
  multiple: { type: Boolean, default: false },
  ariaLabel: { type: String, required: true },
});
const emit = defineEmits(['files']);

const input = ref(null);
const over = ref(false);

function pick(event) {
  const files = [...event.target.files];
  if (files.length) emit('files', files);
  event.target.value = '';
}

function drop(event) {
  over.value = false;
  const files = [...event.dataTransfer.files];
  if (files.length) emit('files', props.multiple ? files : [files[0]]);
}

defineExpose({ browse: () => input.value.click() });
</script>

<template>
  <div
    class="dropzone"
    :class="{ over }"
    tabindex="0"
    role="button"
    :aria-label="ariaLabel"
    @click="input.click()"
    @keydown.enter.prevent="input.click()"
    @keydown.space.prevent="input.click()"
    @dragover.prevent="over = true"
    @dragleave="over = false"
    @drop.prevent="drop"
  >
    <slot></slot>
  </div>
  <input
    ref="input"
    type="file"
    class="visually-hidden"
    :accept="accept"
    :multiple="multiple"
    :aria-label="ariaLabel"
    @change="pick"
  />
</template>
