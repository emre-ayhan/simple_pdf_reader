<script setup>
import NavTabs from './components/NavTabs.vue';
import PdfReader from './components/PdfReader.vue';
import PageModal from './components/PageModal.vue';
import { ref } from 'vue';
import { openNewTab, activeTabIndex } from './composables/useTabs';

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

const openWhiteboard = () => {
    if (!(reader.value)) return;
    openNewTab();
    reader.value.openWhiteboard(activeTabIndex.value);
};
</script>
<template>
    <nav-tabs 
        @file-open="openFile" 
        @file-save="saveFile" 
        @file-delete-page="deletePage"
        @open-whiteboard="openWhiteboard"
    >
        <PdfReader ref="reader" />
    </nav-tabs>
    <PageModal />
</template>