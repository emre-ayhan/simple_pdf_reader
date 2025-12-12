import { ref, markRaw, computed } from 'vue';

const sessions = ref({});

const fileHasUnsavedChanges = (fileId) => {
    const session = sessions.value[fileId];
    
    if (!session) return false;
    return session.historyStep !== session.savedHistoryStep;
}

export function useHistory(strokesPerPage, redrawAllStrokes, drawingCanvases, drawingContexts) {
    const history = ref([]);
    const historyStep = ref(-1);
    const savedHistoryStep = ref(-1);

    const startSession = (fileId) => {
        if (!sessions.value[fileId]) {
            sessions.value[fileId] = {
                history,
                historyStep,
                savedHistoryStep
            };
        }
    };

    const endSession = (fileId) => {
        if (sessions.value[fileId]) {
            delete sessions.value[fileId];
        }
    };

    const addToHistory = (action) => {
        if (historyStep.value < history.value.length - 1) {
            // If we are branching off and the saved state is in the future (or overwritten), invalidate it
            if (savedHistoryStep.value > historyStep.value) {
                savedHistoryStep.value = -2;
            }
            history.value = history.value.slice(0, historyStep.value + 1);
        }
        history.value.push(markRaw(action));
        historyStep.value++;
    };

    const canUndo = computed(() => historyStep.value >= 0);
    const canRedo = computed(() => historyStep.value < history.value.length - 1);

    const undo = () => {
        if (!canUndo.value) return;
        
        const action = history.value[historyStep.value];
        
        console.log('Undo action:', action.type);
    
        if (action.type === 'add') {
            const strokes = strokesPerPage.value[action.page];
            if (strokes) {
                const index = strokes.indexOf(action.stroke);
                if (index > -1) {
                    strokes.splice(index, 1);
                } else {
                    console.warn('Stroke not found for undo');
                }
            }
            redrawAllStrokes(action.page - 1);
        } else if (action.type === 'erase') {
            const strokes = strokesPerPage.value[action.page];
            if (strokes) {
                const toRestore = [...action.strokes].sort((a, b) => a.index - b.index);
                toRestore.forEach(item => {
                    strokes.splice(item.index, 0, item.data);
                });
            }
            redrawAllStrokes(action.page - 1);
        } else if (action.type === 'clear') {
            strokesPerPage.value = JSON.parse(JSON.stringify(action.previousState));
            for (let i = 0; i < drawingCanvases.value.length; i++) {
                redrawAllStrokes(i);
            }
        }
        
        historyStep.value--;
    };

    const redo = () => {
        if (!canRedo.value) return;
        
        historyStep.value++;
        const action = history.value[historyStep.value];
        
        if (action.type === 'add') {
            if (!strokesPerPage.value[action.page]) strokesPerPage.value[action.page] = [];
            strokesPerPage.value[action.page].push(action.stroke);
            redrawAllStrokes(action.page - 1);
        } else if (action.type === 'erase') {
            const strokes = strokesPerPage.value[action.page];
            if (strokes) {
                action.strokes.forEach(item => {
                    const index = strokes.indexOf(item.data);
                    if (index > -1) {
                        strokes.splice(index, 1);
                    }
                });
            }
            redrawAllStrokes(action.page - 1);
        } else if (action.type === 'clear') {
            strokesPerPage.value = {};
            for (let i = 0; i < drawingCanvases.value.length; i++) {
                const canvas = drawingCanvases.value[i];
                const ctx = drawingContexts.value[i];
                if (canvas && ctx) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                }
            }
        }
    };

    const resetHistory = () => {
        history.value = [];
        historyStep.value = -1;
        savedHistoryStep.value = -1;
    };

    const markSaved = () => {
        savedHistoryStep.value = historyStep.value;
    };

    const hasUnsavedChanges = computed(() => {
        return historyStep.value !== savedHistoryStep.value;
    });

    return {
        startSession,
        endSession,
        sessions,
        history,
        historyStep,
        savedHistoryStep,
        addToHistory,
        undo,
        redo,
        canUndo,
        canRedo,
        hasUnsavedChanges,
        resetHistory,
        markSaved,
        fileHasUnsavedChanges
    };
}
