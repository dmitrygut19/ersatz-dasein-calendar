<script setup lang="ts">
import {useAdminLino} from '../../lib/admin-ui';const modern=useAdminLino();
// Original Insignia loading glyph from the installed kit's spinner.svelte.
const points=['4.45,19.15 7.25,11.51 13.01,16.49 14.42,10.92 19.5,14.5','2.68,10.15 5.49,2.51 11.24,7.49 12.47,2.92 16.5,5.5'];
</script>
<template><span v-if="modern" data-slot="spinner" class="admin-spinner" aria-hidden="true"><svg viewBox="2 1 18 18"><template v-for="(line,index) in points" :key="index"><polyline class="under" :points="line"/><polyline class="over" :class="index?'b':'a'" :points="line" pathLength="1"/></template></svg></span></template>
