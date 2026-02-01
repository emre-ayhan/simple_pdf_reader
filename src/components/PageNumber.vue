<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
    pageNum: {
        type: Number,
        required: true
    },
    totalPages: {
        type: Number,
        required: true
    }
});

const show = ref(true);

watch(() => props.pageNum, () => {
    show.value = true;
    setTimeout(() => {
        show.value = false;
    }, 2000);
});

</script>
<template>
<div class="card bg-dark text-secondary position-fixed bottom-0 end-0 my-3 mx-4" v-if="show">
    <div class="card-body d-flex justify-content-center align-items-center gap-2">
        <div class="text-primary">{{ pageNum }}</div>
        <div class="vr"></div>
        <div>{{ totalPages }}</div>
    </div>
</div>
</template>