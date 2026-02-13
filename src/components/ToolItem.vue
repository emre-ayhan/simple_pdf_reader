<script setup>
defineProps({
    item: {
        type: Object,
        required: true
    },
    hideLabel: Boolean
});
</script>
<template>
<a href="#" :class="{ disabled: item.disabled.value }" @click.stop.prevent="$emit('tool-click', item)" :title="$t(item.label.text)">
    <div class="d-flex align-items-center" :class="{ 'gap-2': !hideLabel, 'justify-content-center': hideLabel }">
        <i v-if="item.icon" :class="`bi bi-${item.icon.value}`"></i>
        <template v-if="!hideLabel">
            {{ $t(item.label.text) }}
            <small class="text-secondary ms-auto" v-if="item.label.shortcut">({{ item.label.shortcut }})</small>
        </template>
    </div>
</a>
</template>