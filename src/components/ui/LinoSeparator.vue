<script setup lang="ts">import {useAdminLino} from '../../lib/admin-ui';const modern=useAdminLino();</script>
<template><div v-if="modern" data-slot="separator" data-orientation="horizontal" class="lino-rule" role="separator"/></template>
