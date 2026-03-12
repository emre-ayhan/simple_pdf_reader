<script setup>
defineProps({
    progress: {
        type: Object,
        default: () => ({
            active: false,
            hydratedPages: 0,
            totalPages: 0,
            percent: 0
        })
    },
    position: {
        type: String,
        default: 'bottom',
    }
});
</script>
<template>
<div
    v-if="progress.active && progress.totalPages > 0"
    :class="`position-fixed start-0 ${position}-0 m-3 annotation-hydration-status`"
    :title="`${$t('Loading annotations')} ${progress.hydratedPages}/${progress.totalPages}`"
>
    <div class="annotation-hydration-pill">
        <i class="bi bi-chat-right-text-fill"></i>
        <span class="annotation-hydration-label">{{ $t('Loading annotations') }}</span>
        <span class="annotation-hydration-count">{{ progress.hydratedPages }}/{{ progress.totalPages }}</span>
        <div class="annotation-hydration-track">
            <div class="annotation-hydration-fill" :style="{ width: `${progress.percent}%` }"></div>
        </div>
    </div>
</div>
</template>