<script setup>
import { Toast } from 'bootstrap';
import { onMounted, ref } from 'vue';

const props = defineProps({
    id: {
        type: String,
        required: true
    },
    options: {
        type: Object,
        default: () => ({
            delay: 5000,
            autohide: true,
            animation: true
        })
    },
    position: {
        type: String,
        default: 'top-0 start-0',
    }
})

const toastEl = ref(null)

onMounted(() => {
    toastEl.value = new Toast(`#${props.id}`, props.options)
})

defineExpose({
    show() {
        toastEl.value?.show()
    },
    hide() {
        toastEl.value?.hide()
    },
    getElement() {
        return toastEl.value?._element || null
    }
})

</script>
<style>
.toast {
    margin: 90px 40px;
    min-width: 400px;
}
</style>
<template>
<div :class="`toast-container position-fixed ${position}`">
    <div :id="id" class="toast" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="toast-body">
            <slot></slot>
        </div>
    </div>
</div>
</template>