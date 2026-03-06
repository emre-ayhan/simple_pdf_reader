<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import NavTabs from './components/NavTabs.vue';
import PdfReader from './components/PdfReader.vue';
import PageModal from './components/PageModal.vue';
import UpdateState from './components/UpdateState.vue';
import DragOverlay from './components/DragOverlay.vue';
import { enableTouchDrawing, moveToolbarBottom, availableLocales, currentLocale, retrieveClipboardData } from './composables/useAppSettings';
import { useDrop } from './composables/useDrop';

const reader = ref(null);

const loadFile = (file) => {
    if (reader.value && typeof reader.value.loadFile === 'function') {
        reader.value.loadFile(file);
    }
}


const tabs = [
    {
        tab: 'Preferences'
    },
    {
        tab: 'Properties',
        action: 'showDocumentProperties'
    }
];

// Drag and Drop Handlers
const {
    isDraggingFile,
    onDrop,
    onDragEnter,
    onDragLeave,
} = useDrop(loadFile);

const menuItemClickHandler = (action, value, callback) => {
    if (typeof callback === 'function') callback();
    if (!reader.value || !action) return;
    const handler = reader.value[action];
    if (typeof handler === 'function') handler(value);
}

onMounted(() => {
    window.addEventListener('focus', retrieveClipboardData);
});

onUnmounted(() => {
    window.removeEventListener('focus', retrieveClipboardData);
});
</script>
<template>
    <div @contextmenu.prevent @dragenter.prevent="onDragEnter" @dragleave.prevent="onDragLeave" @dragover.prevent @drop.prevent="onDrop">
        <nav-tabs @menu-item-click="menuItemClickHandler">
            <PdfReader ref="reader" />
        </nav-tabs>
        <page-modal v-slot="{ data, tab, changeTab }">
            <template v-if="tab">
                <ul class="nav nav-tabs" id="settings">
                    <template v-for="item in tabs">
                        <li class="nav-item">
                            <a class="nav-link" :class="{ active: tab === item.tab }" href="#" @click.prevent="menuItemClickHandler(item.action, null, () => changeTab(item.tab))">
                                {{ $t(item.tab) }}
                            </a>
                        </li>
                    </template>
                </ul>
                <div class="tab-content">
                    <div class="tab-pane show active rounded-bottom">
                        <div class="p-3">
                            <template v-if="tab === 'Preferences'">
                                <div class="row">
                                    <div class="col-2">
                                        {{ $t('Language') }}
                                    </div>
                                    <div class="col-10">
                                        <div class="row">
                                            <div class="col-lg-6">
                                                <select class="form-select bg-primary-subtle" id="changeLanguage" aria-label="change language" v-model="currentLocale">
                                                    <option v-for="locale in availableLocales" :key="locale.locale" :value="locale.locale">
                                                        {{ $t(locale.text) }}
                                                    </option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="col-12"><hr></div>
                                    <div class="col-2">
                                        {{ $t('General') }}
                                    </div>
                                    <div class="col-10">
                                        <div class="mb-3">
                                            <input class="form-check-input me-2" type="checkbox" value="" id="toggleTouchDrawing" v-model="enableTouchDrawing">
                                            <label class="form-check-label" for="toggleTouchDrawing">{{ $t('Enable Touch Drawing') }}</label>
                                        </div>
                                        <div class="mb-3">
                                            <input class="form-check-input me-2" type="checkbox" value="" id="toggleToolbarPosition" v-model="moveToolbarBottom">
                                            <label class="form-check-label" for="toggleToolbarPosition">{{ $t('Move Toolbar to Bottom') }}</label>
                                        </div>
                                    </div>
                                </div>
                            </template>
                            <template v-if="tab === 'Properties'">
                                <table class="table table-sm">
                                    <tbody>
                                        <tr v-for="(value, key) in data">
                                            <th>{{ key }}</th>
                                            <td>{{ value }}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </template>
                        </div>
                    </div>
                </div>
            </template>
        </page-modal>
        <UpdateState />
        <DragOverlay v-if="isDraggingFile" />
    </div>
</template>