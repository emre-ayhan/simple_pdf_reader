const pageIndexStore = new Map();
const activeSearches = new Map();

const escapeRegExp = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildRegex = (term, caseSensitive = false, wholeWords = false) => {
    const escaped = escapeRegExp(term);
    const flags = caseSensitive ? 'g' : 'gi';
    const pattern = wholeWords ? `\\b${escaped}\\b` : escaped;
    return new RegExp(pattern, flags);
};

const searchPageItems = (pageIndex, items, regex) => {
    const matches = [];
    if (!Array.isArray(items) || items.length === 0) return matches;

    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
        const text = items[itemIndex];
        if (typeof text !== 'string' || !text.length) continue;

        regex.lastIndex = 0;
        let match;

        while ((match = regex.exec(text)) !== null) {
            matches.push({
                pageIndex,
                itemIndex,
                matchIndex: match.index,
                str: text,
                matchLength: match[0].length,
            });

            if (match.index === regex.lastIndex) regex.lastIndex += 1;
            if (!regex.global) break;
        }
    }

    return matches;
};

const maybeCompleteSearch = (requestId) => {
    const searchState = activeSearches.get(requestId);
    if (!searchState) return;

    if (searchState.scannedPages.size >= searchState.totalPages) {
        self.postMessage({
            type: 'search-done',
            requestId,
            totalMatches: searchState.totalMatches,
        });
        activeSearches.delete(requestId);
    }
};

const processPageForActiveSearch = (requestId, pageIndex, items) => {
    const searchState = activeSearches.get(requestId);
    if (!searchState || searchState.scannedPages.has(pageIndex)) return;

    const matches = searchPageItems(pageIndex, items, searchState.regex);
    searchState.scannedPages.add(pageIndex);
    searchState.totalMatches += matches.length;

    if (matches.length > 0) {
        self.postMessage({
            type: 'search-partial',
            requestId,
            matches,
            scannedPages: searchState.scannedPages.size,
            totalPages: searchState.totalPages,
            totalMatches: searchState.totalMatches,
        });
    }

    maybeCompleteSearch(requestId);
};

const startSearch = ({ requestId, term, caseSensitive, wholeWords, totalPages }) => {
    const regex = buildRegex(term, caseSensitive, wholeWords);
    const searchState = {
        regex,
        scannedPages: new Set(),
        totalMatches: 0,
        totalPages: Number.isInteger(totalPages) && totalPages > 0 ? totalPages : pageIndexStore.size,
    };

    activeSearches.set(requestId, searchState);

    const pageEntries = Array.from(pageIndexStore.entries()).sort((a, b) => a[0] - b[0]);
    for (const [pageIndex, items] of pageEntries) {
        processPageForActiveSearch(requestId, pageIndex, items);
    }

    maybeCompleteSearch(requestId);
};

self.onmessage = (event) => {
    const message = event.data || {};

    if (message.type === 'reset') {
        pageIndexStore.clear();
        activeSearches.clear();
        return;
    }

    if (message.type === 'index-page') {
        const pageIndex = Number(message.pageIndex);
        const items = Array.isArray(message.items) ? message.items : [];

        if (Number.isInteger(pageIndex) && pageIndex >= 0) {
            pageIndexStore.set(pageIndex, items);

            for (const requestId of activeSearches.keys()) {
                processPageForActiveSearch(requestId, pageIndex, items);
            }
        }
        return;
    }

    if (message.type === 'search-cancel') {
        activeSearches.delete(message.requestId);
        return;
    }

    if (message.type === 'search-start') {
        const requestId = message.requestId;

        try {
            startSearch({
                requestId,
                term: String(message.term || ''),
                caseSensitive: !!message.caseSensitive,
                wholeWords: !!message.wholeWords,
                totalPages: message.totalPages,
            });
        } catch (error) {
            self.postMessage({
                type: 'search-error',
                requestId,
                error: error instanceof Error ? error.message : 'Search worker failed',
            });
            activeSearches.delete(requestId);
        }
    }
};
