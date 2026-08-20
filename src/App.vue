<script setup>
import { computed } from 'vue';
import CreatorLeft from './components/CreatorLeft.vue';
import CreatorRight from './components/CreatorRight.vue';
import PreviewPanel from './components/PreviewPanel.vue';
import SolverLeft from './components/SolverLeft.vue';
import SolverRight from './components/SolverRight.vue';
import { activePlates, creator, solver, ui } from './state.js';

const tabs = computed(() => [
  { id: 'config', label: ui.mode === 'creator' ? 'Config' : 'Load' },
  { id: 'preview', label: 'Preview' },
  { id: 'plates', label: 'Plates' },
]);

const summary = computed(() => {
  const parts = [ui.mode === 'creator' ? 'Creator Mode' : 'Solver Mode'];
  if (ui.mode === 'creator' && creator.source) {
    parts.push(`Image: ${creator.source.width}×${creator.source.height}`);
  } else if (ui.mode === 'solver' && solver.width) {
    parts.push(`Plates: ${solver.width}×${solver.height}`);
  }
  if (activePlates.value.length) parts.push(`${activePlates.value.length} plates`);
  parts.push(ui.status);
  return parts.join(' · ');
});
</script>

<template>
  <header>
    <h1>🧩 Chroma Puzzle</h1>
    <nav class="modes" aria-label="Application mode">
      <button
        v-for="m in ['creator', 'solver']"
        :key="m"
        :class="{ active: ui.mode === m }"
        :aria-pressed="String(ui.mode === m)"
        @click="ui.mode = m"
      >
        {{ m === 'creator' ? 'Creator' : 'Solver' }}
      </button>
    </nav>
  </header>

  <div class="tabs" role="tablist" aria-label="Panels">
    <button
      v-for="t in tabs"
      :key="t.id"
      role="tab"
      :aria-selected="String(ui.tab === t.id)"
      :class="{ active: ui.tab === t.id }"
      @click="ui.tab = t.id"
    >
      {{ t.label }}
    </button>
  </div>

  <main :data-tab="ui.tab">
    <CreatorLeft v-if="ui.mode === 'creator'" />
    <SolverLeft v-else />
    <PreviewPanel />
    <CreatorRight v-if="ui.mode === 'creator'" />
    <SolverRight v-else />
  </main>

  <div class="statusbar" role="status" aria-live="polite">
    <span class="dot" :class="ui.statusKind" aria-hidden="true"></span>
    <span>{{ summary }}</span>
  </div>
</template>
