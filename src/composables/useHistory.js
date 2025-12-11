import { ref, markRaw, computed } from 'vue';

const sessions = ref({});

const fileHasUnsavedChanges = (fileId) => {
    const session = sessions.value[fileId];
    
    if (!session) return false;
    return session.historyStep !== session.savedHistoryStep;
}

export function useHistory(undoHandler, redoHandler) {
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
        if (typeof undoHandler === 'function') {
            undoHandler(action);
        }
        
        historyStep.value--;
    };

    const redo = () => {
        if (!canRedo.value) return;
        
        historyStep.value++;
        const action = history.value[historyStep.value];
        if (typeof redoHandler === 'function') {
            redoHandler(action);
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
