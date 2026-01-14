<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, onBeforeUnmount } from "vue";
import { Electron } from "../composables/useElectron";
import { useStore } from "../composables/useStore";
import { useFile } from "../composables/useFile";
import { useDrop } from "../composables/useDrop";
import { useDraw } from "../composables/useDraw";
import { useHistory } from "../composables/useHistory";
import { useWhiteBoard } from "../composables/useWhiteBoard";
import EmptyState from "./EmptyState.vue";
import { useWindowEvents } from "../composables/useWindowEvents";
import { fileDataCache, setCurrentTab, openNewTab, whiteboardDataCache } from "../composables/useTabs";

// Cursor Style
const cursorStyle = computed(() => {
    if (resizeCursor.value) return resizeCursor.value;
    if (isSelectionMode.value) return 'crosshair';
    if (isTextMode.value) return 'text';
    if (isDrawing.value ) {
        if(drawMode.value == 'pen') return `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="${drawColor.value}" class="bi bi-pencil-fill" viewBox="0 0 16 16"><path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708zm.646 6.061L9.793 2.5 3.293 9H3.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.207zm-7.468 7.468A.5.5 0 0 1 6 13.5V13h-.5a.5.5 0 0 1-.5-.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.5-.5V10h-.5a.5.5 0 0 1-.175-.032l-.179.178a.5.5 0 0 0-.11.168l-2 5a.5.5 0 0 0 .65.65l5-2a.5.5 0 0 0 .168-.11z"/></svg>') 8 8, auto`;
        return 'crosshair';
    };
    if (isEraser.value) return `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-eraser-fill" viewBox="0 0 16 16"><path d="M8.086 2.207a2 2 0 0 1 2.828 0l3.879 3.879a2 2 0 0 1 0 2.828l-5.5 5.5A2 2 0 0 1 7.879 15H5.12a2 2 0 0 1-1.414-.586l-2.5-2.5a2 2 0 0 1 0-2.828zm.66 11.34L3.453 8.254 1.914 9.793a1 1 0 0 0 0 1.414l2.5 2.5a1 1 0 0 0 .707.293H7.88a1 1 0 0 0 .707-.293z"/></svg>') 8 8, auto`;
    // Default to drag mode cursor when no tool is active
    return selectedStroke.value ? 'move' : 'default';
});

// File Management
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

const handlePageNumber = (event) => {
    const page = parseInt(event.target.value);
    if (isNaN(page) || page < 1 || page > pageCount.value - deletedPages.size) {
        // Invalid page number
        event.target.value = pageNum.value;
        return;
    }

    scrollToPage(page - 1);
}

const {
    fileId,
    pdfCanvases,
    textLayerDivs,
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
    pageIndex,
    pageNum,
    activePages,
    isFirstPage,
    isLastPage,
    zoomPercentage,
    showWhiteboard,
    resetPdfDoc,
    hasSavedPdfDoc,
    clearSavedState,
    updateSavedState,
    restoreSavedState,
    renderAllPages,
    renderAllPagesAndSetupObservers,
    loadFile,
    processFileOpenResult,
    handleFileOpen,
    handleSaveFile,
    intersectionObserver,
    lazyLoadObserver,
    scrollToPage,
    deletedPages,
    deletePage,
    createImageImportHandler,
} = useFile(loadFileCallback, renderImageFileCallback, lazyLoadCallback, fileSavedCallback);

// Drag and Drop Handlers
const {
    isDraggingFile,
    onDrop,
    onDragEnter,
    onDragLeave,
} = useDrop(loadFile);

// Drawing Management
const strokeChangeCallback = (action) => {
    addToHistory(action);
};

const captureSelectionCallback = (canvasIndex, selectedCanvas) => {
    // Store as image and show as new page
    redrawAllStrokes(canvasIndex);
    whiteboardDataCache.value = selectedCanvas.toDataURL();
    openNewTab();
}

const {
    isDrawing,
    isEraser,
    enableTouchDrawing,
    drawMode,
    drawColor,
    colors,
    isTextMode,
    textInput,
    textInputField,
    fontSize,
    textboxPosition,
    isSelectionMode,
    isPenHovering,
    selectedStroke,
    strokeMenu,
    showStrokeMenu,
    strokeMenuPosition,
    resizeCursor,
    startDrawing,
    stopDrawing,
    onPointerMove,
    onPointerLeave,
    confirmText,
    cancelText,
    resetToolState,
    handleTextboxBlur,
    redrawAllStrokes,
    drawImageCanvas,
    changeStrokeColor,
    changeStrokeThickness,
    changeStrokeText,
    deleteSelectedStroke,
    handleContextMenu,
    initialStrokeStyles,
    activeStrokeStyle,
    setInitialStrokeColor,
    setInitialStrokeThickness,
    handleStrokeStyleButtonClick,
    clampStrokeMenuPosition,
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
    resetHistory, 
    saveCurrentHistoryStep,
} = useHistory(fileId, strokesPerPage, drawingCanvases, drawingContexts, deletedPages, redrawAllStrokes);

// Create handleImageImport handler with the callbacks
const handleImageImport = createImageImportHandler(redrawAllStrokes, addToHistory);

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
        pageIndex.value = 0;
        strokesPerPage.value = {};
        return;
    }

    isFileLoaded.value = true;
    restoreSavedState();
    resetHistory(true); // Reset temporary history
    renderAllPagesAndSetupObservers();
    clearSavedState();
    
    // Scroll to the restored page index after DOM updates
    nextTick(() => {
        scrollToPage(pageIndex.value);
    });
};

const {
    whiteboardScale,
    whiteboardImage,
    whiteboardRecentlyCopied,
    renderWhiteboardCanvas,
    copyWhiteboardToClipboard,
    downloadWhiteboard,
} = useWhiteBoard(showWhiteboard, drawingCanvases, drawingContexts, pdfCanvases, pdfReader, renderedPages, whiteboardRenderCallback, closeWhiteboardCallback);

// Open a blank whiteboard page
const openWhiteboard = async () => {
    if (isFileLoaded.value) {
        openNewTab();
        return;
    }

    // Create a blank white canvas image
    if (whiteboardDataCache.value === 'new-whiteboard') {
        const blankCanvas = document.createElement('canvas');
        const pixelRatio = window.devicePixelRatio || 1;
        const displayWidth = (pdfReader.value?.clientWidth || window.innerWidth) - 40;
        const displayHeight = (pdfReader.value?.clientHeight || window.innerHeight) - 40;
        
        blankCanvas.width = displayWidth * pixelRatio;
        blankCanvas.height = displayHeight * pixelRatio;
        
        const ctx = blankCanvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, blankCanvas.width, blankCanvas.height);
        
        whiteboardImage.value = blankCanvas.toDataURL();
    } else {
        whiteboardImage.value = whiteboardDataCache.value;
    }
    
    whiteboardScale.value = 1;
    whiteboardDataCache.value = null;
    
    isFileLoaded.value = true;
    
    // Update the tab with whiteboard data
    const whiteboardId = `Whiteboard_${Date.now()}`;
    setCurrentTab({
        id: whiteboardId,
        filename: whiteboardId,
        type: 'whiteboard',
    });
    
    // Switch to whiteboard mode
    showWhiteboard.value = true;
    temporaryState.value = true;
    resetPdfDoc(); // Temporarily clear PDF doc
    pageCount.value = 1;
    strokesPerPage.value = { 1: [] };
    renderedPages.value.clear();
    drawingContexts.value = [];
    
    // Render whiteboard page
    nextTick(() => {
        renderAllPages().then(() => {
            handleZoomLevel(100);
        });
    });
};

// Toolbar Actions
const isViewLocked = ref(false);
const isTextSelectionMode = ref(false);

const lockView = () => {
    if (!isFileLoaded.value) return;
    isViewLocked.value = !isViewLocked.value;
};

const resetAllTools = () => {
    resetToolState();
    isTextSelectionMode.value = false;
    window.getSelection()?.removeAllRanges();
};

const toggleTextSelection = () => {
    if (!isFileLoaded.value) return;
    isTextSelectionMode.value = !isTextSelectionMode.value;
    if (isTextSelectionMode.value) {
        resetToolState();
    } else {
        window.getSelection()?.removeAllRanges();
    }
};

const imageInput = ref(null);

const importImage = () => {
    if (!isFileLoaded.value) return;
    imageInput.value?.click();
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

const selectStrokeMode = () => {
    if (!isFileLoaded.value) return;
    resetAllTools();
};

const captureSelection = () => {
    if (!isFileLoaded.value || showWhiteboard.value) return;
    const wasActive = isSelectionMode.value;
    resetToolState();
    isSelectionMode.value = !wasActive;
};

const toggleTouchDrawing = () => {
    enableTouchDrawing.value = !enableTouchDrawing.value;
    const { set: storeSet } = useStore();
    storeSet('enableTouchDrawing', enableTouchDrawing.value);
};


// Zoom Management
const minZoom = 25;
const maxZoom = 300;
const zoomLevels = computed(() => {
    const levels = [];
    for (let z = minZoom; z <= maxZoom; z += 25) {
        levels.push(z);
    }
    return levels;
});

const toggleZoomMode = (mode) => {
    if (!isFileLoaded.value || showWhiteboard.value) return;
    
    if (mode === 'fit-height') {
        const pageContainer = document.querySelector(`.page-container[data-page="${pageIndex.value + 1}"]`);
        console.log(pdfReader.value.clientHeight, pageContainer.clientHeight);
        const percentage = pdfReader.value.clientHeight * zoomPercentage.value / pageContainer.clientHeight;
        zoomPercentage.value = Math.ceil(percentage);
    } else {
        zoomPercentage.value = 100; // Full width
    }
    
    // Restore scroll position to current page after DOM updates
    nextTick(() => {
        scrollToPage(pageIndex.value);
    });
};

const handleZoomLevel = (percentage) => {
    if (!isFileLoaded.value) return;

    if (isNaN(percentage)) {
        toggleZoomMode(event.target.value);
        return;
    }

    if (!zoomLevels.value.includes(percentage)) return;

    percentage = Math.min(Math.max(minZoom, percentage), maxZoom);

    if (showWhiteboard.value) {
        whiteboardScale.value = +(percentage / 100).toFixed(2);
        renderWhiteboardCanvas();
    }

    zoomPercentage.value = percentage;

    // Restore scroll position to current page after DOM updates
    nextTick(() => {
        scrollToPage(pageIndex.value);
    });
};

const onZoomLevelChange = (event) => {
    let percentage = parseInt(event.target.value);
    handleZoomLevel(percentage);
}

const zoom = (direction) => {
    if (!isFileLoaded.value) return;
    handleZoomLevel(zoomPercentage.value + (direction * 25));
}

const hasActiveTool = computed(() => {
    return isDrawing.value || isEraser.value || isTextMode.value || isSelectionMode.value;
});

let resizeTimeout = null;

// Page Event Handlers
useWindowEvents(fileId, {
    resize: {
        action() {
            if (!isFileLoaded.value) return;

            if (showStrokeMenu.value) { 
                clampStrokeMenuPosition();
            };

            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                nextTick(() => {
                    scrollToPage(pageIndex.value);
                })
            });
        }
    },
    keydown: {
        d: {
            action: (event) => {
                if (isTextMode.value) return;
                event.preventDefault();
                selectDrawingTool('pen');
            }
        },
        e: {
            action: (event) => {
                if (isTextMode.value) return;
                event.preventDefault();
                selectEraser();
            }
        },
        l: {
            actionAll: (event, ctrl) => {
                if (ctrl) {
                    event.preventDefault();
                    lockView();
                    return;
                }

                if (isTextMode.value) return;
                event.preventDefault();
                selectDrawingTool('line');
            }
        },
        r: {
            action: (event) => {
                if (isTextMode.value) return;
                event.preventDefault();
                selectDrawingTool('rectangle');
            }
        },
        o: {
            action: (event) => {
                if (isTextMode.value) return;
                event.preventDefault();
                selectDrawingTool('circle');
            }
        },
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
        p: {
            action: (event) => {
                if (isTextMode.value) return;
                event.preventDefault();
                selectStrokeMode();
            }
        },
        s: {
            actionAll: (event, ctrl) => {
                if (ctrl) {
                    event.preventDefault();
                    handleSaveFile();
                    return;
                }

                if (isTextMode.value) return;
                event.preventDefault();
                toggleTextSelection();
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
        x: {
            ctrl: true,
            action: () => {
                captureSelection();
            }
        },
        Delete: {
            action: (event) => {
                event.preventDefault();
                if (selectedStroke.value) {
                    deleteSelectedStroke();
                    return;
                }

                deletePage(pageIndex.value, addToHistory);
            }
        },
        Escape: {
            action: (event) => {
                if (!hasActiveTool.value) return;
                event.preventDefault();
                resetAllTools();
            }
        },
        ArrowLeft: {
            action: () => {
                if (isFirstPage.value) return;
                scrollToPage(pageIndex.value - 1);
            }
        },
        ArrowRight: {
            action: () => {
                if (isLastPage.value) return;
                scrollToPage(pageIndex.value + 1);
            }
        },
    }
});


let unsubscribeFileOpen = null;

onMounted(() => {
    if (whiteboardDataCache.value) {
        openWhiteboard();
        return;
    }

    if (fileDataCache.value) {
        processFileOpenResult(fileDataCache.value);
        fileDataCache.value = null;
        return;
    }

    if (Electron.value?.onFileOpened) {
        unsubscribeFileOpen = Electron.value.onFileOpened((fileData) => {
            if (!fileData || isFileLoaded.value) return;
            console.log('File opened from system:', fileData.filename);
            processFileOpenResult(fileData);
        });
    }
});

onBeforeUnmount(() => {
    unsubscribeFileOpen?.();
    unsubscribeFileOpen = null;
});

onUnmounted(() => {
    endSession();
    
    if (intersectionObserver.value) {
        intersectionObserver.value.disconnect();
    }
    if (lazyLoadObserver.value) {
        lazyLoadObserver.value.disconnect();
    }
});

defineExpose({
    handleFileOpen,
    handleSaveFile,
    deletePage: () => {
        deletePage(pageIndex.value, addToHistory);
    },
    openWhiteboard,
})
</script>
<template>
    <div class="container-fluid bg-dark" @dragenter.prevent="onDragEnter" @dragleave.prevent="onDragLeave" @dragover.prevent @drop.prevent="onDrop">
        <template v-if="isFileLoaded">
            <nav class="navbar navbar-expand navbar-dark bg-dark fixed-top py-1">
                <div class="container">
                    <!-- Toolbar -->
                    <ul class="navbar-nav mx-auto">
                        <!-- Drawing -->
                        <template v-if="hasActiveTool && !isEraser">
                            <li class="nav-item" v-for="(strokeStyle, index) in initialStrokeStyles">
                                <a class="nav-link" href="#" @click.prevent="handleStrokeStyleButtonClick(index)" :class="{ active: strokeStyle.color === drawColor }">
                                    <i class="bi bi-circle-fill" :style="{ color: strokeStyle.color }"></i>
                                </a>
                            </li>
                            <li class="nav-item btn-group">
                                <a href="#" role="button" class="nav-link" data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-expanded="false">
                                    <i class="bi bi-palette-fill"></i>
                                </a>
                                <div class="dropdown-menu dropdown-menu-dark rounded-3 p-3">
                                    <div class="mb-3">
                                        <div class="form-label">Color</div>
                                        <div class="row row-cols-5">
                                            <template v-for="color in colors">
                                                <div class="col" v-if="!initialStrokeStyles.find(el => el.color === color)">
                                                    <div role="button" class="fs-3" :style="{ color }" @click="setInitialStrokeColor(color)" :title="color">
                                                        <i class="bi bi-circle-fill"></i>
                                                    </div>
                                                </div>
                                            </template>
                                        </div>
                                        <div class="mb-2">
                                            <svg width="100%" height="40" viewBox="0 0 200 40" preserveAspectRatio="none">
                                                <path 
                                                    d="M 0,20 Q 25,5 50,20 T 100,20 T 150,20 T 200,20" 
                                                    fill="none" 
                                                    :stroke="activeStrokeStyle?.color" 
                                                    :stroke-width="activeStrokeStyle?.thickness" 
                                                    stroke-linecap="round"
                                                />
                                            </svg>
                                        </div>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">Thickness</label>
                                        <div class="d-flex align-items-center">
                                            <input type="range" class="form-range" min="1" max="10" :value="activeStrokeStyle?.thickness" @input="setInitialStrokeThickness($event.target.value)" />
                                            <input type="text" class="form-control-plaintext" min="1" max="10" :value="activeStrokeStyle?.thickness" readonly />
                                        </div>
                                    </div>
                                </div>
                            </li>
                            <li class="nav-item vr bg-white mx-2"></li>
                        </template>
                        <li class="nav-item">
                            <a class="nav-link" href="#" @click.prevent="selectDrawingTool('pen')" :class="{ active: isDrawing && drawMode === 'pen' }" title="Draw (D)">
                                <i class="bi bi-pencil-fill"></i>
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="#" @click.prevent="selectEraser" :class="{ active: isEraser }" title="Eraser (E)">
                                <i class="bi bi-eraser-fill"></i>
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="#" @click.prevent="selectDrawingTool('line')" :class="{ active: isDrawing && drawMode === 'line' }" title="Line (L)">
                                <i class="bi bi-slash-lg"></i>
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="#" @click.prevent="selectDrawingTool('rectangle')" :class="{ active: isDrawing && drawMode === 'rectangle' }" title="Rectangle (R)">
                                <i class="bi bi-square"></i>
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="#" @click.prevent="selectDrawingTool('circle')" :class="{ active: isDrawing && drawMode === 'circle' }" title="Circle (O)">
                                <i class="bi bi-circle"></i>
                            </a>
                        </li>
                        <li class="nav-item">
                            <a href="#" class="nav-link" @click.prevent="selectText" :class="{ active: isTextMode }" title="Add Text (T)">
                                <i class="bi bi-textarea-t"></i>
                            </a>
                        </li>
                        <li class="nav-item">
                            <a href="#" class="nav-link" @click.prevent="importImage" title="Import Image (I)">
                                <i class="bi bi-image"></i>
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="#" @click.prevent="selectStrokeMode" :class="{ active: !hasActiveTool && !isTextSelectionMode }" title="Stroke Selection (P)">
                                <i class="bi bi-cursor-fill"></i>
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="#" @click.prevent="toggleTextSelection" :class="{ active: isTextSelectionMode }" title="Text Selection (S)">
                                <i class="bi bi-cursor-text"></i>
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="#" @click.prevent="toggleTouchDrawing" :class="{ active: enableTouchDrawing }" :title="`${enableTouchDrawing ? 'Disable' : 'Enable'} Touch Drawing`">
                                <i class="bi bi-hand-index-thumb-fill"></i>
                            </a>
                        </li>
                        <li class="nav-item vr bg-white mx-2"></li>
    
                        <!-- Undo/Redo -->
                        <li class="nav-item">
                            <a class="nav-link" href="#" @click.prevent="undo()" :class="{ disabled: !canUndo }" title="Undo (Ctrl+Z)">
                                <i class="bi bi-arrow-counterclockwise"></i>
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="#" @click.prevent="redo()" :class="{ disabled: !canRedo }" title="Redo (Ctrl+Y)">
                                <i class="bi bi-arrow-clockwise"></i>
                            </a>
                        </li>
    
                        <li class="nav-item vr bg-white mx-2"></li>
                        
                        <!-- Selection Tool -->
                        <li class="nav-item">
                            <a class="nav-link" href="#" @click.prevent="captureSelection" :class="{ active: isSelectionMode || showWhiteboard }" title="Select Area to Whiteboard">
                                <i class="bi bi-scissors"></i>
                            </a>
                        </li>
    
                        <!-- View Lock -->
                        <li v-if="!showWhiteboard" class="nav-item" :title="isViewLocked ? 'Unlock View' : 'Lock View'">
                            <a href="#" class="nav-link" @click.prevent="lockView" :class="{ active: isViewLocked }">
                                <i class="bi" :class="isViewLocked ? 'bi-lock-fill' : 'bi-lock'"></i>
                            </a>
                        </li>
    
                        <!-- Whiteboard Controls -->
                        <template v-if="showWhiteboard">
                            <li class="nav-item" title="Copy to Clipboard (Ctrl+C)">
                                <a href="#" class="nav-link" @click.prevent="copyWhiteboardToClipboard()">
                                    <i :class="`bi bi-clipboard${whiteboardRecentlyCopied ? '-check' : ''}`"></i>
                                </a>
                            </li>
                            <li class="nav-item" title="Download Whiteboard">
                                <a href="#" class="nav-link" @click.prevent="downloadWhiteboard()">
                                    <i class="bi bi-download"></i>
                                </a>
                            </li>
    
                            <!-- Zoom -->
                            <li class="nav-item">
                                <a href="#" class="nav-link" @click.prevent="zoom(-1)" :class="{ disabled: isViewLocked || zoomPercentage <= minZoom }">
                                    <i class="bi bi-zoom-out"></i>
                                </a>
                            </li>
                            <li class="nav-item">
                                <a href="#" class="nav-link" @click.prevent="zoom(1)" :class="{ disabled: isViewLocked || zoomPercentage >= maxZoom }">
                                    <i class="bi bi-zoom-in"></i>
                                </a>
                            </li>
                        </template>
                    </ul>
                </div>
            </nav>
    
            <!-- Footer -->
            <nav class="navbar navbar-expand navbar-dark bg-dark fixed-bottom py-0" v-if="!showWhiteboard">
                <div class="container small">
                    <!-- Toolbar -->
                    <ul class="navbar-nav small ms-auto align-items-center">
                        <!-- Pagination -->
                        <li class="nav-item">
                            <a href="#" class="nav-link" @click.prevent="scrollToPage(0)" :class="{ disabled: showWhiteboard || isFirstPage }" title="First Page">
                                <i class="bi bi-chevron-double-left"></i>
                            </a>
                        </li>
                        <li class="nav-item">
                            <a href="#" class="nav-link" @click.prevent="scrollToPage(pageIndex - 1)" :class="{ disabled: showWhiteboard || isFirstPage }" title="Previous Page">
                                <i class="bi bi-chevron-left"></i>
                            </a>
                        </li>
                        <li class="nav-item d-none d-lg-block">
                            <input type="text" class="form-control-plaintext" :value="pageNum" @input="handlePageNumber" :disabled="showWhiteboard" />
                        </li>
                        <li class="nav-item">
                            <a href="#" class="nav-link" @click.prevent="scrollToPage(pageIndex + 1)" :class="{ disabled: showWhiteboard || isLastPage }" title="Next Page">
                                <i class="bi bi-chevron-right"></i>
                            </a>
                        </li>
                        <li class="nav-item">
                            <a href="#" class="nav-link" @click.prevent="scrollToPage(activePages.length - 1)" :class="{ disabled: showWhiteboard || isLastPage }" :title="`Last Page (${pageCount - deletedPages.size})`">
                                <i class="bi bi-chevron-double-right"></i>
                            </a>
                        </li>
                        <li class="nav-item vr bg-white mx-2"></li>
    
                        <!-- Zoom -->
                        <li class="nav-item">
                            <a href="#" class="nav-link" @click.prevent="zoom(-1)" :class="{ disabled: isViewLocked || zoomPercentage <= minZoom }">
                                <i class="bi bi-zoom-out"></i>
                            </a>
                        </li>
                        <li class="nav-item">
                            <a href="#" class="nav-link" @click.prevent="zoom(1)" :class="{ disabled: isViewLocked || zoomPercentage >= maxZoom }">
                                <i class="bi bi-zoom-in"></i>
                            </a>
                        </li>
                        <li class="nav-item">
                            <select name="zoom-level" id="zoom-level" class="form-control-plaintext" @change="onZoomLevelChange" :disabled="isViewLocked">
                                <option value="fit-height">Fit Height</option>
                                <option value="fit-width">Fit Width</option>
                                <template v-for="value in zoomLevels">
                                    <option :value="value" :selected="zoomPercentage === value">
                                        {{ value }} %
                                    </option>
                                </template>
                            </select>
                        </li>
                    </ul>
                </div>
            </nav>
        </template>
        <div class="pdf-reader" ref="pdfReader" :class="{ 'overflow-hidden': isViewLocked || showWhiteboard }">
            <EmptyState v-if="!isFileLoaded" @open-file="handleFileOpen" />

            <div v-else class="pages-container" :class="{ 'whiteboard-mode': showWhiteboard }" ref="pagesContainer" :style="{ width: `${zoomPercentage}%` }">
                <template v-for="page in pageCount" :key="page">
                    <div  class="page-container" :data-page="page" v-show="!deletedPages.has(page)">
                        <div class="canvas-container" :class="{ 'canvas-loading': !renderedPages.has(page) }">
                            <canvas class="pdf-canvas" :ref="el => { if (el) pdfCanvases[page - 1] = el }"></canvas>
                            <div class="text-layer" :class="{ 'text-selectable': isTextSelectionMode }" :ref="el => { if (el) textLayerDivs[page - 1] = el }"></div>
                            <canvas 
                                :ref="el => { if (el) drawingCanvases[page - 1] = el }"
                                class="drawing-canvas"
                                @pointerdown="startDrawing"
                                @pointermove="onPointerMove"
                                @pointerup="stopDrawing"
                                @pointerleave="onPointerLeave"
                                @pointercancel="stopDrawing"
                                @contextmenu="handleContextMenu"
                                :style="{
                                    cursor: cursorStyle,
                                    pointerEvents: 'auto',
                                    touchAction: (isViewLocked || isPenHovering || (enableTouchDrawing && hasActiveTool)) ? 'none' : 'pan-y pan-x',
                                    zIndex: hasActiveTool ? 3 : 1
                                }"
                                :data-color="drawColor"
                            ></canvas>
                        </div>
                    </div>
                </template>
            </div>
        </div>
        <input ref="fileInput" type="file"  accept="application/pdf,image/*" class="d-none" @change="loadFile" />
        <input ref="imageInput" type="file" accept="image/*" class="d-none" @change="handleImageImport" />

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

        <div v-if="showStrokeMenu && selectedStroke" 
             ref="strokeMenu"
             class="stroke-menu" 
             :style="{ 
                 left: strokeMenuPosition.x + 'px', 
                 top: strokeMenuPosition.y + 'px'
             }">
            <div class="stroke-menu-content" :class="{ 'image-stroke': selectedStroke?.stroke[0]?.type === 'image' }">
                <template v-if="selectedStroke?.stroke[0]?.type !== 'image'">
                    <div class="stroke-menu-section">
                        <label class="stroke-menu-label">Color</label>
                        <div class="stroke-menu-colors d-flex flex-column">
                            <div class="row row-cols-5">
                                <template v-for="color in colors">
                                    <div class="col py-1">
                                        <button
                                            class="color-btn"
                                            :style="{ backgroundColor: color }"
                                            :title="color"
                                            @click.stop="changeStrokeColor(color)"
                                        ></button>
                                    </div>
                                </template>
                            </div>
                        </div>
                    </div>
                    <div v-if="selectedStroke?.stroke[0]?.type === 'text'" class="stroke-menu-section">
                        <label class="stroke-menu-label">Text</label>
                        <input 
                            type="text" 
                            class="form-control form-control-sm" 
                            :value="selectedStroke?.stroke[0]?.text || ''"
                            @input="(e) => changeStrokeText(e.target.value)"
                            @click.stop
                            placeholder="Enter text"
                        />
                    </div>
                    <div class="stroke-menu-section" v-else>
                        <label class="stroke-menu-label">Thickness</label>
                        <div class="d-flex align-items-center gap-2">
                            <input type="range" class="form-range" min="1" max="10" @input="(e) => changeStrokeThickness(parseInt(e.target.value))" :value="selectedStroke?.stroke[0]?.thickness || 1" />
                            <input type="text" class="form-control-plaintext" min="1" max="10" :value="selectedStroke?.stroke[0]?.thickness || 1" readonly />
                        </div>
                    </div>
                </template>
                <button class="stroke-menu-btn delete-btn" @click.stop="deleteSelectedStroke()">
                    <i class="bi bi-trash-fill"></i> Delete
                </button>
            </div>
        </div>

        <div v-if="isDraggingFile" class="drag-overlay">
            <div class="drag-message">
                <i class="bi bi-file-earmark-pdf-fill display-1"></i>
                <h3>Drop PDF here to open</h3>
            </div>
        </div>
    </div>
</template>

