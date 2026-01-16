<script setup>
import { onBeforeUnmount, onMounted } from 'vue';
import { Electron } from '../composables/useElectron';
import { openNewTab, closeTab, activeTabIndex, activeTab, tabs, tabHistory, openTabs, markAsActive, isLastTabOnEmptyState, fileHasUnsavedChanges, handleElectronButtonClick, fileDataCache } from '../composables/useTabs';

const emit = defineEmits([
    'file-new',
    'file-open',
    'file-save',
    'page-blank',
    'page-first',
    'page-last',
    'page-delete'
]);

const openNewBlankPage = () => {
    fileDataCache.value = {
        type: 'blank',
        data: null
    };
    emit('file-new');
};

const electronButtons = [
    { action: 'fullscreen', icon: 'bi-arrows-fullscreen', title: 'Fullscreen' },
    { action: 'minimize', icon: 'bi-dash-lg', title: 'Minimize' },
    { action: 'maximize', icon: 'bi-square', title: 'Maximize' },
    { action: 'close', icon: 'bi-x-lg', title: 'Close' }
];

const onTabClick = (tab, index) => {
    activeTabIndex.value = index;
    tabHistory.value.push(index);
    markAsActive(tab.id);
};

let unsubscribeFileOpen = null;

onMounted(() => {
    if (Electron.value?.onFileOpened) {
        unsubscribeFileOpen = Electron.value.onFileOpened((fileData) => {
            if (!fileData) return;
            if (isLastTabOnEmptyState.value) return;
            openNewTab();
            fileDataCache.value = {
                type: 'file',
                data: fileData
            };
        });
    }
});

onBeforeUnmount(() => {
    unsubscribeFileOpen?.();
    unsubscribeFileOpen = null;
});
</script>
<template>
    <ul class="nav nav-tabs fixed-top" id="appTabs" role="tablist">
        <!-- Nav Menu -->
        <li class="nav-item dropdown">
            <a class="nav-link nav-link-menu" data-bs-toggle="dropdown" href="#" role="button" aria-expanded="false">
                Menu
            </a>
                <ul class="dropdown-menu dropdown-menu-dark">
                    <li><h6 class="dropdown-header">File</h6></li>
                    <li>
                        <a class="dropdown-item small" href="#" @click.prevent="openNewBlankPage">
                            <i class="bi bi-pencil-square me-1"></i>
                            New Blank Page (Ctrl+Shift+N)
                        </a>
                    </li>
                    <li>
                        <a class="dropdown-item small" href="#" @click.prevent="emit('file-open')">
                            <i class="bi bi-folder me-1"></i>
                            Open (Ctrl+O)
                        </a>
                    </li>
                    <li>
                        <a class="dropdown-item small" :class="{ disabled: !fileHasUnsavedChanges(activeTab?.id) || activeTab.emptyState }" href="#" @click.prevent="emit('file-save')">
                            <i class="bi bi-floppy me-1"></i>
                            Save (Ctrl+S)
                        </a>
                    </li>
                    <li><hr class="text-primary my-1"></li>
                    <li><hr class="text-primary my-1"></li>
                    <li><h6 class="dropdown-header">Page</h6></li>
                    <li>
                        <a class="dropdown-item small" :class="{ disabled: activeTab.emptyState }" href="#" @click.prevent="emit('page-blank')">
                            <i class="bi bi-file-earmark me-1"></i>
                            Insert Blank Page
                        </a>
                    </li>
                    <li>
                        <a class="dropdown-item small" :class="{ disabled: activeTab.emptyState }" href="#" @click.prevent="emit('page-first')">
                            <i class="bi bi-chevron-double-up me-1"></i>
                            First Page (Home)
                        </a>
                    </li>
                    <li>
                        <a class="dropdown-item small" :class="{ disabled: activeTab.emptyState }" href="#" @click.prevent="emit('page-last')">
                            <i class="bi bi-chevron-double-down me-1"></i>
                            Last Page (End)
                        </a>
                    </li>
                    <li>
                        <a class="dropdown-item small" :class="{ disabled: activeTab.emptyState, 'text-danger': !activeTab.emptyState }" href="#" @click.prevent="emit('page-delete')">
                            <i class="bi bi-trash3 me-1"></i>
                            Delete Page (Del)
                        </a>
                    </li>
                </ul>
        </li>
        <template v-for="(tab, index) in tabs" :key="tab">
            <li class="nav-item" role="presentation" v-if="!tab.closed">
                <button class="nav-link" :class="{ active: index === activeTabIndex }" type="button" role="tab" @click="onTabClick(tab, index)">
                    <div class="d-flex align-items-center">
                        <div class="text-truncate flex-fill">
                            <span class="align-top fs-5 lh-1" v-if="fileHasUnsavedChanges(tab.id)">*</span>
                            {{ tab.filename }}
                        </div>
                        <i class="bi bi-x-lg d-none d-lg-block" v-if="(index === activeTabIndex && !isLastTabOnEmptyState) || openTabs.length > 1" @click.stop.prevent="closeTab(index)"></i>
                    </div>
                </button>
            </li>
        </template>
        <li class="nav-item d-none d-lg-block" role="presentation">
            <button class="nav-link nav-add" id="add-tab" type="button" role="tab" aria-selected="false" :disabled="isLastTabOnEmptyState" @click="openNewTab">
                <i class="bi bi-plus-lg"></i>
            </button>
        </li>
        <div class="btn-group position-absolute end-0 top-0" v-if="Electron">
            <template v-for="btn in electronButtons">
                <button :class="`btn btn-electron ${btn.action}`" type="button" role="tab" aria-selected="false" @click="handleElectronButtonClick(btn.action)" :title="btn.title">
                    <i :class="btn.icon"></i>
                </button>
            </template>
        </div>
    </ul>
    <div class="tab-content" id="appTabContent">
        <template v-for="(tab, index) in tabs">
            <div class="tab-pane" :class="{ 'active show': index === activeTabIndex }" tabindex="0" v-if="!tab.closed">
                <slot></slot>
            </div>
        </template>
    </div>
</template>
