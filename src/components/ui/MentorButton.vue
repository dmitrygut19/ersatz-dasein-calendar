<script setup lang="ts">
withDefaults(defineProps<{ type?: 'button' | 'submit'; href?: string; target?: '_blank' | '_self'; disabled?: boolean; variant?: 1 | 2; fullWidth?: boolean; palette?: { background: string; text: string; accent: string }; artworkFilter?: string; decorLeft?:string; decorRight?:string; frameAsset?:string }>(), { type: 'button', variant: 2 });
const assets = '/assets/mentors/buttons/';
</script>
<template>
  <component :is="href ? 'a' : 'button'" data-v-4489f5d5 class="app-button title" :class="[`app-button--v${variant}`, { 'app-button--full-width': fullWidth }]" :style="{ '--transition': '.3s', ...(palette ? { '--brown-bg': palette.background, '--white-text': palette.text, '--event-button-accent': palette.accent } : {}) }" :href="href" :target="target" :rel="target === '_blank' ? 'noopener noreferrer' : undefined" :type="href ? undefined : type" :disabled="href ? undefined : disabled">
    <span data-v-4489f5d5 class="app-button__inner">
      <span data-v-4489f5d5 class="app-button__text"><slot/></span>
      <img data-v-4489f5d5 class="app-button__decor app-button__decor--left" :src="decorLeft || assets + (variant === 2 ? 'button-decor-left.png' : 'button-decor-left-light.png')" :style="artworkFilter && palette && (palette.background !== '#2B2121' || palette.accent !== '#AF5120') ? { filter: `url(#${artworkFilter})` } : undefined" alt=""/>
      <img data-v-4489f5d5 class="app-button__decor app-button__decor--right" :src="decorRight || assets + (variant === 2 ? 'button-decor-right.png' : 'button-decor-right-light.png')" :style="artworkFilter && palette && (palette.background !== '#2B2121' || palette.accent !== '#AF5120') ? { filter: `url(#${artworkFilter})` } : undefined" alt=""/>
    </span>
    <img data-v-4489f5d5 class="app-button__border" :src="frameAsset || assets + (variant === 2 ? 'button-border.png' : 'button-border-light.png')" :style="artworkFilter && palette && (palette.background !== '#2B2121' || palette.accent !== '#AF5120') ? { filter: `url(#${artworkFilter})` } : undefined" alt=""/>
  </component>
</template>
