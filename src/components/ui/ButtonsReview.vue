<script setup lang="ts">
import { ref } from 'vue';
import MentorButton from './MentorButton.vue';
import MentorSecondaryButton from './MentorSecondaryButton.vue';
const clicks=ref(0);
</script>
<template>
  <div class="buttons-review">
    <section class="button-example primary-example"><h2>Тёмная</h2><MentorButton @click="clicks++">текст</MentorButton></section>
    <section class="button-example white-example"><h2>Светлая</h2><MentorButton :variant="1" @click="clicks++">текст</MentorButton></section>
    <section class="button-example secondary-example"><h2>Простая</h2><MentorSecondaryButton @click="clicks++">смена домена</MentorSecondaryButton></section>
  </div>
  <p class="button-review-status" role="status">Нажатий: {{ clicks }}</p>
</template>
<style>
.buttons-review { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,360px),360px)); gap: var(--space-8); }
.button-example { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-6); padding: var(--space-4) var(--space-1); min-width: 0; }
.button-review-status { margin-block: var(--space-8); }
</style>
