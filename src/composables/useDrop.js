import { ref } from 'vue';

export function useDrop(dropFileCallback) {
    const isDraggingFile = ref(false);
    const dragCounter = ref(0);

    const onDragEnter = (e) => {
        dragCounter.value++;
        isDraggingFile.value = true;
    };

    const onDragLeave = (e) => {
        dragCounter.value--;
        if (dragCounter.value <= 0) {
            isDraggingFile.value = false;
            dragCounter.value = 0;
        }
    };

    const onDrop = (e) => {
        isDraggingFile.value = false;
        dragCounter.value = 0;
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            dropFileCallback(file);
        }
    };

    return {
        isDraggingFile,
        onDragEnter,
        onDragLeave,
        onDrop
    };
}