<script setup>
import NavTabs from './components/NavTabs.vue';
import PdfReader from './components/PdfReader.vue';
import PageModal from './components/PageModal.vue';
import { ref } from 'vue';

const reader = ref(null);
const appHandlers = {
    openSettings: () => {
        
    },
    openAbout: () => {
        
    }
}

const menuItemClickHandler = (action) => {
    if (!reader.value || !action) return;
    const handler = reader.value[action] || appHandlers[action];
    if (typeof handler !== 'function') return;
    handler();
}
</script>
<template>
    <nav-tabs @menu-item-click="menuItemClickHandler">
        <PdfReader ref="reader" />
    </nav-tabs>
    <PageModal />
</template>