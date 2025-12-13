<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from "vue";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import { PDFDocument, rgb } from "pdf-lib";
import EmptyState from "./EmptyState.vue";
import { Electron } from "../composables/useElectron";
import { useHistory } from "../composables/useHistory";
import { usePagination } from "../composables/usePagination";
import { useDrop } from "../composables/useDrop";
import { useWhiteBoard } from "../composables/useWhiteBoard";
import { useZoom } from "../composables/usZoom";
import { useDraw } from "../composables/useDraw";

GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.449/build/pdf.worker.min.mjs';

const emit = defineEmits(['file-loaded']);

// General State Variables
const fileInput = ref(null);
const filename = ref(null);
const filepath = ref(null);
const isViewLocked = ref(false);
const isFileLoaded = ref(false);
const pdfReader = ref(null);
const imagePage = ref(null); // when opening images as a single page

// Saved State Variables
let savedPdfDoc = null;
let savedPageCount = 0;
let savedPageNum = 1;
let savedStrokesPerPage = {};
let savedWidth = 100; // Save page width before entering whiteboard

// Custom cursor
const cursorStyle = computed(() => {
    if (isSelectionMode.value) {
        return 'crosshair';
    }
    
    if (isTextMode.value) {
        return 'text';
    }

    if (!isEraser.value && drawMode.value != 'pen') {
        return 'crosshair';
    }

    if (isDrawing.value && drawMode.value == 'pen') {
        return 'pen';
    }
    
    return isEraser.value ? 'eraser' : 'default';
});

var pdfDoc = null;

// Drawing Management
const handleStrokeChange = (action) => {
    addToHistory(action);
};

const captureSelectionCallback = (canvasIndex, selectedCanvas) => {
    // Store as image and show as new page
    whiteboardImage.value = selectedCanvas.toDataURL();
    whiteboardScale.value = 1;

    // Save current PDF state and zoom settings
    savedPdfDoc = pdfDoc;
    savedPageCount = pageCount.value;
    savedPageNum = pageNum.value;
    savedStrokesPerPage = JSON.parse(JSON.stringify(strokesPerPage.value));
    savedWidth = zoomPercentage.value;

    // Switch to whiteboard mode
    showWhiteboard.value = true;
    temporaryState.value = true;
    pdfDoc = null; // Temporarily clear PDF doc
    pageCount.value = 1;
    strokesPerPage.value = { 1: [] };
    renderedPages.value.clear();
    drawingContexts.value = [];
    
    // Clear selection rectangle from original canvas
    redrawAllStrokes(canvasIndex);
    
    // Render whiteboard page
    nextTick(() => {
        renderAllPages();
    });
}

const {
    pdfCanvases,
    strokesPerPage,
    drawingCanvases,
    drawingContexts,
    isDrawing,
    isEraser,
    drawMode,
    drawColor,
    drawThickness,
    colors,
    isTextMode,
    textInput,
    fontSize,
    textboxPosition,
    isSelectionMode,
    isPenHovering,
    startDrawing,
    stopDrawing,
    onPointerMove,
    onPointerLeave,
    confirmText,
    cancelText,
    resetToolState,
    handleTextboxBlur,
    clearDrawing,
    redrawAllStrokes
} = useDraw(handleStrokeChange, captureSelectionCallback);


// History management
const { 
    startSession,
    endSession,
    uuid,
    addToHistory,
    undo,
    redo,
    temporaryState,
    canUndo,
    canRedo,
    hasUnsavedChanges,
    resetHistory, 
    markSaved,
} = useHistory(strokesPerPage, drawingCanvases, drawingContexts, redrawAllStrokes);

const fileId = uuid();
startSession(fileId);

// Pagination Management
const scrollToPageCanvas = async (pageNumber) => {
    if (!pdfDoc || renderedPages.value.has(pageNumber)) return;
    
    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2 });
    
    // Get canvas elements
    const canvas = pdfCanvases.value[pageNumber - 1];
    const drawCanvas = drawingCanvases.value[pageNumber - 1];
    
    if (!canvas || !drawCanvas) return;
    // Reset inline styles that might have been set in whiteboard mode
    canvas.style.width = '';
    canvas.style.height = '';
    drawCanvas.style.width = '';
    drawCanvas.style.height = '';
    
    const ctx = canvas.getContext("2d");
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    drawCanvas.height = viewport.height;
    drawCanvas.width = viewport.width;
    
    // Initialize drawing context
    drawingContexts.value[pageNumber - 1] = drawCanvas.getContext('2d');
    
    const renderContext = {
        canvasContext: ctx,
        viewport,
    };
    
    await page.render(renderContext).promise;
    renderedPages.value.add(pageNumber);
    // Repaint saved annotations after PDF render
    redrawAllStrokes(pageNumber - 1);
};

const {
    pagesContainer,
    renderedPages,
    pageCount,
    pageNum,
    getPageFromLocalStorage,
    scrollToPage,
    setupIntersectionObserver,
    setupLazyLoadObserver,
    intersectionObserver,
    lazyLoadObserver
} = usePagination(pdfCanvases, pdfReader, isFileLoaded, filename, scrollToPageCanvas);


// Whiteboard Management
const whiteboardRenderCallback = () => {
    redrawAllStrokes(0);
};

const closeWhiteboardCallback = () => {
    // Restore PDF state
    if (savedPdfDoc) {
        const targetPage = savedPageNum;
        pdfDoc = savedPdfDoc;
        pageCount.value = savedPageCount;
        pageNum.value = targetPage;
        isFileLoaded.value = true;
        resetHistory(true); // Reset temporary history
        strokesPerPage.value = JSON.parse(JSON.stringify(savedStrokesPerPage));
        zoomPercentage.value = savedWidth; // Restore zoom width
        whiteboardImage.value = null;
        renderedPages.value.clear();
        drawingContexts.value = [];
        
        // Re-render PDF pages
        renderAllPagesAndSetupObservers();
        
        // Clear saved state
        savedPdfDoc = null;
        savedPageCount = 0;
        savedPageNum = 1;
        savedStrokesPerPage = {};
        savedWidth = 100;
    } else if (imagePage.value) {
        // Restore image page (preserves imagePage)
        whiteboardImage.value = null;
        pdfDoc = null;
        isFileLoaded.value = true;
        pageCount.value = 1;
        pageNum.value = 1;
        strokesPerPage.value = { 1: [] };
        renderedPages.value.clear();
        drawingContexts.value = [];
        
        // Re-render image page
        nextTick(() => {
            renderAllPages();
        });
    } else {
        // No PDF or image to return to
        pdfDoc = null;
        imagePage.value = null;
        whiteboardImage.value = null;
        isFileLoaded.value = false;
        pageCount.value = 0;
        pageNum.value = 1;
        strokesPerPage.value = {};
        renderedPages.value.clear();
        drawingContexts.value = [];
    }
};

const {
    showWhiteboard,
    whiteboardScale,
    whiteboardImage,
    renderWhiteboardCanvas,
    closeWhiteboard,
    copyWhiteboardToClipboard,
    downloadWhiteboard,
} = useWhiteBoard(drawingCanvases, drawingContexts, pdfCanvases, pdfReader, renderedPages, whiteboardRenderCallback, closeWhiteboardCallback);


// Zoom Management
const {
    zoomMode,
    zoomPercentage,
    toggleZoomMode,
    zoom
} = useZoom(isFileLoaded, showWhiteboard, pageNum, pdfCanvases, pdfReader, whiteboardScale, renderWhiteboardCanvas, scrollToPage)

// File Loaded Event Emitter
const emitFileLoadedEvent = (type, page_count) => {
    isFileLoaded.value = true;
    pageCount.value = page_count || 1;
    pageNum.value = getPageFromLocalStorage();

    emit('file-loaded', {
        id: fileId,
        filename: filename.value,
        path: filepath.value,
        type,
    });
};

const renderAllPages = async () => {
    if (showWhiteboard.value) {
        // Whiteboard mode: render single page with background image
        pageCount.value = 1;
        strokesPerPage.value = { 1: strokesPerPage.value[1] || [] };
        await nextTick();
        renderWhiteboardCanvas();
        return;
    }

    if (imagePage.value) {
        pageCount.value = 1;
        strokesPerPage.value = { 1: strokesPerPage.value[1] || [] };
        await nextTick();

        const canvas = pdfCanvases.value[0];
        const drawCanvas = drawingCanvases.value[0];
        if (canvas && drawCanvas) {
            const img = new Image();
            img.onload = () => {
                // Fit image to current width setting
                const targetWidth = (pagesContainer.value?.clientWidth || canvas.parentElement?.clientWidth || img.width);
                const scale = targetWidth / img.width;
                const canvasWidth = img.width * scale;
                const canvasHeight = img.height * scale;

                canvas.width = canvasWidth;
                canvas.height = canvasHeight;
                canvas.style.width = '100%';
                canvas.style.height = 'auto';

                drawCanvas.width = canvasWidth;
                drawCanvas.height = canvasHeight;
                drawCanvas.style.width = '100%';
                drawCanvas.style.height = '100%';

                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);

                drawingContexts.value[0] = drawCanvas.getContext('2d');
                redrawAllStrokes(0);
                renderedPages.value.add(1);
            };
            img.src = imagePage.value;
        }
        return;
    }
    
    if (!pdfDoc) return;
    
    const numPages = pdfDoc.numPages;
    pageCount.value = numPages;
    
    // Initialize strokes for each page
    for (let i = 1; i <= numPages; i++) {
        if (!strokesPerPage.value[i]) {
            strokesPerPage.value[i] = [];
        }
    }
    
    // Don't render any pages here - let lazy loading handle it
};


// Toolbar handlers
const resetForNewFile = () => {
    resetHistory();
    strokesPerPage.value = {};
    renderedPages.value.clear();
    drawingContexts.value = [];
    showWhiteboard.value = false;
    whiteboardImage.value = null;
    whiteboardScale.value = 1;
    savedPdfDoc = null;
    savedPageCount = 0;
    savedPageNum = 1;
    savedStrokesPerPage = {};
};

const lockView = () => {
    if (!isFileLoaded.value) return;
    isViewLocked.value = !isViewLocked.value;
};

const selectDrawingTool = (mode) => {
    if (!isFileLoaded.value) return;
    
    const wasActive = isDrawing.value && drawMode.value === mode;
    resetToolState();
    
    if (!wasActive) {
        isDrawing.value = true;
        drawMode.value = mode;
    }
};

const selectEraser = () => {
    if (!isFileLoaded.value) return;
    const wasActive = isEraser.value;
    resetToolState();
    isEraser.value = !wasActive;
};

const selectText = () => {
    if (!isFileLoaded.value) return;
    const wasActive = isTextMode.value;
    resetToolState();
    isTextMode.value = !wasActive;
};

const selectSelection = () => {
    if (!isFileLoaded.value || showWhiteboard.value) return;
    const wasActive = isSelectionMode.value;
    resetToolState();
    isSelectionMode.value = !wasActive;
};

const loadImageFile = (file) => {
    if (!file) return;

    filename.value = file.name || 'image';
    filepath.value = file.path || null;
    const reader = new FileReader();
    reader.onload = () => {
        resetForNewFile();
        
        imagePage.value = reader.result;
        strokesPerPage.value = { 1: [] };
        
        emitFileLoadedEvent('image');

        nextTick(() => {
            renderAllPages();
        });
    };
    reader.readAsDataURL(file);
};

const renderAllPagesAndSetupObservers = () => {
    // Wait for next tick to ensure refs are populated
    nextTick(() => {
        renderAllPages().then(() => {
            // Setup observers after pages structure is ready
            setupIntersectionObserver();
            setupLazyLoadObserver();
            scrollToPage(pageNum.value);
        });
    });
};

const getDocumentCallback = (pdfDoc_) => {
    resetForNewFile();
    
    pdfDoc = pdfDoc_;
    imagePage.value = null;
    emitFileLoadedEvent('pdf', pdfDoc.numPages);
    renderAllPagesAndSetupObservers();
}

const loadPdfFile = (file) => {
    if (file) {
        filename.value = file.name;
        filepath.value = file.path || null;
        const url = URL.createObjectURL(file);
        getDocument(url).promise.then(getDocumentCallback).catch(error => {
            console.error('Error loading PDF:', error);
            alert('Error loading PDF: ' + error.message);
        });
    }
};

// Drag and Drop Handlers
const {
    isDragging,
    onDrop,
    onDragEnter,
    onDragLeave,
    loadFile
} = useDrop(loadPdfFile, loadImageFile);

const originalPdfData = ref(null);

const processFileOpenResult = (result) => {
    if (!result) return;

    filepath.value = result.filepath;
    
    // Handle PDF files
    if (result.type === 'pdf' && result.encoding === 'base64') {
        filename.value = result.filename || 'document.pdf';
        
        // Convert base64 to Uint8Array
        const binaryString = atob(result.content);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        // Store a copy of the original PDF data for saving (avoid detached ArrayBuffer issue)
        originalPdfData.value = new Uint8Array(bytes);
        
        // Load PDF from binary data
        getDocument({ data: bytes }).promise.then(getDocumentCallback).catch(error => {
            console.error('Error loading PDF:', error);
            alert('Error loading PDF: ' + error.message);
        });
    }
    // Handle image files
    else if (result.type === 'image' && result.encoding === 'base64') {
        filename.value = result.filename || 'image';
        const dataUrl = `data:${result.mimeType};base64,${result.content}`;
        
        resetForNewFile();
        
        imagePage.value = dataUrl;
        strokesPerPage.value = { 1: [] };
        emitFileLoadedEvent('image');

        nextTick(() => {
            renderAllPages();
        });
    }
    else {
        alert('Unsupported file type. Please select a PDF or image.');
    }
};

const handleFileOpen = async () => {
    if (Electron.value) {
        const result = await Electron.value.openFile();
        processFileOpenResult(result);
        return;
    }

    if (fileInput.value) {
        fileInput.value.click();
    }
};

const handleSaveFile = async () => {
    if (!pdfDoc) return;

    try {
        // Get the original PDF data
        let arrayBuffer;
        
        if (originalPdfData.value) {
            // Electron mode - use stored data (convert Uint8Array to ArrayBuffer)
            arrayBuffer = originalPdfData.value.buffer.slice(originalPdfData.value.byteOffset, originalPdfData.value.byteOffset + originalPdfData.value.byteLength);
        } else if (fileInput.value?.files[0]) {
            // Browser mode - read from file input
            const file = fileInput.value.files[0];
            arrayBuffer = await file.arrayBuffer();
        } else {
            console.error('No PDF data available');
            return;
        }
        
        const pdfLibDoc = await PDFDocument.load(arrayBuffer);

        // Process each page with annotations
        for (let pageNum = 1; pageNum <= pageCount.value; pageNum++) {
            const strokes = strokesPerPage.value[pageNum];
            if (!strokes || strokes.length === 0) continue;

            const page = pdfLibDoc.getPage(pageNum - 1);
            const { width, height } = page.getSize();

            // Get the canvas dimensions for scaling
            const canvas = pdfCanvases.value[pageNum - 1];
            if (!canvas) continue;

            const scaleX = width / canvas.width;
            const scaleY = height / canvas.height;

            // Draw each stroke on the PDF
            strokes.forEach(stroke => {
                if (stroke.length === 0) return;

                const first = stroke[0];

                // Convert color string to RGB
                const colorMap = {
                    'black': [0, 0, 0], 'dimgray': [0.41, 0.41, 0.41], 'gray': [0.5, 0.5, 0.5],
                    'darkgray': [0.66, 0.66, 0.66], 'silver': [0.75, 0.75, 0.75], 'white': [1, 1, 1],
                    'magenta': [1, 0, 1], 'red': [1, 0, 0], 'orangered': [1, 0.27, 0],
                    'orange': [1, 0.65, 0], 'gold': [1, 0.84, 0], 'yellow': [1, 1, 0],
                    'green': [0, 0.5, 0], 'darkgreen': [0, 0.39, 0], 'lime': [0, 1, 0],
                    'teal': [0, 0.5, 0.5], 'cyan': [0, 1, 1], 'navy': [0, 0, 0.5],
                    'blue': [0, 0, 1], 'darkblue': [0, 0, 0.55], 'royalblue': [0.25, 0.41, 0.88],
                    'purple': [0.5, 0, 0.5], 'pink': [1, 0.75, 0.8],
                    'brown': [0.65, 0.16, 0.16], 'sienna': [0.63, 0.32, 0.18],
                    'olive': [0.5, 0.5, 0], 'maroon': [0.5, 0, 0], 'coral': [1, 0.5, 0.31],
                    'salmon': [0.98, 0.5, 0.45]
                };

                const getColor = (colorName) => {
                    const rgbArray = colorMap[colorName] || [0, 0, 0];
                    return rgb(rgbArray[0], rgbArray[1], rgbArray[2]);
                };

                const color = getColor(first.color);
                const thickness = (first.thickness || 2) * scaleX;

                // Handle text
                if (first.type === 'text') {
                    const x = first.x * scaleX;
                    const y = height - (first.y * scaleY);
                    const textSize = (first.fontSize || 16) * scaleX;
                    
                    page.drawText(first.text, {
                        x: x,
                        y: y - textSize,
                        size: textSize,
                        color: color
                    });
                }
                // Handle shapes
                else if (first.type === 'line') {
                    const startX = first.startX * scaleX;
                    const startY = height - (first.startY * scaleY);
                    const endX = first.endX * scaleX;
                    const endY = height - (first.endY * scaleY);

                    page.drawLine({
                        start: { x: startX, y: startY },
                        end: { x: endX, y: endY },
                        thickness: thickness,
                        color: color,
                        opacity: 1
                    });
                } else if (first.type === 'rectangle') {
                    const x = first.startX * scaleX;
                    const y = height - (first.startY * scaleY);
                    const w = (first.endX - first.startX) * scaleX;
                    const h = (first.endY - first.startY) * scaleY;

                    page.drawRectangle({
                        x: x,
                        y: y - h,
                        width: w,
                        height: h,
                        borderColor: color,
                        borderWidth: thickness,
                        opacity: 0
                    });
                } else if (first.type === 'circle') {
                    const centerX = first.startX * scaleX;
                    const centerY = height - (first.startY * scaleY);
                    const radius = Math.sqrt(
                        Math.pow((first.endX - first.startX) * scaleX, 2) +
                        Math.pow((first.endY - first.startY) * scaleY, 2)
                    );

                    page.drawCircle({
                        x: centerX,
                        y: centerY,
                        size: radius,
                        borderColor: color,
                        borderWidth: thickness,
                        opacity: 0
                    });
                } else if (first.type === 'pen') {
                    // Draw pen strokes as connected lines
                    for (let i = 0; i < stroke.length - 1; i++) {
                        const point1 = stroke[i];
                        const point2 = stroke[i + 1];

                        const x1 = point1.x * scaleX;
                        const y1 = height - (point1.y * scaleY);
                        const x2 = point2.x * scaleX;
                        const y2 = height - (point2.y * scaleY);

                        page.drawLine({
                            start: { x: x1, y: y1 },
                            end: { x: x2, y: y2 },
                            thickness: (point1.thickness || 2) * scaleX,
                            color: getColor(point1.color),
                            opacity: 1
                        });
                    }
                }
            });
        }

        // Save the modified PDF
        const pdfBytes = await pdfLibDoc.save();
        
        // If running in Electron and we have the original filepath, overwrite it
        if (Electron.value && filepath.value) {
            try {
                // Convert Uint8Array to base64 in chunks to avoid call stack overflow
                const uint8Array = new Uint8Array(pdfBytes);
                let base64Content = '';
                const chunkSize = 8192; // Process 8KB at a time
                
                for (let i = 0; i < uint8Array.length; i += chunkSize) {
                    const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
                    base64Content += String.fromCharCode.apply(null, Array.from(chunk));
                }
                base64Content = btoa(base64Content);
                
                const result = await Electron.value.saveFile(filepath.value, base64Content, 'base64');
                
                if (result.success) {
                    console.log('PDF saved successfully to:', result.filepath);
                    alert('PDF saved successfully!');
                    markSaved();
                    return;
                } else {
                    console.error('Electron save failed:', result.error);
                    console.error('Error code:', result.errorCode);
                    alert(`Failed to save PDF: ${result.error}\nError code: ${result.errorCode || 'unknown'}\nFalling back to download.`);
                    // Don't throw - fall through to download method
                }
            } catch (err) {
                console.error('Error saving with Electron:', err);
                console.error('Error details:', {
                    message: err.message,
                    stack: err.stack,
                    filepath: filepath.value
                });
                alert(`Failed to save PDF with Electron: ${err.message}\nFalling back to download.`);
                // Don't throw - fall through to download method
            }
        }
        
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        
        // Try to use File System Access API if available (Chrome/Edge)
        if ('showSaveFilePicker' in window) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: filename.value,
                    types: [{
                        description: 'PDF Files',
                        accept: { 'application/pdf': ['.pdf'] }
                    }]
                });
                const writable = await handle.createWritable();
                await writable.write(pdfBytes);
                await writable.close();
                console.log('PDF saved successfully with annotations to:', handle.name);
                markSaved();
                return;
            } catch (err) {
                if (err.name === 'AbortError') {
                    console.log('Save cancelled by user');
                    return;
                }
                console.warn('File System Access API failed, falling back to download:', err);
            }
        }
        
        // Fallback: use download method
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename.value;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('PDF downloaded with annotations');
        markSaved();
    } catch (error) {
        console.error('Error saving PDF:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            hasElectron: !!Electron.value,
            hasFilepath: !!filepath.value,
            hasPdfData: !!originalPdfData.value
        });
        alert('Failed to save PDF: ' + error.message);
    }
};


// Page Event Handlers
const handleKeydown = (event) => {
    // Ctrl + Key Shortcuts
    if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
            case 'z':
                event.preventDefault();
                undo();
                break;
            case 'y':
                event.preventDefault();
                redo();
                break;
            default:
                break;
        }
        return;
    }

    switch (event.key) {
        case 'Escape':
            if (isDrawing.value || isEraser.value || isSelectionMode.value || isTextMode.value) {
                resetToolState();
                event.preventDefault();
            }
            break;
        case 'ArrowLeft':
            if (pageNum.value > 1) {
                event.preventDefault();
                scrollToPage(pageNum.value - 1);
            }
            break;
        case 'ArrowRight':
            if (pageNum.value < pageCount.value) {
                event.preventDefault();
                scrollToPage(pageNum.value + 1);
            }
            break;
        default:
            break;
    }
};


onMounted(() => {
    // Add keyboard event listener
    window.addEventListener('keydown', handleKeydown);
    
    // Listen for files opened from system (when set as default app)
    if (Electron.value?.onFileOpened) {
        Electron.value.onFileOpened((fileData) => {
            if (fileData) {
                console.log('File opened from system:', fileData.filename);
                processFileOpenResult(fileData);
            }
        });
    }
});

onUnmounted(() => {
    endSession(fileId);

    // Remove keyboard event listener
    window.removeEventListener('keydown', handleKeydown);
    
    if (intersectionObserver.value) {
        intersectionObserver.value.disconnect();
    }
    if (lazyLoadObserver.value) {
        lazyLoadObserver.value.disconnect();
    }
});
</script>
<template>
    <div class="container-fluid bg-dark" @contextmenu.prevent @dragenter.prevent="onDragEnter" @dragleave.prevent="onDragLeave" @dragover.prevent @drop.prevent="onDrop">
        <nav class="navbar navbar-expand navbar-dark bg-dark fixed-top py-0">
            <div class="container">
                <!-- Toolbar -->
                <ul class="navbar-nav mx-auto">
                    <!-- Drawing -->
                    <li class="nav-item btn-group">
                        <a class="nav-link" href="#" role="button" data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-expanded="false" :class="{ disabled: !isFileLoaded }" :style="{ color: isDrawing || isTextMode ? drawColor : '' }" title="Drawing Settings">
                            <i class="bi bi-palette-fill"></i>
                        </a>
                        <div class="dropdown-menu dropdown-menu-dark rounded-3 p-3">
                            <div class="mb-3">
                                <label class="form-label">Color</label>
                                <template v-for="(colorGroup, groupIndex) in colors">
                                    <div class="d-flex gap-2 mb-2">
                                        <div v-for="(color, colorIndex) in colorGroup" :key="`color-${groupIndex}-${colorIndex}`">
                                            <input type="radio" class="btn-check" name="colors" :id="`color-${groupIndex}-${colorIndex}`" autocomplete="off" v-model="drawColor" :value="color" />
                                            <label class="btn border rounded-circle p-3" :for="`color-${groupIndex}-${colorIndex}`" :title="color" :style="{ backgroundColor: color }" ></label>
                                        </div>
                                    </div>
                                </template>
                                <div class="mb-2">
                                    <svg width="100%" height="40" viewBox="0 0 200 40" preserveAspectRatio="none">
                                        <path 
                                            d="M 0,20 Q 25,5 50,20 T 100,20 T 150,20 T 200,20" 
                                            fill="none" 
                                            :stroke="drawColor" 
                                            :stroke-width="drawThickness" 
                                            stroke-linecap="round"
                                        />
                                    </svg>
                                </div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Thickness</label>
                                <div class="d-flex align-items-center">
                                    <input type="range" class="form-range" min="1" max="10" v-model="drawThickness" />
                                    <input type="text" class="form-control-plaintext" min="1" max="10" v-model="drawThickness" readonly />
                                </div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Font Size</label>
                                <div class="d-flex align-items-center">
                                    <input type="range" class="form-range" min="8" max="72" v-model="fontSize" />
                                    <input type="text" class="form-control-plaintext" min="8" max="72" v-model="fontSize" readonly />
                                </div>
                            </div>
                            <button class="btn btn-sm btn-danger w-100" @click="clearDrawing()">Clear All Drawing</button>
                        </div>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#" @click.prevent="selectDrawingTool('pen')" :class="{ active: isDrawing && drawMode === 'pen', disabled: !isFileLoaded }" title="Freehand Draw">
                            <i class="bi bi-pencil-fill"></i>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#" @click.prevent="selectEraser" :class="{ active: isEraser, disabled: !isFileLoaded }" title="Eraser">
                            <i class="bi bi-eraser-fill"></i>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#" @click.prevent="selectDrawingTool('line')" :class="{ active: isDrawing && drawMode === 'line', disabled: !isFileLoaded }" title="Line">
                            <i class="bi bi-slash-lg"></i>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#" @click.prevent="selectDrawingTool('rectangle')" :class="{ active: isDrawing && drawMode === 'rectangle', disabled: !isFileLoaded }" title="Rectangle">
                            <i class="bi bi-square"></i>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#" @click.prevent="selectDrawingTool('circle')" :class="{ active: isDrawing && drawMode === 'circle', disabled: !isFileLoaded }" title="Circle">
                            <i class="bi bi-circle"></i>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="#" class="nav-link" @click.prevent="selectText" :class="{ active: isTextMode, disabled: !isFileLoaded }" title="Add Text">
                            <i class="bi bi-textarea-t"></i>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#" @click.prevent="selectSelection" :class="{ active: isSelectionMode, disabled: !isFileLoaded || showWhiteboard }" title="Select Area to Whiteboard">
                            <i class="bi bi-scissors"></i>
                        </a>
                    </li>
                    <li class="nav-item vr bg-white mx-2"></li>

                    <!-- Undo/Redo -->
                    <li class="nav-item">
                        <a class="nav-link" href="#" @click.prevent="undo()" :class="{ disabled: !isFileLoaded || !canUndo }" title="Undo">
                            <i class="bi bi-arrow-counterclockwise"></i>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#" @click.prevent="redo()" :class="{ disabled: !isFileLoaded || !canRedo }" title="Redo">
                            <i class="bi bi-arrow-clockwise"></i>
                        </a>
                    </li>
                    <li class="nav-item vr bg-white mx-2"></li>

                    <!-- Pagination -->
                    <li class="nav-item">
                        <a href="#" class="nav-link" @click.prevent="scrollToPage(1)" :class="{ disabled: !isFileLoaded || showWhiteboard || pageNum <= 1 }" title="First Page">
                            <i class="bi bi-chevron-double-left"></i>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="#" class="nav-link" @click.prevent="scrollToPage(pageNum - 1)" :class="{ disabled: !isFileLoaded || showWhiteboard || pageNum <= 1 }" title="Previous Page">
                            <i class="bi bi-chevron-left"></i>
                        </a>
                    </li>
                    <li class="nav-item d-none d-lg-block">
                        <input type="text" class="form-control-plaintext" :value="pageNum" @input="scrollToPage($event.target.value)" :disabled="!isFileLoaded || showWhiteboard" />
                    </li>
                    <li class="nav-item">
                        <a href="#" class="nav-link" @click.prevent="scrollToPage(pageNum + 1)" :class="{ disabled: !isFileLoaded || showWhiteboard || pageNum >= pageCount }" title="Next Page">
                            <i class="bi bi-chevron-right"></i>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="#" class="nav-link" @click.prevent="scrollToPage(pageCount)" :class="{ disabled: !isFileLoaded || showWhiteboard || pageNum >= pageCount }" :title="`Last Page (${pageCount})`">
                            <i class="bi bi-chevron-double-right"></i>
                        </a>
                    </li>
                    <li class="nav-item vr bg-white mx-2"></li>

                    <!-- Zoom -->
                    <li class="nav-item">
                        <a href="#" class="nav-link" @click.prevent="zoom('out')" :class="{ disabled: !isFileLoaded || isViewLocked || (showWhiteboard ? whiteboardScale <= 0.5 : zoomPercentage <= 25) }">
                            <i class="bi bi-zoom-out"></i>
                        </a>
                    </li>
                    <li class="nav-item d-none d-lg-block">
                        <input type="text" class="form-control-plaintext" :value="showWhiteboard ? Math.round(whiteboardScale * 100) : zoomPercentage" :disabled="!isFileLoaded || isViewLocked || showWhiteboard">
                    </li>
                    <li class="nav-item">
                        <a href="#" class="nav-link" @click.prevent="zoom('in')" :class="{ disabled: !isFileLoaded || isViewLocked || (showWhiteboard ? whiteboardScale >= 2 : zoomPercentage >= 100) }">
                            <i class="bi bi-zoom-in"></i>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="#" class="nav-link" @click.prevent="toggleZoomMode()" :class="{ disabled: !isFileLoaded || isViewLocked || showWhiteboard }" :title="zoomMode === 'fit-width' ? 'Fit Height' : 'Fit Width'">
                            <i :class="`bi bi-arrows-expand${zoomMode === 'fit-width' ? '-vertical' : ''}`"></i>
                        </a>
                    </li>
                    <li class="nav-item vr bg-white mx-2"></li>

                    <!-- View Lock -->
                    <li v-if="!showWhiteboard" class="nav-item" :title="isViewLocked ? 'Unlock View' : 'Lock View'">
                        <a href="#" class="nav-link" @click.prevent="lockView" :class="{ disabled: !isFileLoaded, active: isViewLocked }">
                            <i class="bi" :class="isViewLocked ? 'bi-lock-fill' : 'bi-lock'"></i>
                        </a>
                    </li>

                    <!-- Whiteboard Controls -->
                    <template v-if="showWhiteboard">
                        <li class="nav-item" title="Copy to Clipboard">
                            <a href="#" class="nav-link" @click.prevent="copyWhiteboardToClipboard()">
                                <i class="bi bi-clipboard"></i>
                            </a>
                        </li>
                        <li class="nav-item" title="Download Whiteboard">
                            <a href="#" class="nav-link" @click.prevent="downloadWhiteboard()">
                                <i class="bi bi-download"></i>
                            </a>
                        </li>
                        <li class="nav-item" title="Close Whiteboard">
                            <a href="#" class="nav-link" @click.prevent="closeWhiteboard()">
                                <i class="bi bi-x-lg"></i>
                            </a>
                        </li>
                    </template>
                    <template v-else>
                        <!-- File Controls -->
                        <li class="nav-item" title="Save File">
                            <a href="#" class="nav-link" @click.prevent="handleSaveFile" :class="{ disabled: !isFileLoaded || !hasUnsavedChanges || !pdfDoc }">
                                <i class="bi bi-floppy-fill"></i>
                            </a>
                        </li>
                        <li class="nav-item" :title="isFileLoaded ? 'Open Another File' : 'Open File'">
                            <a href="#" class="nav-link" @click.prevent="handleFileOpen">
                                <i class="bi bi-folder-fill"></i>
                            </a>
                        </li>
                    </template>

                </ul>
            </div>
        </nav>
        <div class="pdf-reader" ref="pdfReader" :class="{ 'overflow-hidden': isViewLocked || showWhiteboard }">
            <EmptyState v-if="!isFileLoaded" @open-file="handleFileOpen" />

            <div v-else class="pages-container" ref="pagesContainer" :style="{ width: showWhiteboard ? '100%' : `${zoomPercentage}%`, padding: showWhiteboard ? '0' : '20px 0' }">
                <div v-for="page in pageCount" :key="page" class="page-container" :data-page="page">
                    <div class="canvas-container" :class="{ 'whiteboard-mode': showWhiteboard, 'canvas-loading': !renderedPages.has(page) }">
                        <canvas class="pdf-canvas" :ref="el => { if (el) pdfCanvases[page - 1] = el }"></canvas>
                        <canvas 
                            :ref="el => { if (el) drawingCanvases[page - 1] = el }"
                            :class="`drawing-canvas cursor-${cursorStyle}`"
                            @pointerdown="startDrawing"
                            @pointermove="onPointerMove"
                            @pointerup="stopDrawing"
                            @pointerleave="onPointerLeave"
                            @pointercancel="stopDrawing"
                            :style="{
                                pointerEvents: 'auto',
                                touchAction: isViewLocked || isPenHovering ? 'none' : 'pan-y pan-x'
                            }"
                        ></canvas>
                    </div>
                </div>
            </div>
        </div>
        <input ref="fileInput" type="file"  accept="application/pdf,image/*" class="d-none" @change="loadFile" />

        <div v-if="isTextMode && textboxPosition" 
             class="text-input-box" 
             :style="{ 
                 left: textboxPosition.x + 'px', 
                 top: textboxPosition.y + 'px'
             }">
            <input 
                id="textInputField"
                type="text" 
                v-model="textInput" 
                class="text-input-field" 
                placeholder="Type text..." 
                @keydown.enter="confirmText()"
                @keydown.esc="cancelText()"
                @blur="handleTextboxBlur()"
                :style="{ 
                    fontSize: fontSize + 'px',
                    color: drawColor,
                    minWidth: '150px'
                }"
                autofocus
            />
        </div>

        <div v-if="isDragging" class="drag-overlay">
            <div class="drag-message">
                <i class="bi bi-file-earmark-pdf-fill display-1"></i>
                <h3>Drop PDF here to open</h3>
            </div>
        </div>
    </div>
</template>

