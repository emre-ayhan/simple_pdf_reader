import { ref } from 'vue';

export function useDrop(dropFileCallback) {
    const isDragging = ref(false);
    const dragCounter = ref(0);

    const onDragEnter = (e) => {
        dragCounter.value++;
        isDragging.value = true;
    };

    const onDragLeave = (e) => {
        dragCounter.value--;
        if (dragCounter.value <= 0) {
            isDragging.value = false;
            dragCounter.value = 0;
        }
    };

    const onDrop = (e) => {
        isDragging.value = false;
        dragCounter.value = 0;
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            dropFileCallback(file);
        }
    };

    return {
        isDragging,
        onDragEnter,
        onDragLeave,
        onDrop
    };
}