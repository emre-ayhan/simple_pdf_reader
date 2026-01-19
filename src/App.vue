<script setup>
import NavTabs from './components/NavTabs.vue';
import PdfReader from './components/PdfReader.vue';
import PageModal from './components/PageModal.vue';
import { ref } from 'vue';

const reader = ref(null);

const menuItemClickHandler = (action) => {
    if (!reader.value || !action) return;
    const handler = reader.value[action];
    if (typeof handler !== 'function') return;
    handler();
}

const resetAllTools = () => {
    if (!reader.value) return;
    reader.value.resetAllTools();
};
</script>
<template>
    <nav-tabs @navbar-click="resetAllTools" @menu-item-click="menuItemClickHandler">
        <PdfReader ref="reader" />
    </nav-tabs>
    <PageModal />
</template>