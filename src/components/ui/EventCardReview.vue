<script setup lang="ts">
import { ref } from 'vue';
import EventCard from './EventCard.vue';
const message=ref('');
</script>
<template>
  <div class="event-card-reference"><EventCard title="Конгресс" description="Все" cover="/assets/panel/a5ff5.png" @edit="message='Нажато редактирование образца. Рабочая форма находится ниже.'" @delete="message='Нажато удаление образца. Образец не удаляет данные.'"/></div>
  <p v-if="message" role="status" class="event-card-review-message">{{ message }}</p>
</template>
<style>
.event-card-reference { width: 816px; max-width: 100%; }
.event-card-review-message { margin-top: var(--space-4); }
</style>
