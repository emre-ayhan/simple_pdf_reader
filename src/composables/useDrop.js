export function useDrop(dragCounter, isDragging, loadPdfHandler, loadImageHandler) {
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

    const alertUnsupportedFile = () => {
        alert('Unsupported file type. Please select a PDF or image.');
    }

    const loadFile = (event) => {
        const file = event?.target?.files?.[0] || event;
        
        if (!file) {
            alertUnsupportedFile();
            return
        };

        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            loadPdfHandler(file);
        } else if (file.type.startsWith('image/') || file.name.toLowerCase().match(/\.(png|jpe?g|gif|webp|bmp|svg)$/)) {
            loadImageHandler(file);
        } else {
            alertUnsupportedFile();
        }
    };

    const onDrop = (e) => {
        isDragging.value = false;
        dragCounter.value = 0;
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            loadFile(file);
        }
    };

    return {
        onDragEnter,
        onDragLeave,
        onDrop,
        loadFile
    };
}