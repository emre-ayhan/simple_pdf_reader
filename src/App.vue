<script setup>
import { ref } from 'vue';
import NavTabs from './components/NavTabs.vue';
import PdfReader from './components/PdfReader.vue';
import PageModal from './components/PageModal.vue';
import UpdateState from './components/UpdateState.vue';
import { toggleTouchDrawing, toggleToolbarPosition, changeLocale } from './composables/useAppPreferences';

const reader = ref(null);

const appHandlers = {
    toggleToolbarPosition,
    toggleTouchDrawing,
    changeLocale,
}

const menuItemClickHandler = (action, value) => {
    if (!reader.value || !action) return;
    const handler = reader.value[action] || appHandlers[action];
    if (typeof handler !== 'function') return;
    handler(value);
}
</script>
<template>
    <div @contextmenu.prevent>
        <nav-tabs @menu-item-click="menuItemClickHandler">
            <PdfReader ref="reader" />
        </nav-tabs>
        <PageModal />
        <UpdateState />
    </div>
</template>