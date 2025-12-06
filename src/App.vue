<script setup>
import { ref } from 'vue';
import NavTabs from './components/NavTabs.vue';
import PdfReader from './components/PdfReader.vue';

const fileTabs = ref(null);
const reader = ref(null);

const handleFileLoad = (filename) => {
    if (fileTabs.value) {
        fileTabs.value.addTab(filename);
    }
};

const handleTabClose = (filename) => {
    
};
</script>
<template>
    <div id="app">
        <nav-tabs ref="fileTabs" @close="handleTabClose">
            <PdfReader ref="reader" @file-loaded="handleFileLoad" />
        </nav-tabs>
    </div>
</template>