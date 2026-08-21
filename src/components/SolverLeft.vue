<script setup>
import DropZone from './DropZone.vue';
import SegmentedChoice from './SegmentedChoice.vue';
import { clearPlates, loadPlates, solver } from '../state.js';

const STACK_CHOICES = [
  { value: 'additive', label: 'Additive', hint: 'Plates add up, the usual stack' },
  { value: 'modular', label: 'Cipher', hint: 'Plates wrap modulo 256; set by puzzle.json' },
];
</script>

<template>
  <section class="panel left">
    <div class="section">
      <h2>Load Puzzle</h2>
      <DropZone
        ref="zone"
        multiple
        accept=".png,.zip,image/png,application/zip"
        aria-label="Load plates: drop PNG files or a puzzle ZIP here, or press Enter to browse"
        @files="loadPlates"
      >
        <div>Drop plate PNGs<br />or puzzle ZIP here</div>
        <div class="hint">PNG · ZIP</div>
      </DropZone>
      <button class="ghost" @click="$refs.zone.browse()">Browse Files</button>

      <div class="meta" v-if="solver.plates.length">
        Loaded: {{ solver.plates.length }} plates<br />{{ solver.width }} × {{ solver.height }} px
      </div>
      <div class="error" v-if="solver.error">{{ solver.error }}</div>

      <SegmentedChoice
        v-if="solver.plates.length"
        id="s-stack"
        label="Stacking"
        v-model="solver.stack"
        :choices="STACK_CHOICES"
      />
      <button class="linkbtn" v-if="solver.plates.length" @click="clearPlates">Clear All</button>
    </div>

    <div class="section" v-if="solver.meta">
      <h2>Puzzle Info</h2>
      <div class="note">
        <ul>
          <li>
            {{ solver.meta.totalPlates }} plates, {{ solver.meta.numRealPlates }} of them real
          </li>
          <li>plate opacity {{ solver.meta.plateOpacity }}</li>
          <li v-if="solver.meta.created">
            created {{ new Date(solver.meta.created).toLocaleString() }}
          </li>
          <li v-if="solver.meta.solutionHash">
            solution hash present — your combination can be verified
          </li>
        </ul>
      </div>
    </div>

    <div class="section">
      <h2>How to Solve</h2>
      <div class="note">
        <ul>
          <li>Plates blend additively, so stack order never changes the picture.</li>
          <li>Solo a plate to see what colour band it carries.</li>
          <li>
            Switch plates off until the blend stops looking corrupted — the ones left are the real
            set.
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
