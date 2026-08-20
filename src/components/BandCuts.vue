<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps({
  label: { type: String, required: true },
  max: { type: Number, required: true },
  gradient: { type: String, required: true },
  histogram: { type: Object, default: null },
  modelValue: { type: Array, required: true },
});
const emit = defineEmits(['update:modelValue']);

const strip = ref(null);
const canvas = ref(null);
let dragging = -1;

const percent = (cut) => `${(cut / props.max) * 100}%`;

/** A cut may not pass its neighbours, so the bands keep their order. */
const clampCut = (index, value) => {
  const low = index === 0 ? 0 : props.modelValue[index - 1] + 1;
  const high =
    index === props.modelValue.length - 1 ? props.max - 1 : props.modelValue[index + 1] - 1;
  return Math.round(Math.min(high, Math.max(low, value)));
};

function moveCut(index, value) {
  const next = [...props.modelValue];
  next[index] = clampCut(index, value);
  emit('update:modelValue', next);
}

function onPointerMove(event) {
  if (dragging < 0 || !strip.value) return;
  const box = strip.value.getBoundingClientRect();
  moveCut(dragging, ((event.clientX - box.left) / box.width) * props.max);
}

const stopDrag = () => {
  dragging = -1;
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', stopDrag);
};

function startDrag(index, event) {
  dragging = index;
  event.preventDefault();
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', stopDrag);
}

function onKey(index, event) {
  const step = event.shiftKey ? 10 : 1;
  if (event.key === 'ArrowLeft') moveCut(index, props.modelValue[index] - step);
  else if (event.key === 'ArrowRight') moveCut(index, props.modelValue[index] + step);
  else return;
  event.preventDefault();
}

onBeforeUnmount(stopDrag);

/** The histogram behind the strip shows where the image actually has content. */
function drawHistogram() {
  const element = canvas.value;
  const data = props.histogram;
  if (!element || !data?.length) return;
  const width = (element.width = data.length);
  const height = (element.height = 40);
  const context = element.getContext('2d');
  context.clearRect(0, 0, width, height);
  let peak = 0;
  for (const value of data) peak = Math.max(peak, value);
  if (peak <= 0) return;
  context.fillStyle = 'rgba(255,255,255,0.8)';
  for (let i = 0; i < width; i++) {
    const bar = (data[i] / peak) * height;
    context.fillRect(i, height - bar, 1, bar);
  }
}

// The immediate run happens before the canvas exists, so mount draws it too.
watch(() => props.histogram, drawHistogram, { flush: 'post' });
onMounted(drawHistogram);

const cutList = computed(() => props.modelValue ?? []);
</script>

<template>
  <div class="cutrow">
    <div class="row">
      <span class="choice-label">{{ label }}</span>
      <span class="val">{{ cutList.length }} cuts</span>
    </div>
    <div class="cutstrip" ref="strip" :style="{ background: gradient }">
      <canvas ref="canvas" class="cuthist" aria-hidden="true"></canvas>
      <button
        v-for="(cut, index) in cutList"
        :key="index"
        type="button"
        class="cuthandle"
        :style="{ left: percent(cut) }"
        :aria-label="`${label} cut ${index + 1} at ${cut}`"
        :aria-valuenow="cut"
        :aria-valuemin="0"
        :aria-valuemax="max"
        role="slider"
        @pointerdown="startDrag(index, $event)"
        @keydown="onKey(index, $event)"
      ></button>
    </div>
  </div>
</template>
