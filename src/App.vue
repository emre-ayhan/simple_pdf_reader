<script setup>
import NavTabs from './components/NavTabs.vue';
import PdfReader from './components/PdfReader.vue';
import PageModal from './components/PageModal.vue';
import { ref } from 'vue';

const reader = ref(null);

const openFile = () => {
    if (!(reader.value)) return;
    reader.value.handleFileOpen();
};

const saveFile = () => {
    if (!(reader.value)) return;
    reader.value.handleSaveFile();
};

const deletePage = () => {
    if (!(reader.value)) return;
    reader.value.deletePage();
};

const newWhiteboard = () => {
    if (!(reader.value)) return;
    reader.value.openWhiteboard();
};
</script>
<template>
    <nav-tabs 
        @file-open="openFile" 
        @file-save="saveFile" 
        @file-delete-page="deletePage"
        @new-whiteboard="newWhiteboard"
    >
        <PdfReader ref="reader" />
    </nav-tabs>
    <PageModal />
</template>