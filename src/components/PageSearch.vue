<script setup>
import { ref, watch, computed, onUnmounted } from 'vue';
import BsToast from './BsToast.vue';

// Define props to receive the necessary data from parent
const props = defineProps({
    disabled: Boolean,
    fileid: String,
    pages: { type: Object, required: true },
    scrollToPage: { type: Function },
    searchTextIndex: { type: Function }
});

const searchToolbar = ref(null);
const search = ref(null);
const caseSensitive = ref(false);
const wholeWords = ref(false);
const currentMatchIndex = ref(0);
const allMatches = ref([]);
const isSearching = ref(false);
let latestSearchToken = 0;
let searchDebounceTimeout = null;

const showSearch = () => {
    if (props.disabled) return;
    if (searchToolbar.value) {
        searchToolbar.value.show();
        const toast = searchToolbar.value.getElement();
        const input = toast.querySelector('input[type="search"]');
        if (input) {
            input.focus();
        }
    }
};

const totalMatches = computed(() => allMatches.value.length);

const performSearch = async (resetIndex = true) => {
    const token = ++latestSearchToken;

    // Store current match details if we want to preserve position
    let previousMatch = null;
    if (!resetIndex && currentMatchIndex.value > 0 && allMatches.value.length > 0) {
        previousMatch = allMatches.value[currentMatchIndex.value - 1];
    }

    allMatches.value = [];
    if (resetIndex) {
        currentMatchIndex.value = 0;
    }
    
    // Clear existing DOM highlights first
    clearDomHighlights();

    const searchTerm = search.value;
    if (!searchTerm) return;

    if (typeof props.searchTextIndex === 'function') {
        isSearching.value = true;
        try {
            allMatches.value = await props.searchTextIndex(searchTerm, {
                caseSensitive: caseSensitive.value,
                wholeWords: wholeWords.value,
                onPartial: (partialMatches) => {
                    if (token !== latestSearchToken) return;
                    allMatches.value = partialMatches;
                }
            });
            if (token !== latestSearchToken) return;
        } catch (error) {
            if (token !== latestSearchToken) return;
            const message = error?.message || '';
            if (!message.includes('Search superseded')) {
                console.error('Search failed:', error);
            }
            return;
        } finally {
            if (token === latestSearchToken) {
                isSearching.value = false;
            }
        }
    }

    if (allMatches.value.length > 0) {
        if (resetIndex) {
            currentMatchIndex.value = 1;
            highlightCurrentMatch();
        } else if (previousMatch) {
            // Try to find the previous match in the new list
            const newIndex = allMatches.value.findIndex(m => 
                m.pageIndex === previousMatch.pageIndex && 
                m.itemIndex === previousMatch.itemIndex && 
                m.matchIndex === previousMatch.matchIndex
            );
            
            if (newIndex !== -1) {
                 // Update index to match the new array position
                currentMatchIndex.value = newIndex + 1;
            } else {
                // Determine where we should be relative to pages
                // If the previous match is gone, find the nearest one after it
                 const nextBest = allMatches.value.findIndex(m => 
                    (m.pageIndex > previousMatch.pageIndex) || 
                    (m.pageIndex === previousMatch.pageIndex && m.itemIndex > previousMatch.itemIndex)
                );
                
                if (nextBest !== -1) {
                    currentMatchIndex.value = nextBest + 1;
                } else {
                     // No matches after, go to last
                    currentMatchIndex.value = allMatches.value.length;
                }
            }
            // Re-highlight just in case DOM changed
             highlightCurrentMatch();
        } else {
            // If we weren't resetting but had no valid previous match, default to 1
             currentMatchIndex.value = 1;
             highlightCurrentMatch();
        }
    }
};

const highlightCurrentMatch = () => {
    if (totalMatches.value === 0) return;
    
    const match = allMatches.value[currentMatchIndex.value - 1];
    
    // 1. Scroll to the page containing the match
    // This will trigger lazy loading in useFileActions.js if the page isn't rendered
    if (props.scrollToPage) {
        props.scrollToPage(match.pageIndex);
    }

    // 2. Wait for DOM to update/render, then apply highlight
    setTimeout(() => {
        applyVisualHighlight(match);
    }, 100); 
};

const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

const getPageDataAttribute = (match) => {
    const page = props.pages?.[match.pageIndex];
    if (page?.id) {
        return String(page.id);
    }

    // Fallback for numeric data-page values
    return String(match.pageIndex + 1);
};

const applyVisualHighlight = (match, retryCount = 0) => {
    // Stop retrying after 3 seconds (30 * 100ms)
    if (retryCount > 30) return;

    // Clean up previous highlights on the UI
    const activeHighlights = document.querySelectorAll('mark.search-highlight');
    activeHighlights.forEach(el => {
        // Restore parent span text
        const parent = el.parentNode;
        if (parent && parent.dataset.originalText) {
            parent.innerHTML = parent.dataset.originalText;
        }
    });

    const pageDataAttr = getPageDataAttribute(match);
    const textLayer = document.querySelector(`.page-container[data-page="${pageDataAttr}"] .text-layer`);
    
    if (!textLayer) {
        // Should rarely happen as containers are pre-created
        setTimeout(() => applyVisualHighlight(match, retryCount + 1), 100);
        return;
    }

    const spans = textLayer.querySelectorAll('span');
    // If no spans, text layer probably hasn't rendered yet
    if (spans.length === 0) {
        setTimeout(() => applyVisualHighlight(match, retryCount + 1), 100);
        return;
    }

    let targetSpan = spans[match.itemIndex];

    // Validation: Ensure the span content matches the matched string to handle index misalignments
    if (!targetSpan || targetSpan.textContent !== match.str) {
        // Attempt to find the correct span in the vicinity
        const range = 50; 
        for (let i = 1; i < range; i++) {
            // Check forward
            if (match.itemIndex + i < spans.length) {
                const s = spans[match.itemIndex + i];
                if (s.textContent === match.str) {
                    targetSpan = s;
                    break;
                }
            }
            // Check backward
            if (match.itemIndex - i >= 0) {
                const s = spans[match.itemIndex - i];
                if (s.textContent === match.str) {
                    targetSpan = s;
                    break;
                }
            }
        }
    }

    if (targetSpan) {
        // Prepare highlighted HTML
        if (!targetSpan.dataset.originalText) {
            targetSpan.dataset.originalText = targetSpan.innerHTML;
        }

        const text = match.str;
        const start = match.matchIndex;
        const length = match.matchLength;
        
        const pre = text.substring(0, start);
        const highlighted = text.substring(start, start + length);
        const post = text.substring(start + length);
        
        targetSpan.innerHTML = `${escapeHtml(pre)}<mark class="search-highlight">${escapeHtml(highlighted)}</mark>${escapeHtml(post)}`;

        // Helper to find the mark for scrolling
        const mark = targetSpan.querySelector('mark');
        if (mark) {
            mark.scrollIntoView({ block: 'center' });
        }
    } else {
         // Span match not found, could be misalignment or logic error, but might appearing late?
         setTimeout(() => applyVisualHighlight(match, retryCount + 1), 100);
    }
};

const clearDomHighlights = () => {
    // Simplified cleanup for this example
    document.querySelectorAll('mark.search-highlight').forEach(el => {
         const parent = el.parentNode;
        if (parent && parent.dataset.originalText) {
            parent.innerHTML = parent.dataset.originalText;
        }
    });
};

const goToNextMatch = () => {
    if (totalMatches.value === 0) return;
    if (currentMatchIndex.value < totalMatches.value) {
        currentMatchIndex.value++;
    } else {
        currentMatchIndex.value = 1;
    }
    highlightCurrentMatch();
};

const goToPreviousMatch = () => {
    if (totalMatches.value === 0) return;
    if (currentMatchIndex.value > 1) {
        currentMatchIndex.value--;
    } else {
        currentMatchIndex.value = totalMatches.value;
    }
    highlightCurrentMatch();
};

watch([search, caseSensitive, wholeWords], () => {
    if (searchDebounceTimeout) {
        clearTimeout(searchDebounceTimeout);
    }

    searchDebounceTimeout = setTimeout(() => {
        performSearch(true);
    }, 180);
});

onUnmounted(() => {
    if (searchDebounceTimeout) {
        clearTimeout(searchDebounceTimeout);
        searchDebounceTimeout = null;
    }

    isSearching.value = false;
});

defineExpose({
    search,
    caseSensitive,
    wholeWords
});
</script>
<template>
<li class="nav-item btn-group">
    <a class="nav-link" :class="{ disabled }" href="#" @click="showSearch" :title="$t('Search')">
        <i class="bi bi-search"></i>
    </a>
    <bs-toast ref="searchToolbar" :id="`search-toolbar-${fileid}`">
        <div class="d-flex align-items-start gap-2">
            <div>
                <div class="d-flex gap-2">
                    <div class="position-relative">
                        <i class="bi bi-search text-dark position-absolute top-50 start-0 translate-middle-y ps-2"></i>
                        <input type="search" class="form-control rounded-3 ps-4" :placeholder="`${$t('Search')}...`" @keydown.enter.prevent="goToNextMatch" v-model="search" />
                    </div>
                    <div class="d-flex gap-1 mb-2 align-items-center">
                        <span>{{ currentMatchIndex }}</span>
                        <span>/</span>
                        <span>{{ totalMatches }}</span>
                        <span v-if="isSearching" class="small text-muted ms-1">searching...</span>
                    </div>
                </div>
                <div class="d-flex align-items-center justify-content-between gap-4 mt-2">
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" id="searchCaseSensitive" v-model="caseSensitive">
                        <label class="form-check-label small text-nowrap ms-1" for="searchCaseSensitive">{{ $t('Case Sensitive') }}</label>
                    </div>
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" id="searchWholeWords" v-model="wholeWords">
                        <label class="form-check-label small text-nowrap ms-1" for="searchWholeWords">{{ $t('Whole Words') }}</label>
                    </div>
                </div>
            </div>
            <div class="vr bg-primary"></div>
            <ul class="navbar-nav flex-column gap-1">
                <li class="nav-item">
                    <a href="#" class="nav-link" :class="{ disabled: !totalMatches }" :title="$t('Previous')" @click.prevent="goToPreviousMatch">
                        <i class="bi bi-chevron-up"></i>
                    </a>
                </li>
                <li class="nav-item">
                    <a href="#" class="nav-link" :class="{ disabled: !totalMatches }" :title="$t('Next')" @click.prevent="goToNextMatch">
                        <i class="bi bi-chevron-down"></i>
                    </a>
                </li>
            </ul>
            <button type="button" class="btn-close small ms-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    </bs-toast>
</li>
</template>