<script setup lang="ts">
withDefaults(defineProps<{ type?: 'button' | 'submit'; disabled?: boolean }>(), { type: 'button' });
</script>
<template>
  <button data-astro-cid-mpbzu7iw class="services__card-list-item mentor-secondary" :type="type" :disabled="disabled"><slot/></button>
</template>
