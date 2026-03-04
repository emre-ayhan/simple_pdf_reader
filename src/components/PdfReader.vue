<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, onBeforeUnmount, watch } from "vue";
import { Electron } from "../composables/useElectron";
import { useFile } from "../composables/useFile";
import { useDraw } from "../composables/useDraw";
import { useHistory } from "../composables/useHistory";
import { fileDataCache } from "../composables/useTabs";
import { useWindowEvents } from "../composables/useWindowEvents";
import { enableTouchDrawing, toolbarPosition } from "../composables/useAppPreferences";
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
    const penCursorColor = encodeURIComponent(drawColor.value);
    if (resizeCursor.value) return resizeCursor.value;
    if (handToolActive.value) return isHandToolPanning.value ? 'grabbing' : 'grab';
    if (selectedStroke.value && (isStrokeHovering.value || isDragging.value)) return 'move';
    if (isSelectModeActive.value && isStrokeHovering.value) return 'pointer';
    if (isSelectionMode.value) return 'crosshair';
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
    submitPdfForm,
    collectPdfFormValues,
} = useFile(loadFileCallback, renderImageFileCallback, lazyLoadCallback, fileSavedCallback);

// Drawing Management
const strokeChangeCallback = (action) => {
    addToHistory(action);
};

const {
    colorPalette,
    isSelectModeActive,
    isTextSelectionMode,
    isTextHighlightMode,
    isDrawing,
    isEraser,
    drawMode,
    drawColor,
    isTextInputMode,
    textEditorHtml,
    textEditorPosition,
    textEditorSimpleMode,
    isSelectionMode,
    isPenHovering,
    isStrokeHovering,
    isDragging,
    selectedStroke,
    strokeMenu,
    showStrokeMenu,
    strokeMenuPosition,
    resizeCursor,
    handToolActive,
    isHandToolPanning,
    startDrawing,
    stopDrawing,
    onPointerMove,
    onPointerLeave,
    editSelectedTextStroke,
    commitTextEditor,
    closeTextEditor,
    syncTextEditorPosition,
    updateTextEditorSize,
    updateTextEditorPosition,
    resetToolState,
    redrawAllStrokes,
    drawImageCanvas,
    deleteSelectedStroke,
    handleStrokeMenu,
    initialStrokeStyles,
    activeStrokeStyle,
    setInitialStrokeColor,
    setInitialStrokeThickness,
    showStrokeStyleMenu,
    handleStrokeStyleButtonClick,
    clampStrokeMenuPosition,
    highlightTextSelection,
    copySelectedStroke,
    insertCopiedStroke,
    retrieveClipboardData,
    isSelectedStrokeType,
    copiedStrokes,
    selectStrokes,
} = useDraw(pagesContainer, activePage, strokeChangeCallback);

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
    if (isViewLocked.value || isPenHovering.value || isSelectModeActive.value || isSelectionMode.value || (enableTouchDrawing.value && hasActiveTool.value)) {
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
    resetAllTools();
    handToolActive.value = !handToolActive.value;
};

const lockView = () => {
    if (!isFileLoaded.value) return;
    isViewLocked.value = !isViewLocked.value;
};

const resetAllTools = () => {
    resetToolState();
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
    resetAllTools();
    
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
    resetAllTools();
    isTextInputMode.value = !wasActive;

    if (!wasActive) {
        nextTick(() => {
            textEditorAlert.value?.show();
        });
    }
};

const toggleStrokeSelectionMode = () => {
    if (!isFileLoaded.value) return;
    resetAllTools();
    isSelectModeActive.value = true;
};

const captureSelection = () => {
    if (!isFileLoaded.value) return;
    const wasActive = isSelectionMode.value;
    resetToolState();
    isSelectionMode.value = !wasActive;
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
    return isDrawing.value || isEraser.value || isTextInputMode.value || isSelectionMode.value || isTextHighlightMode.value;
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

            if (showStrokeMenu.value) { 
                clampStrokeMenuPosition();
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
                if (isSelectModeActive.value) {
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
                    toggleStrokeSelectionMode();
                    return;
                }

                toggleTextSelection();
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
                    <li class="nav-item btn-group" v-for="({ color }, index) in initialStrokeStyles">
                        <ToolItem class="nav-link" icon="circle-fill" :action="handleStrokeStyleButtonClick" :value="index" :active="color === drawColor" :style="`color: ${color} !important`" />
                        <div class="dropdown-menu dropdown-menu-dark show rounded-3 mt-5 p-3" v-if="showStrokeStyleMenu && !index">
                            <div class="row row-cols-5 g-2">
                                <div class="form-label col-12">{{ $t('Color') }}</div>
                                <template v-for="paletteColor in colorPalette">
                                    <div class="col">
                                        <button  type="button" class="btn" :class="{ 'border border-3 border-light': paletteColor === drawColor }" :style="{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: paletteColor }" @click="setInitialStrokeColor(paletteColor)"></button>
                                    </div>
                                </template>
                                <div class="col-12 mt-3">
                                    <input type="color" class="form-control-color" id="color-picker" :value="drawColor" title="Select color" @input="setInitialStrokeColor($event.target.value)" />
                                </div>
                                <div class="col-12"><hr class="my-2"></div>
                                <div class="col-12">
                                    <label class="form-label">{{ $t('Thickness') }}</label>
                                    <div class="d-flex align-items-center">
                                        <input type="range" class="form-range" min="1" max="10" :value="activeStrokeStyle?.thickness" @input="setInitialStrokeThickness($event.target.value)" />
                                        <input type="text" class="form-control-plaintext" min="1" max="10" :value="activeStrokeStyle?.thickness" readonly />
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
                    <ToolItem class="nav-link" label="Capture Selection" icon="scissors" :active="isSelectionMode" :action="captureSelection" />
                </li>

                <!-- Selection -->
                <li class="nav-item vr"></li>
                <li class="nav-item">
                    <ToolItem class="nav-link" label="Drawing Selection" shortcut="P" icon="cursor-fill" :active="isSelectModeActive" :action="toggleStrokeSelectionMode" />
                </li>
                <li class="nav-item">
                    <ToolItem class="nav-link" label="Text Selection" shortcut="S" icon="cursor-text" :active="isTextSelectionMode" :action="toggleTextSelection" />
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
                                @click="handleStrokeMenu"
                                :style="{
                                    cursor: cursorStyle,
                                    pointerEvents: isTextSelectionMode ? 'none' : 'auto',
                                    touchAction: touchAction,
                                    zIndex: isTextSelectionMode ? 1 : 3
                                }"
                                :data-color="drawColor"
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
            <div v-if="showStrokeMenu && selectedStroke" 
                ref="strokeMenu"
                class="stroke-menu" 
                :style="{ 
                    left: strokeMenuPosition.x + 'px', 
                    top: strokeMenuPosition.y + 'px'
                }"
            >
                <div class="stroke-menu-content">
                    <div class="stroke-menu-section">
                        <div class="stroke-menu-colors dropdown-center">
                            <button
                                v-if="isSelectedStrokeType('text')"
                                type="button"
                                class="btn btn-link link-secondary btn-stroke-menu border-0 p-0"
                                :title="$t('Edit')"
                                @click.stop="editSelectedTextStroke()"
                            >
                                <i class="bi bi-pencil-square"></i>
                            </button>
                            <div v-if="isSelectedStrokeType('text')" class="vr bg-primary"></div>
                            <button type="button" class="btn btn-link link-secondary btn-stroke-menu border-0 p-0" :title="$t('Copy')" @click.stop="copySelectedStroke()">
                                <i class="bi bi-copy"></i>
                            </button>
                            <button type="button" class="btn btn-link link-secondary btn-stroke-menu border-0 p-0" :title="$t('Delete')" @click.stop="deleteSelectedStroke()">
                                <i class="bi bi-trash-fill"></i>
                            </button>
                        </div>
                    </div>
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
            
            <context-menu :parent="`#pdf-reader-${fileId}`" @show="retrieveClipboardData">
                <ToolItem class="dropdown-item" show-label label="Stroke Selection" shortcut="P" icon="cursor-fill" :active="isSelectModeActive" :action="toggleStrokeSelectionMode" />
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