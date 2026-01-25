<script setup>
import NavTabs from './components/NavTabs.vue';
import PdfReader from './components/PdfReader.vue';
import PageModal from './components/PageModal.vue';
import { computed, inject, onBeforeMount, onMounted, onUnmounted, ref } from 'vue';
import { useStore } from './composables/useStore';
import { toggleTouchDrawing } from './composables/useTouchDrawing';

const store = useStore();
const reader = ref(null);
const toolbarPosition = ref('top');
const changeLocale = inject('changeLocale');

const updateState = ref({
    visible: false,
    statusText: '',
    percent: 0,
    phase: 'idle', // idle | available | downloading | downloaded | error | checking
});

const updateBarStyle = computed(() => ({
    width: `${Math.max(0, Math.min(100, updateState.value.percent || 0))}%`
}));

const showUpdateActions = computed(() => updateState.value.phase === 'available' || updateState.value.phase === 'downloaded');
const showDownloadButton = computed(() => updateState.value.phase === 'available');
const showInstallButton = computed(() => updateState.value.phase === 'downloaded');

const downloadUpdate = async () => {
    const api = window?.electronAPI;
    if (!api?.update?.download) return;
    await api.update.download();
}

const installUpdate = async () => {
    const api = window?.electronAPI;
    if (!api?.update?.install) return;
    await api.update.install();
}

const dismissUpdateBanner = () => {
    updateState.value = { ...updateState.value, visible: false };
}

const appHandlers = {
    toggleToolbarPosition() {
        const newPosition = toolbarPosition.value === 'top' ? 'bottom' : 'top';
        store.set('toolbarPosition', newPosition);
        toolbarPosition.value = newPosition;
    },
    changeLocale,
    toggleTouchDrawing
}

const menuItemClickHandler = (action, value) => {
    if (!reader.value || !action) return;
    const handler = reader.value[action] || appHandlers[action];
    if (typeof handler !== 'function') return;
    handler(value);
}

onBeforeMount(() => {
    store.get('toolbarPosition', 'top').then(position => {
        toolbarPosition.value = position;
    });
})

let unsubUpdateStatus = null;
let unsubUpdateProgress = null;

onMounted(() => {
    const api = window?.electronAPI;
    if (!api?.onUpdateStatus || !api?.onUpdateProgress) return;

    unsubUpdateStatus = api.onUpdateStatus((payload) => {
        const state = payload?.state;
        if (state === 'available') {
            updateState.value = { ...updateState.value, visible: true, phase: 'available', statusText: 'Update available.' };
        } else if (state === 'downloading') {
            updateState.value = { ...updateState.value, visible: true, phase: 'downloading', statusText: 'Downloading update…' };
        } else if (state === 'downloaded') {
            updateState.value = { ...updateState.value, visible: true, phase: 'downloaded', statusText: 'Update downloaded. Ready to install.', percent: 100 };
        } else if (state === 'checking') {
            updateState.value = { ...updateState.value, visible: true, phase: 'checking', statusText: 'Checking for updates…' };
        } else if (state === 'not-available') {
            updateState.value = { ...updateState.value, visible: false, phase: 'idle', statusText: '', percent: 0 };
        } else if (state === 'deferred') {
            // User chose "Later" in the dialog; keep a banner so they can download from the UI.
            updateState.value = { ...updateState.value, visible: true, phase: 'available', statusText: 'Update available.', percent: 0 };
        } else if (state === 'error') {
            updateState.value = { ...updateState.value, visible: true, phase: 'error', statusText: 'Update error. See logs for details.' };
        }
    });

    unsubUpdateProgress = api.onUpdateProgress((payload) => {
        const percent = typeof payload?.percent === 'number' ? payload.percent : updateState.value.percent;
        updateState.value = {
            ...updateState.value,
            visible: true,
            percent,
            phase: 'downloading',
            statusText: 'Downloading update…'
        };
    });
});

onUnmounted(() => {
    try { unsubUpdateStatus?.(); } catch {}
    try { unsubUpdateProgress?.(); } catch {}
});
</script>
<template>
    <nav-tabs @menu-item-click="menuItemClickHandler" :toolbar-position="toolbarPosition">
        <PdfReader ref="reader" :toolbar-position="toolbarPosition" />
    </nav-tabs>
    <PageModal />

    <div
        v-if="updateState.visible"
        class="position-fixed bottom-0 start-0 end-0 p-2"
        style="z-index: 2000;"
    >
        <div class="bg-dark text-white rounded shadow p-2">
            <div class="d-flex align-items-center justify-content-between gap-2">
                <div class="small">{{ updateState.statusText }}</div>
                <div class="small text-nowrap" v-if="updateState.percent">{{ Math.round(updateState.percent) }}%</div>
            </div>
            <div class="progress mt-2" style="height: 6px;">
                <div class="progress-bar" role="progressbar" :style="updateBarStyle"></div>
            </div>

            <div class="d-flex justify-content-end gap-2 mt-2" v-if="showUpdateActions">
                <button v-if="showDownloadButton" class="btn btn-sm btn-primary" type="button" @click="downloadUpdate">
                    Download update
                </button>
                <button v-if="showInstallButton" class="btn btn-sm btn-success" type="button" @click="installUpdate">
                    Install & restart
                </button>
                <button class="btn btn-sm btn-outline-light" type="button" @click="dismissUpdateBanner">
                    Later
                </button>
            </div>
        </div>
    </div>
</template>