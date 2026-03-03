<script setup>
import { onMounted, ref } from 'vue';

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

const onInput = (event) => {
    emit('update:modelValue', event.target.value);
}

onMounted(() => {
    if (simpleEditor.value) {
        simpleEditor.value.focus();
    }
});

</script>
<template>
    <div class="text-editor-box simple-mode" :style="{ ...style, height: 'auto', width: 'auto' }" @contextmenu.stop.prevent>
        <input ref="simpleEditor" type="text" class="form-control" :placeholder="$t('Type text...')" :value="modelValue" @input="onInput" @keydown.enter.prevent="emit('enter', modelValue)" @keydown.esc.prevent="emit('cancel')" />
    </div>
</template>