import { ref } from "vue";

// File Group
class Tool {
    constructor(group, label, icon, action, value, items = null) {
        this.group = group;
        this.label = label;
        this.action = action;
        this.iconStored = icon; // Store the original icon for toggling
        this.icon = ref(icon.inactive || icon); // Use inactive icon if provided, otherwise use the original
        this.active = false;
        this.value = value;
        this.items = items;
        this.disabled = false;
    }
    
    toggle() {
        this.active = !this.active;
        this.icon.value = this.active && this.iconStored.active ? this.iconStored.active : (this.iconStored.inactive || this.iconStored);
    }
}

const newFile = new Tool('file', { text: 'New Blank Page' }, 'file-earmark-fill', 'openNewBlankPage');
const openFile = new Tool('file', { text: 'Open File', shortcut: 'Ctrl+O' }, 'folder2-open', 'openFile');
const saveFile = new Tool('file', { text: 'Save', shortcut: 'Ctrl+S' }, 'floppy', 'saveFile');

// Page Group
const rotateClockwise = new Tool('page', { text: 'Rotate Clockwise' }, 'arrow-clockwise', 'rotateClockwise');
const rotateCounterclockwise = new Tool('page', { text: 'Rotate Counterclockwise' }, 'arrow-counterclockwise', 'rotateCounterclockwise');
const insertFromClipboard = new Tool('page', { text: 'Import From Clipboard' }, 'clipboard-plus', 'insertFromClipboard');
const insertBlankPage = new Tool('page', { text: 'Insert Page After' }, 'file-earmark-arrow-down', 'insertBlankPage');
const deletePage = new Tool('page', { text: 'Delete' }, 'trash3', 'deletePage');

// Document Group
const firstPage = new Tool('document', { text: 'First Page', shortcut: 'Home' }, 'chevron-double-up', 'scrollToFirstPage');
const lastPage = new Tool('document', { text: 'Last Page', shortcut: 'End' }, 'chevron-double-down', 'scrollToLastPage');
const previousPage = new Tool('document', { text: 'Previous Page', shortcut: 'PageUp' }, 'chevron-up', 'scrollToPreviousPage');
const nextPage = new Tool('document', { text: 'Next Page', shortcut: 'PageDown' }, 'chevron-down', 'scrollToNextPage');
const printPage = new Tool('document', { text: 'Print', shortcut: 'Ctrl+P' }, 'printer', 'printPage');
const showDocumentProperties = new Tool('document', { text: 'Properties' }, 'info-circle', 'showDocumentProperties');

// View Group
const viewLock = new Tool('view', { text: 'Lock View' }, { active: 'lock-fill', inactive: 'lock' }, 'lockView');
const viewZoomIn = new Tool('view', { text: 'Zoom In' }, 'zoom-in', 'zoomIn');
const viewZoomOut = new Tool('view', { text: 'Zoom Out' }, 'zoom-out', 'zoomOut');

// Edit Group
const editUndo = new Tool('edit', { text: 'Undo', shortcut: 'Ctrl+Z' }, 'arrow-counterclockwise', 'undo');
const editRedo = new Tool('edit', { text: 'Redo', shortcut: 'Ctrl+Y' }, 'arrow-clockwise', 'redo');
const editPaste = new Tool('edit', { text: 'Paste', shortcut: 'Ctrl+V' }, 'clipboard-fill', 'insertCopiedStroke');
const editCapture = new Tool('edit', { text: 'Capture Selection' }, 'scissors', 'captureSelection');
const editSelectStroke = new Tool('edit', { text: 'Select Stroke' }, 'cursor-fill', 'selectStrokeMode');
const editSelectText = new Tool('edit', { text: 'Select Text' }, 'cursor-text', 'toggleTextSelection');
const editHandTool = new Tool('edit', { text: 'Hand Tool' }, 'hand-index-thumb-fill', 'toggleHandTool');

// Preferences Group
const toggleTouchDrawing = new Tool('preferences', { text: 'Toggle Touch Drawing' }, 'hand-index-thumb', 'toggleTouchDrawing');
const toggleToolbarPosition = new Tool('preferences', { text: 'Toggle Toolbar Position' }, 'arrows-expand', 'toggleToolbarPosition');
// const translate = { 
//     group: 'preferences', label: 'Language', icon: 'translate', items: [
//         { label: 'English', action: 'changeLocale', value: 'en', icon: currentLocale.value === 'en' ? 'check-circle-fill' : 'circle' },
//         { label: 'Portuguese', action: 'changeLocale', value: 'pt', icon: currentLocale.value === 'pt' ? 'check-circle-fill' : 'circle' },
//         { label: 'Turkish', action: 'changeLocale', value: 'tr', icon: currentLocale.value === 'tr' ? 'check-circle-fill' : 'circle' },
//     ]
// };

export function useTools(actions) {
    const handleToolClick = (tool) => {
        if (!tool.action) return;
        const handler = actions[tool.action];
        if (typeof handler !== 'function') return;
        handler(tool.value);
        tool.toggle();
    };

    return {
        newFile,
        openFile,
        saveFile,
        rotateClockwise,
        rotateCounterclockwise,
        insertFromClipboard,
        insertBlankPage,
        deletePage,
        firstPage,
        lastPage,
        previousPage,
        nextPage,
        editUndo,
        editRedo,
        editPaste,
        editCapture,
        editSelectStroke,
        editSelectText,
        editHandTool,
        toggleTouchDrawing,
        toggleToolbarPosition,
        // translate,
        printPage,
        showDocumentProperties,
        viewLock,
        viewZoomIn,
        viewZoomOut,
        handleToolClick
    };
}