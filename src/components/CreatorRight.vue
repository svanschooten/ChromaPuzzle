<script setup>
import { creator, exportPuzzle, ui } from '../state.js';
import { rgbCss } from '../lib/color.js';
</script>

<template>
  <section class="panel right">
    <div class="section">
      <h2>Generated Plates</h2>
      <div class="cards" v-if="creator.plates.length">
        <div
          class="card"
          v-for="plate in creator.plates"
          :key="plate.id"
          :class="{ 'false-plate': plate.isFalse, disabled: !plate.enabled }"
        >
          <input type="checkbox" v-model="plate.enabled" :aria-label="'Enable ' + plate.label" />
          <img :src="plate.thumb" :alt="plate.label + ' thumbnail'" />
          <div class="body">
            <span class="name">{{ plate.label }}</span>
            <span class="sub">
              {{ plate.bandLabel }}
              <span
                class="swatch"
                :style="{ background: rgbCss(plate.tint) }"
                :title="'RGB ' + plate.tint.join(', ')"
              ></span>
            </span>
            <span class="sub">{{ plate.width }}×{{ plate.height }} PNG</span>
          </div>
        </div>
      </div>
      <div class="note" v-else>Generate plates to see them here.</div>

      <button class="primary" :disabled="!creator.plates.length || ui.busy" @click="exportPuzzle">
        <span v-if="ui.busy" class="spinner" aria-hidden="true"></span>
        <span>EXPORT PUZZLE<span class="sub">Download ZIP</span></span>
      </button>
      <div class="note" v-if="creator.plates.length">
        Export includes:
        <ul>
          <li>{{ creator.plates.length }} shuffled plate PNGs</li>
          <li>puzzle.json metadata</li>
        </ul>
      </div>
    </div>
  </section>
</template>
