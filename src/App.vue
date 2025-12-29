<script setup>
import { ref } from 'vue';
import NavTabs from './components/NavTabs.vue';
import PdfReader from './components/PdfReader.vue';
import PageModal from './components/PageModal.vue';

const fileTabs = ref(null);

const handleFileLoad = (fileData) => {
    if (fileTabs.value) {
        fileTabs.value.setCurrentTab(fileData);
    }
};
</script>
<template>
    <nav-tabs ref="fileTabs">
        <PdfReader @file-loaded="handleFileLoad" />
    </nav-tabs>
    <PageModal />
</template>