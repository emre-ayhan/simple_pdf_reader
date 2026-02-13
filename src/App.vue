<script setup>
import { ref } from 'vue';
import NavTabs from './components/NavTabs.vue';
import PdfReader from './components/PdfReader.vue';
import PageModal from './components/PageModal.vue';
import UpdateState from './components/UpdateState.vue';
import DragOverlay from './components/DragOverlay.vue';
import { toggleTouchDrawing, toggleToolbarPosition, changeLocale } from './composables/useAppPreferences';
import { useDrop } from './composables/useDrop';

const reader = ref(null);

const loadFile = (file) => {
    if (reader.value && typeof reader.value.loadFile === 'function') {
        reader.value.loadFile(file);
    }
}

// Drag and Drop Handlers
const {
    isDraggingFile,
    onDrop,
    onDragEnter,
    onDragLeave,
} = useDrop(loadFile);

const appHandlers = {
    toggleToolbarPosition,
    toggleTouchDrawing,
    changeLocale,
}

const menuItemClickHandler = (action, value) => {
    if (!reader.value || !action) return;
    const handler = reader.value[action] || appHandlers[action];
    if (typeof handler !== 'function') return;
    handler(value);
}
</script>
<template>
    <div @contextmenu.prevent @dragenter.prevent="onDragEnter" @dragleave.prevent="onDragLeave" @dragover.prevent @drop.prevent="onDrop">
        <nav-tabs @menu-item-click="menuItemClickHandler">
            <PdfReader ref="reader" />
        </nav-tabs>
        <PageModal />
        <UpdateState />
        <DragOverlay v-if="isDraggingFile" />
    </div>
</template>