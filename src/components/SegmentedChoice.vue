<script setup>
defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  choices: { type: Array, required: true },
  modelValue: { type: String, required: true },
});
defineEmits(['update:modelValue']);
</script>

<template>
  <div class="control">
    <div class="row">
      <span class="choice-label" :id="`${id}-label`">{{ label }}</span>
    </div>
    <div class="segmented" role="radiogroup" :aria-labelledby="`${id}-label`">
      <button
        v-for="choice in choices"
        :key="choice.value"
        type="button"
        role="radio"
        :id="`${id}-${choice.value}`"
        :aria-checked="String(modelValue === choice.value)"
        :class="{ active: modelValue === choice.value }"
        :title="choice.hint"
        @click="$emit('update:modelValue', choice.value)"
      >
        {{ choice.label }}
      </button>
    </div>
    <div class="scale">
      <span>{{ choices.find((choice) => choice.value === modelValue)?.hint }}</span>
    </div>
  </div>
</template>
