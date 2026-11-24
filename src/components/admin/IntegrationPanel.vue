<script setup lang="ts">
import { computed } from 'vue';
import MentorButton from '../ui/MentorButton.vue';
import MentorSecondaryButton from '../ui/MentorSecondaryButton.vue';
import FigmaField from '../ui/FigmaField.vue';
import LinoSpinner from '../ui/LinoSpinner.vue';

const props = defineProps<{ state: string; summary?: string; lastSyncAt?: string | null; lastSyncError?: string | null; provider?: string }>();
const emit = defineEmits<{ close: []; change: []; update: []; disconnect: [] }>();
const state = computed(() => props.state.split('-').pop());
const link = 'Ссылка скрыта. Для замены нажмите «Сменить календарь».';
const providerLabel = computed(() => props.provider === 'yandex' ? 'Яндекс Календарь' : 'Google Календарь');
const updatedLabel = computed(() => {
  if (state.value === 'error') return props.lastSyncError || 'Ошибка синхронизации';
  if (state.value === 'syncing') return 'Обновляем события…';
  if (props.lastSyncAt) return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(props.lastSyncAt));
  return 'Только что';
});
</script>

<template>
  <section class="integration-content" :data-state="state">
    <div class="integration-main">
      <div class="integration-heading">
        <span class="integration-handle" aria-hidden="true"/>
        <div class="integration-heading-row">
          <h2>Подключение</h2>
          <button class="integration-close" type="button" aria-label="Закрыть подключение" @click="emit('close')"><img src="/assets/integration/close.svg" width="20" height="20" alt=""/></button>
        </div>
      </div>

      <template v-if="state !== 'disconnected'">
        <div class="integration-sync">
          <dl class="integration-details">
            <div><dt>Календарь</dt><dd>{{ summary || 'Ersatz Dasein' }}</dd></div>
            <div><dt>Источник</dt><dd>{{ providerLabel }}</dd></div>
            <div><dt>Последнее обновление</dt><dd :class="{ 'integration-error': state === 'error' }"><LinoSpinner v-if="state === 'syncing'"/>{{ updatedLabel }}</dd></div>
          </dl>
          <MentorSecondaryButton v-if="state === 'connected'" class="integration-action" @click="emit('update')">Обновить сейчас</MentorSecondaryButton>
          <MentorButton v-else-if="state === 'error'" class="integration-primary" @click="emit('update')">Повторить</MentorButton>
        </div>
        <div class="integration-calendar">
          <FigmaField id="integration-link" :model-value="link" label="Подключение календаря" disabled/>
          <MentorSecondaryButton v-if="state !== 'connected'" class="integration-action" @click="emit('change')">Сменить календарь</MentorSecondaryButton>
          <MentorButton v-else class="integration-primary" @click="emit('change')">Сменить календарь</MentorButton>
        </div>
      </template>

      <div v-else class="integration-disconnected">
        <p>Вставьте ссылку iCal из настроек Google или Яндекс.Календаря, чтобы импортировать события.</p>
        <MentorButton class="integration-primary" @click="emit('change')">Подключить календарь</MentorButton>
      </div>
    </div>
    <button v-if="state !== 'disconnected'" class="integration-disconnect" type="button" @click="emit('disconnect')">Отключить календарь</button>
  </section>
</template>
