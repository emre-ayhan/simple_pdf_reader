<script setup>
import { ref, computed, nextTick, watch, onMounted, onUnmounted, onBeforeUnmount } from "vue";
import { Electron } from "../composables/useElectron";
import { useStore } from "../composables/useStore";
import { useFile } from "../composables/useFile";
import { useDrop } from "../composables/useDrop";
import { useDraw } from "../composables/useDraw";
import { useHistory } from "../composables/useHistory";
import { useWhiteBoard } from "../composables/useWhiteBoard";
import EmptyState from "./EmptyState.vue";
import { useWindowEvents } from "../composables/useWindowEvents";
import { fileDataCache } from "../composables/useTabs";

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
    zoomMode,
    showWhiteboard,
    fileRecentlySaved,
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
} = useFile(loadFileCallback, renderImageFileCallback, lazyLoadCallback, fileSavedCallback, showWhiteboardCallback);

// Drag and Drop Handlers
const {
    isDragging: isDraggingFile,
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

// Ref to measure and clamp the stroke context menu
const strokeMenuRef = ref(null);

const clampStrokeMenuPosition = async () => {
    // Ensure the menu has rendered before measuring
    await nextTick();
    const el = strokeMenuRef.value;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

    // Account for CSS transform: translate(-50%, 10px)
    const halfW = rect.width / 2;
    const offsetY = 10; // matches SCSS transform Y
    const margin = 8;   // keep a small margin from edges

    // Prefer placing menu to the right of the stroke if it fits, else left
    let preferredX = strokeMenuPosition.value.x;
    let preferredY = strokeMenuPosition.value.y;

    if (selectedStroke?.value) {
        const canvasIdx = selectedStroke.value.pageIndex;
        const canvas = drawingCanvases.value[canvasIdx];
        if (canvas) {
            const cRect = canvas.getBoundingClientRect();
            const scaleXToClient = cRect.width / canvas.width;
            const scaleYToClient = cRect.height / canvas.height;

            const stroke = selectedStroke.value.stroke;
            const first = stroke[0];
            let minX, minY, maxX, maxY;

            if (first.type === 'text') {
                const ctx = drawingContexts.value[canvasIdx];
                if (ctx) {
                    ctx.font = `${first.fontSize}px Arial`;
                    const metrics = ctx.measureText(first.text || '');
                    minX = first.x; minY = first.y;
                    maxX = first.x + metrics.width; maxY = first.y + first.fontSize;
                }
            } else if (first.type === 'line' || first.type === 'rectangle' || first.type === 'circle') {
                if (first.type === 'circle') {
                    const r = Math.sqrt((first.endX - first.startX) ** 2 + (first.endY - first.startY) ** 2);
                    minX = first.startX - r; maxX = first.startX + r;
                    minY = first.startY - r; maxY = first.startY + r;
                } else {
                    minX = Math.min(first.startX, first.endX);
                    maxX = Math.max(first.startX, first.endX);
                    minY = Math.min(first.startY, first.endY);
                    maxY = Math.max(first.startY, first.endY);
                }
            } else {
                // pen stroke
                minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
                for (const p of stroke) {
                    if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
                    if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
                }
            }

            if (minX !== undefined) {
                const clientMinX = cRect.left + minX * scaleXToClient;
                const clientMaxX = cRect.left + maxX * scaleXToClient;
                const clientMinY = cRect.top + minY * scaleYToClient;
                const clientMaxY = cRect.top + maxY * scaleYToClient;

                const offset = 10;
                const menuWidth = rect.width;
                const menuHeight = rect.height;

                // Compute center positions due to translate(-50%, 10px)
                const rightCenterX = clientMaxX + offset + menuWidth / 2;
                const leftCenterX = clientMinX - offset - menuWidth / 2;
                const aboveY = clientMinY; // top aligned with stroke

                // If placing to the right fits fully, use it; else try left
                if (rightCenterX + menuWidth / 2 <= viewportWidth - margin) {
                    preferredX = rightCenterX;
                } else if (leftCenterX - menuWidth / 2 >= margin) {
                    preferredX = leftCenterX;
                }

                // Prefer vertical near the top of the stroke
                preferredY = aboveY;
            }
        }
    }

    const minX = margin + halfW;
    const maxX = viewportWidth - margin - halfW;
    const minY = margin - offsetY; // ensure top (with offset) >= margin
    const maxY = viewportHeight - margin - rect.height - offsetY;

    const clampedX = Math.min(Math.max(minX, preferredX), Math.max(minX, maxX));
    const clampedY = Math.min(Math.max(minY, preferredY), Math.max(minY, maxY));

    if (clampedX !== strokeMenuPosition.value.x || clampedY !== strokeMenuPosition.value.y) {
        strokeMenuPosition.value = { x: clampedX, y: clampedY };
    }
};

// (moved) watchers will be defined after useDraw destructuring

const {
    isDrawing,
    isEraser,
    enableTouchDrawing,
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
    isDragMode,
    selectedStroke,
    isDragging: isDraggingStroke,
        isResizing,
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
    clearDrawing,
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
} = useDraw(pagesContainer, pdfCanvases, renderedPages, strokesPerPage, drawingCanvases, drawingContexts, strokeChangeCallback, captureSelectionCallback);


// Clamp when menu opens (now that refs are available)
watch(showStrokeMenu, (visible) => {
    if (visible) {
        clampStrokeMenuPosition();
    }
});

// Clamp on position changes (e.g., programmatic updates)
watch(() => strokeMenuPosition.value, () => {
    if (showStrokeMenu.value) {
        clampStrokeMenuPosition();
    }
}, { deep: true });

onMounted(() => {
    const handler = () => {
        if (showStrokeMenu.value) clampStrokeMenuPosition();
    };
    window.addEventListener('resize', handler);
});

onUnmounted(() => {
    const handler = () => {};
    window.removeEventListener('resize', handler);
});


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
} = useHistory(fileId, strokesPerPage, drawingCanvases, drawingContexts, deletedPages, redrawAllStrokes);

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
};

const {
    whiteboardScale,
    whiteboardImage,
    whiteboardRecentlyCopied,
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

const toggleTouchDrawing = () => {
    enableTouchDrawing.value = !enableTouchDrawing.value;
    const { set: storeSet } = useStore();
    storeSet('enableTouchDrawing', enableTouchDrawing.value);
};

const toggleZoomMode = (mode) => {
    if (!isFileLoaded.value || showWhiteboard.value) return;
    mode = `${mode}`.toLowerCase().replace(' ', '-');
    zoomMode.value = mode;
    
    if (zoomMode.value === 'fit-height') {
        const pageContainer = document.querySelector(`.page-container[data-page="${pageIndex.value + 1}"]`);
        const percentage = pdfReader.value.clientHeight * 100 / pageContainer.clientHeight;
        zoomPercentage.value = Math.ceil(percentage);
    } else {
        zoomPercentage.value = 100; // Full width
    }
    
    // Restore scroll position to current page after DOM updates
    nextTick(() => {
        scrollToPage();
    });
};

const handleZoomLevel = (event) => {
    let percentage = parseInt(event.target.value);

    if (isNaN(percentage)) {
        toggleZoomMode(event.target.value);
        return;
    }

    if (showWhiteboard.value) {
        percentage = Math.min(Math.max(20, percentage), 200);
        whiteboardScale.value = +(percentage / 100).toFixed(2);
        renderWhiteboardCanvas();
    } else {
        percentage = Math.min(Math.max(20, percentage), 300);
        zoomMode.value = 'fit-height'; // Reset to fit-height on manual zoom
        zoomPercentage.value = percentage;
    }

    // Restore scroll position to current page after DOM updates
    nextTick(() => {
        scrollToPage();
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

    // Restore scroll position to current page after DOM updates
    nextTick(() => {
        scrollToPage();
    });
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
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                nextTick(() => {
                    scrollToPage(pageIndex.value);
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
            action: () => {
                if (!hasActiveTool.value) return;
                resetToolState();
            }
        },
        ArrowLeft: {
            action: () => {
                if (isFirstPage.value) return;
                pageIndex.value--;
            }
        },
        ArrowRight: {
            action: () => {
                if (isLastPage.value) return;
                pageIndex.value++;
            }
        },
    }
});


let unsubscribeFileOpen = null;

onMounted(() => {
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
</script>
<template>
    <div class="container-fluid bg-dark" @contextmenu.prevent @dragenter.prevent="onDragEnter" @dragleave.prevent="onDragLeave" @dragover.prevent @drop.prevent="onDrop">
        <nav class="navbar navbar-expand navbar-dark bg-dark fixed-top py-0">
            <div class="container">
                <!-- Toolbar -->
                <ul class="navbar-nav mx-auto">
                    <!-- Drawing -->
                    <template v-if="hasActiveTool">
                        <li class="nav-item" v-for="(strokeStyle, index) in initialStrokeStyles">
                            <a class="nav-link" href="#" @click.prevent="handleStrokeStyleButtonClick(index)" :class="{ active: strokeStyle.color === drawColor, disabled: !isFileLoaded }">
                                <div class="btn-group gap-1">
                                    <i class="bi bi-circle-fill" :style="{ color: strokeStyle.color }"></i>
                                </div>
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
                        <a class="nav-link" href="#" @click.prevent="toggleTouchDrawing" :class="{ active: enableTouchDrawing, disabled: !isFileLoaded }" :title="`${enableTouchDrawing ? 'Disable' : 'Enable'} Touch Drawing`">
                            <i class="bi bi-hand-index-thumb-fill"></i>
                        </a>
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
                    
                    <!-- Selection Tool -->
                    <li class="nav-item">
                        <a class="nav-link" href="#" @click.prevent="selectSelection" :class="{ active: isSelectionMode, disabled: !isFileLoaded || showWhiteboard }" title="Select Area to Whiteboard">
                            <i class="bi bi-scissors"></i>
                        </a>
                    </li>

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
                                <i :class="`bi bi-clipboard${whiteboardRecentlyCopied ? '-check' : ''}`"></i>
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
                        <!-- Remove Page -->
                        <li class="nav-item" title="Delete Current Page (Delete)">
                            <a href="#" class="nav-link" @click.prevent="deletePage(pageIndex, addToHistory)" :class="{ disabled: !isFileLoaded }">
                                <i class="bi bi-trash-fill"></i>
                            </a>
                        </li>
                        <!-- File Controls -->
                        <li class="nav-item" title="Save File (Ctrl+S)">
                            <a href="#" class="nav-link" @click.prevent="handleSaveFile" :class="{ disabled: !isFileLoaded || !hasUnsavedChanges }">
                                <i :class="`bi bi-floppy${fileRecentlySaved ? '-fill' : ''}`"></i>
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
        <nav class="navbar navbar-expand navbar-dark bg-dark fixed-bottom py-0">
            <div class="container small">
                <!-- Toolbar -->
                <ul class="navbar-nav small ms-auto align-items-center">
                    <!-- Pagination -->
                    <li class="nav-item">
                        <a href="#" class="nav-link" @click.prevent="scrollToPage(0)" :class="{ disabled: !isFileLoaded || showWhiteboard || isFirstPage }" title="First Page">
                            <i class="bi bi-chevron-double-left"></i>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="#" class="nav-link" @click.prevent="scrollToPage(pageIndex - 1)" :class="{ disabled: !isFileLoaded || showWhiteboard || isFirstPage }" title="Previous Page">
                            <i class="bi bi-chevron-left"></i>
                        </a>
                    </li>
                    <li class="nav-item d-none d-lg-block">
                        <input type="text" class="form-control-plaintext" :value="pageNum" @input="handlePageNumber" :disabled="!isFileLoaded || showWhiteboard" />
                    </li>
                    <li class="nav-item">
                        <a href="#" class="nav-link" @click.prevent="scrollToPage(pageIndex + 1)" :class="{ disabled: !isFileLoaded || showWhiteboard || isLastPage }" title="Next Page">
                            <i class="bi bi-chevron-right"></i>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="#" class="nav-link" @click.prevent="scrollToPage(activePages.length - 1)" :class="{ disabled: !isFileLoaded || showWhiteboard || isLastPage }" :title="`Last Page (${pageCount - deletedPages.size})`">
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
                    <li class="nav-item">
                        <a href="#" class="nav-link" @click.prevent="zoom('in')" :class="{ disabled: !isFileLoaded || isViewLocked || (showWhiteboard ? whiteboardScale >= 2 : zoomPercentage >= maxZoom) }">
                            <i class="bi bi-zoom-in"></i>
                        </a>
                    </li>
                    <li class="nav-item">
                        <select name="zoom-level" id="zoom-level" class="form-control-plaintext" @change="handleZoomLevel" :disabled="!isFileLoaded || isViewLocked">
                            <template v-for="value in ['Fit Width', 'Fit Height', 50, 75, 125, 150, 200, 250, 300]">
                                <option :value="value" :selected="!showWhiteboard && zoomPercentage === value">
                                    {{ value }}
                                    <template v-if="typeof value === 'number'">%</template>
                                </option>
                            </template>
                        </select>
                    </li>
                </ul>
            </div>
        </nav>
        <div class="pdf-reader" ref="pdfReader" :class="{ 'overflow-hidden': isViewLocked || showWhiteboard }">
            <EmptyState v-if="!isFileLoaded" @open-file="handleFileOpen" />

            <div v-else class="pages-container" :class="{ 'whiteboard-mode': showWhiteboard }" ref="pagesContainer" :style="{ width: `${zoomPercentage}%` }">
                <template v-for="page in pageCount" :key="page">
                    <div  class="page-container" :data-page="page" v-show="!deletedPages.has(page)">
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
                                @contextmenu="handleContextMenu"
                                :style="{
                                    cursor: cursorStyle,
                                    pointerEvents: 'auto',
                                    touchAction: (isViewLocked || isPenHovering || (enableTouchDrawing && hasActiveTool)) ? 'none' : 'pan-y pan-x',
                                }"
                                :data-color="drawColor"
                            ></canvas>
                        </div>
                    </div>
                </template>
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

        <div v-if="showStrokeMenu && selectedStroke" 
             ref="strokeMenuRef"
             class="stroke-menu" 
             :style="{ 
                 left: strokeMenuPosition.x + 'px', 
                 top: strokeMenuPosition.y + 'px'
             }">
            <div class="stroke-menu-content">
                <div class="stroke-menu-section">
                    <label class="stroke-menu-label">Color</label>
                    <div class="stroke-menu-colors d-flex flex-column">
                        <template v-for="(colorGroup, groupIndex) in colors">
                            <div class="d-flex gap-2 mb-2">
                                <template v-for="(color, colorIndex) in colorGroup" :key="`color-${groupIndex}-${colorIndex}`">
                                    <button
                                        class="color-btn"
                                        :style="{ backgroundColor: color }"
                                        :title="color"
                                        @click.stop="changeStrokeColor(color)"
                                    ></button>
                                </template>
                            </div>
                        </template>
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

