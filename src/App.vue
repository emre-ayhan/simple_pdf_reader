<script setup>
import { ref } from 'vue';
import NavTabs from './components/NavTabs.vue';
import PdfReader from './components/PdfReader.vue';

const fileTabs = ref(null);

const handleFileLoad = (fileData) => {
    if (fileTabs.value) {
        fileTabs.value.setCurrentTab(fileData);
    }
};

const addNewTab = () => {
    if (fileTabs.value) {
        fileTabs.value.addNewTab();
    }
};
</script>
<template>
    <nav-tabs ref="fileTabs">
        <PdfReader @file-loaded="handleFileLoad" @new-tab="addNewTab" />
    </nav-tabs>
</template>