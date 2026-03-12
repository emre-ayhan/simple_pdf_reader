<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
    pageNum: [Number, String],
    total: [Number, String],
    position: {
        type: String,
        default: 'bottom',
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
<div :class="`card bg-dark text-secondary position-fixed end-0 my-3 mx-4 ${position}-0`" v-if="show">
    <div class="card-body d-flex justify-content-center align-items-center gap-2">
        <div class="text-primary">{{ pageNum }}</div>
        <div class="vr"></div>
        <div>{{ total }}</div>
    </div>
</div>
</template>