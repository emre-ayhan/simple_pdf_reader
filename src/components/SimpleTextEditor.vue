<script setup>
import { onMounted, ref, watch } from 'vue';

const props = defineProps({
    modelValue: {
        type: String,
        default: ''
    },
    style: {
        type: Object,
        default: {}
    }
})

const emit = defineEmits(['update:modelValue', 'enter', 'cancel'])

const simpleEditor = ref(null)
const SIMPLE_TEXT_MAX_CHARS = 180
const lastAcceptedValue = ref(String(props.modelValue || ''))

const canAcceptValue = (candidate) => {
    const nextValue = String(candidate || '')
    if (nextValue.length > SIMPLE_TEXT_MAX_CHARS) return false

    const input = simpleEditor.value
    if (!input) return true

    const previous = input.value
    input.value = nextValue
    const fits = input.scrollWidth <= (input.clientWidth + 1)
    input.value = previous
    return fits
}

const onInput = (event) => {
    const nextValue = String(event.target.value || '')
    if (canAcceptValue(nextValue)) {
        lastAcceptedValue.value = nextValue
        emit('update:modelValue', nextValue)
        return
    }

    event.target.value = lastAcceptedValue.value
    emit('update:modelValue', lastAcceptedValue.value)
}

const onKeydown = (event) => {
    if (event.isComposing) return

    if (event.key === 'Enter') {
        event.preventDefault()
        emit('enter', props.modelValue)
        return
    }

    if (event.key === 'Escape') {
        event.preventDefault()
        emit('cancel')
        return
    }

    if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return

    const input = simpleEditor.value
    if (!input) return

    const start = input.selectionStart ?? input.value.length
    const end = input.selectionEnd ?? input.value.length
    const candidate = `${input.value.slice(0, start)}${event.key}${input.value.slice(end)}`

    if (!canAcceptValue(candidate)) {
        event.preventDefault()
    }
}

watch(() => props.modelValue, (value) => {
    lastAcceptedValue.value = String(value || '')
})

onMounted(() => {
    if (simpleEditor.value) {
        simpleEditor.value.focus();
    }
});

</script>
<template>
    <div class="text-editor-box simple-mode" :style="{ ...style, height: 'auto', width: 'auto' }" @contextmenu.stop.prevent>
        <input ref="simpleEditor" type="text" class="form-control" :placeholder="$t('Type text...')" :value="modelValue" :maxlength="SIMPLE_TEXT_MAX_CHARS" @input="onInput" @keydown="onKeydown" />
    </div>
</template>