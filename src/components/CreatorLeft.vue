<script setup>
import { ref } from 'vue';
import BandCuts from './BandCuts.vue';
import DropZone from './DropZone.vue';
import SegmentedChoice from './SegmentedChoice.vue';
import {
  BAND_MODES,
  BAND_SPACES,
  clearSource,
  creator,
  estimate,
  FALSE_MODES,
  generatePlates,
  loadPreset,
  loadSource,
  MAX_PLATES,
  MAX_WEAVE,
  MIN_PLATES,
  OCCLUSION_MODES,
  savePreset,
  SOFT_PLATE_LIMIT,
  ui,
} from '../state.js';

const presetInput = ref(null);

function onPresetPicked(event) {
  const [file] = event.target.files;
  if (file) loadPreset(file);
  event.target.value = '';
}

const BAND_SPACE_COPY = {
  channels: { label: 'Channels', hint: 'Tonal slices of red, green and blue' },
  spectrum: { label: 'Spectrum', hint: 'Arcs of the hue wheel, even at any plate count' },
  cells: { label: 'Cells', hint: 'Hue × chroma × value cells, summed onto plates' },
};
const CELL_AXIS_COPY = {
  hue: { label: 'Hue classes', hint: 'where on the wheel' },
  chroma: { label: 'Chroma classes', hint: 'how colourful' },
  value: { label: 'Value classes', hint: 'how bright' },
};
const CELL_AXES = Object.keys(CELL_AXIS_COPY);
const BAND_MODE_COPY = {
  linear: { label: 'Linear', hint: 'Equal-width slices' },
  weighted: { label: 'Weighted', hint: 'Cuts placed so every band carries equal image' },
  manual: { label: 'Manual', hint: 'Drag the cuts yourself' },
};
// The modes themselves are defined in lib; the wording belongs here.
const FALSE_MODE_COPY = {
  drift: { label: 'Color drift', hint: 'Decoys are the image in the wrong colors' },
  warp: { label: 'Image warp', hint: 'Decoys are the image pushed out of shape' },
};
const OCCLUSION_COPY = {
  fracture: { label: 'Fracture', hint: 'Bands swap between plates shard by shard' },
  blend: { label: 'Blend', hint: 'Soft noise islands decide who carries what' },
  noise: { label: 'Noise', hint: 'Per-pixel static; plates become colored snow' },
  screen: { label: 'Screen', hint: 'An ordered dither, like a printing separation' },
};
const describe = (modes, copy) => modes.map((value) => ({ value, ...copy[value] }));
const FALSE_MODE_CHOICES = describe(FALSE_MODES, FALSE_MODE_COPY);
const OCCLUSION_CHOICES = describe(OCCLUSION_MODES, OCCLUSION_COPY);
const BAND_SPACE_CHOICES = describe(BAND_SPACES, BAND_SPACE_COPY);
const BAND_MODE_CHOICES = describe(BAND_MODES, BAND_MODE_COPY);

const CELL_STRIPS = {
  hue: {
    label: 'Hue cuts',
    max: 360,
    ring: true,
    gradient: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
  },
  chroma: {
    label: 'Chroma cuts',
    max: 255,
    ring: false,
    gradient: 'linear-gradient(to right, #777, #f22)',
  },
  value: {
    label: 'Value cuts',
    max: 255,
    ring: false,
    gradient: 'linear-gradient(to right, #000, #fff)',
  },
};

const CHANNEL_STRIPS = [
  { label: 'Red cuts', gradient: 'linear-gradient(to right, #000, #f33)' },
  { label: 'Green cuts', gradient: 'linear-gradient(to right, #000, #3f3)' },
  { label: 'Blue cuts', gradient: 'linear-gradient(to right, #000, #48f)' },
];
const HUE_GRADIENT = 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)';

function setChannelCuts(channel, cuts) {
  creator.cuts = {
    ...creator.cuts,
    channels: creator.cuts.channels.map((existing, index) => (index === channel ? cuts : existing)),
  };
}
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
          <label for="c-real">Chroma Plates</label><span class="val">{{ creator.plateCount }}</span>
        </div>
        <input
          id="c-real"
          type="range"
          :min="MIN_PLATES"
          :max="MAX_PLATES"
          step="1"
          v-model.number="creator.plateCount"
        />
        <div class="scale">
          <span>{{ MIN_PLATES }}</span
          ><span>{{ MAX_PLATES }}</span>
        </div>
      </div>

      <div class="control">
        <div class="row">
          <label for="c-false">False Plates</label><span class="val">{{ creator.falseCount }}</span>
        </div>
        <input
          id="c-false"
          type="range"
          min="0"
          :max="MAX_PLATES"
          step="1"
          v-model.number="creator.falseCount"
        />
        <div class="scale">
          <span>0</span><span>{{ MAX_PLATES }}</span>
        </div>
      </div>

      <div class="control">
        <div class="row">
          <label for="c-op">Plate Opacity</label>
          <span class="val">{{ creator.opacity.toFixed(2) }}</span>
        </div>
        <input
          id="c-op"
          type="range"
          min="0.3"
          max="1"
          step="0.05"
          v-model.number="creator.opacity"
        />
        <div class="scale"><span>0.3</span><span>1.0 (no boost)</span></div>
      </div>
      <div class="note" v-if="creator.opacity < 1">
        Colors boosted {{ (1 / creator.opacity).toFixed(2) }}× to make up for the alpha, so bright
        highlights may clip. At 1.00 the stack reconstructs the source exactly.
      </div>

      <SegmentedChoice
        id="c-space"
        label="Band Space"
        v-model="creator.bandSpace"
        :choices="BAND_SPACE_CHOICES"
      />
      <SegmentedChoice
        id="c-band"
        label="Band Split"
        v-model="creator.bandMode"
        :choices="BAND_MODE_CHOICES"
      />

      <template v-if="creator.bandSpace === 'cells'">
        <div class="control" v-for="axis in CELL_AXES" :key="axis">
          <div class="row">
            <label :for="`c-cell-${axis}`">{{ CELL_AXIS_COPY[axis].label }}</label>
            <span class="val">{{ creator.cells[axis] === 1 ? 'off' : creator.cells[axis] }}</span>
          </div>
          <input
            :id="`c-cell-${axis}`"
            type="range"
            min="1"
            max="12"
            step="1"
            :value="creator.cells[axis]"
            @input="creator.cells = { ...creator.cells, [axis]: Number($event.target.value) }"
          />
          <div class="scale">
            <span>{{ CELL_AXIS_COPY[axis].hint }}</span
            ><span>1 = off</span>
          </div>
        </div>
        <label class="checkrow">
          <input
            id="c-cell-hard"
            type="checkbox"
            :checked="creator.cells.hard"
            @change="creator.cells = { ...creator.cells, hard: $event.target.checked }"
          />
          Hard cells — every pixel lands on one plate
        </label>
      </template>

      <div class="control" v-else>
        <div class="row">
          <label for="c-weave">Weave</label>
          <span class="val">{{ creator.weave === 1 ? 'off' : `×${creator.weave}` }}</span>
        </div>
        <input
          id="c-weave"
          type="range"
          min="1"
          :max="MAX_WEAVE"
          step="1"
          v-model.number="creator.weave"
        />
        <div class="scale">
          <span>{{
            creator.weave === 1
              ? 'one slice per plate'
              : `${creator.plateCount * creator.weave} slices dealt round the plates`
          }}</span>
        </div>
      </div>

      <template v-if="creator.bandMode === 'manual'">
        <div class="note" v-if="!creator.cuts">Generate once to load the cuts, then drag them.</div>
        <template v-else-if="creator.bandSpace === 'cells'">
          <BandCuts
            v-for="axis in CELL_AXES"
            :key="axis"
            v-show="creator.cells[axis] > 1"
            :label="CELL_STRIPS[axis].label"
            :max="CELL_STRIPS[axis].max"
            :gradient="CELL_STRIPS[axis].gradient"
            :histogram="creator.histograms?.[axis]"
            :model-value="creator.cuts[axis]"
            @update:model-value="creator.cuts = { ...creator.cuts, [axis]: $event }"
          />
        </template>
        <template v-else-if="creator.bandSpace === 'spectrum'">
          <BandCuts
            label="Hue cuts"
            :max="360"
            :gradient="HUE_GRADIENT"
            :histogram="creator.histograms?.hue"
            :model-value="creator.cuts.hue"
            @update:model-value="creator.cuts = { ...creator.cuts, hue: $event }"
          />
        </template>
        <template v-else>
          <BandCuts
            v-for="(strip, channel) in CHANNEL_STRIPS"
            :key="strip.label"
            :label="strip.label"
            :max="255"
            :gradient="strip.gradient"
            :histogram="creator.histograms?.channels?.[channel]"
            :model-value="creator.cuts.channels[channel]"
            @update:model-value="setChannelCuts(channel, $event)"
          />
        </template>
      </template>
      <SegmentedChoice
        id="c-falsemode"
        label="Decoys"
        v-model="creator.falseMode"
        :choices="FALSE_MODE_CHOICES"
      />
      <div class="control" v-if="creator.falseCount > 0">
        <div class="row">
          <label for="c-decoy">Decoy Intensity</label>
          <span class="val">{{ Math.round(creator.decoyIntensity * 100) }}%</span>
        </div>
        <input
          id="c-decoy"
          type="range"
          min="0.05"
          max="1"
          step="0.05"
          v-model.number="creator.decoyIntensity"
        />
        <div class="scale"><span>subtle, harder</span><span>obvious, easier</span></div>
      </div>
    </div>

    <div class="section">
      <h2>Occlusion</h2>
      <label class="checkrow">
        <input id="c-occlusion" type="checkbox" v-model="creator.occlusionEnabled" />
        Hide the picture inside each plate
      </label>

      <template v-if="creator.occlusionEnabled">
        <SegmentedChoice
          id="c-occmode"
          label="Mode"
          v-model="creator.occlusionMode"
          :choices="OCCLUSION_CHOICES"
        />
        <div class="control">
          <div class="row">
            <label for="c-strength">Strength</label>
            <span class="val">{{ Math.round(creator.occlusionStrength * 100) }}%</span>
          </div>
          <input
            id="c-strength"
            type="range"
            min="0.05"
            max="1"
            step="0.05"
            v-model.number="creator.occlusionStrength"
          />
          <div class="scale"><span>subtle</span><span>total</span></div>
        </div>

        <div class="control" v-if="creator.occlusionMode === 'fracture'">
          <div class="row">
            <label for="c-shard">Shard Size</label>
            <span class="val">{{ creator.shardSize }} px</span>
          </div>
          <input
            id="c-shard"
            type="range"
            min="12"
            max="96"
            step="4"
            v-model.number="creator.shardSize"
          />
          <div class="scale"><span>12</span><span>96</span></div>
        </div>

        <div class="control" v-if="creator.occlusionMode === 'screen'">
          <div class="row">
            <label for="c-screen">Dot Size</label>
            <span class="val">{{ creator.screenScale }} px</span>
          </div>
          <input
            id="c-screen"
            type="range"
            min="1"
            max="8"
            step="1"
            v-model.number="creator.screenScale"
          />
          <div class="scale"><span>1</span><span>8</span></div>
        </div>

        <div class="control" v-if="creator.occlusionMode === 'blend'">
          <div class="row">
            <label for="c-scale">Island Size</label>
            <span class="val">{{ creator.blendScale }} px</span>
          </div>
          <input
            id="c-scale"
            type="range"
            min="16"
            max="256"
            step="8"
            v-model.number="creator.blendScale"
          />
          <div class="scale"><span>16</span><span>256</span></div>
        </div>

        <div class="note">
          Whatever one plate is masked out of, the others pick up — the stack still reconstructs the
          source exactly.
        </div>
      </template>
    </div>

    <div class="section">
      <h2>Stacking</h2>
      <div class="control">
        <div class="row">
          <label for="c-cipher">Cipher</label>
          <span class="val">{{ Math.round(creator.cipher * 100) }}%</span>
        </div>
        <input
          id="c-cipher"
          type="range"
          min="0"
          max="1"
          step="0.05"
          v-model.number="creator.cipher"
        />
        <div class="scale"><span>plates add up</span><span>plates are static</span></div>
      </div>
      <div class="note" v-if="creator.cipher > 0">
        Plates carry noise that cancels out modulo 256, so the picture exists only in the complete
        stack. They no longer combine with ordinary additive blending, and an incomplete stack shows
        nothing at all — the puzzle becomes trial and error rather than something you can read.
      </div>
    </div>

    <div class="section">
      <h2>Preset</h2>
      <div class="buttonrow">
        <button class="ghost" @click="savePreset">Save settings</button>
        <button class="ghost" @click="presetInput.click()">Load settings</button>
      </div>
      <input
        ref="presetInput"
        type="file"
        class="visually-hidden"
        accept="application/json,.json"
        aria-label="Preset file"
        @change="onPresetPicked"
      />
      <div class="note">Every setting except the image, as a file you can share.</div>
    </div>

    <div class="section sticky-action">
      <p class="estimate" v-if="estimate" :class="{ slow: estimate.slow }">
        Estimated generation: {{ estimate.text }}.
        <template v-if="creator.plateCount > SOFT_PLATE_LIMIT">
          Above {{ SOFT_PLATE_LIMIT }} plates this grows quickly.
        </template>
      </p>
      <button class="primary" :disabled="!creator.source || ui.busy" @click="generatePlates">
        <span v-if="ui.busy" class="spinner" aria-hidden="true"></span>
        {{ creator.plates.length ? 'Regenerate Plates' : 'Generate Plates' }}
      </button>
    </div>
  </section>
</template>
