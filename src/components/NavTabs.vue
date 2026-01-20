<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue';
import { Electron } from '../composables/useElectron';
import { openNewTab, closeTab, activeTabIndex, activeTab, tabs, tabHistory, openTabs, markAsActive, isLastTabOnEmptyState, fileHasUnsavedChanges, activePageHasUnsavedChanges, handleElectronButtonClick, fileDataCache } from '../composables/useTabs';

const props = defineProps({
    toolbarPosition: {
        type: String,
        default: 'top',
        validator: (value) => ['top', 'bottom'].includes(value)
    }
});

const emit = defineEmits([
    'menu-item-click'
]);

const currentLocale = inject('currentLocale');

const menuItems = computed(() => ({
    file: [
        { label: 'New Blank Page', action: 'openNewBlankPage', icon: 'pencil-square' },
        { label: 'Open', action: 'openFile', icon: 'folder', shortcut: 'Ctrl+O' },
        { label: 'Save', action: 'saveFile', icon: 'floppy', shortcut: 'Ctrl+S', disabled: !activePageHasUnsavedChanges.value }
    ],
    page: [
        { label: 'Insert Blank After', action: 'insertBlankPage', icon: 'file-earmark-arrow-down' },
        { label: 'First Page', action: 'scrollToFirstPage', icon: 'chevron-double-up', shortcut: 'Home' },
        { label: 'Last Page', action: 'scrollToLastPage', icon: 'chevron-double-down', shortcut: 'End' },
        { label: 'Delete', action: 'deletePage', icon: 'trash3' }
    ],
    pereferences: [
        { label: `Move Toolbar to ${props.toolbarPosition === 'top' ? 'Bottom' : 'Top'}`, action: 'toggleToolbarPosition', icon: props.toolbarPosition === 'top' ? 'arrow-down-square' : 'arrow-up-square' },
        { label: 'Language', icon: 'translate', items: [
                { label: 'English', action: 'changeLocale', value: 'en', icon: currentLocale.value === 'en' ? 'check-circle-fill' : 'circle' },
                { label: 'Turkish', action: 'changeLocale', value: 'tr', icon: currentLocale.value === 'tr' ? 'check-circle-fill' : 'circle' }
            ]
        }
    ]
}));

const electronButtons = [
    { action: 'fullscreen', icon: 'arrows-fullscreen', title: 'Fullscreen' },
    { action: 'minimize', icon: 'dash-lg', title: 'Minimize' },
    { action: 'maximize', icon: 'square', title: 'Maximize' },
    { action: 'close', icon: 'x-lg', title: 'Close' }
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
    <ul :class="`nav nav-tabs fixed-${props.toolbarPosition} ${activeTab.emptyState ? 'empty-state' : ''}`" id="appTabs" role="tablist">
        <!-- Nav Menu -->
        <li class="nav-item dropdown">
            <a class="nav-link nav-link-menu" data-bs-toggle="dropdown" href="#" role="button" data-bs-auto-close="outside" aria-expanded="false">
                Menu
            </a>
                <ul class="dropdown-menu dropdown-menu-dark rounded-3">
                    <template v-for="(item, group, index) in menuItems">
                        <li v-if="index"><hr class="text-primary my-1"></li>
                        <li><h6 class="dropdown-header text-capitalize text-primary">{{ $t(group) }}</h6></li>
                        <template v-for="menuItem in item">
                            <li>
                                <template v-if="menuItem.items">
                                    <div class="dropend">
                                        <button class="dropdown-item small dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                                            <i :class="`bi bi-${menuItem.icon} me-1`"></i>
                                            {{ $t(menuItem.label) }}
                                        </button>
                                        <ul class="dropdown-menu dropdown-menu-dark rounded-3">
                                            <template v-for="subItem in menuItem.items">
                                                <li>
                                                    <a class="dropdown-item small" :class="{ disabled: activeTab.emptyState && group === 'page' || subItem.disabled }" href="#" @click.prevent="emit('menu-item-click', subItem.action, subItem.value)">
                                                        <i :class="`bi bi-${subItem.icon} me-1`"></i>
                                                        {{ $t(subItem.label) }} <span v-if="subItem.shortcut">({{ subItem.shortcut }})</span>
                                                    </a>
                                                </li>
                                            </template>
                                        </ul>
                                    </div>
                                </template>

                                <a class="dropdown-item small" :class="{ disabled: activeTab.emptyState && group === 'page' || menuItem.disabled }" href="#" @click.prevent="emit('menu-item-click', menuItem.action, menuItem.value)" v-else>
                                    <i :class="`bi bi-${menuItem.icon} me-1`"></i>
                                    {{ $t(menuItem.label) }} <span v-if="menuItem.shortcut">({{ menuItem.shortcut }})</span>
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
                            {{ $t(tab.filename) }}
                        </div>
                        <i class="bi bi-x-lg" v-if="(index === activeTabIndex && !isLastTabOnEmptyState) || openTabs.length > 1" @click.stop.prevent="closeTab(index)" :title="$t('Close')"></i>
                    </div>
                </button>
            </li>
        </template>
        <li class="nav-item" role="presentation">
            <button class="nav-link nav-add" id="add-tab" type="button" role="tab" aria-selected="false" :disabled="isLastTabOnEmptyState" @click="openNewTab" :title="$t('New Tab')">
                <i class="bi bi-plus-lg"></i>
            </button>
        </li>
        <div class="btn-group position-absolute end-0 top-0" v-if="Electron">
            <template v-for="btn in electronButtons">
                <button :class="`btn btn-electron ${btn.action}`" type="button" role="tab" aria-selected="false" @click="handleElectronButtonClick(btn.action)" :title="$t(btn.title)">
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
