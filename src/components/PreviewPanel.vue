<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { activePlates, checkSolution, creator, enabledPlates, solver, ui } from '../state.js';
import { renderPlates } from '../lib/composite.js';
import { rgbCss } from '../lib/color.js';

const canvas = ref(null);

const dimensions = computed(() =>
  ui.mode === 'creator'
    ? [creator.source?.width ?? 0, creator.source?.height ?? 0]
    : [solver.width, solver.height],
);

function render() {
  const [width, height] = dimensions.value;
  if (!canvas.value || !width || !height) return;
  if (ui.mode === 'creator' && creator.showOriginal && creator.source) {
    renderPlates(canvas.value, [{ data: creator.source.data }], width, height);
    return;
  }
  renderPlates(canvas.value, enabledPlates.value, width, height);
}

// Re-render whenever the enabled set, the plates themselves, or the mode change.
const signature = computed(() =>
  [
    ui.mode,
    creator.showOriginal,
    dimensions.value.join('x'),
    activePlates.value.map((p) => p.id + (p.enabled ? '1' : '0')).join(','),
  ].join('|'),
);

watch(signature, render, { flush: 'post' });
watch(
  () => activePlates.value.map((p) => p.enabled).join(''),
  () => {
    if (ui.mode === 'solver') checkSolution();
  },
);
onMounted(render);
</script>

<template>
  <section class="panel center">
    <h2>{{ ui.mode === 'creator' ? 'Preview' : 'Solution Preview' }}</h2>

    <div class="canvas-wrap">
      <canvas
        ref="canvas"
        v-show="activePlates.length"
        aria-label="Composited plate preview"
      ></canvas>
      <p class="empty" v-if="!activePlates.length">
        {{
          ui.mode === 'creator'
            ? 'Upload an image and generate plates to preview the blend.'
            : 'Load plate PNGs or a puzzle ZIP to start solving.'
        }}
      </p>
    </div>

    <div class="toggle-list" v-if="ui.mode === 'creator' && creator.plates.length">
      <div
        class="toggle-row"
        v-for="plate in creator.plates"
        :key="plate.id"
        :class="{ 'false-plate': plate.isFalse }"
      >
        <input
          type="checkbox"
          :id="'toggle-' + plate.id"
          v-model="plate.enabled"
          :aria-label="'Enable ' + plate.label"
        />
        <label :for="'toggle-' + plate.id">{{ plate.label }}</label>
        <span
          class="swatch"
          :style="{ background: rgbCss(plate.tint) }"
          :title="'RGB ' + plate.tint.join(', ')"
        ></span>
      </div>
    </div>

    <div class="previewbar">
      <span class="stat"
        >Plates: {{ activePlates.length }} · Enabled: {{ enabledPlates.length }}</span
      >
      <template v-if="ui.mode === 'creator'">
        <button
          class="ghost"
          :class="{ active: creator.showOriginal }"
          :disabled="!creator.source"
          @click="creator.showOriginal = true"
        >
          Show Original
        </button>
        <button
          class="ghost"
          :class="{ active: !creator.showOriginal }"
          :disabled="!creator.plates.length"
          @click="creator.showOriginal = false"
        >
          Show Blend
        </button>
      </template>
      <button
        class="ghost"
        v-else
        disabled
        title="puzzle.json carries no reference image, so there is no target to show"
      >
        Show Target
      </button>
    </div>

    <p
      class="verdict"
      v-if="ui.mode === 'solver' && solver.meta?.solutionHash"
      :class="solver.solved ? 'solved' : 'unsolved'"
    >
      {{
        solver.solved
          ? '✓ Correct combination — exactly the real plates are enabled.'
          : 'Not the solution yet. Keep switching plates off until only the real ones remain.'
      }}
    </p>
  </section>
</template>
