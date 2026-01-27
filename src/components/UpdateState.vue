<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Electron } from '../composables/useElectron';

const updateState = ref({
    statusText: '',
    percent: 0,
    phase: 'idle', // idle | available | downloading | downloaded | error | checking
});

const statusTexts = {
    idle: '',
    checking: 'Checking for updates…',
    available: 'Update available.',
    downloading: 'Downloading update…',
    downloaded: 'Update downloaded. Ready to install.',
    error: 'Update error. See logs for details.'
};

const setUpdateState = (phase) => {
    const visible = phase !== 'idle' && phase !== 'not-available';
    const statusText = statusTexts[phase] || '';
    updateState.value = { ...updateState.value, visible, phase, statusText};
}

const updateBarStyle = computed(() => ({
    width: `${Math.max(0, Math.min(100, updateState.value.percent || 0))}%`
}));

// const showUpdateActions = computed(() => updateState.value.phase === 'available' || updateState.value.phase === 'downloaded');
// const showDownloadButton = computed(() => updateState.value.phase === 'available');
// const showInstallButton = computed(() => updateState.value.phase === 'downloaded');

// const downloadUpdate = async () => {
//     if (!Electron.value?.update?.download) return;
//     await Electron.value.update.download();
// }

// const installUpdate = async () => {
//     if (!Electron.value?.update?.install) return;
//     await Electron.value.update.install();
// }

// const dismissUpdateBanner = () => {
//     updateState.value = { ...updateState.value, visible: false };
// }

let unsubUpdateStatus = null;
let unsubUpdateProgress = null;

onMounted(() => {
    const api = Electron.value;
    if (!api?.onUpdateStatus || !api?.onUpdateProgress) return;

    unsubUpdateStatus = api.onUpdateStatus((payload) => {
        const state = payload?.state;
        if (typeof state !== 'string') return;
        setUpdateState(state);
    });

    unsubUpdateProgress = api.onUpdateProgress((payload) => {
        const percent = typeof payload?.percent === 'number' ? payload.percent : updateState.value.percent;
        setUpdateState('downloading');
        updateState.value.percent = percent;
    });
});

onUnmounted(() => {
    try { unsubUpdateStatus?.(); } catch {}
    try { unsubUpdateProgress?.(); } catch {}
});
</script>
<template>
<div class="position-fixed bottom-0 start-0 end-0 p-2 z-3" v-if="updateState.visible">
    <div class="bg-dark text-white rounded shadow p-2">
        <div class="d-flex align-items-center justify-content-between gap-2">
            <div class="small text-capitalize">{{ updateState.statusText }}</div>
            <div class="small text-nowrap" v-if="updateState.percent">{{ Math.round(updateState.percent) }}%</div>
        </div>
        <div class="progress mt-2" style="height: 6px;">
            <div class="progress-bar" role="progressbar" :style="updateBarStyle"></div>
        </div>
        <!-- <div class="d-flex justify-content-end gap-2 mt-2" v-if="showUpdateActions">
            <button v-if="showDownloadButton" class="btn btn-sm btn-primary" type="button" @click="downloadUpdate">
                Download Update
            </button>
            <button v-if="showInstallButton" class="btn btn-sm btn-success" type="button" @click="installUpdate">
                Install & Restart
            </button>
            <button class="btn btn-sm btn-outline-light" type="button" @click="dismissUpdateBanner">
                Later
            </button>
        </div> -->
    </div>
</div>
</template>