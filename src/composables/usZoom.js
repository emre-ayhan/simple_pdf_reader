import { ref, nextTick } from 'vue';

export function useZoom(isFileLoaded, showWhiteboard, pageNum, pdfCanvases, pdfReader, scale, whiteboardScale, renderWhiteboardCanvas, scrollToPage) {
    const zoomMode = ref('fit-width'); // 'fit-width' or 'fit-height'
    const zoomPercentage = ref(100); // 25 to 100
    
    const toggleZoomMode = () => {
        if (!isFileLoaded.value || showWhiteboard.value) return;
        const currentPage = pageNum.value;
        const canvas = pdfCanvases.value[currentPage - 1];

        if (zoomMode.value === 'fit-width') {
            zoomMode.value = 'fit-height';
            const margin = scale * 65.5; // Account for navbar and padding
            zoomPercentage.value = ((pdfReader.value.clientHeight - margin) * 100) / canvas.height;
        } else {
            zoomMode.value = 'fit-width';
            zoomPercentage.value = 100; // Full width
        }
        
        // Restore scroll position to current page after DOM updates
        nextTick(() => {
            scrollToPage(currentPage);
        });
    };

    const zoom = (mode) => {
        if (!isFileLoaded.value) return;
        if (showWhiteboard.value) {
            whiteboardScale.value =  mode === 'in' 
                ? Math.min(2, +(whiteboardScale.value + 0.1).toFixed(2))
                : Math.max(0.1, +(whiteboardScale.value - 0.1).toFixed(2));
            renderWhiteboardCanvas();
        } else {
            zoomPercentage.value = mode === 'in' 
                ? Math.min(zoomPercentage.value + 10, 100)
                : Math.max(zoomPercentage.value - 10, 25);
        }
    }

    return {
        zoomMode,
        zoomPercentage,
        toggleZoomMode,
        zoom
    };
}