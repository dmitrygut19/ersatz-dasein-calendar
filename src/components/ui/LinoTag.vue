<script setup lang="ts">
// Vue adapter to the published Tag: identical slot, tier, styles and cut('tag').
import {linoCut as vLinoCut} from '../../lib/admin-material';
withDefaults(defineProps<{tier?:0|1|2}>(),{tier:0});
</script>
<template><span v-lino-cut="'tag'" class="lino-tag" data-slot="tag" :data-tier="tier"><slot/></span></template>
