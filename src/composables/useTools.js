// File Group
const newFile = { group: 'file', label: 'New Blank Page', action: 'openNewBlankPage', icon: 'file-earmark-fill' };
const openFile = { group: 'file', label: 'Open', action: 'openFile', icon: 'folder', shortcut: 'Ctrl+O' };
const saveFile = { group: 'file', label: 'Save', action: 'saveFile', icon: 'floppy', shortcut: 'Ctrl+S' };

// Page Group
const rotateClockwise = { group: 'page', label: 'Rotate Clockwise', action: 'rotateClockwise', icon: 'arrow-clockwise' };
const rotateCounterclockwise = { group: 'page', label: 'Rotate Counterclockwise', action: 'rotateCounterclockwise', icon: 'arrow-counterclockwise' };
const insertFromClipboard = { group: 'page', label: 'Import From Clipboard', action: 'insertFromClipboard', icon: 'clipboard-plus' };
const insertBlankPage = { group: 'page', label: 'Insert Page After', action: 'insertBlankPage', icon: 'file-earmark-arrow-down' };
const deletePage = { group: 'page', label: 'Delete', action: 'deletePage', icon: 'trash3' };

// Document Group
const firstPage = { group: 'document', label: 'First Page', action: 'scrollToFirstPage', icon: 'chevron-double-up', shortcut: 'Home' };
const lastPage = { group: 'document', label: 'Last Page', action: 'scrollToLastPage', icon: 'chevron-double-down', shortcut: 'End' };
const previousPage = { group: 'document', label: 'Previous Page', action: 'scrollToPreviousPage', icon: 'chevron-up', shortcut: 'PageUp' };
const nextPage = { group: 'document', label: 'Next Page', action: 'scrollToNextPage', icon: 'chevron-down', shortcut: 'PageDown' };
const printPage = { group: 'document', label: 'Print', action: 'printPage', icon: 'printer', shortcut: 'Ctrl+P' };
const showDocumentProperties = { group: 'document', label: 'Properties', action: 'showDocumentProperties', icon: 'info-circle' };

// View Group
const viewLock = { group: 'view', label: 'Lock View', action: 'lockView', icon: 'lock' };
const viewZoomIn = { group: 'view', label: 'Zoom In', action: 'zoomIn', icon: 'zoom-in' };
const viewZoomOut = { group: 'view', label: 'Zoom Out', action: 'zoomOut', icon: 'zoom-out' };

// Edit Group
const undo = { group: 'edit', label: 'Undo', action: 'undo', icon: 'arrow-counterclockwise' };
const redo = { group: 'edit', label: 'Redo', action: 'redo', icon: 'arrow-clockwise' };
const paste = { group: 'edit', label: 'Paste', action: 'insertCopiedStroke', icon: 'clipboard-fill' };
const importFromClipboard = { group: 'edit', label: 'Import From Clipboard', action: 'insertFromClipboard', icon: 'clipboard-plus-fill' };

// Preferences Group
const toggleTouchDrawing = { group: 'preferences', label: 'Toggle Touch Drawing', action: 'toggleTouchDrawing', icon: 'hand-index-thumb' };
const toggleToolbarPosition = { group: 'preferences', label: 'Toggle Toolbar Position', action: 'toggleToolbarPosition', icon: 'arrows-expand' };
// const translate = { 
//     group: 'preferences', label: 'Language', icon: 'translate', items: [
//         { label: 'English', action: 'changeLocale', value: 'en', icon: currentLocale.value === 'en' ? 'check-circle-fill' : 'circle' },
//         { label: 'Portuguese', action: 'changeLocale', value: 'pt', icon: currentLocale.value === 'pt' ? 'check-circle-fill' : 'circle' },
//         { label: 'Turkish', action: 'changeLocale', value: 'tr', icon: currentLocale.value === 'tr' ? 'check-circle-fill' : 'circle' },
//     ]
// };

export function useTools(actions) {
    const handleToolClick = (action, value) => {
        if (!action) return;
        const handler = actions[action];
        if (typeof handler !== 'function') return;
        handler(value);
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
        undo,
        redo,
        paste,
        importFromClipboard,
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