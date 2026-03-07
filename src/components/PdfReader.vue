<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, onBeforeUnmount, watch } from "vue";
import { Electron, enableTouchDrawing, toolbarPosition } from "../composables/useAppSettings";
import { useFile } from "../composables/useFile";
import { usePageActions } from "../composables/usePageActions";
import { useHistory } from "../composables/useHistory";
import { fileDataCache } from "../composables/useTabs";
import { useWindowEvents } from "../composables/useWindowEvents";
import PrintModal from "./PrintModal.vue";
import PageSearch from "./PageSearch.vue";
import ThumbnailSidebar from "./ThumbnailSidebar.vue";
import PageNumber from "./PageNumber.vue";
import ContextMenu from "./ContextMenu.vue";
import ToolItem from "./ToolItem.vue";
import PdfForm from "./PdfForm.vue";
import QuillEditor from "./QuillEditor.vue";
import SimpleTextEditor from "./SimpleTextEditor.vue";
import BsToast from "./BsToast.vue";

// Cursor Style
const cursorStyle = computed(() => {
    const penCursorColor = encodeURIComponent(drawStyle.value.color);
    if (resizeCursor.value) return resizeCursor.value;
    if (handToolActive.value) return isHandToolPanning.value ? 'grabbing' : 'grab';
    if (selectedStroke.value && (isStrokeHovering.value || isDragging.value)) return 'move';
    if (isStrokeSelectModeActive.value && isStrokeHovering.value) return 'pointer';
    if (isCaptureSelectionMode.value) return 'crosshair';
    if (isTextInputMode.value) return 'text';
    if (isDrawing.value ) {
        if(drawMode.value === 'pen') return `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="${penCursorColor}" class="bi bi-pencil-fill" viewBox="0 0 16 16"><path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708zm.646 6.061L9.793 2.5 3.293 9H3.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.207zm-7.468 7.468A.5.5 0 0 1 6 13.5V13h-.5a.5.5 0 0 1-.5-.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.5-.5V10h-.5a.5.5 0 0 1-.175-.032l-.179.178a.5.5 0 0 0-.11.168l-2 5a.5.5 0 0 0 .65.65l5-2a.5.5 0 0 0 .168-.11z"/></svg>') 8 8, auto`;
        if(drawMode.value == 'highlight') return 'text';
        return 'crosshair';
    };
    if (isEraser.value) return `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-eraser-fill" viewBox="0 0 16 16"><path d="M8.086 2.207a2 2 0 0 1 2.828 0l3.879 3.879a2 2 0 0 1 0 2.828l-5.5 5.5A2 2 0 0 1 7.879 15H5.12a2 2 0 0 1-1.414-.586l-2.5-2.5a2 2 0 0 1 0-2.828zm.66 11.34L3.453 8.254 1.914 9.793a1 1 0 0 0 0 1.414l2.5 2.5a1 1 0 0 0 .707.293H7.88a1 1 0 0 0 .707-.293z"/></svg>') 8 8, auto`;
    // Default to drag mode cursor when no tool is active
    return 'default';
});

// File Management
const loadFileCallback = () => {
    resetHistory();
}

const lazyLoadCallback = (page) => {
    redrawAllStrokes(page);
}

const fileSavedCallback = () => {
    saveCurrentHistoryStep();
}

const createNewBlankPage = (imageData) => {
    openNewBlankPage(redrawAllStrokes, addToHistory, imageData);
};

const {
    fileId,
    pages,
    isFileLoaded,
    pdfReader,
    pagesContainer,
    fileInput,
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
    activePage,
    activePages,
    deletePage,
    insertBlankPage,
    openNewBlankPage,
    createImageImportHandler,
    handlePageNumberInput,
    renderPdfPage,
    renderPageThumbnail,
    resyncRenderedTextLayers,
    showDocumentProperties,
    rotatePage,
    openPreferences,

    // Form Fill
    resetForm,
    handlePdfButtonAction,
} = useFile(loadFileCallback, lazyLoadCallback, fileSavedCallback);

// Drawing Management
const strokeChangeCallback = (action) => {
    addToHistory(action);
};

const {
    colorPalette,
    isStrokeSelectModeActive,
    isTextSelectionMode,
    isTextHighlightMode,
    isDrawing,
    isEraser,
    drawMode,
    drawStyle,
    isTextInputMode,
    textEditorHtml,
    textEditorPosition,
    textEditorSimpleMode,
    isCaptureSelectionMode,
    isPenHovering,
    isStrokeHovering,
    isDragging,
    selectedStroke,
    popMenu,
    showPopMenu,
    popMenuPosition,
    resizeCursor,
    handToolActive,
    isHandToolPanning,
    startDrawing,
    stopDrawing,
    onPointerMove,
    onPointerLeave,
    editTextStroke,
    commitTextEditor,
    closeTextEditor,
    syncTextEditorPosition,
    updateTextEditorSize,
    updateTextEditorPosition,
    resetToolState,
    redrawAllStrokes,
    deleteSelectedStroke,
    strokeStyles,
    activeStrokeStyle,
    updateStrokeStyle,
    showStrokeStyleMenu,
    handleStrokeStyleButtonClick,
    selectedText,
    handleTextSelectionMouseUp,
    clampPopMenuPosition,
    highlightTextSelection,
    copySelectedStroke,
    insertCopiedStroke,
    isSelectedStrokeType,
    copiedStrokes,
    selectStrokes,
} = usePageActions(pagesContainer, activePage, strokeChangeCallback);

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
    savedHistoryStep,
    historyStep,
} = useHistory(fileId, redrawAllStrokes);

startSession();

// Create handleImageImport handler with the callbacks
const handleImageImport = createImageImportHandler(redrawAllStrokes, addToHistory);



// Toolbar Actions
const textActionsDisabled = computed(() => Object.values(pages.value).map(page => page.textContent?.items.length || 0).reduce((a, b) => a + b, 0) === 0);

const touchAction = computed(() => {
    if (isViewLocked.value || isPenHovering.value || isStrokeSelectModeActive.value || isCaptureSelectionMode.value || (enableTouchDrawing.value && hasActiveTool.value)) {
        return 'none';
    }
    return 'pan-y pan-x';
});

const isViewLocked = ref(false);
const isThumbnailSidebarVisible = ref(false);
const hasDismissedTextGestureHint = ref(false);

watch(() => textEditorPosition.value, (position) => {
    if (position) {
        hasDismissedTextGestureHint.value = true;
    }
});

const toggleThumbnailSidebar = () => {
    isThumbnailSidebarVisible.value = !isThumbnailSidebarVisible.value;
};

const toggleHandTool = () => {
    if (!isFileLoaded.value) return;
    resetToolState();
    handToolActive.value = !handToolActive.value;
};

const lockView = () => {
    if (!isFileLoaded.value) return;
    isViewLocked.value = !isViewLocked.value;
};

const toggleTextHighlightMode = () => {
    if (!isFileLoaded.value) return;
    const wasActive = isTextHighlightMode.value;
    resetToolState();
    isTextHighlightMode.value = !wasActive;
    isTextSelectionMode.value = true;
};

const toggleTextSelection = () => {
    if (!isFileLoaded.value) return;
    const wasActive = isTextSelectionMode.value;
    resetToolState();
    isTextSelectionMode.value = !wasActive;
};

const imageInput = ref(null);

const importImage = () => {
    if (!isFileLoaded.value) return;
    imageInput.value?.click();
};

const dravingTools = [
    {
        icon: 'slash-lg',
        label: 'Line',
        shortcut: 'L',
        value: 'line',
    },
    {
        icon: 'square',
        label: 'Rectangle',
        shortcut: 'R',
        value: 'rectangle',
    },
    {
        icon: 'circle',
        label: 'Circle',
        shortcut: 'O',
        value: 'circle',
    },
    {
        icon: 'pencil-fill',
        label: 'Draw',
        shortcut: 'D',
        value: 'pen',
    },
]

const selectDrawingTool = (mode) => {
    if (!isFileLoaded.value) return;
    
    const wasActive = isDrawing.value && drawMode.value === mode;
    resetToolState();
    
    if (wasActive) {
        isTextSelectionMode.value = true;
        return;
    }

    isDrawing.value = true;
    drawMode.value = mode;
};

const selectEraser = () => {
    if (!isFileLoaded.value) return;
    const wasActive = isEraser.value;
    resetToolState();
    isEraser.value = !wasActive;
};

const textEditorAlert = ref(null);

const selectText = () => {
    if (!isFileLoaded.value) return;
    const wasActive = isTextInputMode.value;
    resetToolState();
    isTextInputMode.value = !wasActive;

    if (!wasActive) {
        nextTick(() => {
            textEditorAlert.value?.show();
        });
    }
};

const toggleStrokeSelectionMode = () => {
    if (!isFileLoaded.value) return;
    resetToolState();
    isStrokeSelectModeActive.value = true;
};

const captureSelection = () => {
    if (!isFileLoaded.value) return;
    const wasActive = isCaptureSelectionMode.value;
    resetToolState();
    isCaptureSelectionMode.value = !wasActive;
};

const copySelection = () => {
    copySelectedStroke();
    const selection = window.getSelection();

    if (selection) {
        window.navigator.clipboard.writeText(selection.toString());
        selection.removeAllRanges();
    }
}

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
        const pageContainer = document.querySelector(`.page-container[data-page="${activePage.value.id}"]`);        
        const percentage = pdfReader.value.clientHeight * zoomPercentage.value / pageContainer.clientHeight;
        zoomPercentage.value = Math.ceil(percentage);
    } else {
        zoomPercentage.value = 100; // Full width
    }
    
    // Keep text selection aligned after CSS zoom changes
    nextTick(async () => {
        await resyncRenderedTextLayers();
        scrollToPage(pageIndex.value);
        syncTextEditorPosition();
    });
};

const handleZoomLevel = (percentage) => {
    if (!isFileLoaded.value) return;

    if (isNaN(percentage)) {
        toggleZoomMode(percentage);
        return;
    }

    if (!zoomLevels.value.includes(percentage)) {
        percentage = zoomLevels.value.reduce((prev, curr) => {
            return (Math.abs(curr - percentage) < Math.abs(prev - percentage) ? curr : prev);
        });
    }

    zoomPercentage.value = Math.min(Math.max(minZoom, percentage), maxZoom);

    // Keep text selection aligned after CSS zoom changes
    nextTick(async () => {
        await resyncRenderedTextLayers();
        scrollToPage(pageIndex.value);
        syncTextEditorPosition();
    });
};

const onZoomLevelChange = (event) => {
    let percentage = event.target.value;
    handleZoomLevel(percentage);
}

const zoom = (direction) => {
    if (!isFileLoaded.value) return;
    const newZoom = zoomPercentage.value + (direction * 25);
    handleZoomLevel(newZoom);
}

const hasActiveTool = computed(() => {
    return isDrawing.value || isEraser.value || isTextInputMode.value || isCaptureSelectionMode.value || isTextHighlightMode.value;
});

let resizeTimeout = null;

const printModal = ref(null);

const printPage = () => {
    printModal.value?.printPage();
};

// Page Event Handlers
useWindowEvents(fileId, {
    resize: {
        action() {
            if (!isFileLoaded.value) return;

            if (showPopMenu.value) { 
                clampPopMenuPosition();
            };

            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                nextTick(async () => {
                    await resyncRenderedTextLayers();
                    scrollToPage(pageIndex.value);
                    syncTextEditorPosition();
                })
            });
        }
    },
    keydown: {
        disabled: () => {
            return document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' || document.activeElement.isContentEditable);
        },
        a: {
            ctrl: true,
            action: (event) => {
                if (isStrokeSelectModeActive.value) {
                    event.preventDefault();
                    selectStrokes(activePage.value.strokes);
                }
            }
        },
        c: {
            ctrl: true,
            action: () => {
                copySelection();
            }
        },
        d: {
            action: (event) => {
                event.preventDefault();
                selectDrawingTool('pen');
            }
        },
        e: {
            action: (event) => {
                event.preventDefault();
                selectEraser();
            }
        },
        l: {
            actionAll: (event, ctrl, disabled) => {
                if (ctrl) {
                    event.preventDefault();
                    lockView();
                    return;
                }

                if (disabled) return;
                event.preventDefault();
                selectDrawingTool('line');
            }
        },
        r: {
            action: (event) => {
                event.preventDefault();
                selectDrawingTool('rectangle');
            }
        },
        o: {
            actionAll: (event, ctrl, disabled) => {
                if (ctrl) {
                    event.preventDefault();
                    handleFileOpen();
                    return;
                }

                if (disabled) return;
                event.preventDefault();
                selectDrawingTool('circle');
            }
        },
        p: {
            actionAll: (event, ctrl) => {
                if (!ctrl || !isFileLoaded.value) return;
                event.preventDefault();
                printPage();
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
                event.preventDefault();
                selectEraser();
            }
        },
        h: {
            action: (event) => {
                event.preventDefault();
                toggleTextHighlightMode();
            }
        },
        t: {
            action: (event) => {
                event.preventDefault();
                selectText();
            }
        },
        s: {
            actionAll: (event, ctrl, disabled) => {
                if (ctrl) {
                    event.preventDefault();
                    handleSaveFile();
                    return;
                }

                if (disabled) return;
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
                if (selectedStroke.value) {
                    copySelectedStroke();
                    deleteSelectedStroke();
                    return;
                }

                captureSelection();
            }
        },
        v: {
            ctrl: true,
            action: () => {
                insertCopiedStroke();
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
                if (isDrawing.value || isTextInputMode.value) {
                    resetToolState();
                    isStrokeSelectModeActive.value = true;
                    return;
                }
                
                resetToolState();
                isTextSelectionMode.value = true;
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

    document.addEventListener('mouseup', handleTextSelectionMouseUp);
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
    showDocumentProperties
})
</script>
<template>
    <div class="container-fluid bg-dark-accent" v-if="isFileLoaded">
        <nav :class="`navbar navbar-expand-lg navbar-dark p-1 fixed-${toolbarPosition}`">
            <ul class="navbar-nav flex-row gap-1">
                <!-- Thumbnail Sidebar -->
                <li class="nav-item">
                    <ToolItem class="nav-link" label="Thumbnail Sidebar" icon="layout-sidebar-inset" :active="isThumbnailSidebarVisible" :action="toggleThumbnailSidebar" />
                </li>
                <!-- Search -->
                <PageSearch :fileid="fileId" :pages="pages" :disabled="textActionsDisabled" :scrollToPage="scrollToPage" />

                <!-- Reset Form -->
                <li class="nav-item" v-if="isTextSelectionMode && activePage.annotations?.length">
                    <ToolItem class="nav-link" label="Reset Form" shortcut="R" icon="arrow-counterclockwise" :action="resetForm" />
                </li>
            </ul>
            <!-- Toolbar -->
            <ul ref="toolbar" class="navbar-nav mx-auto gap-1 d-none d-lg-flex">
                <!-- Drawing -->
                <template v-if="isDrawing || isTextHighlightMode || (isTextInputMode && textEditorSimpleMode)">
                    <li class="nav-item btn-group" v-for="({ color }, index) in strokeStyles">
                        <ToolItem class="nav-link" icon="circle-fill" :action="handleStrokeStyleButtonClick" :value="index" :active="color === drawStyle.color" :style="`color: ${color} !important`" />
                        <div class="dropdown-menu dropdown-menu-dark show rounded-3 mt-5 p-3" v-if="showStrokeStyleMenu && color === drawStyle.color">
                            <div class="row">
                                <div class="col-6">
                                    <div class="row row-cols-5 g-0">
                                        <template v-for="paletteColor in colorPalette">
                                            <div class="col hoverable py-1 rounded-3 text-center" :class="{ active: paletteColor === drawStyle.color }">
                                                <svg width="32" height="32" viewBox="0 0 32 32" @click="updateStrokeStyle(index, 'color', paletteColor)">
                                                    <circle cx="16" cy="16" r="14" :fill="paletteColor" role="button" />
                                                </svg>
                                            </div>
                                        </template>
                                        <div class="col-12 mt-2">
                                            <svg width="100%" height="40" viewBox="0 0 100 40" preserveAspectRatio="none">
                                                <defs>
                                                    <linearGradient id="waveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                                        <stop offset="0%" :style="`stop-color: ${drawStyle.color}; stop-opacity: 0.3`" />
                                                        <stop offset="50%" :style="`stop-color: ${drawStyle.color}; stop-opacity: 1`" />
                                                        <stop offset="100%" :style="`stop-color: ${drawStyle.color}; stop-opacity: 0.3`" />
                                                    </linearGradient>
                                                </defs>
                                                <path
                                                    d="M 0,20 Q 12.5,5 25,20 T 50,20 T 75,20 T 100,20"
                                                    :stroke="drawStyle.color"
                                                    :stroke-dasharray="drawStyle.dash === 'dashed' ? '8 6' : (drawStyle.dash === 'dotted' ? '1 6' : null)"
                                                    :opacity="drawStyle.opacity"
                                                    :stroke-width="drawStyle.thickness"
                                                    fill="none"
                                                    stroke-linecap="round"
                                                />
                                                <rect x="0" y="0" width="100" height="40" :fill="drawStyle.fill ? drawStyle.color : 'none'" />
                                            </svg>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-6 border-start border-secondary">
                                    <div class="row row-cols-5">
                                        <div class="col-12 d-flex align-items-center gap-2">
                                            <label class="form-label" for="stroke-fill-toggle">{{ $t('Filled') }}</label>
                                            <div class="form-check form-check-inline form-switch">
                                                <input class="form-check-input" type="checkbox" :checked="drawStyle.fill" @change="updateStrokeStyle(index, 'fill', $event.target.checked)" id="stroke-fill-toggle" />
                                            </div>
                                        </div>
                                        <div class="col-12">
                                            <label class="form-label mb-1">{{ $t('Style') }}</label>
                                            <template v-for="option in ['solid', 'dashed', 'dotted']">
                                                <div class="form-check">
                                                    <input class="form-check-input" type="radio" name="dashOptions" :id="`dash-${option}`" :value="option" :checked="drawStyle.dash === option" @change="updateStrokeStyle(index, 'dash', option)" />
                                                    <label class="form-check-label text-capitalize" :for="`dash-${option}`">
                                                        {{ $t(option) }}
                                                    </label>
                                                </div>
                                            </template>
                                        </div>
                                        <div class="col-12 mt-2">
                                            <label class="form-label mb-1">{{ $t('Opacity') }}: {{ Math.round(drawStyle.opacity * 100) }}%</label>
                                            <input type="range" min="0.1" max="1" step="0.05" class="form-range" :value="drawStyle.opacity" @input="updateStrokeStyle(index, 'opacity', $event.target.value)" />
                                        </div>
                                        <div class="col-12 mt-2">
                                            <label class="form-label mb-1">{{ $t('Thickness') }}</label>
                                        </div>
                                        <template v-for="value in [1, 2, 4, 6, 8]">
                                            <div class="col text-center py-1 px-0 rounded-3 hoverable" :class="{ active: activeStrokeStyle?.thickness == value }" role="button" @click="updateStrokeStyle(index, 'thickness', value)">
                                                <svg width="32" height="32" viewBox="0 0 32 32">
                                                    <circle cx="16" cy="16" :r="value * 1.75" :fill="drawStyle.color" :opacity="drawStyle.opacity" />
                                                </svg>
                                            </div>
                                        </template>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </li>
                    <li class="nav-item vr"></li>
                </template>
                <li class="nav-item" v-if="isDrawing || isEraser">
                    <ToolItem class="nav-link" label="Eraser" shortcut="E" icon="eraser-fill" :active="isEraser" :disabled="drawMode !== 'pen'" :action="selectEraser" />
                </li>
                <template v-for="tool in dravingTools">
                    <li class="nav-item" v-if="isDrawing || isEraser || tool.value === 'pen'">
                        <ToolItem class="nav-link" v-bind="tool" :action="selectDrawingTool" :active="drawMode === tool.value && isDrawing" />
                    </li>
                </template>
                <li class="nav-item">
                    <ToolItem class="nav-link" label="Highlight Text" shortcut="H" icon="highlighter" :active="isTextHighlightMode" :disabled="textActionsDisabled" :action="toggleTextHighlightMode" />
                </li>
                <li class="nav-item">
                    <ToolItem class="nav-link" label="Add Text" shortcut="T" icon="textarea-t" :active="isTextInputMode" :action="selectText" />
                </li>
                <li class="nav-item">
                    <ToolItem class="nav-link" label="Import Image" shortcut="I" icon="image" :action="importImage" />
                </li>
                <li class="nav-item">
                    <ToolItem class="nav-link" label="Capture Selection" icon="scissors" :active="isCaptureSelectionMode" :action="captureSelection" />
                </li>

                <!-- Selection -->
                <li class="nav-item vr"></li>
                <li class="nav-item">
                    <ToolItem class="nav-link" label="Drawing Selection" shortcut="P" icon="cursor-fill" :active="isStrokeSelectModeActive" :action="toggleStrokeSelectionMode" />
                </li>
                <li class="nav-item">
                    <ToolItem class="nav-link" label="Text Selection" shortcut="S" icon="cursor-text" :active="isTextSelectionMode" :disabled="textActionsDisabled" :action="toggleTextSelection" />
                </li>

                <!-- Pagination -->
                <li class="nav-item vr"></li>
                <li class="nav-item">
                    <div class="input-group align-items-center flex-nowrap">
                        <input id="page-number" type="text" class="form-control-plaintext" v-model="pageNum" @input="handlePageNumberInput" />
                        <span class="text-secondary">/ {{ activePages.length }}</span>
                    </div>
                </li>
                <li class="nav-item">
                    <ToolItem class="nav-link" label="Previous Page" shortcut="ArrowLeft" icon="chevron-up" :action="scrollToPage" :value="pageIndex - 1" :disabled="isFirstPage" />
                </li>
                <li class="nav-item">
                    <ToolItem class="nav-link" label="Next Page" shortcut="ArrowRight" icon="chevron-down" :action="scrollToPage" :value="pageIndex + 1" :disabled="isLastPage" />
                </li>

                <!-- History -->
                <li class="nav-item vr"></li>
                <li class="nav-item">
                    <ToolItem class="nav-link" label="Undo" shortcut="Ctrl+Z" icon="arrow-counterclockwise" :action="undo" :disabled="!canUndo" />
                </li>
                <li class="nav-item">
                    <ToolItem class="nav-link" label="Redo" shortcut="Ctrl+Y" icon="arrow-clockwise" :action="redo" :disabled="!canRedo" />
                </li>

                <!-- Zoom -->
                <li class="nav-item vr"></li>
                <li class="nav-item">
                    <ToolItem class="nav-link" label="Zoom In" icon="zoom-in" :disabled="zoomPercentage === maxZoom || isViewLocked" :action="zoom" :value="1" />
                </li>
                <li class="nav-item">
                    <ToolItem class="nav-link" label="Zoom Out" icon="zoom-out" :disabled="zoomPercentage === minZoom || isViewLocked" :action="zoom" :value="-1" />
                </li>
                <li class="nav-item">
                    <select id="zoom-level" class="form-control-plaintext" @change="onZoomLevelChange" :disabled="isViewLocked">
                        <option value="fit-width" :selected="zoomPercentage === 100">{{ $t('Fit Width') }}</option>
                        <option value="fit-height" :selected="false">{{ $t('Fit Height') }}</option>
                        <option v-for="level in zoomLevels" :value="level" :selected="level === zoomPercentage">{{ level }}%</option>
                    </select>
                </li>
                <li class="nav-item">
                    <ToolItem class="nav-link" label="Lock View" icon="lock" icon-active :active="isViewLocked" :action="lockView" />
                </li>
            </ul>
            <ul class="navbar-nav flex-row gap-1">
                <li class="nav-item">
                    <ToolItem class="nav-link" label="Save File" icon="floppy-fill" :action="handleSaveFile" :disabled="historyStep === savedHistoryStep" />
                </li>
                <li class="nav-item">
                    <ToolItem class="nav-link" label="Preferences" icon="gear-fill" :action="openPreferences" />
                </li>
            </ul>
        </nav>
        <div :id="`pdf-reader-${fileId}`" ref="pdfReader" :class="`pdf-reader toolbar-${toolbarPosition} ${isViewLocked ? 'overflow-hidden' : ''}`">
            <ThumbnailSidebar 
                v-if="isThumbnailSidebarVisible"
                :pageCount="pageCount"
                :pages="pages"
                :pageIndex="pageIndex"
                :scrollToPage="scrollToPage"
                :renderPageThumbnail="renderPageThumbnail"
            />
            <div class="pages-container flex-grow-1" ref="pagesContainer" :style="{ width: `${zoomPercentage}%` }">
                <template v-for="page in pages" :key="page.id">
                    <div class="page-container" :data-page="page.id" v-show="!page.deleted">
                        <div class="canvas-container" :class="{ 'canvas-loading': !page.rendered }">
                            <canvas class="pdf-canvas" :ref="el => page.canvas = el"></canvas>
                            <div class="text-layer" :class="{ 'text-selectable': isTextSelectionMode }" :ref="el => page.textLayer = el"></div>
                            <!-- Interactive form field overlay -->
                            <PdfForm :page="page" :disabled="!isTextSelectionMode" @button-action="handlePdfButtonAction" />
                            <svg
                                :ref="el => page.annotationSvg = el"
                                class="annotation-layer"
                                preserveAspectRatio="none"
                                xmlns="http://www.w3.org/2000/svg"
                            ></svg>
                            <canvas 
                                :ref="el => page.drawingCanvas = el"
                                class="drawing-canvas"
                                @pointerdown="startDrawing"
                                @pointermove="onPointerMove"
                                @pointerup="stopDrawing"
                                @pointerleave="onPointerLeave"
                                @pointercancel="stopDrawing"
                                :style="{
                                    cursor: cursorStyle,
                                    pointerEvents: isTextSelectionMode ? 'none' : 'auto',
                                    touchAction: touchAction,
                                    zIndex: isTextSelectionMode ? 1 : 3
                                }"
                                :data-color="drawStyle.color"
                            ></canvas>
                        </div>
                    </div>
                </template>
            </div>

            <template v-if="!!textEditorPosition">
                <SimpleTextEditor
                    v-if="textEditorSimpleMode"
                    :style="textEditorPosition"
                    v-model="textEditorHtml"
                    @enter="commitTextEditor"
                    @cancel="closeTextEditor"
                />
                <QuillEditor
                    v-else
                    :placeholder="$t('Type text...')"
                    :style="textEditorPosition"
                    v-model="textEditorHtml"
                    @save="commitTextEditor"
                    @cancel="closeTextEditor"
                    @resize="updateTextEditorSize"
                    @drag="updateTextEditorPosition"
                />
            </template>
            <bs-toast
                ref="textEditorAlert"
                :id="`text-editor-alert-${fileId}`"
                position="top-50 start-50 translate-middle"
                v-else-if="isTextInputMode && !hasDismissedTextGestureHint"
            >
                <div class="text-center">
                    {{ $t('Click for simple text, select area to input advanced text') }}
                </div>
            </bs-toast>

            <!-- Stroke Menu -->
            <div ref="popMenu" class="pop-menu" :style="{ left: popMenuPosition.x + 'px', top: popMenuPosition.y + 'px' }" v-if="showPopMenu && (selectedStroke || selectedText)">
                <div class="pop-menu-body">
                    <template v-if="selectedStroke">
                        <ToolItem class="btn-pop-menu" label="Edit" icon="pencil-square" :action="editTextStroke"  v-if="isSelectedStrokeType('text')" />
                        <ToolItem class="btn-pop-menu" label="Delete" icon="trash3" :action="deleteSelectedStroke" />
                    </template>
                    <template v-else-if="selectedText">
                        <ToolItem class="btn-pop-menu" label="Highlight Text" shortcut="H" icon="highlighter" :action="highlightTextSelection" />
                    </template>
                    <ToolItem class="btn-pop-menu" label="Copy" shortcut="Ctrl+D" icon="files" :action="copySelection" />
                </div>
            </div>

            <!-- Custom Print Modal (Electron silent printing) -->
            <PrintModal
                ref="printModal"
                :pageCount="pageCount"
                :pages="pages"
                :renderPdfPage="renderPdfPage"
            />

            <PageNumber :page-num="pageNum" :total="activePages.length"/>
            
            <context-menu :parent="`#pdf-reader-${fileId}`">
                <ToolItem class="dropdown-item" show-label label="Stroke Selection" shortcut="P" icon="cursor-fill" :active="isStrokeSelectModeActive" :action="toggleStrokeSelectionMode" />
                <ToolItem class="dropdown-item" show-label label="Text Selection" shortcut="S" icon="cursor-text" :active="isTextSelectionMode && !isTextHighlightMode" :disabled="textActionsDisabled" :action="toggleTextSelection" />
                <ToolItem class="dropdown-item" show-label label="Hand Tool" icon="hand-index-thumb-fill" :active="handToolActive" :action="toggleHandTool" />
                <li><hr class="dropdown-divider"></li>
                <ToolItem class="dropdown-item" show-label label="Capture Selection" shortcut="Ctrl+X" icon="scissors" :action="captureSelection" />
                <ToolItem class="dropdown-item" show-label label="Copy" shortcut="Ctrl+C" icon="copy" :action="copySelection" />
                <ToolItem class="dropdown-item" show-label label="Paste" shortcut="Ctrl+V" icon="clipboard" :action="insertCopiedStroke" />
                <li><hr class="dropdown-divider"></li>
                <ToolItem class="dropdown-item" show-label label="First Page" :disabled="isFirstPage" shortcut="Home" icon="chevron-double-up" :action="scrollToFirstPage" />
                <ToolItem class="dropdown-item" show-label label="Last Page" :disabled="isLastPage" shortcut="End" icon="chevron-double-down" :action="scrollToLastPage" />
                <li><hr class="dropdown-divider"></li>
                <ToolItem class="dropdown-item" show-label label="Rotate Clockwise" icon="arrow-clockwise" :action="rotatePage" value="clockwise" />
                <ToolItem class="dropdown-item" show-label label="Rotate Counterclockwise" icon="arrow-counterclockwise" :action="rotatePage" value="counterclockwise" />
                <ToolItem class="dropdown-item" show-label label="Insert Blank Page Before" icon="file-earmark-plus" :action="insertBlankPage" value="before" />
                <ToolItem class="dropdown-item" show-label label="Insert Blank Page After" icon="file-earmark-plus" :action="insertBlankPage" value="after" />
                <li><hr class="dropdown-divider"></li>
                <ToolItem class="dropdown-item" show-label label="Print" shortcut="Ctrl+P" icon="printer" :action="printPage" />
                <ToolItem class="dropdown-item" show-label label="Properties" shortcut="Ctrl+I" icon="info-circle" :action="showDocumentProperties" />
            </context-menu>
        </div>

        <input ref="imageInput" type="file" accept="image/*" class="d-none" @change="handleImageImport" />
    </div>

    <input ref="fileInput" type="file"  accept="application/pdf" class="d-none" @change="loadFile" />
</template>