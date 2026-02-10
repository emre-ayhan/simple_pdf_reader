import { ref } from "vue";

// File Group
class Tool {
    constructor(group, label, action, icon, value, items = null) {
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

const newFile = new Tool('file', { text: 'New Blank Page' }, 'openNewBlankPage', 'file-earmark-fill');
const openFile = new Tool('file', { text: 'Open File', shortcut: 'Ctrl+O' }, 'openFile', 'folder2-open');
const saveFile = new Tool('file', { text: 'Save', shortcut: 'Ctrl+S' }, 'saveFile', 'floppy');

// Page Group
const rotateClockwise = new Tool('page', { text: 'Rotate Clockwise' }, 'rotateClockwise', 'arrow-clockwise');
const rotateCounterclockwise = new Tool('page', { text: 'Rotate Counterclockwise' }, 'rotateCounterclockwise', 'arrow-counterclockwise');
const insertFromClipboard = new Tool('page', { text: 'Import From Clipboard' }, 'insertFromClipboard', 'clipboard-plus');
const insertBlankPage = new Tool('page', { text: 'Insert Page After' }, 'insertBlankPage', 'file-earmark-arrow-down');
const deletePage = new Tool('page', { text: 'Delete' }, 'deletePage', 'trash3');

// Document Group
const firstPage = new Tool('document', { text: 'First Page', shortcut: 'Home' }, 'scrollToFirstPage', 'chevron-double-up');
const lastPage = new Tool('document', { text: 'Last Page', shortcut: 'End' }, 'scrollToLastPage', 'chevron-double-down');
const previousPage = new Tool('document', { text: 'Previous Page', shortcut: 'PageUp' }, 'scrollToPreviousPage', 'chevron-up');
const nextPage = new Tool('document', { text: 'Next Page', shortcut: 'PageDown' }, 'scrollToNextPage', 'chevron-down');
const printPage = new Tool('document', { text: 'Print', shortcut: 'Ctrl+P' }, 'printPage', 'printer');
const showDocumentProperties = new Tool('document', { text: 'Properties' }, 'showDocumentProperties', 'info-circle');

// View Group
const viewLock = new Tool('view', { text: 'Lock View' }, 'lockView', { active: 'lock-fill', inactive: 'lock' });
const viewZoomIn = new Tool('view', { text: 'Zoom In' }, 'zoomIn', 'zoom-in');
const viewZoomOut = new Tool('view', { text: 'Zoom Out' }, 'zoomOut', 'zoom-out');

// Edit Group
const editUndo = new Tool('edit', { text: 'Undo', shortcut: 'Ctrl+Z' }, 'undo', 'arrow-counterclockwise');
const editRedo = new Tool('edit', { text: 'Redo', shortcut: 'Ctrl+Y' }, 'redo', 'arrow-clockwise');
const editPaste = new Tool('edit', { text: 'Paste', shortcut: 'Ctrl+V' }, 'insertCopiedStroke', 'clipboard-fill');

// Preferences Group
const toggleTouchDrawing = new Tool('preferences', { text: 'Toggle Touch Drawing' }, 'toggleTouchDrawing', 'hand-index-thumb');
const toggleToolbarPosition = new Tool('preferences', { text: 'Toggle Toolbar Position' }, 'toggleToolbarPosition', 'arrows-expand');
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