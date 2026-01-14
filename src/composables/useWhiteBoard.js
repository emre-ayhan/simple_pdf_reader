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
            // Use device pixel ratio for sharp rendering (same as PDF rendering)
            const pixelRatio = window.devicePixelRatio || 1;
            
            // The captured image already includes high-resolution pixel data
            // img.width and img.height are the actual pixel dimensions from the captured canvas
            // Divide by pixelRatio to get the original display size
            const originalDisplayWidth = img.width / pixelRatio;
            const originalDisplayHeight = img.height / pixelRatio;
            
            // Calculate display dimensions based on viewport
            const availableWidth = (pdfReader.value?.clientWidth || window.innerWidth) - 40;
            const availableHeight = (pdfReader.value?.clientHeight || window.innerHeight) - 40;
            const safeWidth = Math.max(1, availableWidth);
            const safeHeight = Math.max(1, availableHeight);
            
            // Calculate fit scale based on original display dimensions
            const fitScale = Math.max(0.01, Math.min(1, Math.min(safeWidth / originalDisplayWidth, safeHeight / originalDisplayHeight)));
            // Allow zoom-in beyond the fitted size up to 4x while keeping aspect ratio
            const targetScale = Math.max(0.01, Math.min(fitScale * whiteboardScale.value, 4));
            
            // Display size (CSS size) with user's zoom applied
            const displayWidth = originalDisplayWidth * targetScale;
            const displayHeight = originalDisplayHeight * targetScale;

            // Expand canvas to at least the viewport so tools work across the whole whiteboard
            const canvasDisplayWidth = Math.max(displayWidth, safeWidth);
            const canvasDisplayHeight = Math.max(displayHeight, safeHeight);
            
            // Canvas size should be display size * pixelRatio for sharp rendering (like PDF pages)
            canvas.width = canvasDisplayWidth * pixelRatio;
            canvas.height = canvasDisplayHeight * pixelRatio;
            canvas.style.width = `${canvasDisplayWidth}px`;
            canvas.style.height = `${canvasDisplayHeight}px`;

            drawCanvas.width = canvasDisplayWidth * pixelRatio;
            drawCanvas.height = canvasDisplayHeight * pixelRatio;
            drawCanvas.style.width = `${canvasDisplayWidth}px`;
            drawCanvas.style.height = `${canvasDisplayHeight}px`;

            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvasDisplayWidth * pixelRatio, canvasDisplayHeight * pixelRatio);
            // Draw the captured image at display size (the image already has high-res pixel data)
            ctx.drawImage(img, 0, 0, displayWidth, displayHeight);

            const drawCtx = drawCanvas.getContext('2d');
            drawingContexts.value[0] = drawCtx;
            renderedPages.value.add(1);

            if (typeof renderCallback === 'function') {
                renderCallback();
            }
        };

        img.src = whiteboardImage.value;
    };

    const getWhiteboardCanvas = () => {
        if (!showWhiteboard.value || !pdfCanvases.value[0] || !drawingCanvases.value[0]) return null;
        
        const pdfCanvas = pdfCanvases.value[0];
        const drawCanvas = drawingCanvases.value[0];
        
        const tempCanvas = document.createElement('canvas');
        // Use the actual canvas dimensions (which include pixel ratio scaling)
        tempCanvas.width = pdfCanvas.width;
        tempCanvas.height = pdfCanvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        
        // Draw white background
        tempCtx.fillStyle = 'white';
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        
        // Draw background image (no scaling needed - canvas dimensions match)
        tempCtx.drawImage(pdfCanvas, 0, 0);
        // Draw annotations (no scaling needed - canvas dimensions match)
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
        copyWhiteboardToClipboard,
        downloadWhiteboard
    };
}