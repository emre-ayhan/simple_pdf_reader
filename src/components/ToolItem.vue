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
<a href="#" :class="{ disabled, active }" @click.prevent="onClick" :title="$t(label) + (shortcut ? ` (${shortcut})` : '')">
    <div class="d-flex align-items-center">
        <i v-if="icon" :class="`bi bi-${icon}${iconActive && active ? '-fill' : ''}`"></i>
        <div :class="`d-flex align-items-start flex-fill ms-2 gap-2 ${labelClass}`" v-if="label">
            {{ $t(label) }}
            <small class="text-secondary ms-auto" v-if="shortcut">{{ shortcut }}</small>
        </div>
    </div>
</a>
</template>