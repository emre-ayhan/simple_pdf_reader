<script setup>
import NavTabs from './components/NavTabs.vue';
import PdfReader from './components/PdfReader.vue';
import PageModal from './components/PageModal.vue';
import { ref } from 'vue';
import { fileDataCache } from './composables/useTabs';

const reader = ref(null);

// File Operations
const openFile = () => {
    if (!(reader.value)) return;
    reader.value.handleFileOpen();
};

const saveFile = () => {
    if (!(reader.value)) return;
    reader.value.handleSaveFile();
};


const newBlankPage = () => {
    if (!(reader.value)) return;
    fileDataCache.value = {
        type: 'blank',
        data: null
    };
    reader.value.createNewBlankPage();
};

// Page Operations
const scrollToFirstPage = () => {
    if (!(reader.value)) return;
    reader.value.scrollToFirstPage();
};

const scrollToLastPage = () => {
    if (!(reader.value)) return;
    reader.value.scrollToLastPage();
};

const deletePage = () => {
    if (!(reader.value)) return;
    reader.value.deletePage();
};

const insertBlankPage = () => {
    if (!(reader.value)) return;
    reader.value.insertBlankPage();
};
</script>
<template>
    <nav-tabs 
        @file-new="newBlankPage"
        @file-open="openFile"
        @file-save="saveFile"
        @page-first="scrollToFirstPage"
        @page-last="scrollToLastPage"
        @page-delete="deletePage"
        @page-blank="insertBlankPage"
    >
        <PdfReader ref="reader" />
    </nav-tabs>
    <PageModal />
</template>