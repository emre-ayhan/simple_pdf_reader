<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from "vue";
import { Electron } from "../composables/useElectron";
import { useFile } from "../composables/useFile";
import { useDrop } from "../composables/useDrop";
import { useDraw } from "../composables/useDraw";
import { useHistory } from "../composables/useHistory";
import { useWhiteBoard } from "../composables/useWhiteBoard";
import EmptyState from "./EmptyState.vue";
import { useWindowEvents } from "../composables/useWindowEvents";

// Cursor Style
const cursorStyle = computed(() => {
    if (isSelectionMode.value) return 'crosshair';
    if (isTextMode.value) return 'text';
    if (isDrawing.value ) {
        if(drawMode.value == 'pen') return `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="${drawColor.value}" class="bi bi-pencil-fill" viewBox="0 0 16 16"><path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708zm.646 6.061L9.793 2.5 3.293 9H3.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.207zm-7.468 7.468A.5.5 0 0 1 6 13.5V13h-.5a.5.5 0 0 1-.5-.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.5-.5V10h-.5a.5.5 0 0 1-.175-.032l-.179.178a.5.5 0 0 0-.11.168l-2 5a.5.5 0 0 0 .65.65l5-2a.5.5 0 0 0 .168-.11z"/></svg>') 8 8, auto`;
        return 'crosshair';
    };
    if (isEraser.value) return `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-eraser-fill" viewBox="0 0 16 16"><path d="M8.086 2.207a2 2 0 0 1 2.828 0l3.879 3.879a2 2 0 0 1 0 2.828l-5.5 5.5A2 2 0 0 1 7.879 15H5.12a2 2 0 0 1-1.414-.586l-2.5-2.5a2 2 0 0 1 0-2.828zm.66 11.34L3.453 8.254 1.914 9.793a1 1 0 0 0 0 1.414l2.5 2.5a1 1 0 0 0 .707.293H7.88a1 1 0 0 0 .707-.293z"/></svg>') 8 8, auto`;
    return 'default';
});

const emit = defineEmits(['file-loaded', 'new-tab']);

const showWhiteboardCallback = () => {
    renderWhiteboardCanvas();
}

const loadFileCallback = () => {
    resetHistory();
    whiteboardImage.value = null;
    whiteboardScale.value = 1;
}

const renderImageFileCallback = (image) => {
    drawImageCanvas(image);
}

const lazyLoadCallback = (index) => {
    redrawAllStrokes(index);
}

const fileSavedCallback = () => {
    saveCurrentHistoryStep();
}


// File Management
const {
    fileId,
    pdfCanvases,
    strokesPerPage,
    drawingCanvases,
    drawingContexts,
    isFileLoaded,
    pdfReader,
    pagesContainer,
    fileInput,
    renderedPages,
    imagePage,
    pageCount,
    pageNum,
    zoomPercentage,
    zoomMode,
    showWhiteboard,
    resetPdfDoc,
    hasSavedPdfDoc,
    clearSavedState,
    updateSavedState,
    restoreSavedState,
    renderAllPages,
    loadImageFile,
    renderAllPagesAndSetupObservers,
    loadPdfFile,
    processFileOpenResult,
    handleFileOpen,
    handleSaveFile,
    intersectionObserver,
    lazyLoadObserver,
    scrollToPage,
} = useFile(emit, loadFileCallback, renderImageFileCallback, lazyLoadCallback, fileSavedCallback, showWhiteboardCallback);

// Drag and Drop Handlers
const {
    isDragging,
    onDrop,
    onDragEnter,
    onDragLeave,
    loadFile
} = useDrop(loadPdfFile, loadImageFile);

// Drawing Management
const strokeChangeCallback = (action) => {
    addToHistory(action);
};

const captureSelectionCallback = (canvasIndex, selectedCanvas) => {
    // Store as image and show as new page
    whiteboardImage.value = selectedCanvas.toDataURL();
    whiteboardScale.value = 1;

    // Save current PDF state and zoom settings
    updateSavedState();

    // Switch to whiteboard mode
    showWhiteboard.value = true;
    temporaryState.value = true;
    resetPdfDoc(); // Temporarily clear PDF doc
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
    isDrawing,
    isEraser,
    drawMode,
    drawColor,
    drawThickness,
    colors,
    isTextMode,
    textInput,
    textInputField,
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
    redrawAllStrokes,
    drawImageCanvas,
} = useDraw(pagesContainer, pdfCanvases, renderedPages, strokesPerPage, drawingCanvases, drawingContexts, strokeChangeCallback, captureSelectionCallback);


// History management
const { 
    startSession,
    endSession,
    addToHistory,
    undo,
    redo,
    temporaryState,
    canUndo,
    canRedo,
    hasUnsavedChanges,
    resetHistory, 
    saveCurrentHistoryStep,
} = useHistory(fileId, strokesPerPage, drawingCanvases, drawingContexts, redrawAllStrokes);

startSession();


// Whiteboard Management
const whiteboardRenderCallback = () => {
    redrawAllStrokes(0);
};

const closeWhiteboardCallback = () => {
    whiteboardImage.value = null;
    renderedPages.value.clear();
    drawingContexts.value = [];

    if (!hasSavedPdfDoc() && !imagePage.value) {
        // No PDF or image to return to
        resetPdfDoc();
        imagePage.value = null;
        isFileLoaded.value = false;
        pageCount.value = 0;
        pageNum.value = 1;
        strokesPerPage.value = {};
        return;
    }

    isFileLoaded.value = true;
    restoreSavedState();
    resetHistory(true); // Reset temporary history
    renderAllPagesAndSetupObservers();
    clearSavedState();
};

const {
    whiteboardScale,
    whiteboardImage,
    renderWhiteboardCanvas,
    closeWhiteboard,
    copyWhiteboardToClipboard,
    downloadWhiteboard,
} = useWhiteBoard(showWhiteboard, drawingCanvases, drawingContexts, pdfCanvases, pdfReader, renderedPages, whiteboardRenderCallback, closeWhiteboardCallback);

// Toolbar Actions
const isViewLocked = ref(false);

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

const toggleZoomMode = () => {
    if (!isFileLoaded.value || showWhiteboard.value) return;
    const currentPage = pageNum.value;

    if (zoomMode.value === 'fit-width') {
        zoomMode.value = 'fit-height';
        const canvasContainer = document.querySelector('.canvas-container');
        zoomPercentage.value = pdfReader.value.clientHeight * 100 / canvasContainer.clientHeight;
    } else {
        zoomMode.value = 'fit-width';
        zoomPercentage.value = 100; // Full width
    }
    
    // Restore scroll position to current page after DOM updates
    nextTick(() => {
        scrollToPage(currentPage);
    });
};

const maxZoom = 300;
const minZoom = 20;

const zoom = (mode) => {
    if (!isFileLoaded.value) return;
    if (showWhiteboard.value) {
        whiteboardScale.value =  mode === 'in' 
            ? Math.min(2, +(whiteboardScale.value + 0.1).toFixed(2))
            : Math.max(0.1, +(whiteboardScale.value - 0.1).toFixed(2));
        renderWhiteboardCanvas();
    } else {
        zoomMode.value = 'fit-height'; // Reset to fit-height on manual zoom
        zoomPercentage.value = mode === 'in' 
            ? Math.min(zoomPercentage.value + 10, maxZoom)
            : Math.max(zoomPercentage.value - 10, minZoom);
    }
}

const hasActiveTool = computed(() => {
    return isDrawing.value || isEraser.value || isTextMode.value || isSelectionMode.value;
});

let resizeTimeout = null;

// Page Event Handlers
useWindowEvents({
    resize: {
        action() {
            if (!isFileLoaded.value) return;
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                nextTick(() => {
                    scrollToPage(pageNum.value);
                })
            });
        }
    },
    keydown: {
        t: {
            action: (event) => {
                if (isTextMode.value) return;
                event.preventDefault();
                selectText();
            }
        },
        o: {
            ctrl: true,
            action: () => {
                handleFileOpen();
            }
        },
        s: {
            ctrl: true,
            action: () => {
                handleSaveFile();
            }
        },
        z: {
            ctrl: true,
            action: () => {
                undo();
            }
        },
        y: {
            ctrl: true,
            action: () => {
                redo();
            }
        },
        Escape: {
            action: () => {
                if (hasActiveTool.value) {
                    resetToolState();
                }
            }
        },
        ArrowLeft: {
            action: () => {
                if (pageNum.value > 1) {
                    scrollToPage(pageNum.value - 1);
                }
            }
        },
        ArrowRight: {
            action: () => {
                if (pageNum.value < pageCount.value) {
                    scrollToPage(pageNum.value + 1);
                }
            }
        },
    }
});


onMounted(() => {
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
                        <a class="nav-link" href="#" @click.prevent="selectDrawingTool('pen')" :class="{ active: isDrawing && drawMode === 'pen', disabled: !isFileLoaded }" title="Draw">
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
                        <a href="#" class="nav-link" @click.prevent="selectText" :class="{ active: isTextMode, disabled: !isFileLoaded }" title="Add Text (T)">
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
                        <a class="nav-link" href="#" @click.prevent="undo()" :class="{ disabled: !isFileLoaded || !canUndo }" title="Undo (Ctrl+Z)">
                            <i class="bi bi-arrow-counterclockwise"></i>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#" @click.prevent="redo()" :class="{ disabled: !isFileLoaded || !canRedo }" title="Redo (Ctrl+Y)">
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
                        <a href="#" class="nav-link" @click.prevent="zoom('out')" :class="{ disabled: !isFileLoaded || isViewLocked || (showWhiteboard ? whiteboardScale <= 0.5 : zoomPercentage <= minZoom) }">
                            <i class="bi bi-zoom-out"></i>
                        </a>
                    </li>
                    <li class="nav-item d-none d-lg-block">
                        <input type="text" class="form-control-plaintext" :value="showWhiteboard ? Math.round(whiteboardScale * 100) : zoomPercentage" :disabled="!isFileLoaded || isViewLocked || showWhiteboard" readonly>
                    </li>
                    <li class="nav-item">
                        <a href="#" class="nav-link" @click.prevent="zoom('in')" :class="{ disabled: !isFileLoaded || isViewLocked || (showWhiteboard ? whiteboardScale >= 2 : zoomPercentage >= maxZoom) }">
                            <i class="bi bi-zoom-in"></i>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="#" class="nav-link" @click.prevent="toggleZoomMode()" :class="{ disabled: !isFileLoaded || isViewLocked || showWhiteboard }" :title="zoomMode === 'fit-width' ? 'Fit Height' : 'Fit Width'">
                            <i :class="`bi bi-arrows-expand${zoomMode === 'fit-height' ? '-vertical' : ''}`"></i>
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
                        <li class="nav-item" title="Copy to Clipboard (Ctrl+C)">
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
                        <li class="nav-item" title="Save File (Ctrl+S)">
                            <a href="#" class="nav-link" @click.prevent="handleSaveFile" :class="{ disabled: !isFileLoaded || !hasUnsavedChanges }">
                                <i class="bi bi-floppy-fill"></i>
                            </a>
                        </li>
                        <li class="nav-item" title="Open File (Ctrl+O)">
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

            <div v-else class="pages-container" :class="{ 'whiteboard-mode': showWhiteboard }" ref="pagesContainer" :style="{ width: `${zoomPercentage}%` }">
                <div v-for="page in pageCount" :key="page" class="page-container" :data-page="page">
                    <div class="canvas-container" :class="{ 'canvas-loading': !renderedPages.has(page) }">
                        <canvas class="pdf-canvas" :ref="el => { if (el) pdfCanvases[page - 1] = el }"></canvas>
                        <canvas 
                            :ref="el => { if (el) drawingCanvases[page - 1] = el }"
                            class="drawing-canvas"
                            @pointerdown="startDrawing"
                            @pointermove="onPointerMove"
                            @pointerup="stopDrawing"
                            @pointerleave="onPointerLeave"
                            @pointercancel="stopDrawing"
                            :style="{
                                cursor: cursorStyle,
                                pointerEvents: 'auto',
                                touchAction: isViewLocked || isPenHovering ? 'none' : 'pan-y pan-x',
                            }"
                            :data-color="drawColor"
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
                ref="textInputField"
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

