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
<a href="#" :class="{ disabled: item.disabled.value }" @click.prevent.stop="$emit('tool-click', item)" :title="$t(item.label.text)">
    <div class="d-flex align-items-center gap-2">
        <i v-if="item.icon" :class="`bi bi-${item.icon.value}`"></i>
        <template v-if="!hideLabel">
            {{ $t(item.label.text) }}
            <small class="text-secondary ms-auto" v-if="item.label.shortcut">({{ item.label.shortcut }})</small>
        </template>
    </div>
</a>
</template>