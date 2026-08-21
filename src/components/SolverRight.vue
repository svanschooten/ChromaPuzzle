<script setup>
import { ref } from 'vue';
import {
  checkSolution,
  exportSolution,
  movePlate,
  setAllEnabled,
  soloPlate,
  solver,
  enabledPlates,
  ui,
} from '../state.js';
import { rgbCss } from '../lib/color.js';

const dragIndex = ref(-1);
const dropIndex = ref(-1);

function onDragStart(index, event) {
  dragIndex.value = index;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', String(index));
}

function onDrop(index) {
  if (dragIndex.value >= 0) movePlate(dragIndex.value, index);
  dragIndex.value = dropIndex.value = -1;
}

/** Keyboard equivalent of the drag handle: arrows move, space toggles. */
function onKey(index, event) {
  const plate = solver.plates[index];
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault();
    const target = index + (event.key === 'ArrowUp' ? -1 : 1);
    movePlate(index, target);
    const cards = event.currentTarget.parentElement.children;
    cards[Math.min(cards.length - 1, Math.max(0, target))]?.focus();
  } else if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault();
    plate.enabled = !plate.enabled;
    checkSolution();
  }
}
</script>

<template>
  <section class="panel right">
    <div class="section">
      <h2>Plate Stack</h2>
      <div class="note">Drag to reorder · ↑/↓ to move · Space to toggle</div>
      <div class="previewbar" v-if="solver.plates.length">
        <button class="ghost" @click="setAllEnabled(true)">All on</button>
        <button class="ghost" @click="setAllEnabled(false)">All off</button>
        <span class="stat" style="text-align: right"
          >{{ enabledPlates.length }}/{{ solver.plates.length }}</span
        >
      </div>

      <div class="cards" role="list" v-if="solver.plates.length">
        <div
          class="card"
          role="listitem"
          v-for="(plate, index) in solver.plates"
          :key="plate.id"
          tabindex="0"
          draggable="true"
          :class="{
            disabled: !plate.enabled,
            dragging: dragIndex === index,
            'drop-before': dropIndex === index && dragIndex > index,
            'drop-after': dropIndex === index && dragIndex < index,
          }"
          :aria-label="`${plate.label}, ${plate.enabled ? 'enabled' : 'disabled'}, position ${index + 1} of ${solver.plates.length}`"
          @dragstart="onDragStart(index, $event)"
          @dragend="dragIndex = dropIndex = -1"
          @dragover.prevent="dropIndex = index"
          @drop.prevent="onDrop(index)"
          @keydown="onKey(index, $event)"
        >
          <span class="handle" aria-hidden="true">⠿</span>
          <input
            type="checkbox"
            v-model="plate.enabled"
            :aria-label="'Enable ' + plate.label"
            @change="checkSolution()"
          />
          <img :src="plate.thumb" :alt="plate.label + ' thumbnail'" />
          <div class="body">
            <span class="name">{{ plate.label }}</span>
            <span class="sub">
              <span
                class="swatch"
                :style="{ background: rgbCss(plate.tint) }"
                :title="'Average tint RGB ' + plate.tint.join(', ')"
              ></span>
              <span>{{
                index === 0 ? 'top' : index === solver.plates.length - 1 ? 'bottom' : ''
              }}</span>
            </span>
          </div>
          <button
            class="linkbtn"
            :aria-label="'Show only ' + plate.label"
            @click="soloPlate(plate)"
          >
            solo
          </button>
        </div>
      </div>
      <div class="note" v-else>Load plates to build a stack.</div>

      <button
        class="primary"
        v-if="solver.plates.length"
        :disabled="!enabledPlates.length || ui.busy"
        @click="exportSolution"
      >
        <span v-if="ui.busy" class="spinner" aria-hidden="true"></span>
        <span>EXPORT SOLUTION<span class="sub">Download PNG</span></span>
      </button>
    </div>
  </section>
</template>
