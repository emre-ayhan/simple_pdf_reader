<script setup>
import { ref, watch } from 'vue';


const search = ref(null);
const caseSensitive = ref(false);
const wholeWords = ref(false);
const currentMatchIndex = ref(0);
const totalMatches = ref(0);
const matchElements = ref([]);

const highlightMatches = () => {
    const searchContainer = document.querySelector('.text-layer');
    
    if (searchContainer) {
        // Clear previous match elements
        matchElements.value = [];
        totalMatches.value = 0;
        currentMatchIndex.value = 0;
        
        searchContainer.querySelectorAll('span').forEach((span) => {
            // Restore original text if it was previously modified
            if (span.dataset.originalText) {
                span.innerHTML = span.dataset.originalText;
            }
            
            const text = span.textContent || '';
            const searchTerm = search.value || '';
            
            if (searchTerm === '') {
                return;
            }

            // Store original text
            if (!span.dataset.originalText) {
                span.dataset.originalText = span.innerHTML;
            }

            let regex;
            if (wholeWords.value) {
                const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const flags = caseSensitive.value ? 'g' : 'gi';
                regex = new RegExp(`\\b${escapedTerm}\\b`, flags);
            } else {
                const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const flags = caseSensitive.value ? 'g' : 'gi';
                regex = new RegExp(escapedTerm, flags);
            }

            const matches = text.match(regex);
            if (matches) {
                let matchCount = 0;
                const highlightedText = text.replace(regex, (match) => {
                    matchCount++;
                    totalMatches.value++;
                    const index = totalMatches.value - 1;
                    return `<mark class="search-highlight" data-match-index="${index}">${match}</mark>`;
                });
                span.innerHTML = highlightedText;
            }
        });
        
        // Collect all match elements
        matchElements.value = Array.from(searchContainer.querySelectorAll('mark.search-highlight'));
        
        // Highlight first match
        if (matchElements.value.length > 0) {
            currentMatchIndex.value = 1;
            highlightCurrentMatch();
        }
    }
};

const highlightCurrentMatch = () => {
    // Remove active class from all matches
    matchElements.value.forEach(el => el.classList.remove('search-highlight-active'));
    
    if (currentMatchIndex.value > 0 && currentMatchIndex.value <= matchElements.value.length) {
        const currentElement = matchElements.value[currentMatchIndex.value - 1];
        currentElement.classList.add('search-highlight-active');
        currentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
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

watch(search, highlightMatches);
watch(caseSensitive, highlightMatches);
watch(wholeWords, highlightMatches);

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
.search-highlight-active {
    background-color: orange;
    color: black;
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