<script setup>
import { ref } from 'vue';
import NavTabs from './components/NavTabs.vue';
import PdfReader from './components/PdfReader.vue';

const fileTabs = ref(null);
const pdfReader = ref(null);

const addFileTab = (filename) => {
    if (fileTabs.value) {
        fileTabs.value.addFile(filename);
    }
};

const onTabClose = (filename) => {
    if (pdfReader.value && pdfReader.value.filename === filename) {
        // Clean up the PDF if the closed tab's filename matches the currently loaded PDF
        pdfReader.value.cleanupPdf();
    }
};
</script>
<template>
    <div id="app">
        <nav-tabs ref="fileTabs" @close="onTabClose">
            <PdfReader ref="pdfReader" @file-loaded="addFileTab" />
        </nav-tabs>
    </div>
</template>