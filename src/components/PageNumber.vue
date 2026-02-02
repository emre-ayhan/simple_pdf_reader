<script setup>
import { ref, watch } from 'vue';
import { toolbarPosition } from '../composables/useAppPreferences';

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

const hidePageNumber = () => {
    setTimeout(() => {
        show.value = false;
    }, 2000);
};

let timer = hidePageNumber();

watch(() => props.pageNum, () => {
    show.value = true;
    clearTimeout(timer);
    timer = hidePageNumber();
});

</script>
<template>
<div :class="`card bg-dark text-secondary position-fixed end-0 my-3 mx-4 ${toolbarPosition === 'top' ? 'bottom-0' : 'top-0'}`" v-if="show">
    <div class="card-body d-flex justify-content-center align-items-center gap-2">
        <div class="text-primary">{{ pageNum }}</div>
        <div class="vr"></div>
        <div>{{ totalPages }}</div>
    </div>
</div>
</template>