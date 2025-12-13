import { ref, markRaw, computed } from 'vue';

const sessions = ref({});

const fileHasUnsavedChanges = (fileId) => {
    const session = sessions.value[fileId];
    
    if (!session) return false;
    return session.historyStep !== session.savedHistoryStep;
}

const uuid  = () => {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}

export function useHistory(strokesPerPage, drawingCanvases, drawingContexts, redrawAllStrokes) {
    const history = ref([]);
    const historyStep = ref(-1);
    const savedHistoryStep = ref(-1);

    // For temporary actions like live previews
    const temporaryState = ref(false);
    const temporaryHistory = ref([]);
    const temporaryHistoryStep = ref(-1);
    const temporarySavedHistoryStep = ref(-1);

    const fileId = uuid();

    const startSession = () => {
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

    const addToTemporaryHistory = (action) => {
        if (temporaryHistoryStep.value < temporaryHistory.value.length - 1) {
            // If we are branching off and the saved state is in the future (or overwritten), invalidate it
            if (temporarySavedHistoryStep.value > temporaryHistoryStep.value) {
                temporarySavedHistoryStep.value = -2;
            }

            temporaryHistory.value = temporaryHistory.value.slice(0, temporaryHistoryStep.value + 1);
        }

        temporaryHistory.value.push(markRaw(action));
        temporaryHistoryStep.value++;
    };

    const addToHistory = (action) => {
        console.log(action.stroke);
        
        action.stroke.id = uuid();

        if (temporaryState.value) {
            addToTemporaryHistory(action);
            return;
        }

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

    const canUndo = computed(() => {
        if (temporaryState.value) {
            return temporaryHistoryStep.value >= 0
        }

        return historyStep.value >= 0;
    });

    const canRedo = computed(() => {
        if (temporaryState.value) {
            return temporaryHistoryStep.value < temporaryHistory.value.length - 1;
        }

        return historyStep.value < history.value.length - 1;
    });

    const undo = () => {
        if (!canUndo.value) return;
        
        const action = temporaryState.value ? temporaryHistory.value[temporaryHistoryStep.value] : history.value[historyStep.value];
        
        console.log('Undo action:', action.type);

        if (action.type === 'add') {
            const strokes = strokesPerPage.value[action.page];
            console.log(strokes);
            
            if (strokes) {
                const index = strokes.findIndex(s => s.id === action.stroke.id);
                console.log('Undo add action at index:', index);
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
        
        if (temporaryState.value) {
            temporaryHistoryStep.value--;
            return;
        }

        historyStep.value--;
    };

    const redo = () => {
        if (!canRedo.value) return;
        
        var action;

        if (temporaryState.value) {
            temporaryHistoryStep.value++;
            action = temporaryHistory.value[temporaryHistoryStep.value];
        } else {
            historyStep.value++;
            action = history.value[historyStep.value];
        }

        
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
        if (temporaryState.value) {
            temporaryHistory.value = [];
            temporaryHistoryStep.value = -1;
            temporarySavedHistoryStep.value = -1;
            temporaryState.value = false;
            return;
        }

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
        fileId,
        sessions,
        history,
        historyStep,
        savedHistoryStep,
        temporaryState,
        addToHistory,
        undo,
        redo,
        canUndo,
        canRedo,
        hasUnsavedChanges,
        resetHistory,
        markSaved,
        fileHasUnsavedChanges,
    };
}
