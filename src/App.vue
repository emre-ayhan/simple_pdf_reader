<script setup>
import { inject, onBeforeMount, ref } from 'vue';
import { useStore } from './composables/useStore';
import { toggleTouchDrawing } from './composables/useTouchDrawing';
import NavTabs from './components/NavTabs.vue';
import PdfReader from './components/PdfReader.vue';
import PageModal from './components/PageModal.vue';
import UpdateState from './components/UpdateState.vue';

const store = useStore();
const reader = ref(null);
const toolbarPosition = ref('top');
const changeLocale = inject('changeLocale');

const appHandlers = {
    toggleToolbarPosition() {
        const newPosition = toolbarPosition.value === 'top' ? 'bottom' : 'top';
        store.set('toolbarPosition', newPosition);
        toolbarPosition.value = newPosition;
    },
    changeLocale,
    toggleTouchDrawing
}

const menuItemClickHandler = (action, value) => {
    if (!reader.value || !action) return;
    const handler = reader.value[action] || appHandlers[action];
    if (typeof handler !== 'function') return;
    handler(value);
}

onBeforeMount(() => {
    store.get('toolbarPosition', 'top').then(position => {
        toolbarPosition.value = position;
    });
})
</script>
<template>
    <nav-tabs @menu-item-click="menuItemClickHandler" :toolbar-position="toolbarPosition">
        <PdfReader ref="reader" :toolbar-position="toolbarPosition" />
    </nav-tabs>
    <PageModal />
    <UpdateState />
</template>