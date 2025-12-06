<script setup>
import { ref } from 'vue';
import NavTabs from './components/NavTabs.vue';
import PdfReader from './components/PdfReader.vue';

const fileTabs = ref(null);

const handleFileLoad = (filename) => {
    if (fileTabs.value) {
        fileTabs.value.addTab(filename);
    }
};
</script>
<template>
    <div id="app">
        <nav-tabs ref="fileTabs">
            <PdfReader @file-loaded="handleFileLoad" />
        </nav-tabs>
    </div>
</template>