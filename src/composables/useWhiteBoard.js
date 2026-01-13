import { ref } from 'vue';

export function useWhiteBoard(showWhiteboard, drawingCanvases, drawingContexts, pdfCanvases, pdfReader, renderedPages, renderCallback, closeCallback) {

    const whiteboardScale = ref(1);
    const whiteboardImage = ref(null);
    const whiteboardRecentlyCopied = ref(false);

    const renderWhiteboardCanvas = () => {
        const canvas = pdfCanvases.value[0];
        const drawCanvas = drawingCanvases.value[0];
        if (!canvas || !drawCanvas || !whiteboardImage.value) return;

        const img = new Image();
        img.onload = () => {
            // Fit capture within viewport while preserving aspect ratio; allow user-scale without exceeding 1x source
            const availableWidth = (pdfReader.value?.clientWidth || window.innerWidth) - 40;
            const availableHeight = (pdfReader.value?.clientHeight || window.innerHeight) - 40;
            const safeWidth = Math.max(1, availableWidth);
            const safeHeight = Math.max(1, availableHeight);
            const fitScale = Math.max(0.01, Math.min(1, Math.min(safeWidth / img.width, safeHeight / img.height)));
            // Allow zoom-in beyond the fitted size up to 4x while keeping aspect ratio
            const targetScale = Math.max(0.01, Math.min(fitScale * whiteboardScale.value, 4));
            const imageWidth = img.width * targetScale;
            const imageHeight = img.height * targetScale;

            // Expand canvas to at least the viewport so tools work across the whole whiteboard
            // Keep the captured selection anchored to top-left (no centering offsets)
            const canvasWidth = Math.max(imageWidth, safeWidth);
            const canvasHeight = Math.max(imageHeight, safeHeight);
            const offsetX = 0;
            const offsetY = 0;

            // Use high DPI for better quality
            const dpr = window.devicePixelRatio || 1;
            canvas.width = canvasWidth * dpr;
            canvas.height = canvasHeight * dpr;
            canvas.style.width = `${canvasWidth}px`;
            canvas.style.height = `${canvasHeight}px`;

            drawCanvas.width = canvasWidth * dpr;
            drawCanvas.height = canvasHeight * dpr;
            drawCanvas.style.width = `${canvasWidth}px`;
            drawCanvas.style.height = `${canvasHeight}px`;

            const ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);
            ctx.clearRect(0, 0, canvasWidth, canvasHeight);
            ctx.drawImage(img, offsetX, offsetY, imageWidth, imageHeight);

            const drawCtx = drawCanvas.getContext('2d');
            drawCtx.scale(dpr, dpr);
            drawingContexts.value[0] = drawCtx;
            renderedPages.value.add(1);

            if (typeof renderCallback === 'function') {
                renderCallback();
            }
        };

        img.src = whiteboardImage.value;
    };

    const closeWhiteboard = () => {
        showWhiteboard.value = false;
        whiteboardScale.value = 1;
        
        if (typeof closeCallback === 'function') {
            closeCallback();
        }
    };

    const getWhiteboardCanvas = () => {
        if (!showWhiteboard.value || !pdfCanvases.value[0] || !drawingCanvases.value[0]) return null;
        
        const pdfCanvas = pdfCanvases.value[0];
        const drawCanvas = drawingCanvases.value[0];
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = pdfCanvas.width;
        tempCanvas.height = pdfCanvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        
        // Draw white background
        tempCtx.fillStyle = 'white';
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        
        // Draw background image
        tempCtx.drawImage(pdfCanvas, 0, 0);
        // Draw annotations
        tempCtx.drawImage(drawCanvas, 0, 0);
        
        return tempCanvas;
    };

    let clipboardTimeout = null;

    const copyWhiteboardToClipboard = async () => {
        const tempCanvas = getWhiteboardCanvas();
        if (!tempCanvas) return;
        
        try {
            const blob = await new Promise(resolve => tempCanvas.toBlob(resolve, 'image/png'));
            if (!blob) return;
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            whiteboardRecentlyCopied.value = true;
            clearTimeout(clipboardTimeout);
            clipboardTimeout = setTimeout(() => {
                whiteboardRecentlyCopied.value = false;
            }, 2000);
        } catch (err) {
            console.error('Failed to copy to clipboard:', err);
            alert('Failed to copy to clipboard');
        }
    };

    const downloadWhiteboard = () => {
        const tempCanvas = getWhiteboardCanvas();
        if (!tempCanvas) return;
        
        // Download
        const url = tempCanvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = 'whiteboard-' + new Date().getTime() + '.png';
        a.click();
    };


    return {
        whiteboardScale,
        whiteboardImage,
        whiteboardRecentlyCopied,
        renderedPages,
        renderWhiteboardCanvas,
        closeWhiteboard,
        copyWhiteboardToClipboard,
        downloadWhiteboard
    };
}