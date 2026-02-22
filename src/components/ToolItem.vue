<script setup>
const props = defineProps({
    icon: String,
    iconActive: Boolean,
    label: String,
    labelClass: {
        type: String,
        default: '',
    },
    shortcut: String,
    action: Function,
    value: [String, Number, Boolean],
    disabled: Boolean,
    active: Boolean,
});

const onClick = () => {
    if (props.disabled) return;
    props.action(props.value);
}
</script>
<template>
<a href="#" :class="{ disabled, active }" @click.stop.prevent="onClick" :title="$t(label) + (shortcut ? ` (${shortcut})` : '')">
    <div class="d-flex align-items-center gap-2">
        <i v-if="icon" :class="`bi bi-${icon}${iconActive && active ? '-fill' : ''}`"></i>
        <span :class="labelClass || ''" v-if="label">{{ $t(label) }} <span v-if="shortcut">({{ shortcut }})</span></span>
    </div>
</a>
</template>