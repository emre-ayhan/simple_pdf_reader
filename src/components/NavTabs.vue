<script setup>
import { ref, computed } from 'vue';

const defaultTab = 'Simple PDF Reader';
const tabs = ref([defaultTab]);
const activeTabIndex = ref(0);
const closedTabs = ref([]);

const activeTabs = computed(() => {
    return tabs.value.filter(tab => !closedTabs.value.includes(tab));
});

const isLastTabDefault = computed(() => {
    return activeTabs.value[activeTabs.value.length - 1] === defaultTab;
});

const addTab = (filename) => {
    tabs.value[tabs.value.length - 1] = filename;
};

const addNewTab = () => {
    if (isLastTabDefault.value) return;
    tabs.value.push(defaultTab);
    activeTabIndex.value = tabs.value.length - 1;
};

const closeTab = (index) => {
    if (tabs.value[index]) {
        const tab = tabs.value[index];

        if (tab === defaultTab) {
            tabs.value.splice(index, 1);
        } else {
            closedTabs.value.push(tab);
        }

        const lastNotClosedIndex = tabs.value.findIndex((tab, i) => !closedTabs.value.includes(tab) && i >= index);
        activeTabIndex.value = Math.max(0, lastNotClosedIndex);
    }
};

defineExpose({
    addTab,
    closeTab
});
</script>
<template>
    <ul class="nav nav-tabs fixed-top" id="appTabs" role="tablist">
            <template v-for="(tab, index) in tabs" :key="tab">
                <li class="nav-item" role="presentation" v-if="!closedTabs.includes(tab)">
                    <button class="nav-link" :class="{ active: index === activeTabIndex }" type="button" role="tab" @click="activeTabIndex = index">
                        <div class="d-flex align-items-center">
                            <div class="text-truncate flex-fill">
                                {{ tab }}
                            </div>
                            <i class="bi bi-x-lg" v-if="index === activeTabIndex && activeTabs.length > 1" @click.stop.prevent="closeTab(index)"></i>
                        </div>
                    </button>
                </li>
            </template>
            <li class="nav-item" role="presentation">
                <button class="nav-link nav-add" id="add-tab" type="button" role="tab" aria-selected="false" :disabled="isLastTabDefault" @click="addNewTab">
                    <i class="bi bi-plus-lg"></i>
                </button>
            </li>
        </ul>
        <div class="tab-content" id="appTabContent">
            <template v-for="(tab, index) in tabs">
                <div class="tab-pane" :class="{ 'active show': index === activeTabIndex }" tabindex="0" v-if="!closedTabs.includes(tab)">
                    <slot></slot>
                </div>
            </template>
        </div>
</template>
<style>
body, #app, .container-fluid {
    margin: 0;
    padding: 0;
    overflow: hidden;
}


.nav-tabs, .nav-tabs .nav-item {
    border: 0 !important;
    margin: 0 !important;
    font-size: small !important;
}

.nav-add:disabled {
    color: var(--bs-secondary) !important;
}

.nav-tabs .nav-link:not(.nav-add) {
    width: 200px !important;
}
.nav-tabs .nav-link {
    border-top-left-radius: var(--bs-border-radius-lg) !important;
    border-top-right-radius: var(--bs-border-radius-lg) !important;
    color: var(--bs-secondary);
    padding: .25rem .75rem;
}

.nav-tabs .nav-link:hover {
    color: var(--bs-light) !important;
}

.nav-tabs .nav-link.active {
    background-color: var(--bs-dark) !important;
    color: var(--bs-light) !important;
    border-bottom: 0 !important;
}
</style>