<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, onBeforeUnmount } from "vue";
import { Electron } from "../composables/useElectron";
import { useStore } from "../composables/useStore";
import { useFile } from "../composables/useFile";
import { useDrop } from "../composables/useDrop";
import { useDraw } from "../composables/useDraw";
import { useHistory } from "../composables/useHistory";
import { fileDataCache, openNewTab } from "../composables/useTabs";
import { useWindowEvents } from "../composables/useWindowEvents";
import EmptyState from "./EmptyState.vue";

const props = defineProps({
    toolbarPosition: {
        type: String,
        default: 'top',
        validator: (value) => ['top', 'bottom'].includes(value)
    }
});

// Cursor Style
const cursorStyle = computed(() => {
    if (resizeCursor.value) return resizeCursor.value;
    if (isSelectionMode.value) return 'crosshair';
    if (isTextMode.value) return 'text';
    if (isDrawing.value ) {
        if(drawMode.value == 'pen') return `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="${drawColor.value}" class="bi bi-pencil-fill" viewBox="0 0 16 16"><path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708zm.646 6.061L9.793 2.5 3.293 9H3.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.207zm-7.468 7.468A.5.5 0 0 1 6 13.5V13h-.5a.5.5 0 0 1-.5-.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.5-.5V10h-.5a.5.5 0 0 1-.175-.032l-.179.178a.5.5 0 0 0-.11.168l-2 5a.5.5 0 0 0 .65.65l5-2a.5.5 0 0 0 .168-.11z"/></svg>') 8 8, auto`;
        if(drawMode.value == 'highlight') return 'text';
        return 'crosshair';
    };
    if (isEraser.value) return `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-eraser-fill" viewBox="0 0 16 16"><path d="M8.086 2.207a2 2 0 0 1 2.828 0l3.879 3.879a2 2 0 0 1 0 2.828l-5.5 5.5A2 2 0 0 1 7.879 15H5.12a2 2 0 0 1-1.414-.586l-2.5-2.5a2 2 0 0 1 0-2.828zm.66 11.34L3.453 8.254 1.914 9.793a1 1 0 0 0 0 1.414l2.5 2.5a1 1 0 0 0 .707.293H7.88a1 1 0 0 0 .707-.293z"/></svg>') 8 8, auto`;
    // Default to drag mode cursor when no tool is active
    return selectedStroke.value ? 'move' : 'default';
});

// File Management
const loadFileCallback = () => {
    resetHistory();
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

const createNewBlankPage = (imageData) => {
    openNewBlankPage(redrawAllStrokes, addToHistory, imageData);
};

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
    pageCount,
    pageIndex,
    pageNum,
    isFirstPage,
    isLastPage,
    zoomPercentage,
    loadFile,
    processFileOpenResult,
    handleFileOpen,
    handleSaveFile,
    intersectionObserver,
    lazyLoadObserver,
    scrollToPage,
    scrollToFirstPage,
    scrollToLastPage,
    deletedPages,
    deletePage,
    insertBlankPage,
    openNewBlankPage,
    createImageImportHandler,
    handlePageNumberInput,
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
    // Ensure strokes are finalized before capture
    redrawAllStrokes(canvasIndex);

    // Store the captured image data and open a new tab
    fileDataCache.value = {
        type: 'blank',
        data: selectedCanvas.toDataURL('image/png')
    };

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
    handleStrokeMenu,
    initialStrokeStyles,
    activeStrokeStyle,
    setInitialStrokeColor,
    setInitialStrokeThickness,
    handleStrokeStyleButtonClick,
    clampStrokeMenuPosition,
    highlightTextSelection,
} = useDraw(pagesContainer, pdfCanvases, renderedPages, strokesPerPage, drawingCanvases, drawingContexts, strokeChangeCallback, captureSelectionCallback);

// History management
const { 
    startSession,
    endSession,
    addToHistory,
    undo,
    redo,
    canUndo,
    canRedo,
    resetHistory, 
    saveCurrentHistoryStep,
} = useHistory(fileId, strokesPerPage, drawingCanvases, drawingContexts, deletedPages, redrawAllStrokes);

// Create handleImageImport handler with the callbacks
const handleImageImport = createImageImportHandler(redrawAllStrokes, addToHistory);

startSession();


// Toolbar Actions
const isViewLocked = ref(false);
const isTextSelectionMode = ref(false);
const isTextHighlightMode = ref(false);

const lockView = () => {
    if (!isFileLoaded.value) return;
    isViewLocked.value = !isViewLocked.value;
};

const resetAllTools = () => {
    resetToolState();
    isTextHighlightMode.value = false;
    isTextSelectionMode.value = false;
    window.getSelection()?.removeAllRanges();
    document.removeEventListener('mouseup', handleTextSelectionMouseUp);
};


const handleTextSelectionMouseUp = () => {
    // Small delay to ensure selection is complete
    setTimeout(highlightTextSelection, 10);
};


const toggleTextHighlightMode = () => {
    if (!isFileLoaded.value) return;
    resetToolState();
    isTextHighlightMode.value = !isTextHighlightMode.value;

    if (isTextHighlightMode.value) {
        isTextSelectionMode.value = true;
        nextTick(() => {
            document.addEventListener('mouseup', handleTextSelectionMouseUp);
        });
        return;
    }

    resetAllTools();
};

const toggleTextSelection = () => {
    if (!isFileLoaded.value) return;
    resetAllTools();
    isTextSelectionMode.value = !isTextSelectionMode.value;
};

const imageInput = ref(null);

const importImage = () => {
    if (!isFileLoaded.value) return;
    imageInput.value?.click();
};


const selectDrawingTool = (mode) => {
    if (!isFileLoaded.value) return;
    
    const wasActive = isDrawing.value && drawMode.value === mode;
    resetAllTools();
    
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
    resetAllTools();
    isTextMode.value = !wasActive;
};

const selectStrokeMode = () => {
    if (!isFileLoaded.value) return;
    resetAllTools();
};

const handleInsertBlankPage = () => {
    if (!isFileLoaded.value) return;
    insertBlankPage(addToHistory);
};

const captureSelection = () => {
    if (!isFileLoaded.value) return;
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
    if (!isFileLoaded.value) return;
    
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

    zoomPercentage.value = Math.min(Math.max(minZoom, percentage), maxZoom);

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
    return isDrawing.value || isEraser.value || isTextMode.value || isSelectionMode.value || isTextHighlightMode.value;
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
            actionAll: (event, ctrl) => {
                if (ctrl) {
                    event.preventDefault();
                    handleFileOpen();
                    return;
                }

                if (isTextMode.value) return;
                event.preventDefault();
                selectDrawingTool('circle');
            }
        },
        n: {
            actionAll: (event, ctrl) => {
                if (ctrl && event.shiftKey) {
                    event.preventDefault();
                    createNewBlankPage();
                }
            }
        },
        e: {
            action: (event) => {
                if (isTextMode.value) return;
                event.preventDefault();
                selectEraser();
            }
        },
        h: {
            action: (event) => {
                if (isTextMode.value) return;
                event.preventDefault();
                toggleTextHighlightMode();
            }
        },
        t: {
            action: (event) => {
                if (isTextMode.value) return;
                event.preventDefault();
                selectText();
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
        Home: {
            action: (event) => {
                if (isFirstPage.value) return;
                event.preventDefault();
                scrollToFirstPage();
            }
        },
        End: {
            action: (event) => {
                if (isLastPage.value) return;
                event.preventDefault();
                scrollToLastPage();
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
    const cache = fileDataCache.value;
    fileDataCache.value = null;

    if (cache) {
        if (cache.type === 'blank') {
            createNewBlankPage(cache.data);
            return;
        }

        processFileOpenResult(cache.data);
        return;
    }

    if (Electron.value?.onFileOpened) {
        unsubscribeFileOpen = Electron.value.onFileOpened((fileData) => {
            if (!fileData || isFileLoaded.value) return;
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
    
    // Clean up text selection listener
    document.removeEventListener('mouseup', handleTextSelectionMouseUp);
    
    if (intersectionObserver.value) {
        intersectionObserver.value.disconnect();
    }
    if (lazyLoadObserver.value) {
        lazyLoadObserver.value.disconnect();
    }
});

defineExpose({
    openNewBlankPage: createNewBlankPage,
    openFile: handleFileOpen,
    saveFile: handleSaveFile,
    insertBlankPage: handleInsertBlankPage,
    scrollToFirstPage,
    scrollToLastPage,
    deletePage: () => {
        deletePage(pageIndex.value, addToHistory);
    },
    resetAllTools
})
</script>
<template>
    <div class="container-fluid bg-dark" @dragenter.prevent="onDragEnter" @dragleave.prevent="onDragLeave" @dragover.prevent @drop.prevent="onDrop">
        <template v-if="isFileLoaded">
            <nav :class="`navbar navbar-expand navbar-dark bg-dark py-1 fixed-${toolbarPosition}`">
                <!-- Toolbar -->
                <ul ref="toolbar" class="navbar-nav mx-auto flex-wrap justify-content-center">
                    <!-- Drawing -->
                    <template v-if="isDrawing || isTextMode || isTextHighlightMode">
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
                    <li class="nav-item" v-if="drawMode === 'pen' && isDrawing">
                        <a class="nav-link" href="#" @click.prevent="selectEraser" :class="{ active: isEraser }" title="Eraser (E)">
                            <i class="bi bi-eraser-fill"></i>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#" @click.prevent="selectDrawingTool('pen')" :class="{ active: isDrawing && drawMode === 'pen' }" title="Draw (D)">
                            <i class="bi bi-pencil-fill"></i>
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
                        <a class="nav-link" href="#" @click.prevent="toggleTextHighlightMode" :class="{ active: isTextHighlightMode }" title="Highlight Text (H)">
                            <i class="bi bi-highlighter"></i>
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
                        <a class="nav-link" href="#" @click.prevent="toggleTextSelection" :class="{ active: isTextSelectionMode && !isTextHighlightMode }" title="Text Selection (S)">
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
                    
                    <!-- Pagination -->
                    <li class="nav-item vr bg-white mx-2"></li>
                    <li class="nav-item">
                        <a href="#" class="nav-link" @click.prevent="scrollToPage(pageIndex - 1)" :class="{ disabled: isFirstPage }" title="Previous Page">
                            <i class="bi bi-chevron-up"></i>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="#" class="nav-link" @click.prevent="scrollToPage(pageIndex + 1)" :class="{ disabled: isLastPage }" title="Next Page">
                            <i class="bi bi-chevron-down"></i>
                        </a>
                    </li>
                    <li class="nav-item">
                        <div class="input-group flex-nowrap">
                            <input type="text" class="form-control-plaintext" :value="pageNum" @input="handlePageNumberInput" />
                            <div class="input-group-text bg-transparent border-0 text-secondary p-0 pe-1">/ {{ pageCount }}</div>
                        </div>
                    </li>
                    
                    <!-- Zoom -->
                    <li class="nav-item vr bg-white mx-2"></li>
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

                    <li class="nav-item vr bg-white mx-2"></li>
                    
                    <!-- Selection Tool -->
                    <li class="nav-item">
                        <a class="nav-link" href="#" @click.prevent="captureSelection" :class="{ active: isSelectionMode }" title="Select Area to Whiteboard">
                            <i class="bi bi-scissors"></i>
                        </a>
                    </li>

                    <!-- View Lock -->
                    <li class="nav-item" :title="isViewLocked ? 'Unlock View' : 'Lock View'">
                        <a href="#" class="nav-link" @click.prevent="lockView" :class="{ active: isViewLocked }">
                            <i class="bi" :class="isViewLocked ? 'bi-lock-fill' : 'bi-lock'"></i>
                        </a>
                    </li>
                </ul>
            </nav>
        </template>
        <div class="pdf-reader" ref="pdfReader" :class="{ 'overflow-hidden': isViewLocked }">
            <EmptyState v-if="!isFileLoaded" @open-file="handleFileOpen" />

            <div v-else class="pages-container" ref="pagesContainer" :style="{ width: `${zoomPercentage}%` }">
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
                                @click="handleStrokeMenu"
                                :style="{
                                    cursor: cursorStyle,
                                    pointerEvents: 'auto',
                                    touchAction: (isViewLocked || isPenHovering || (enableTouchDrawing && hasActiveTool)) ? 'none' : 'pan-y pan-x',
                                    zIndex: isTextSelectionMode ? 1 : 3
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
                        <div class="stroke-menu-colors d-flex flex-column">
                            <div class="d-flex align-items-center justify-content-between">
                                <template v-for="strokeStyle in initialStrokeStyles">
                                    <button
                                        class="color-btn"
                                        :style="{ backgroundColor: strokeStyle.color }"
                                        :title="strokeStyle.color"
                                        @click.stop="changeStrokeColor(strokeStyle.color)"
                                    ></button>
                                </template>
                            </div>
                        </div>
                    </div>
                    <div v-if="selectedStroke?.stroke[0]?.type === 'text'" class="stroke-menu-section">
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
                        <div class="d-flex align-items-center gap-1">
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

