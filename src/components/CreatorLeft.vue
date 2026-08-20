<script setup>
import DropZone from './DropZone.vue';
import { creator, generate, loadSource, clearSource, schemeLabel, ui } from '../state.js';
</script>

<template>
  <section class="panel left">
    <div class="section">
      <h2>Source Image</h2>
      <DropZone
        accept="image/*"
        aria-label="Upload source image: drop a file here or press Enter to browse"
        @files="loadSource($event[0])"
      >
        <div>Drop image here<br />or click to browse</div>
        <div class="hint">PNG · JPG · WebP</div>
      </DropZone>
      <div class="thumbrow" v-if="creator.source">
        <img :src="creator.source.thumb" alt="Source image preview" />
        <div>
          <div class="meta">{{ creator.source.width }} × {{ creator.source.height }} px</div>
          <div class="meta" v-if="creator.source.scaled">
            scaled down from {{ creator.source.origWidth }} × {{ creator.source.origHeight }}
          </div>
          <button class="linkbtn" @click="clearSource">Remove</button>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Configuration</h2>
      <div class="control">
        <div class="row">
          <label for="c-real">Chroma Plates</label
          ><span class="val">{{ creator.numRealPlates }}</span>
        </div>
        <input
          id="c-real"
          type="range"
          min="2"
          max="4"
          step="1"
          v-model.number="creator.numRealPlates"
        />
        <div class="scale"><span>2</span><span>3</span><span>4</span></div>
      </div>
      <div class="control">
        <div class="row">
          <label for="c-false">False Plates</label
          ><span class="val">{{ creator.numFalsePlates }}</span>
        </div>
        <input
          id="c-false"
          type="range"
          min="0"
          max="4"
          step="1"
          v-model.number="creator.numFalsePlates"
        />
        <div class="scale"><span>0</span><span>2</span><span>4</span></div>
      </div>
      <div class="control">
        <div class="row">
          <label for="c-op">Plate Opacity</label
          ><span class="val">{{ creator.plateOpacity.toFixed(2) }}</span>
        </div>
        <input
          id="c-op"
          type="range"
          min="0.3"
          max="1"
          step="0.05"
          v-model.number="creator.plateOpacity"
        />
        <div class="scale"><span>0.3</span><span>0.7</span><span>1.0</span></div>
      </div>
      <div class="note">
        Scheme: {{ schemeLabel
        }}<span v-if="creator.plateOpacity < 1">
          · colours boosted {{ (1 / creator.plateOpacity).toFixed(2) }}×, so bright highlights may
          clip</span
        >
      </div>
      <button class="primary" :disabled="!creator.source || ui.busy" @click="generate">
        <span v-if="ui.busy" class="spinner" aria-hidden="true"></span>
        {{ creator.plates.length ? 'Regenerate Plates' : 'Generate Plates' }}
      </button>
    </div>
  </section>
</template>
