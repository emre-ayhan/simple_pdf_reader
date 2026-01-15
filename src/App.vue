<script setup>
import NavTabs from './components/NavTabs.vue';
import PdfReader from './components/PdfReader.vue';
import PageModal from './components/PageModal.vue';
import { ref } from 'vue';

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


const newWhiteboard = () => {
    if (!(reader.value)) return;
    reader.value.openWhiteboard();
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
</script>
<template>
    <nav-tabs 
        @file-open="openFile"
        @file-save="saveFile"
        @page-first="scrollToFirstPage"
        @page-last="scrollToLastPage"
        @page-delete="deletePage"
        @new-whiteboard="newWhiteboard"
    >
        <PdfReader ref="reader" />
    </nav-tabs>
    <PageModal />
</template>