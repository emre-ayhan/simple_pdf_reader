<script setup>
import { ref, watch, computed } from 'vue';

// Define props to receive the necessary data from parent
const props = defineProps({
    pageTextContent: { type: Object, required: true },
    pdfReader: { type: Object },
    scrollToPage: { type: Function }
});

const search = ref(null);
const caseSensitive = ref(false);
const wholeWords = ref(false);
const currentMatchIndex = ref(0);
const allMatches = ref([]);

const totalMatches = computed(() => allMatches.value.length);

const performSearch = () => {
    allMatches.value = [];
    currentMatchIndex.value = 0;
    
    // Clear existing DOM highlights first
    clearDomHighlights();

    const searchTerm = search.value;
    if (!searchTerm) return;

    const pageIndices = Object.keys(props.pageTextContent).map(Number).sort((a, b) => a - b);

    // Prepare Regex
    let regex;
    const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const flags = caseSensitive.value ? 'g' : 'gi';
    
    if (wholeWords.value) {
        regex = new RegExp(`\\b${escapedTerm}\\b`, flags);
    } else {
        regex = new RegExp(escapedTerm, flags);
    }

    // Search through the extracted text data
    for (const pageIndex of pageIndices) {
        const content = props.pageTextContent[pageIndex];
        if (!content || !content.items) continue;

        content.items.forEach((item, itemIdx) => {
            if (!item.str) return;
            
            // Reset regex lastIndex for global searches
            regex.lastIndex = 0;
            
            let match;
            // Scan the string for all occurrences
            while ((match = regex.exec(item.str)) !== null) {
                allMatches.value.push({
                    pageIndex: pageIndex,
                    itemIndex: itemIdx,
                    matchIndex: match.index,
                    str: item.str,
                    matchLength: match[0].length
                });
                
                // Prevent infinite loop if match is empty string (though unlikely with proper regex)
                if (match.index === regex.lastIndex) regex.lastIndex++;
                if (!regex.global) break; 
            }
        });
    }

    if (allMatches.value.length > 0) {
        currentMatchIndex.value = 1;
        highlightCurrentMatch();
    }
};

const highlightCurrentMatch = () => {
    if (totalMatches.value === 0) return;
    
    const match = allMatches.value[currentMatchIndex.value - 1];
    
    // 1. Scroll to the page containing the match
    // This will trigger lazy loading in useFile.js if the page isn't rendered
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

    const textLayer = document.querySelector(`.page-container[data-page="${match.pageIndex + 1}"] .text-layer`);
    
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

    const targetSpan = spans[match.itemIndex];

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
            mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

watch([search, caseSensitive, wholeWords], performSearch);
watch(() => props.pageTextContent, () => {
    // If text content loads late, re-run search if we have a term
    if (search.value) performSearch();
}, { deep: true });

defineExpose({
    search,
    caseSensitive,
    wholeWords
});
</script>
<style scoped>
.form-control {
    padding-left: 32px !important;
}
</style>
<style>
.search-highlight {
    background-color: yellow;
    color: black;
    padding: 0;
}
</style>
<template>
<li class="nav-item btn-group">
    <a class="nav-link" href="#" data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-expanded="false" :title="$t('Search')">
        <i class="bi bi-search"></i>
    </a>
    <div class="dropdown-menu dropdown-menu-dark rounded-3 p-2">
        <div class="d-flex align-items-start gap-2">
            <div>
                <div class="d-flex gap-2">
                    <div class="position-relative">
                        <i class="bi bi-search text-dark position-absolute top-50 start-0 translate-middle-y ps-2"></i>
                        <input type="search" class="form-control rounded-3 ps-4" placeholder="Search..." v-model="search" />
                    </div>
                    <div class="d-flex gap-1 mb-2 align-items-center">
                        <span>{{ currentMatchIndex }}</span>
                        <span>/</span>
                        <span>{{ totalMatches }}</span>
                    </div>
                </div>
                <div class="d-flex align-items-center gap-4 mt-2">
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" id="searchCaseSensitive" v-model="caseSensitive">
                        <label class="form-check-label text-nowrap" for="searchCaseSensitive">{{ $t('Case Sensitive') }}</label>
                    </div>
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" id="searchWholeWords" v-model="wholeWords">
                        <label class="form-check-label text-nowrap" for="searchWholeWords">{{ $t('Whole Words') }}</label>
                    </div>
                </div>
            </div>
            <div class="vr bg-white"></div>
            <ul class="navbar-nav">
                <li class="nav-item">
                    <a href="#" class="nav-link" :title="$t('Previous')" @click.prevent="goToPreviousMatch">
                        <i class="bi bi-chevron-up"></i>
                    </a>
                </li>
                <li class="nav-item">
                    <a href="#" class="nav-link" :title="$t('Next')" @click.prevent="goToNextMatch">
                        <i class="bi bi-chevron-down"></i>
                    </a>
                </li>
            </ul>
        </div>
    </div>
</li>
</template>