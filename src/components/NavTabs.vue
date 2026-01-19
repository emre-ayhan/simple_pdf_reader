<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { Electron } from '../composables/useElectron';
import { openNewTab, closeTab, activeTabIndex, activeTab, tabs, tabHistory, openTabs, markAsActive, isLastTabOnEmptyState, fileHasUnsavedChanges, activePageHasUnsavedChanges, handleElectronButtonClick, fileDataCache } from '../composables/useTabs';

const emit = defineEmits([
    'menu-item-click'
]);

const menuItems = computed(() => ({
    file: [
        { label: 'New Blank Page', action: 'openNewBlankPage', icon: 'bi-pencil-square' },
        { label: 'Open', action: 'openFile', icon: 'bi-folder', shortcut: 'Ctrl+O' },
        { label: 'Save', action: 'saveFile', icon: 'bi-floppy', shortcut: 'Ctrl+S', disabled: !activePageHasUnsavedChanges.value }
    ],
    page: [
        { label: 'Insert Blank After', action: 'insertBlankPage', icon: 'bi-file-earmark-arrow-down' },
        { label: 'First Page', action: 'scrollToFirstPage', icon: 'bi-chevron-double-up', shortcut: 'Home' },
        { label: 'Last Page', action: 'scrollToLastPage', icon: 'bi-chevron-double-down', shortcut: 'End' },
        { label: 'Delete', action: 'deletePage', icon: 'bi-trash3' }
    ],
    pereferences: [
        { label: 'Settings', action: 'openSettings', icon: 'bi-gear' },
        { label: 'About', action: 'openAbout', icon: 'bi-info-circle' }
    ]
}));

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
                    <template v-for="(item, group, index) in menuItems">
                        <li v-if="index"><hr class="text-primary my-1"></li>
                        <li><h6 class="dropdown-header text-capitalize text-primary">{{ group }}</h6></li>
                        <template v-for="menuItem in item">
                            <li>
                                <a class="dropdown-item small" :class="{ disabled: activeTab.emptyState && group === 'page' || menuItem.disabled }" href="#" @click.prevent="emit('menu-item-click', menuItem.action)">
                                    <i :class="`${menuItem.icon} me-1`"></i>
                                    {{ menuItem.label }} <span v-if="menuItem.shortcut">({{ menuItem.shortcut }})</span>
                                </a>
                            </li>
                        </template>
                    </template>
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
