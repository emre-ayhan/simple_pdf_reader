import { ref, nextTick, computed, watch, toRaw, onUnmounted } from "vue";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import { PDFDocument, rgb, degrees as pdfDegrees, PDFHexString, PDFName, PDFString } from "pdf-lib";
import { uuid, Electron, COMMENT_ICON_DEFAULT_COLOR, STROKE_ICON_DEFAULT_SIZE } from "./useAppSettings";
import { useStore } from "./useStore";
import { showModal } from "./usePageModal";
import { fileDataCache, openNewTab, setCurrentTab } from "./useTabs";
import { useFormFill } from "./useFormFill";

GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
).toString();

const { set: storeSet, get: storeGet } = useStore();

const getPages = (length) => {
    return Array.from({ length }, (_, index) => ({
        id: uuid(),
        index,
        rendered: false,
        renderQuality: 'none',
        canvas: null,
        textLayer: null,
        annotationSvg: null,
        drawingCanvas: null,
        drawingContext: null,
        visible: false,
        strokes: [],
        annotations: [],
        annotationsHydrated: false,
        calculationRules: [],
        form: {
            original: {}, // fieldName → original value at extraction time
        },
        deleted: false
    }));
};

const formatBytes = (bytes, decimals = 2) => {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const normalizeAttachmentBytes = (value) => {
    if (!value) return null;
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);

    if (Array.isArray(value)) {
        try {
            return Uint8Array.from(value);
        } catch {
            return null;
        }
    }

    if (typeof value === 'object') {
        if (value.content) return normalizeAttachmentBytes(value.content);
        if (value.data) return normalizeAttachmentBytes(value.data);
        if (value.bytes) return normalizeAttachmentBytes(value.bytes);
    }

    return null;
};

const getAttachmentDownloadName = (item = {}, fallback = 'attachment.bin') => {
    const rawName = String(item?.name || item?.filename || item?.title || '').trim();
    if (!rawName) return fallback;
    return rawName.replace(/[\\/:*?"<>|]+/g, '_');
};

const triggerBlobDownload = (blob, filename = 'attachment.bin') => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
};

const formatPdfDate = (dateStr) => {
    if (!dateStr) return '-';
    // Simple cleanup for PDF date string D:YYYYMMDDHHmmss...
    if (dateStr.startsWith('D:')) {
        return dateStr.substring(2).replace(/'/g, '');
    }
    return dateStr;
};

const formatPdfAnnotationDate = (value = new Date()) => {
    const date = value instanceof Date ? value : new Date(value || Date.now());
    const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
    const pad = (part) => String(part).padStart(2, '0');
    return `D:${safeDate.getFullYear()}${pad(safeDate.getMonth() + 1)}${pad(safeDate.getDate())}${pad(safeDate.getHours())}${pad(safeDate.getMinutes())}${pad(safeDate.getSeconds())}`;
};

const readAnnotationString = (...values) => {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim();
        if (value && typeof value.str === 'string' && value.str.trim()) return value.str.trim();
    }
    return '';
};

const PDF_MARKUP_SUBTYPES = new Set([
    'Highlight',
    'Underline',
    'StrikeOut',
    'Squiggly',
    'FreeText'
]);

const PDF_MARKUP_ANNOTATION_TYPES = new Set([3, 9, 10, 11, 12]);
const PDF_FILE_ATTACHMENT_ANNOTATION_TYPES = new Set([17]);

const getMarkupTypeFromAnnotation = (annotation) => {
    const subtype = String(annotation?.subtype || '').trim().toLowerCase();
    if (subtype === 'highlight') return 'highlight';
    if (subtype === 'underline') return 'underline';
    if (subtype === 'strikeout') return 'strikeout';
    if (subtype === 'squiggly') return 'squiggly';

    const annotationType = Number(annotation?.annotationType);
    if (annotationType === 9) return 'highlight';
    if (annotationType === 10) return 'underline';
    if (annotationType === 11) return 'squiggly';
    if (annotationType === 12) return 'strikeout';

    return '';
};

const getAnnotationViewportBounds = (annotation, viewport) => {
    if (!annotation || !viewport) return null;

    const rect = Array.isArray(annotation.rect) ? annotation.rect : null;
    if (rect && rect.length >= 4) {
        try {
            const [vx1, vy1, vx2, vy2] = viewport.convertToViewportRectangle(rect);
            return {
                x: Math.min(vx1, vx2),
                y: Math.min(vy1, vy2),
                width: Math.abs(vx2 - vx1),
                height: Math.abs(vy2 - vy1)
            };
        } catch (err) {
            // Fallback to quad points when rect conversion fails.
        }
    }

    const quadPoints = Array.isArray(annotation.quadPoints) ? annotation.quadPoints : null;
    if (!quadPoints || quadPoints.length < 8 || typeof viewport.convertToViewportPoint !== 'function') {
        return null;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (let i = 0; i + 1 < quadPoints.length; i += 2) {
        const rawX = Number(quadPoints[i]);
        const rawY = Number(quadPoints[i + 1]);
        if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) continue;

        const [vx, vy] = viewport.convertToViewportPoint(rawX, rawY);
        if (!Number.isFinite(vx) || !Number.isFinite(vy)) continue;

        minX = Math.min(minX, vx);
        minY = Math.min(minY, vy);
        maxX = Math.max(maxX, vx);
        maxY = Math.max(maxY, vy);
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
        return null;
    }

    return {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY)
    };
};

// Comment Sidebar Helpers
const collapseWhitespace = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const previewCommentSelection = (value = '') => {
    const text = collapseWhitespace(value);
    return text.length > 160 ? `${text.slice(0, 157)}...` : text;
};

const getTextLocationAtRawIndex = (nodes, rawIndex) => {
    if (!Array.isArray(nodes) || nodes.length === 0) return null;

    for (const entry of nodes) {
        if (rawIndex < entry.end) {
            return {
                node: entry.node,
                element: entry.element,
                offset: Math.max(0, rawIndex - entry.start)
            };
        }
    }

    const last = nodes[nodes.length - 1];
    const lastLength = last?.node?.nodeValue?.length || 0;
    return {
        node: last.node,
        element: last.element,
        offset: lastLength
    };
};

const collectTextLayerNodes = (textLayer) => {
    if (!textLayer) {
        return { rawText: '', nodes: [] };
    }

    const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            if (!node?.nodeValue?.trim()) {
                return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
        }
    });

    const nodes = [];
    let rawText = '';
    let currentNode = walker.nextNode();

    while (currentNode) {
        const text = currentNode.nodeValue || '';
        const start = rawText.length;
        rawText += text;
        nodes.push({
            node: currentNode,
            element: currentNode.parentElement || textLayer,
            start,
            end: rawText.length
        });
        currentNode = walker.nextNode();
    }

    return { rawText, nodes };
};

const buildNormalizedTextIndex = (value = '') => {
    let normalized = '';
    const rawByNormalized = [];
    let pendingWhitespaceIndex = -1;
    let hasVisibleCharacter = false;

    for (let index = 0; index < value.length; index++) {
        const char = value[index];
        if (/\s/.test(char)) {
            if (hasVisibleCharacter && pendingWhitespaceIndex === -1) {
                pendingWhitespaceIndex = index;
            }
            continue;
        }

        if (pendingWhitespaceIndex !== -1) {
            normalized += ' ';
            rawByNormalized.push(pendingWhitespaceIndex);
            pendingWhitespaceIndex = -1;
        }

        normalized += char;
        rawByNormalized.push(index);
        hasVisibleCharacter = true;
    }

    return { text: normalized, rawByNormalized };
};

const buildTextRangeCandidate = (nodes, normalizedIndex, needleLength, normalizedLookup) => {
    const startRaw = normalizedLookup.rawByNormalized[normalizedIndex];
    const endRawInclusive = normalizedLookup.rawByNormalized[normalizedIndex + needleLength - 1];
    if (!Number.isFinite(startRaw) || !Number.isFinite(endRawInclusive)) return null;

    const startLocation = getTextLocationAtRawIndex(nodes, startRaw);
    const endLocation = getTextLocationAtRawIndex(nodes, endRawInclusive + 1);
    if (!startLocation || !endLocation) return null;

    const range = document.createRange();
    range.setStart(startLocation.node, startLocation.offset);
    range.setEnd(endLocation.node, endLocation.offset);

    return {
        range,
        element: startLocation.element || endLocation.element || null,
        rect: range.getBoundingClientRect(),
        rawStart: startRaw,
        rawEnd: endRawInclusive + 1
    };
};

const getCommentAnchorClientPoint = (page, commentRef) => {
    const first = commentRef?.stroke?.[0] || null;
    const canvas = page?.drawingCanvas || null;
    if (!first || !canvas) return null;

    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height || !canvas.width || !canvas.height) return null;

    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;
    const width = Number(first.width) || 0;
    const height = Number(first.height) || 0;

    return {
        x: rect.left + ((Number(first.x) || 0) + width / 2) * scaleX,
        y: rect.top + ((Number(first.y) || 0) + height / 2) * scaleY
    };
};

const getCommentTextAnchor = (commentRef) => commentRef?.stroke?.[0]?.selectionAnchor || null;

const scoreCommentTextCandidate = (candidate, rawText, commentRef, anchorPoint) => {
    let score = 0;
    const totalLength = Math.max(1, rawText.length);
    const selectionAnchor = getCommentTextAnchor(commentRef);

    if (selectionAnchor) {
        if (Number.isFinite(selectionAnchor.startRatio)) {
            const candidateRatio = candidate.rawStart / totalLength;
            score += Math.max(0, 4 - Math.abs(candidateRatio - selectionAnchor.startRatio) * 20);
        }

        const beforeHint = collapseWhitespace(selectionAnchor.beforeText || '').toLowerCase();
        if (beforeHint) {
            const beforeWindow = collapseWhitespace(
                rawText.slice(Math.max(0, candidate.rawStart - Math.max(96, beforeHint.length * 2)), candidate.rawStart)
            ).toLowerCase();
            if (beforeWindow.endsWith(beforeHint)) {
                score += 5;
            } else if (beforeWindow.includes(beforeHint)) {
                score += 2;
            }
        }

        const afterHint = collapseWhitespace(selectionAnchor.afterText || '').toLowerCase();
        if (afterHint) {
            const afterWindow = collapseWhitespace(
                rawText.slice(candidate.rawEnd, Math.min(rawText.length, candidate.rawEnd + Math.max(96, afterHint.length * 2)))
            ).toLowerCase();
            if (afterWindow.startsWith(afterHint)) {
                score += 5;
            } else if (afterWindow.includes(afterHint)) {
                score += 2;
            }
        }
    }

    if (anchorPoint && candidate.rect) {
        const centerX = candidate.rect.left + candidate.rect.width / 2;
        const centerY = candidate.rect.top + candidate.rect.height / 2;
        const distance = Math.hypot(centerX - anchorPoint.x, centerY - anchorPoint.y);
        score += Math.max(0, 2 - (distance / 320));
    }

    return score;
};

const findBestCommentTextRange = (page, commentRef) => {
    const textLayer = page?.textLayer || null;
    const needle = collapseWhitespace(commentRef?.selectedText || '');
    if (!textLayer || !needle) return null;

    const { rawText, nodes } = collectTextLayerNodes(textLayer);
    if (!rawText || nodes.length === 0) return null;

    const normalizedLookup = buildNormalizedTextIndex(rawText);
    const normalizedNeedle = buildNormalizedTextIndex(needle).text;
    if (!normalizedLookup.text || !normalizedNeedle) return null;

    const candidates = [];
    let searchFrom = 0;
    const normalizedHaystack = normalizedLookup.text.toLowerCase();
    const normalizedTarget = normalizedNeedle.toLowerCase();

    while (searchFrom < normalizedHaystack.length) {
        const matchIndex = normalizedHaystack.indexOf(normalizedTarget, searchFrom);
        if (matchIndex === -1) break;

        const candidate = buildTextRangeCandidate(nodes, matchIndex, normalizedTarget.length, normalizedLookup);
        if (candidate) {
            candidates.push(candidate);
        }

        searchFrom = matchIndex + Math.max(1, normalizedTarget.length);
    }

    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    const anchor = getCommentAnchorClientPoint(page, commentRef);
    return candidates.reduce((best, candidate) => {
        const score = scoreCommentTextCandidate(candidate, rawText, commentRef, anchor);
        if (!best || score > best.score) {
            return { ...candidate, score };
        }
        return best;
    }, null);
};

export function useFile(loadFileCallback, lazyLoadCallback, fileSavedCallback) {
    const fileId = uuid();

    var pdfDoc = null;

    // Prevent concurrent render() calls per page/canvas
    const pageRenderPromises = new Map();
    const VISIBLE_PAGE_WINDOW_SIZE = 5;
    const MIN_RENDER_SCALE = 1;
    const MAX_RENDER_SCALE = 3;
    const MAX_EFFECTIVE_DPR = 2.25;
    const MAX_CANVAS_PIXELS = 10_000_000;
    const LOW_QUALITY_DPR = 1.15;
    const LOW_QUALITY_CANVAS_PIXELS = 4_000_000;
    const HIGH_QUALITY_UPGRADE_DELAY_MS = 140;
    const MAX_LETTER_SPACING_ITEMS = 700;
    let visibleWindowStart = -1;
    let isProgrammaticNavigation = false;
    let programmaticNavigationToken = 0;
    let programmaticNavigationTimer = null;
    let programmaticTargetPageId = null;
    let textExtractionRunId = 0;
    let annotationExtractionRunId = 0;
    let extractTextTimeout = null;
    let extractAnnotationsTimeout = null;
    let highQualityUpgradeTimeout = null;
    let searchRequestId = 0;

    const indexedTextPages = new Set();
    const pendingSearchRequests = new Map();
    const annotationHydrationStatus = ref({
        active: false,
        hydratedPages: 0,
        totalPages: 0,
    });

    const updateAnnotationHydrationStatus = (active = annotationHydrationStatus.value.active) => {
        const totalPages = pages.value.length;
        const hydratedPages = pages.value.reduce((count, page) => {
            return count + (page?.annotationsHydrated ? 1 : 0);
        }, 0);

        annotationHydrationStatus.value = {
            active: Boolean(active),
            hydratedPages,
            totalPages,
        };
    };

    const annotationHydrationProgress = computed(() => {
        const total = Math.max(0, Number(annotationHydrationStatus.value.totalPages) || 0);
        const hydrated = Math.min(total, Math.max(0, Number(annotationHydrationStatus.value.hydratedPages) || 0));
        const percent = total > 0 ? Math.min(100, Math.round((hydrated / total) * 100)) : 0;

        return {
            active: Boolean(annotationHydrationStatus.value.active),
            hydratedPages: hydrated,
            totalPages: total,
            percent,
            complete: total > 0 && hydrated >= total,
        };
    });

    const hasWorkerSupport = typeof Worker !== 'undefined';
    const searchWorker = hasWorkerSupport
        ? new Worker(new URL('../workers/pdfSearchWorker.js', import.meta.url), { type: 'module' })
        : null;

    const resetSearchIndex = (count = 0) => {
        indexedTextPages.clear();
        if (searchWorker) {
            searchWorker.postMessage({ type: 'reset', pageCount: count });
        }
    };

    const buildSearchItems = (textContent) => {
        if (!textContent?.items?.length) return [];
        return textContent.items
            .map(item => item?.str)
            .filter(text => typeof text === 'string' && text.length > 0);
    };

    const syncPageTextIndex = (pageIndexToSync, textContent) => {
        if (!Number.isInteger(pageIndexToSync) || pageIndexToSync < 0) return;
        const items = buildSearchItems(textContent);
        indexedTextPages.add(pageIndexToSync);

        if (searchWorker) {
            searchWorker.postMessage({
                type: 'index-page',
                pageIndex: pageIndexToSync,
                items,
            });
        }
    };

    if (searchWorker) {
        searchWorker.onmessage = (event) => {
            const { type, requestId, matches = [], error = null, scannedPages = 0, totalPages = 0, totalMatches = 0 } = event.data || {};
            if (!pendingSearchRequests.has(requestId)) return;

            const { resolve, reject, onPartial } = pendingSearchRequests.get(requestId);

            if (type === 'search-partial') {
                if (typeof onPartial === 'function') {
                    onPartial(matches, { scannedPages, totalPages, totalMatches, done: false });
                }
                return;
            }

            if (type === 'search-error' || error) {
                pendingSearchRequests.delete(requestId);
                reject(new Error(error));
                return;
            }

            if (type === 'search-done') {
                pendingSearchRequests.delete(requestId);
                resolve({ totalMatches });
            }
        };
    }

    onUnmounted(() => {
        if (extractTextTimeout) {
            clearTimeout(extractTextTimeout);
            extractTextTimeout = null;
        }

        if (extractAnnotationsTimeout) {
            clearTimeout(extractAnnotationsTimeout);
            extractAnnotationsTimeout = null;
        }

        if (programmaticNavigationTimer) {
            clearTimeout(programmaticNavigationTimer);
            programmaticNavigationTimer = null;
        }

        if (highQualityUpgradeTimeout) {
            clearTimeout(highQualityUpgradeTimeout);
            highQualityUpgradeTimeout = null;
        }

        pendingSearchRequests.forEach(({ reject }) => {
            reject(new Error('Search worker disposed'));
        });
        pendingSearchRequests.clear();

        if (searchWorker) {
            searchWorker.terminate();
        }
    });

    const textMeasureCanvas = document.createElement('canvas');
    const textMeasureContext = textMeasureCanvas.getContext('2d');

    const measureTextWidth = (text, fontSize, fontFamily) => {
        if (!textMeasureContext) return 0;
        textMeasureContext.font = `${fontSize}px ${fontFamily || 'sans-serif'}`;
        return textMeasureContext.measureText(text || '').width;
    };

    const yieldToUI = () => {
        return new Promise(resolve => {
            if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
                window.requestIdleCallback(() => resolve(), { timeout: 100 });
                return;
            }
            setTimeout(resolve, 0);
        });
    };

    const computeAdaptiveRenderScale = (unscaledViewport, desiredDisplayWidth, pixelRatio, options = {}) => {
        const {
            dprCap = MAX_EFFECTIVE_DPR,
            pixelBudget = MAX_CANVAS_PIXELS,
        } = options;

        if (!unscaledViewport?.width || !unscaledViewport?.height) {
            return MIN_RENDER_SCALE;
        }

        const cssScale = desiredDisplayWidth / unscaledViewport.width;
        const effectiveDpr = Math.min(Math.max(pixelRatio || 1, 1), dprCap);
        const desiredScale = cssScale * effectiveDpr;

        let scale = Math.min(MAX_RENDER_SCALE, Math.max(MIN_RENDER_SCALE, desiredScale));
        const pixelCount = (unscaledViewport.width * scale) * (unscaledViewport.height * scale);

        if (pixelCount > pixelBudget) {
            const reductionFactor = Math.sqrt(pixelBudget / pixelCount);
            scale = Math.max(MIN_RENDER_SCALE, scale * reductionFactor);
        }

        return scale;
    };

    const getQualityRank = (quality) => {
        if (quality === 'high') return 2;
        if (quality === 'low') return 1;
        return 0;
    };

    const getVisiblePageSourceIndex = (activeIdx = pageIndex.value) => {
        const maxActive = Math.max(0, activePages.value.length - 1);
        const safeActive = Math.min(Math.max(0, Number(activeIdx) || 0), maxActive);
        const active = activePages.value[safeActive];
        if (!active) return -1;
        return pages.value.findIndex(page => page.id === active.id);
    };

    const scheduleHighQualityUpgrade = () => {
        if (highQualityUpgradeTimeout) {
            clearTimeout(highQualityUpgradeTimeout);
            highQualityUpgradeTimeout = null;
        }

        highQualityUpgradeTimeout = setTimeout(() => {
            const centerSourceIndex = getVisiblePageSourceIndex(pageIndex.value);
            if (centerSourceIndex === -1) return;

            const targets = pages.value
                .filter(page => page.visible && !page.deleted)
                .map(page => ({ page, distance: Math.abs((page.index ?? 0) - centerSourceIndex) }))
                .sort((a, b) => a.distance - b.distance)
                .slice(0, 3)
                .map(entry => entry.page);

            targets.forEach(page => {
                renderPdfPage(page.id, 'high').catch(() => {});
            });
        }, HIGH_QUALITY_UPGRADE_DELAY_MS);
    };

    const beginProgrammaticNavigation = (targetPageId = null) => {
        programmaticNavigationToken += 1;
        if (programmaticNavigationTimer) {
            clearTimeout(programmaticNavigationTimer);
            programmaticNavigationTimer = null;
        }

        isProgrammaticNavigation = true;
        programmaticTargetPageId = targetPageId;
        return programmaticNavigationToken;
    };

    const endProgrammaticNavigation = (token, delayMs = 350) => {
        if (programmaticNavigationTimer) {
            clearTimeout(programmaticNavigationTimer);
        }

        programmaticNavigationTimer = setTimeout(() => {
            if (token === programmaticNavigationToken) {
                isProgrammaticNavigation = false;
                programmaticTargetPageId = null;
            }
        }, delayMs);
    };

    const getVisibleWindowBounds = (sourceIndex) => {
        const total = pages.value.length;
        if (!total) return { start: 0, end: -1 };

        if (total <= VISIBLE_PAGE_WINDOW_SIZE) {
            return { start: 0, end: total - 1 };
        }

        const safeSource = Math.min(total - 1, Math.max(0, Number(sourceIndex) || 0));
        const radius = Math.floor(VISIBLE_PAGE_WINDOW_SIZE / 2);
        const maxStart = total - VISIBLE_PAGE_WINDOW_SIZE;
        const start = Math.min(Math.max(0, safeSource - radius), maxStart);
        const end = start + VISIBLE_PAGE_WINDOW_SIZE - 1;
        return { start, end };
    };

    const applyVisibleWindowAroundSourceIndex = (sourceIndex) => {
        if (!pages.value.length) return false;

        const { start, end } = getVisibleWindowBounds(sourceIndex);
        let changed = false;

        for (let i = 0; i < pages.value.length; i++) {
            const shouldBeVisible = i >= start && i <= end;
            if (pages.value[i].visible !== shouldBeVisible) {
                if (!shouldBeVisible) {
                    // v-if unmounts canvas/text-layer nodes; force a fresh render when remounted.
                    pages.value[i].rendered = false;
                    pages.value[i].renderQuality = 'none';
                }
                pages.value[i].visible = shouldBeVisible;
                changed = true;
            }
        }

        return changed;
    };

    const applyVisibleWindowForActiveIndex = (activeIndex = pageIndex.value, options = {}) => {
        const { force = false } = options;
        const maxActiveIndex = Math.max(0, activePages.value.length - 1);
        const safeActiveIndex = Math.min(Math.max(0, Number(activeIndex) || 0), maxActiveIndex);
        const active = activePages.value[safeActiveIndex];
        if (!active) return false;

        const sourceIndex = pages.value.findIndex(page => page.id === active.id);
        if (sourceIndex === -1) return false;

        const total = pages.value.length;
        const maxStart = Math.max(0, total - VISIBLE_PAGE_WINDOW_SIZE);

        let nextStart;

        if (force || visibleWindowStart < 0 || total <= VISIBLE_PAGE_WINDOW_SIZE) {
            const centered = getVisibleWindowBounds(sourceIndex).start;
            nextStart = centered;
        } else {
            nextStart = Math.min(Math.max(0, visibleWindowStart), maxStart);

            // Keep current source inside an inner buffer to avoid frequent DOM churn.
            const innerStart = nextStart + 1;
            const innerEnd = nextStart + VISIBLE_PAGE_WINDOW_SIZE - 2;

            if (sourceIndex < innerStart) {
                nextStart = Math.max(0, sourceIndex - 1);
            } else if (sourceIndex > innerEnd) {
                nextStart = Math.min(maxStart, sourceIndex - (VISIBLE_PAGE_WINDOW_SIZE - 2));
            }
        }

        visibleWindowStart = nextStart;
        return applyVisibleWindowAroundSourceIndex(nextStart + Math.floor(VISIBLE_PAGE_WINDOW_SIZE / 2));
    };

    const syncCommentStrokesFromAnnotations = (page, annotations = [], viewport = null) => {
        if (!page || !viewport || !Array.isArray(page.strokes)) return;

        const commentAnnotations = annotations.filter(annotation => {
            const subtype = String(annotation?.subtype || '').trim();
            const subtypeLower = subtype.toLowerCase();
            const annotationType = Number(annotation?.annotationType);
            // Only true PDF text notes should become sticky-note icon comments.
            const isTextNote = subtypeLower === 'text';
            const isMarkup = PDF_MARKUP_SUBTYPES.has(subtype) || PDF_MARKUP_ANNOTATION_TYPES.has(annotationType);
            if (!isTextNote && !isMarkup) return false;

            const commentText = readAnnotationString(
                annotation?.contents,
                annotation?.contentsObj,
                annotation?.richText,
                annotation?.popupRef?.contents,
                annotation?.popup?.contents
            );
            return Boolean(commentText);
        });

        const importedCommentStrokes = commentAnnotations.map((annotation) => {
            const bounds = getAnnotationViewportBounds(annotation, viewport);
            let x = 0;
            let y = 0;
            let width = 28;
            let height = 28;

            if (bounds) {
                x = bounds.x;
                y = bounds.y;
                width = Math.max(18, bounds.width || 28);
                height = Math.max(18, bounds.height || 28);
            }

            const subtype = String(annotation?.subtype || '').trim();
            const source = subtype.toLowerCase() === 'text'
                ? 'pdf-text-annotation'
                : 'pdf-markup-annotation';
            const markupType = getMarkupTypeFromAnnotation(annotation);

            if (source === 'pdf-text-annotation') {
                const fixed = STROKE_ICON_DEFAULT_SIZE;
                if (bounds) {
                    const centerX = bounds.x + bounds.width / 2;
                    const centerY = bounds.y + bounds.height / 2;
                    x = centerX - fixed / 2;
                    y = centerY - fixed / 2;
                }
                width = fixed;
                height = fixed;
            }

            return [{
                id: String(annotation.id || annotation.annotationId || uuid()),
                type: 'comment',
                x,
                y,
                width,
                height,
                color: COMMENT_ICON_DEFAULT_COLOR,
                thickness: 2,
                opacity: 1,
                selectedText: readAnnotationString(annotation.subject, annotation.subjectObj, annotation.subj),
                comment: readAnnotationString(
                    annotation.contents,
                    annotation.contentsObj,
                    annotation.richText,
                    annotation.popupRef?.contents,
                    annotation.popup?.contents
                ),
                author: readAnnotationString(annotation.title, annotation.titleObj, annotation.userName),
                createdAt: annotation.creationDate || null,
                updatedAt: annotation.modificationDate || annotation.modDate || null,
                source,
                markupType,
                pdfAnnotationId: String(annotation.id || annotation.annotationId || ''),
            }];
        });

        const nonImportedStrokes = page.strokes.filter(stroke => {
            const first = stroke?.[0] || null;
            return first?.type !== 'comment'
                || (first.source !== 'pdf-text-annotation' && first.source !== 'pdf-markup-annotation');
        });

        page.strokes = [...nonImportedStrokes, ...importedCommentStrokes];
    };

    const syncAttachmentStrokesFromAnnotations = (page, annotations = [], viewport = null) => {
        if (!page || !viewport || !Array.isArray(page.strokes)) return;

        const attachmentAnnotations = annotations.filter(annotation => {
            const subtype = String(annotation?.subtype || '').trim().toLowerCase();
            const annotationType = Number(annotation?.annotationType);
            return subtype === 'fileattachment' || PDF_FILE_ATTACHMENT_ANNOTATION_TYPES.has(annotationType);
        });

        const importedAttachmentStrokes = attachmentAnnotations.map((annotation, index) => {
            const bounds = getAnnotationViewportBounds(annotation, viewport);
            const fixedSize = STROKE_ICON_DEFAULT_SIZE;
            const centerX = bounds ? (bounds.x + (bounds.width / 2)) : 0;
            const centerY = bounds ? (bounds.y + (bounds.height / 2)) : 0;
            const fileEntry = annotation?.file || annotation?.attachment || annotation?.fileAttachment || null;
            const attachmentName = getAttachmentDownloadName({
                name: fileEntry?.filename || fileEntry?.name || annotation?.title || annotation?.id || `attachment-${index + 1}`
            }, `attachment-${index + 1}.bin`);
            const attachmentContent = normalizeAttachmentBytes(
                fileEntry?.content || fileEntry?.data || fileEntry?.bytes || annotation?.content || null
            );

            return [{
                id: String(annotation.id || annotation.annotationId || uuid()),
                type: 'attachment',
                x: Math.max(0, centerX - (fixedSize / 2)),
                y: Math.max(0, centerY - (fixedSize / 2)),
                width: fixedSize,
                height: fixedSize,
                color: '#2f7cd1',
                thickness: 2,
                opacity: 1,
                selectedText: attachmentName,
                comment: readAnnotationString(annotation.contents, annotation.contentsObj),
                source: 'pdf-attachment-annotation',
                pdfAnnotationId: String(annotation.id || annotation.annotationId || ''),
                attachmentName,
                attachmentContentType: String(fileEntry?.contentType || fileEntry?.mimeType || 'application/octet-stream'),
                attachmentContent,
            }];
        });

        const nonImportedStrokes = page.strokes.filter(stroke => {
            const first = stroke?.[0] || null;
            return first?.type !== 'attachment' || first?.source !== 'pdf-attachment-annotation';
        });

        page.strokes = [...nonImportedStrokes, ...importedAttachmentStrokes];
    };

    const downloadAttachment = async (attachment) => {
        const bytes = normalizeAttachmentBytes(attachment?.content || attachment?.attachmentContent || null);
        if (!bytes || bytes.byteLength === 0) {
            await showModal('This attachment has no downloadable data.');
            return false;
        }

        const contentType = String(attachment?.contentType || attachment?.attachmentContentType || 'application/octet-stream');
        const filename = getAttachmentDownloadName(
            {
                name: attachment?.name || attachment?.filename || attachment?.attachmentName,
            },
            'attachment.bin'
        );

        triggerBlobDownload(new Blob([bytes], { type: contentType }), filename);
        return true;
    };

    const removeNativeTextCommentAnnotations = (pdfLibDoc, pdfPage) => {
        const annots = pdfPage?.node?.Annots?.() || null;
        if (!annots) return;

        for (let i = annots.size() - 1; i >= 0; i--) {
            const annotRef = annots.get(i);
            const annotDict = pdfLibDoc.context.lookup(annotRef);
            const subtype = annotDict?.get?.(PDFName.of('Subtype')) || null;
            if (String(subtype) === '/Text') {
                annots.remove(i);
            }
        }
    };

    const addNativeCommentAnnotation = (pdfLibDoc, pdfPage, first, scaleX, scaleY, pageHeight) => {
        if (!first?.comment) return;
        if (first?.source === 'pdf-markup-annotation') return;

        const width = Math.max(18, Number(first.width) || 28) * scaleX;
        const height = Math.max(18, Number(first.height) || 28) * scaleY;
        const x = Number(first.x || 0) * scaleX;
        const y = pageHeight - ((Number(first.y || 0) + (Number(first.height) || 28)) * scaleY);
        const annotDict = pdfLibDoc.context.obj({
            Type: 'Annot',
            Subtype: 'Text',
            Rect: [x, y, x + width, y + height],
            Contents: PDFHexString.fromText(String(first.comment || '')),
            T: PDFHexString.fromText(String(first.author || 'Simple PDF Reader')),
            NM: PDFHexString.fromText(String(first.id || uuid())),
            M: PDFString.of(formatPdfAnnotationDate(first.updatedAt || first.createdAt || new Date())),
            Name: 'Comment',
            Open: false,
            C: [1, 0.65, 0],
        });

        if (first.selectedText) {
            annotDict.set(PDFName.of('Subj'), PDFHexString.fromText(String(first.selectedText)));
        }
        if (pdfPage.ref) {
            annotDict.set(PDFName.of('P'), pdfPage.ref);
        }

        const annotRef = pdfLibDoc.context.register(annotDict);
        pdfPage.node.addAnnot(annotRef);
    };

    const renderPdfPage = async (pageId, quality = 'low', options = {}) => {
        const { force = false } = options;
        if (!pdfDoc) return;

        const page = pages.value.find(p => p.id === pageId);

        if (!page || page.deleted || page.index < 0) return;

        const requestedQuality = quality === 'high' ? 'high' : 'low';
        const requestedRank = getQualityRank(requestedQuality);
        const currentRank = getQualityRank(page.renderQuality);

        if (!force && page.rendered && currentRank >= requestedRank) return;

        if (pageRenderPromises.has(pageId)) {
            const inflight = pageRenderPromises.get(pageId);
            const inflightRank = getQualityRank(inflight?.quality);

            if (inflightRank >= requestedRank) {
                return inflight.promise;
            }

            await inflight.promise;
        }

        const promise = (async () => {
            const pdfPage = await pdfDoc.getPage(page.index + 1); // pdf-lib is 1-indexed

            const pixelRatio = window.devicePixelRatio || 1;
            const containerWidth = pdfReader.value?.clientWidth || window.innerWidth;
            const zoomFactor = Math.max(zoomPercentage.value, 100) / 100;
            const desiredDisplayWidth = containerWidth * zoomFactor;
            const unscaledViewport = pdfPage.getViewport({ scale: 1 });
            const scale = computeAdaptiveRenderScale(
                unscaledViewport,
                desiredDisplayWidth,
                pixelRatio,
                requestedQuality === 'high'
                    ? { dprCap: MAX_EFFECTIVE_DPR, pixelBudget: MAX_CANVAS_PIXELS }
                    : { dprCap: LOW_QUALITY_DPR, pixelBudget: LOW_QUALITY_CANVAS_PIXELS }
            );
            const viewport = pdfPage.getViewport({ scale });

            const canvas = page?.canvas;
            const drawCanvas = page?.drawingCanvas;
            const annotationSvg = page?.annotationSvg;
            if (!canvas || !drawCanvas) return;

            canvas.style.width = '';
            canvas.style.height = '';
            drawCanvas.style.width = '';
            drawCanvas.style.height = '';

            const ctx = canvas.getContext('2d');

            canvas.height = viewport.height;
            canvas.width = viewport.width;
            drawCanvas.height = viewport.height;
            drawCanvas.width = viewport.width;

            if (annotationSvg) {
                annotationSvg.setAttribute('viewBox', `0 0 ${viewport.width} ${viewport.height}`);
                annotationSvg.setAttribute('width', `${viewport.width}`);
                annotationSvg.setAttribute('height', `${viewport.height}`);
            }

            page.drawingContext = drawCanvas.getContext('2d', { willReadFrequently: true });

            const renderContext = {
                canvasContext: ctx,
                viewport,
            };

            await pdfPage.render(renderContext).promise;

            const textLayerDiv = page?.textLayer;

            if (textLayerDiv) {
                textLayerDiv.innerHTML = '';

                const cssWidth = canvas.offsetWidth;
                const cssHeight = canvas.offsetHeight;
                const scaleX = cssWidth / canvas.width;
                const scaleY = cssHeight / canvas.height;

                textLayerDiv.style.width = `${canvas.width}px`;
                textLayerDiv.style.height = `${canvas.height}px`;
                textLayerDiv.style.transformOrigin = '0 0';
                textLayerDiv.style.transform = `scale(${scaleX}, ${scaleY})`;

                const textContent = page.textContent || await pdfPage.getTextContent();
                if (!page.textContent) {
                    page.textContent = textContent;
                }
                if (!indexedTextPages.has(page.index)) {
                    syncPageTextIndex(page.index, textContent);
                }

                const useLetterSpacing = textContent.items.length <= MAX_LETTER_SPACING_ITEMS;
                const fragment = document.createDocumentFragment();
                const tx = viewport.transform;

                for (const item of textContent.items) {
                    if (!item.str) continue;

                    const span = document.createElement('span');
                    span.textContent = item.str;

                    const m = item.transform;

                    const x = tx[0] * m[4] + tx[2] * m[5] + tx[4];
                    const y = tx[1] * m[4] + tx[3] * m[5] + tx[5];

                    const fontHeight = Math.hypot(
                        tx[0] * m[2] + tx[2] * m[3],
                        tx[1] * m[2] + tx[3] * m[3]
                    );

                    const fontWidth = Math.hypot(
                        tx[0] * m[0] + tx[2] * m[1],
                        tx[1] * m[0] + tx[3] * m[1]
                    );

                    const textWidth = item.width * viewport.scale;

                    span.style.left = `${x}px`;
                    span.style.top = `${y - fontHeight * 0.85}px`;
                    span.style.fontSize = `${fontHeight}px`;
                    span.style.fontFamily = item.fontName || 'sans-serif';

                    const angle = Math.atan2(
                        tx[1] * m[0] + tx[3] * m[1],
                        tx[0] * m[0] + tx[2] * m[1]
                    );

                    let transform = `rotate(${angle}rad)`;
                    if (fontWidth > 0 && fontHeight > 0) {
                        const scaleX2 = fontWidth / fontHeight;
                        if (Math.abs(scaleX2 - 1) > 0.001) {
                            transform += ` scaleX(${scaleX2})`;
                        }
                    }
                    span.style.transform = transform;

                    const naturalWidth = useLetterSpacing
                        ? measureTextWidth(item.str, fontHeight, item.fontName || 'sans-serif')
                        : 0;

                    if (textWidth > 0 && naturalWidth > 0 && item.str.length > 1) {
                        const extraSpace = textWidth - naturalWidth;
                        const letterSpacing = extraSpace / (item.str.length - 1);
                        if (Number.isFinite(letterSpacing) && Math.abs(letterSpacing) < fontHeight) {
                            span.style.letterSpacing = `${letterSpacing}px`;
                        }
                    }

                    fragment.appendChild(span);
                }

                textLayerDiv.appendChild(fragment);
            }

            page.rendered = true;
            page.renderQuality = requestedQuality;

            // Re-extract annotations with the high-res viewport so positions are pixel-accurate
            try {
                const rawAnnotations = await pdfPage.getAnnotations();
                setPageAnnotations(page, rawAnnotations, viewport);
                syncCommentStrokesFromAnnotations(page, rawAnnotations, viewport);
                syncAttachmentStrokesFromAnnotations(page, rawAnnotations, viewport);
                page.annotationsHydrated = true;
                updateAnnotationHydrationStatus();
            } catch (e) {
                console.warn('Form annotation re-extraction failed for page', pageId, e);
            }

            lazyLoadCallback(page);
        })();

        pageRenderPromises.set(pageId, { quality: requestedQuality, promise });

        try {
            await promise;
        } finally {
            pageRenderPromises.delete(pageId);
        }
    };

    // Render a low-res offscreen thumbnail for a page (independent of lazy loading)
    const renderPageThumbnail = async (pageNumber, maxWidth = 160) => {
        try {
            if (!pdfDoc) return null;
            if (!pageNumber || pageNumber < 1 || pageNumber > pdfDoc.numPages) return null;

            const page = await pdfDoc.getPage(pageNumber);
            const viewport1x = page.getViewport({ scale: 1 });
            const scale = Math.min(maxWidth / viewport1x.width, 0.5); // cap scale to avoid heavy work
            const viewport = page.getViewport({ scale });

            const offscreen = document.createElement('canvas');
            offscreen.width = viewport.width;
            offscreen.height = viewport.height;
            const ctx = offscreen.getContext('2d');

            await page.render({ canvasContext: ctx, viewport }).promise;
            return offscreen.toDataURL('image/jpeg', 0.6);
        } catch (e) {
            console.warn('Thumbnail render failed for page', pageNumber, e);
            return null;
        }
    };

    // Observers
    const intersectionObserver = ref(null);
    const lazyLoadObserver = ref(null);

    // General State Variables
    const fileInput = ref(null);
    const filename = ref(null);
    const filepath = ref(null);
    const internalFileSize = ref(0);
    const pagesContainer = ref(null);
    const pdfReader = ref(null);
    const isFileLoaded = ref(false);
    const originalPdfData = ref(null);

    // Zoom State Variables
    const zoomPercentage = ref(100); // 25 to 100

    // Saved State Variables
    const fileRecentlySaved = ref(false);
    const sidebarBookmarks = ref([]);
    const sidebarAttachments = ref([]);
    const sidebarLayers = ref([]);

    // Pagination State Variables
    const pages = ref([]);
    const pageCount = ref(0);
    const pageIndex = ref(0);
    const pageNum = ref(1);
    const activePages = computed(() => pages.value.filter(page => !page.deleted));

    const activePage = computed(() => {
        return activePages.value[pageIndex.value] || {};
    });

    const {
        resetForm,
        setPageAnnotations,
        flattenToPdfLib,
        handlePdfButtonAction,
    } = useFormFill(activePage, (action) => {
        if (action.type === 'goto') {
            scrollToPage(action.pageIndex ?? 0);
            return;
        }

        const actionNames = [action.type, action.target];

        if (actionNames.some(el => el.includes('first'))) {
            scrollToFirstPage();
            return;
        }

        if (actionNames.some(el => el.includes('last'))) {
            scrollToLastPage();
            return;
        }

        if (actionNames.some(el => el.includes('next'))) {
            scrollToPage(pageIndex.value + 1);
            return;
        }

        if (actionNames.some(el => el.includes('prev'))) {
            scrollToPage(pageIndex.value - 1);
            return;
        }
    });

    const setPages = (length) => {
        textExtractionRunId += 1;
        annotationExtractionRunId += 1;
        if (extractTextTimeout) {
            clearTimeout(extractTextTimeout);
            extractTextTimeout = null;
        }
        if (extractAnnotationsTimeout) {
            clearTimeout(extractAnnotationsTimeout);
            extractAnnotationsTimeout = null;
        }
        visibleWindowStart = -1;
        resetSearchIndex(length);
        pageCount.value = length;
        pages.value = getPages(length);
        annotationHydrationStatus.value = {
            active: false,
            hydratedPages: 0,
            totalPages: length,
        };
        sidebarBookmarks.value = [];
        sidebarAttachments.value = [];
        sidebarLayers.value = [];
    }

    const clampRatio = (value) => {
        if (!Number.isFinite(value)) return null;
        return Math.min(1, Math.max(0, value));
    };

    const toPdfTopRatio = (pdfY, view) => {
        if (!Array.isArray(view) || view.length < 4) return null;
        if (!Number.isFinite(pdfY)) return null;

        const yMin = Number(view[1]) || 0;
        const yMax = Number(view[3]) || 0;
        const height = yMax - yMin;
        if (!Number.isFinite(height) || height <= 0) return null;

        const normalized = 1 - ((pdfY - yMin) / height);
        return clampRatio(normalized);
    };

    const resolveOutlineDestination = async (dest) => {
        if (!pdfDoc || !dest) return null;

        let resolvedDest = dest;
        if (typeof resolvedDest === 'string') {
            try {
                resolvedDest = await pdfDoc.getDestination(resolvedDest);
            } catch {
                return null;
            }
        }

        if (!Array.isArray(resolvedDest) || resolvedDest.length === 0) return null;
        const pageRef = resolvedDest[0];
        if (!pageRef) return null;

        try {
            const pageIdx = await pdfDoc.getPageIndex(pageRef);
            if (!Number.isInteger(pageIdx)) return null;

            let offsetRatio = null;
            const destType = resolvedDest[1]?.name;

            if (destType === 'XYZ') {
                offsetRatio = toPdfTopRatio(Number(resolvedDest[3]), (await pdfDoc.getPage(pageIdx + 1))?.view);
            } else if (destType === 'FitH' || destType === 'FitBH') {
                offsetRatio = toPdfTopRatio(Number(resolvedDest[2]), (await pdfDoc.getPage(pageIdx + 1))?.view);
            } else if (destType === 'FitR') {
                offsetRatio = toPdfTopRatio(Number(resolvedDest[5]), (await pdfDoc.getPage(pageIdx + 1))?.view);
            }

            return {
                pageIndex: pageIdx,
                offsetRatio,
            };
        } catch {
            return null;
        }
    };

    const flattenOutlineItems = async (items = [], level = 0, collector = []) => {
        if (!Array.isArray(items) || items.length === 0) return collector;

        for (const item of items) {
            const destination = await resolveOutlineDestination(item?.dest || null);
            collector.push({
                id: String(item?.title || uuid()),
                title: String(item?.title || 'Untitled'),
                page: Number.isInteger(destination?.pageIndex) ? destination.pageIndex + 1 : null,
                offsetRatio: clampRatio(destination?.offsetRatio),
                level,
            });

            if (Array.isArray(item?.items) && item.items.length > 0) {
                await flattenOutlineItems(item.items, level + 1, collector);
            }
        }

        return collector;
    };

    const loadSidebarDocumentData = async () => {
        if (!pdfDoc) return;

        try {
            const attachmentMap = await pdfDoc.getAttachments?.();
            const entries = Object.entries(attachmentMap || {});
            sidebarAttachments.value = entries.map(([key, value], index) => {
                const bytes = normalizeAttachmentBytes(value?.content || value?.data || value?.bytes || null);
                const size = bytes?.length || bytes?.byteLength || 0;
                return {
                    id: String(value?.filename || value?.name || key || `attachment-${index + 1}`),
                    name: String(value?.filename || value?.name || key || `Attachment ${index + 1}`),
                    size: size ? formatBytes(size) : '',
                    contentType: String(value?.contentType || value?.mimeType || 'application/octet-stream'),
                    content: bytes || null,
                };
            });
        } catch {
            sidebarAttachments.value = [];
        }

        try {
            const outline = await pdfDoc.getOutline?.();
            const flattened = await flattenOutlineItems(outline || []);
            sidebarBookmarks.value = flattened.filter(item => Number.isInteger(item.page));
        } catch {
            sidebarBookmarks.value = [];
        }

        try {
            const optional = await pdfDoc.getOptionalContentConfig?.();
            const groups = optional?.getGroups?.();
            const layerList = Object.values(groups || {}).map((group, index) => ({
                id: String(group?.id || `layer-${index}`),
                name: String(group?.name || `Layer ${index + 1}`),
                visible: group?.visible !== false,
            }));
            sidebarLayers.value = layerList;
        } catch {
            sidebarLayers.value = [];
        }
    };

    const reloadPage = (pageId) => {
        const oldPages = toRaw(pages.value);

        const page = oldPages.find(p => p.id === pageId);
        if (!page) return;

        page.id = uuid();
        page.rendered = false;
        page.renderQuality = 'none';
        pages.value = [...oldPages];
    }

    const insertPage = (index) => {
        const oldPages = toRaw(pages.value);
        if (index < 0 || index > oldPages.length) return;

        const newPage = getPages(1)[0];
        newPage.index = index;
        newPage.rendered = false;
        newPage.renderQuality = 'none';
        newPage.visible = false;
        oldPages.splice(index, 0, newPage);

        // Update indexes of subsequent pages
        for (let i = index; i < oldPages.length; i++) {
            oldPages[i].index = i;
        }

        pageCount.value = oldPages.length;
        pages.value = [...oldPages];
        applyVisibleWindowForActiveIndex(pageIndex.value, { force: true });
    }

    watch(pageIndex, async (newIndex) => {
        pageNum.value = newIndex + 1;
        storePageIndex(filename.value, newIndex);

        const windowChanged = applyVisibleWindowForActiveIndex(newIndex);
        if (windowChanged) {
            await nextTick();
            setupIntersectionObserver();
            setupLazyLoadObserver();
        }

        scheduleHighQualityUpgrade();
    });

    const isFirstPage = computed(() => {
        return pageNum.value <= 1;
    });

    const isLastPage = computed(() => {
        return pageNum.value >= activePages.value.length;
    });

    const handlePageNumberInput = (event) => {
        const pageNo = parseInt(event.target.value);
        
        if (isNaN(pageNo) || pageNo < 1) {
            // Invalid page number
            pageNum.value = 1;
            return;
        }

        const lastPageNum = activePages.value.length;

        if (pageNo > lastPageNum) {
            pageNum.value = lastPageNum;
            return;
        }

        scrollToPage(pageNo - 1);
    }

    const setupLazyLoadObserver = () => {
        // Clean up existing observer
        if (lazyLoadObserver.value) {
            lazyLoadObserver.value.disconnect();
        }
        
        const options = {
            root: pdfReader.value,
            rootMargin: '200px', // Start loading 200px before entering viewport
            threshold: 0.01
        };

        lazyLoadObserver.value = new IntersectionObserver((entries) => {
            entries.forEach(async entry => {
                if (entry.isIntersecting) {
                    const pageId = entry.target.getAttribute('data-page');
                    const page = pages.value.find(p => p.id === pageId);
                    if (!page || !page.visible) return;

                    if (!pdfDoc) return;
                    await renderPdfPage(pageId, 'low');

                    const activeSourceIndex = getVisiblePageSourceIndex(pageIndex.value);
                    if (activeSourceIndex !== -1 && Math.abs(page.index - activeSourceIndex) <= 1) {
                        renderPdfPage(pageId, 'high').catch(() => {});
                    }
                }
            });
        }, options);
        
        // Observe all page containers
        if (pagesContainer.value) {
            const pageContainers = pagesContainer.value.querySelectorAll('.page-container');
            pageContainers.forEach(container => {
                lazyLoadObserver.value.observe(container);
            });
        }
    };

    const setupIntersectionObserver = () => {
        // Clean up existing observer
        if (intersectionObserver.value) {
            intersectionObserver.value.disconnect();
        }
        
        const options = {
            root: pdfReader.value,
            rootMargin: '-45% 0px -45% 0px', // Trigger when middle of viewport
            threshold: 0
        };
        
        intersectionObserver.value = new IntersectionObserver((entries) => {
            // Find the most visible page
            let maxRatio = 0;
            let mostVisiblePage = null;
            
            entries.forEach(entry => {
                if (entry.isIntersecting && entry.intersectionRatio > maxRatio) {
                    maxRatio = entry.intersectionRatio;
                    mostVisiblePage = entry.target;
                }
            });
            
            if (mostVisiblePage) {
                const visiblePageId = mostVisiblePage.getAttribute('data-page');
                if (!visiblePageId) return;

                const page = pages.value.find(p => p.id === visiblePageId);

                if (page && !page.deleted) {
                    if (isProgrammaticNavigation && programmaticTargetPageId && visiblePageId !== programmaticTargetPageId) {
                        return;
                    }

                    const activeIndex = activePages.value.findIndex(p => p.id === visiblePageId);
                    if (!isProgrammaticNavigation && activeIndex !== -1 && activeIndex !== pageIndex.value) {
                        pageIndex.value = activeIndex;
                        storePageIndex();
                    }
                }
            }
        }, options);
        
        // Observe all page containers
        if (pagesContainer.value) {
            const pageContainers = pagesContainer.value.querySelectorAll('.page-container');
            pageContainers.forEach(container => {
                intersectionObserver.value.observe(container);
            });
        }
    };

    const storePageIndex = () => {
        storeSet(filename.value, {
            pageIndex: pageIndex.value
        });
    }

    const getStoredPageIndex = async () => {
        try {
            const data = await storeGet(filename.value);
            if (Number.isInteger(data?.pageIndex) && data.pageIndex >= 0) {
                return data.pageIndex;
            }
        } catch (error) {
            console.warn('Failed to get stored page index:', error);
        }

        return 0;
    }
    
    const scrollToPage = (targetPageIndex, options = {}) => {
        if (isNaN(targetPageIndex)) return;
        const maxIndex = Math.max(0, activePages.value.length - 1);
        const normalizedIndex = Math.min(Math.max(0, targetPageIndex), maxIndex);
        const targetPage = activePages.value[normalizedIndex];
        if (!targetPage) return;

        const sourceIndex = pages.value.findIndex(p => p.id === targetPage.id);
        if (sourceIndex === -1) return;

        visibleWindowStart = -1;
        const windowChanged = applyVisibleWindowForActiveIndex(normalizedIndex, { force: true });

        const navigationToken = beginProgrammaticNavigation(targetPage.id);
        pageIndex.value = normalizedIndex;

        const scrollToTarget = () => {
            const container = pagesContainer.value?.querySelector(`.page-container[data-page="${targetPage.id}"]`);
            if (!container) return;

            const rawOffsetRatio = Number(options?.offsetRatio);
            const hasOffsetRatio = Number.isFinite(rawOffsetRatio);

            if (!hasOffsetRatio || !pdfReader.value) {
                container.scrollIntoView({ block: 'start' });
                return;
            }

            const ratio = Math.min(Math.max(rawOffsetRatio, 0), 1);
            const readerRect = pdfReader.value.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            const containerTopInReader = (containerRect.top - readerRect.top) + pdfReader.value.scrollTop;
            const targetTop = Math.max(0, containerTopInReader + (container.clientHeight * ratio) - 12);
            pdfReader.value.scrollTo({ top: targetTop, behavior: 'auto' });
        };

        if (windowChanged) {
            nextTick().then(() => {
                setupIntersectionObserver();
                setupLazyLoadObserver();
                scrollToTarget();
                scheduleHighQualityUpgrade();
                endProgrammaticNavigation(navigationToken);
            });
            return;
        }

        scrollToTarget();
        scheduleHighQualityUpgrade();
        endProgrammaticNavigation(navigationToken);
    };

    const scrollToFirstPage = () => {
        scrollToPage(0);
    };

    const scrollToLastPage = () => {
        const lastIndex = activePages.value.length - 1;
        scrollToPage(lastIndex);
    };

    // File Loaded Event Emitter
    const handleFileLoadEvent = (type) => {
        isFileLoaded.value = true;

        setCurrentTab({
            id: fileId,
            filename: filename.value,
            path: filepath.value,
            type,
        });
    };

    const getTextExtractionOrder = (priorityIndex = pageIndex.value) => {
        const total = pages.value.length;
        if (!total) return [];

        const safePriority = Math.min(Math.max(0, Number(priorityIndex) || 0), total - 1);
        const ordered = [];
        const seen = new Set();

        const pushIndex = (idx) => {
            if (idx < 0 || idx >= total || seen.has(idx)) return;
            seen.add(idx);
            ordered.push(idx);
        };

        pushIndex(safePriority);

        for (let offset = 1; ordered.length < total; offset++) {
            pushIndex(safePriority - offset);
            pushIndex(safePriority + offset);
        }

        return ordered;
    };

    const ensureTextContentForSearch = async (priorityIndex = pageIndex.value) => {
        if (!pdfDoc) return;

        textExtractionRunId += 1;
        const runId = textExtractionRunId;

        if (extractTextTimeout) {
            clearTimeout(extractTextTimeout);
            extractTextTimeout = null;
        }

        const orderedIndices = getTextExtractionOrder(priorityIndex);
        let processedSinceYield = 0;

        for (const index of orderedIndices) {
            if (runId !== textExtractionRunId || !pdfDoc) return;

            const pageState = pages.value[index];
            if (!pageState || pageState.textContent?.items?.length) continue;

            try {
                const page = await pdfDoc.getPage(index + 1);
                if (runId !== textExtractionRunId || !pdfDoc) return;

                const textContent = await page.getTextContent();
                if (pages.value[index]) {
                    pages.value[index].textContent = textContent;
                    syncPageTextIndex(index, textContent);
                }

                processedSinceYield += 1;
                if (processedSinceYield >= 2) {
                    processedSinceYield = 0;
                    await yieldToUI();
                }
            } catch (error) {
                console.error(`Error extracting text from page ${index + 1}:`, error);
            }
        }
    };

    const ensureAnnotationsForAllPages = async (priorityIndex = pageIndex.value) => {
        if (!pdfDoc) return;

        annotationExtractionRunId += 1;
        const runId = annotationExtractionRunId;

        if (extractAnnotationsTimeout) {
            clearTimeout(extractAnnotationsTimeout);
            extractAnnotationsTimeout = null;
        }

        const orderedIndices = getTextExtractionOrder(priorityIndex);
        let processedSinceYield = 0;
        updateAnnotationHydrationStatus(true);

        try {
            for (const index of orderedIndices) {
                if (runId !== annotationExtractionRunId || !pdfDoc) return;

                const pageState = pages.value[index];
                if (!pageState) continue;

                if (pageState.annotationsHydrated) {
                    updateAnnotationHydrationStatus(true);
                    continue;
                }

                try {
                    const page = await pdfDoc.getPage(index + 1);
                    if (runId !== annotationExtractionRunId || !pdfDoc) return;

                    const viewport = page.getViewport({ scale: 1 });
                    const rawAnnotations = await page.getAnnotations();

                    const latestPageState = pages.value[index];
                    if (latestPageState) {
                        setPageAnnotations(latestPageState, rawAnnotations, viewport);
                        syncCommentStrokesFromAnnotations(latestPageState, rawAnnotations, viewport);
                        syncAttachmentStrokesFromAnnotations(latestPageState, rawAnnotations, viewport);
                        latestPageState.annotationsHydrated = true;
                        updateAnnotationHydrationStatus(true);
                    }

                    processedSinceYield += 1;
                    if (processedSinceYield >= 2) {
                        processedSinceYield = 0;
                        await yieldToUI();
                    }
                } catch (error) {
                    console.warn(`Error extracting annotations from page ${index + 1}:`, error);
                }
            }
        } finally {
            if (runId === annotationExtractionRunId) {
                updateAnnotationHydrationStatus(false);
            }
        }
    };

    const searchTextIndexFallback = (term, options = {}) => {
        const { caseSensitive = false, wholeWords = false } = options;
        const escaped = String(term || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const flags = caseSensitive ? 'g' : 'gi';
        const regex = new RegExp(wholeWords ? `\\b${escaped}\\b` : escaped, flags);
        const matches = [];

        for (let pageIndex = 0; pageIndex < pages.value.length; pageIndex++) {
            const items = buildSearchItems(pages.value[pageIndex]?.textContent);
            for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
                const itemText = items[itemIndex];
                regex.lastIndex = 0;
                let match;

                while ((match = regex.exec(itemText)) !== null) {
                    matches.push({
                        pageIndex,
                        itemIndex,
                        matchIndex: match.index,
                        str: itemText,
                        matchLength: match[0].length,
                    });

                    if (match.index === regex.lastIndex) regex.lastIndex += 1;
                    if (!regex.global) break;
                }
            }
        }

        return matches;
    };

    const searchTextIndex = async (term, options = {}) => {
        const safeTerm = String(term || '').trim();
        if (!safeTerm) return [];

        pendingSearchRequests.forEach((request, requestId) => {
            request.reject(new Error('Search superseded by newer query'));
            pendingSearchRequests.delete(requestId);
            if (searchWorker) {
                searchWorker.postMessage({ type: 'search-cancel', requestId });
            }
        });

        // Run extraction in background so worker can stream partial matches as pages are indexed.
        ensureTextContentForSearch(pageIndex.value);

        if (!searchWorker) {
            const matches = searchTextIndexFallback(safeTerm, options);
            if (typeof options.onPartial === 'function') {
                options.onPartial(matches, {
                    scannedPages: pages.value.length,
                    totalPages: pages.value.length,
                    totalMatches: matches.length,
                    done: true,
                });
            }
            return matches;
        }

        const requestId = ++searchRequestId;

        const results = [];

        return new Promise((resolve, reject) => {
            pendingSearchRequests.set(requestId, {
                resolve,
                reject,
                onPartial: (chunk = [], meta = {}) => {
                    if (chunk.length > 0) {
                        results.push(...chunk);
                    }

                    if (typeof options.onPartial === 'function') {
                        options.onPartial(results.slice(), meta);
                    }
                },
            });

            searchWorker.postMessage({
                type: 'search-start',
                requestId,
                term: safeTerm,
                caseSensitive: !!options.caseSensitive,
                wholeWords: !!options.wholeWords,
                totalPages: pages.value.length,
            });
        }).then(() => results);
    };

    const renderAllPages = async () => {
        if (!pdfDoc) return;

        const numPages = pdfDoc.numPages;
        setPages(numPages);
        applyVisibleWindowForActiveIndex(pageIndex.value, { force: true });

        // Wait for Vue to render new page elements (keys changed due to new UUIDs)
        await nextTick();

        // Keep startup light: extract text on demand from search flow.

        // Don't render any pages here - let lazy loading handle it
        // Setup observers after pages structure is ready
        setupIntersectionObserver();
        setupLazyLoadObserver();
    };

    const getDocumentCallback = async (pdfDoc_) => {
        loadFileCallback();
        pdfDoc = pdfDoc_;
        handleFileLoadEvent('pdf');
        await renderAllPages();
        loadSidebarDocumentData().catch(() => {});

        const storedPageIndex = await getStoredPageIndex();
        scrollToPage(storedPageIndex);

        // Hydrate annotations for all pages in the background, similar to search text indexing.
        extractAnnotationsTimeout = setTimeout(() => {
            ensureAnnotationsForAllPages(storedPageIndex).catch((error) => {
                console.warn('Background annotation extraction failed:', error);
            });
        }, 0);
    }

    const loadFile = async (event) => {
        const file = event?.target?.files?.[0] || event;
        
        if (!file) {
            await showModal('Unsupported file type. Please select a PDF file.');
            return
        };

        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            if (file) {
                internalFileSize.value = file.size;
                filename.value = file.name;
                filepath.value = file.path || null;
                const url = URL.createObjectURL(file);
                getDocument(url).promise.then(getDocumentCallback).catch(async error => {
                    console.error('Error loading PDF:', error);
                    await showModal('Error loading PDF: ' + error.message);
                });
            }
        } else {
            await showModal('Unsupported file type. Please select a PDF file.');
        }
    };

    const processFileOpenResult =  async (result) => {
        if (!result) return;

        filepath.value = result.filepath;
        
        // Handle PDF files
        if (result.type === 'pdf' && result.encoding === 'base64') {
            filename.value = result.filename || 'document.pdf';
            
            // Convert base64 to Uint8Array
            const binaryString = atob(result.content);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            // Store a copy of the original PDF data for saving (avoid detached ArrayBuffer issue)
            originalPdfData.value = new Uint8Array(bytes);
            
            // Load PDF from binary data
            getDocument({ data: bytes }).promise.then(getDocumentCallback).catch(async error => {
                console.error('Error loading PDF:', error);
                await showModal('Error loading PDF: ' + error.message);
            });
        } else {
            await showModal('Unsupported file type. Please select a PDF file.');
        }
    };

    const handleFileOpen = async () => {
        if (Electron.value) {
            const result = await Electron.value.openFile();
            processFileOpenResult(result);
            return;
        }

        if (fileInput.value) {
            fileInput.value.click();
        }
    };

    let saveFileTimeout = null;

    const handleSaveFile = async () => {
        if (!pdfDoc || !isFileLoaded.value) return;

        try {
            // Get the original PDF data
            let arrayBuffer;

            if (originalPdfData.value) {
                // Electron mode - use stored data (convert Uint8Array to ArrayBuffer)
                arrayBuffer = originalPdfData.value.buffer.slice(originalPdfData.value.byteOffset, originalPdfData.value.byteOffset + originalPdfData.value.byteLength);
            } else if (fileInput.value?.files[0]) {
                // Browser mode - read from file input
                const file = fileInput.value.files[0];
                arrayBuffer = await file.arrayBuffer();
            } else {
                console.error('No PDF data available');
                return;
            }
            
            const pdfLibDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

            // Process each page with annotations
            for (const page of pages.value) {
                const strokes = page.strokes || [];
                const pdfPage = pdfLibDoc.getPage(page.index);
                const { width, height } = pdfPage.getSize();

                removeNativeTextCommentAnnotations(pdfLibDoc, pdfPage);

                if (!strokes || strokes.length === 0) continue;

                // Get the canvas dimensions for scaling
                const canvas = page.canvas;
                if (!canvas) continue;

                const scaleX = width / canvas.width;
                const scaleY = height / canvas.height;

                // Draw each stroke on the PDF
                for (const stroke of strokes) {
                    if (stroke.length === 0) continue;

                    const first = stroke[0];

                    // Convert color string to RGB
                    const colorMap = {
                        'black': [0, 0, 0], 'dimgray': [0.41, 0.41, 0.41], 'gray': [0.5, 0.5, 0.5],
                        'darkgray': [0.66, 0.66, 0.66], 'silver': [0.75, 0.75, 0.75], 'white': [1, 1, 1],
                        'magenta': [1, 0, 1], 'red': [1, 0, 0], 'orangered': [1, 0.27, 0],
                        'orange': [1, 0.65, 0], 'gold': [1, 0.84, 0], 'yellow': [1, 1, 0],
                        'green': [0, 0.5, 0], 'darkgreen': [0, 0.39, 0], 'lime': [0, 1, 0],
                        'teal': [0, 0.5, 0.5], 'cyan': [0, 1, 1], 'navy': [0, 0, 0.5],
                        'blue': [0, 0, 1], 'darkblue': [0, 0, 0.55], 'royalblue': [0.25, 0.41, 0.88],
                        'purple': [0.5, 0, 0.5], 'pink': [1, 0.75, 0.8],
                        'brown': [0.65, 0.16, 0.16], 'sienna': [0.63, 0.32, 0.18],
                        'olive': [0.5, 0.5, 0], 'maroon': [0.5, 0, 0], 'coral': [1, 0.5, 0.31],
                        'salmon': [0.98, 0.5, 0.45]
                    };

                    const getColor = (colorName) => {
                        const rgbArray = colorMap[colorName] || [0, 0, 0];
                        return rgb(rgbArray[0], rgbArray[1], rgbArray[2]);
                    };

                    const color = getColor(first.color);
                    const thickness = (first.thickness || 2) * scaleX;

                    // Handle text
                    if (first.type === 'text') {
                        const x = first.x * scaleX;
                        const y = height - (first.y * scaleY);
                        const textSize = (first.fontSize || 16) * scaleX;
                        
                        pdfPage.drawText(first.text, {
                            x: x,
                            y: y - textSize,
                            size: textSize,
                            color: color
                        });
                    }
                    // Handle shapes
                    else if (first.type === 'line') {
                        const startX = first.startX * scaleX;
                        const startY = height - (first.startY * scaleY);
                        const endX = first.endX * scaleX;
                        const endY = height - (first.endY * scaleY);

                        pdfPage.drawLine({
                            start: { x: startX, y: startY },
                            end: { x: endX, y: endY },
                            thickness: thickness,
                            color: color,
                            opacity: 1
                        });
                    } else if (first.type === 'rectangle') {
                        const x = first.startX * scaleX;
                        const y = height - (first.startY * scaleY);
                        const w = (first.endX - first.startX) * scaleX;
                        const h = (first.endY - first.startY) * scaleY;

                        pdfPage.drawRectangle({
                            x: x,
                            y: y - h,
                            width: w,
                            height: h,
                            borderColor: color,
                            borderWidth: thickness,
                            opacity: 0
                        });
                    } else if (first.type === 'circle') {
                        const centerX = first.startX * scaleX;
                        const centerY = height - (first.startY * scaleY);
                        const radius = Math.sqrt(
                            Math.pow((first.endX - first.startX) * scaleX, 2) +
                            Math.pow((first.endY - first.startY) * scaleY, 2)
                        );

                        pdfPage.drawCircle({
                            x: centerX,
                            y: centerY,
                            size: radius,
                            borderColor: color,
                            borderWidth: thickness,
                            opacity: 0
                        });
                    } else if (first.type === 'highlight-rect') {
                        const rects = first.rects || [{ x: first.x, y: first.y, width: first.width, height: first.height }];
                        
                        for (const rect of rects) {
                            const x = rect.x * scaleX;
                            const h = rect.height * scaleY;
                            const y = height - (rect.y * scaleY) - h;
                            const w = rect.width * scaleX;

                            pdfPage.drawRectangle({
                                x: x,
                                y: y,
                                width: w,
                                height: h,
                                color: color,
                                opacity: 0.3,
                                borderWidth: 0
                            });
                        }
                    } else if (first.type === 'comment') {
                        addNativeCommentAnnotation(pdfLibDoc, pdfPage, first, scaleX, scaleY, height);
                    } else if (first.type === 'pen') {
                        // Draw pen strokes as connected lines
                        for (let i = 0; i < stroke.length - 1; i++) {
                            const point1 = stroke[i];
                            const point2 = stroke[i + 1];

                            const x1 = point1.x * scaleX;
                            const y1 = height - (point1.y * scaleY);
                            const x2 = point2.x * scaleX;
                            const y2 = height - (point2.y * scaleY);

                            pdfPage.drawLine({
                                start: { x: x1, y: y1 },
                                end: { x: x2, y: y2 },
                                thickness: (point1.thickness || 2) * scaleX,
                                color: getColor(point1.color),
                                opacity: 1
                            });
                        }
                    } else if (first.type === 'image' && first.imageData) {
                        try {
                            const dataUrl = first.imageData;
                            const base64Data = dataUrl.split(',')[1];
                            
                            let image;
                            if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) {
                                image = await pdfLibDoc.embedJpg(base64Data);
                            } else {
                                image = await pdfLibDoc.embedPng(base64Data);
                            }

                            const imageWidth = first.width * scaleX;
                            const imageHeight = first.height * scaleY;
                            
                            pdfPage.drawImage(image, {
                                x: first.x * scaleX,
                                y: height - (first.y * scaleY) - imageHeight,
                                width: imageWidth,
                                height: imageHeight,
                            });
                        } catch (err) {
                            console.error('Error embedding image stroke:', err);
                        }
                    }
                }
            }

            // Remove any pages that were deleted by the user before saving
            const deletedPages = new Set(pages.value.map((p, i) => p.deleted ? i + 1 : null).filter(p => p));

            // Flatten interactive form fields into the PDF if the callback is provided
            if (typeof flattenToPdfLib === 'function') {
                try {
                    const pdfForm = pdfLibDoc.getForm();
                    flattenToPdfLib(pdfForm);
                } catch (e) {
                    console.warn('Form flatten failed:', e);
                }
            }
            if (deletedPages.size > 0) {
                try {
                    // Convert deleted page numbers to zero-based indexes and sort descending
                    const indices = Array.from(deletedPages)
                        .map(p => p - 1)
                        .filter(i => Number.isInteger(i) && i >= 0)
                        .sort((a, b) => b - a);

                    // Remove pages from the PDF document in descending order
                    indices.forEach(idx => {
                        try {
                            if (typeof pdfLibDoc.removePage === 'function') {
                                pdfLibDoc.removePage(idx);
                            }
                        } catch (err) {
                            console.error('Failed to remove page index', idx, err);
                        }
                    });
                } catch (err) {
                    console.error('Error removing deleted pages before save:', err);
                }
            }

            // Save the modified PDF
            const pdfBytes = await pdfLibDoc.save();
            
            // If running in Electron and we have the original filepath, overwrite it
            if (Electron.value && filepath.value) {
                try {
                    // Convert Uint8Array to base64 in chunks to avoid call stack overflow
                    const uint8Array = new Uint8Array(pdfBytes);
                    let base64Content = '';
                    const chunkSize = 8192; // Process 8KB at a time
                    
                    for (let i = 0; i < uint8Array.length; i += chunkSize) {
                        const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
                        base64Content += String.fromCharCode.apply(null, Array.from(chunk));
                    }
                    base64Content = btoa(base64Content);
                    
                    const result = await Electron.value.saveFile(filepath.value, base64Content, 'base64');
                    
                    if (result.success) {
                        console.log('PDF saved successfully to:', result.filepath);
                        fileSavedCallback();
                        fileRecentlySaved.value = true;
                        clearTimeout(saveFileTimeout);
                        saveFileTimeout = setTimeout(() => {
                            fileRecentlySaved.value = false;
                        }, 2000);
                        return;
                    } else {
                        console.error('Electron save failed:', result.error);
                        console.error('Error code:', result.errorCode);
                        await showModal(`Failed to save PDF: ${result.error}\nError code: ${result.errorCode || 'unknown'}\nFalling back to download.`);
                        // Don't throw - fall through to download method
                    }
                } catch (err) {
                    console.error('Error saving with Electron:', err);
                    console.error('Error details:', {
                        message: err.message,
                        stack: err.stack,
                        filepath: filepath.value
                    });
                    await showModal(`Failed to save PDF with Electron: ${err.message}\nFalling back to download.`);
                    // Don't throw - fall through to download method
                }
            }
        
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            
            // Try to use File System Access API if available (Chrome/Edge)
            if ('showSaveFilePicker' in window) {
                try {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: filename.value,
                        types: [{
                            description: 'PDF Files',
                            accept: { 'application/pdf': ['.pdf'] }
                        }]
                    });
                    const writable = await handle.createWritable();
                    await writable.write(pdfBytes);
                    await writable.close();
                    console.log('PDF saved successfully with annotations to:', handle.name);
                    fileSavedCallback();
                    return;
                } catch (err) {
                    if (err.name === 'AbortError') {
                        console.log('Save cancelled by user');
                        return;
                    }
                    console.warn('File System Access API failed, falling back to download:', err);
                }
            }
        
            // Fallback: use download method
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename.value;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            console.log('PDF downloaded with annotations');
            fileSavedCallback();
        } catch (error) {
            console.error('Error saving PDF:', error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                hasElectron: !!Electron.value,
                hasFilepath: !!filepath.value,
                hasPdfData: !!originalPdfData.value
            });
            await showModal('Failed to save PDF: ' + error.message);
        }
    };

    const deletePage = async (index, callback) => {
        const page = pages.value[index];
        if (!pdfDoc || !page) return;
        
        const confirmed = await showModal(`Are you sure you want to delete page ${index + 1}?`, true);
        if (!confirmed) return;

        page.deleted = true;

        if (typeof callback !== 'function') return;
        callback({ type: 'delete-page', page });
    };

    const createBlankPage = async (callback) => {
        // Create a new single blank page PDF
        const pdfLibDoc = await PDFDocument.create();
        
        // Use standard letter size
        const width = 595; // 8.3 inches * 72 points/inch
        const height = 842; // 11.7 inches * 72 points/inch
        
        const blankPage = pdfLibDoc.addPage([width, height]);
        
        // Draw a white background
        blankPage.drawRectangle({
            x: 0,
            y: 0,
            width,
            height,
            color: rgb(1, 1, 1),
        });
        
        // Save and load the new PDF
        const pdfBytes = await pdfLibDoc.save();
        originalPdfData.value = new Uint8Array(pdfBytes);
        
        // Load the new PDF
        getDocument({ data: pdfBytes }).promise.then(async (pdfDoc_) => {
            filename.value = `Document_${Date.now()}.pdf`;
            filepath.value = null;
            loadFileCallback();
            pdfDoc = pdfDoc_;
            handleFileLoadEvent('pdf');
            
            await renderAllPages();
            
            // Wait for the page to be rendered by lazy load observer
            await nextTick();
            
            // Reset page index to 0 for the new blank page
            pageIndex.value = 0;
            
            // Poll for canvas to be ready
            if (typeof callback === 'function') {
                callback();
            }
        }).catch(async error => {
            console.error('Error creating blank PDF:', error);
            await showModal('Error creating blank page: ' + error.message);
        });
    };

    const rotatePage = async (direction) => {
        if (!pdfDoc) return;

        const rotationChange = direction === 'clockwise' ? 90 : -90;
        const page = activePage.value;

        // We can't easily rotate the page in the viewer client-side without re-rendering everything
        // So we'll rotate it in the PDF document model (pdf-lib) and reload the document.
        // This is a heavy operation but ensures consistency.

        // Get current PDF data
        let arrayBuffer;
        if (originalPdfData.value) {
            arrayBuffer = originalPdfData.value.buffer.slice(
                originalPdfData.value.byteOffset, 
                originalPdfData.value.byteOffset + originalPdfData.value.byteLength
            );
        } else if (fileInput.value?.files[0]) {
             const file = fileInput.value.files[0];
             arrayBuffer = await file.arrayBuffer();
        } else {
            return;
        }

        const pdfLibDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        const pdfPage = pdfLibDoc.getPage(page.index);
        
        const currentRotation = pdfPage.getRotation().angle;
        const newRotation = (currentRotation + rotationChange) % 360;
        const normalizedRotation = newRotation < 0 ? newRotation + 360 : newRotation;

        pdfPage.setRotation(pdfDegrees(normalizedRotation));

        // Save modified PDF
        const pdfBytes = await pdfLibDoc.save();
        originalPdfData.value = new Uint8Array(pdfBytes);

        // Reload PDF
        await getDocument({ data: pdfBytes }).promise.then(async (pdfDoc_) => {
            // Re-initialize viewer state
            pdfDoc = pdfDoc_;

            reloadPage(page.id);

            await nextTick();
            setupIntersectionObserver();
            setupLazyLoadObserver();
            
            // Restore position
            await nextTick();
            scrollToPage(page.index);
        }).catch(async (error) => {
            console.error('Error rotating page:', error);
            await showModal('Falied to rotate page: ' + error.message);
        })
    };

    const insertBlankPage = async (location) => {
        if (!pdfDoc) return;
        
        // Load the original PDF and add a blank page
        let arrayBuffer;
        if (originalPdfData.value) {
            arrayBuffer = originalPdfData.value.buffer.slice(
                originalPdfData.value.byteOffset, 
                originalPdfData.value.byteOffset + originalPdfData.value.byteLength
            );
        } else if (fileInput.value?.files[0]) {
            const file = fileInput.value.files[0];
            arrayBuffer = await file.arrayBuffer();
        } else {
            console.error('No PDF data available');
            return;
        }
        
        const pdfLibDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        const currentPageIndex = activePage.value.index;

        // Match the rendered page size (rotation/crop aware) when possible
        let width;
        let height;

        try {
            const currentPdfJsPage = await pdfDoc.getPage(currentPageIndex + 1);
            const viewport = currentPdfJsPage.getViewport({ scale: 1 });
            width = viewport.width;
            height = viewport.height;
        } catch (e) {
            console.warn('Could not read viewport size from pdf.js page, falling back to pdf-lib size:', e);
        }

        if (!width || !height) {
            const currentPage = pdfLibDoc.getPage(currentPageIndex);
            const size = currentPage.getSize();
            width = size.width;
            height = size.height;

            const rotation = ((currentPage.getRotation()?.angle || 0) % 360 + 360) % 360;
            if (rotation === 90 || rotation === 270) {
                [width, height] = [height, width];
            }
        }

        const insertIndex = location === 'after' ? currentPageIndex + 1 : currentPageIndex;
        
        // Create a blank page with same dimensions
        const blankPage = pdfLibDoc.insertPage(insertIndex, [width, height]);
        
        // Draw a white background
        blankPage.drawRectangle({
            x: 0,
            y: 0,
            width,
            height,
            color: rgb(1, 1, 1),
        });
        
        // Save the modified PDF back
        const pdfBytes = await pdfLibDoc.save();
        originalPdfData.value = new Uint8Array(pdfBytes);
        
        // Reload the PDF
        getDocument({ data: pdfBytes }).promise.then(async (pdfDoc_) => {
            pdfDoc = pdfDoc_;

            insertPage(insertIndex);
            
            await nextTick();
            setupIntersectionObserver();
            setupLazyLoadObserver();

            await nextTick();
            // Scroll to the newly inserted page
            scrollToPage(insertIndex);
            
            if (typeof callback === 'function') {
                callback({ type: 'insert-blank-page', pageNumber: pageNum.value });
            }
        }).catch(async error => {
            console.error('Error reloading PDF after blank page insertion:', error);
            await showModal('Error inserting blank page: ' + error.message);
        });
    };

    const createImage = (imageData, redrawAllStrokesCallback, addToHistoryCallback) => {
        if(!imageData) return;
        const img = new Image();
        img.onload = () => {
            // Add image to current page in visible viewport
            const canvasIndex = pageIndex.value;
            const page = pages.value[canvasIndex];
            const canvas = page?.drawingCanvas;
            
            if (!canvas) return;
            
            // Calculate visible viewport position on the canvas
            const pageContainer = pagesContainer.value?.querySelector(`.page-container[data-page="${page.id}"]`);
            const pdfReaderEl = pdfReader.value;
            
            let viewportCenterX = canvas.width / 2;
            let viewportCenterY = canvas.height / 2;
            
            if (pageContainer && pdfReaderEl) {
                const containerRect = pageContainer.getBoundingClientRect();
                const readerRect = pdfReaderEl.getBoundingClientRect();
                
                // Calculate visible center relative to the page
                const visibleCenterX = (readerRect.left + readerRect.width / 2) - containerRect.left;
                const visibleCenterY = (readerRect.top + readerRect.height / 2) - containerRect.top;
                
                // Convert to canvas coordinates
                const scaleX = canvas.width / containerRect.width;
                const scaleY = canvas.height / containerRect.height;
                
                viewportCenterX = visibleCenterX * scaleX;
                viewportCenterY = visibleCenterY * scaleY;
            }
            
            // Use the full image dimensions without artificial limits
            let width = img.width;
            let height = img.height;
            
            // Only scale down if image is larger than canvas
            if (width > canvas.width || height > canvas.height) {
                const ratio = Math.min(canvas.width / width, canvas.height / height);
                width *= ratio;
                height *= ratio;
            }
            
            // Center the image in the visible viewport on the canvas
            const x = Math.max(0, Math.min(canvas.width - width, viewportCenterX - width / 2));
            const y = Math.max(0, Math.min(canvas.height - height, viewportCenterY - height / 2));
            
            const imageStroke = [{
                type: 'image',
                x,
                y,
                width,
                height,
                imageData,
                originalWidth: width,
                originalHeight: height
            }];
            
            const strokeId = uuid();
            // Assign a stable id to the image stroke for history ops
            imageStroke[0].id = strokeId;

            if (!page.strokes) {
                page.strokes = [];
            }

            page.strokes.push(imageStroke);
            
            redrawAllStrokesCallback(canvasIndex);
            // Use unified history action shape
            addToHistoryCallback({ type: 'add', id: strokeId, page: page, stroke: imageStroke });
        };

        img.src = imageData;
    }

    const createImageImportHandler = (redrawAllStrokesCallback, addToHistoryCallback) => {
        return async (event) => {
            const file = event.target.files?.[0];
            if (!file || !file.type.startsWith('image/')) return;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                createImage(e.target.result, redrawAllStrokesCallback, addToHistoryCallback);
            };
            reader.readAsDataURL(file);
            
            // Reset input
            event.target.value = '';
        };
    };

    // Open a blank page
    const openNewBlankPage = (redrawAllStrokes, addToHistory, imageData) => {
        if (isFileLoaded.value) {
            openNewTab();
            fileDataCache.value = {
                type: 'blank',
            }
            return;
        }
        
        createBlankPage(() => {
            createImage(imageData, redrawAllStrokes, addToHistory);
        });
    };

    // Keep the PDF.js text layer aligned with the canvas after zoom/resize.
    // Pages are rendered once and then CSS size changes; we must update the text-layer scale.
    const resyncRenderedTextLayers = async () => {
        if (!isFileLoaded.value) return;
        await nextTick();
        for (const page of pages.value) {
            if (page.deleted) continue;
            const canvas = page.canvas;
            const textLayerDiv = page.textLayer;
            if (!canvas || !textLayerDiv) continue;

            const cssWidth = canvas.offsetWidth;
            const cssHeight = canvas.offsetHeight;
            if (!cssWidth || !cssHeight || !canvas.width || !canvas.height) continue;

            const scaleX = cssWidth / canvas.width;
            const scaleY = cssHeight / canvas.height;

            textLayerDiv.style.width = `${canvas.width}px`;
            textLayerDiv.style.height = `${canvas.height}px`;
            textLayerDiv.style.transformOrigin = '0 0';
            textLayerDiv.style.transform = `scale(${scaleX}, ${scaleY})`;
        }
    };

    const showDocumentProperties = async () => {
        if (!pdfDoc) return;
        
        try {
            const { info } = await pdfDoc.getMetadata();

            const size = originalPdfData.value ? originalPdfData.value.byteLength : internalFileSize.value;
            const fileSize = size ? formatBytes(size) : 'Unknown';
            console.log(info);
            
            const properties = {
                "File Name": filename.value,
                "File Size": fileSize,
                "Title": info?.Title || '-',
                "Author": info?.Author || '-',
                "Subject": info?.Subject || '-',
                "Keywords": info?.Keywords || '-',
                "Creator": info?.Creator || '-',
                "Producer": info?.Producer || '-',
                "Creation Date": formatPdfDate(info?.CreationDate),
                "Modification Date": formatPdfDate(info?.ModDate),
                "PDF Format Version": info?.PDFFormatVersion || '-',
                "Page Count": pageCount.value

            };

            await showModal(properties, false, 'lg', 'Properties');
            
        } catch (error) {
            console.error('Error getting document properties:', error);
            await showModal('Failed to retrieve document properties.');
        }
    };

    const openPreferences = () => {
        showModal({}, false, 'lg', 'Preferences');
    };

    // Zoom Management
    const minZoom = 25;
    const maxZoom = 300;
    const zoomLevels = computed(() => {
        const levels = [];
        for (let z = minZoom; z <= maxZoom; z += 25) {
            levels.push(z);
        }
        return levels;
    });

    const toggleZoomMode = (mode) => {
        if (!isFileLoaded.value) return;
        
        if (mode === 'fit-height') {
            const pageContainer = document.querySelector(`.page-container[data-page="${activePage.value.id}"]`);
            const percentage = pdfReader.value.clientHeight * zoomPercentage.value / pageContainer.clientHeight;
            zoomPercentage.value = Math.ceil(percentage);
        } else {
            zoomPercentage.value = 100; // Full width
        }
        
        // Keep text selection aligned after CSS zoom changes
        nextTick(async () => {
            await resyncRenderedTextLayers();
            scrollToPage(pageIndex.value);
            // syncTextEditorPosition();
        });
    };

    const handleZoomLevel = (percentage) => {
        if (!isFileLoaded.value) return;

        if (isNaN(percentage)) {
            toggleZoomMode(percentage);
            return;
        }

        if (!zoomLevels.value.includes(percentage)) {
            percentage = zoomLevels.value.reduce((prev, curr) => {
                return (Math.abs(curr - percentage) < Math.abs(prev - percentage) ? curr : prev);
            });
        }

        zoomPercentage.value = Math.min(Math.max(minZoom, percentage), maxZoom);

        // Keep text selection aligned after CSS zoom changes
        nextTick(async () => {
            await resyncRenderedTextLayers();
            scrollToPage(pageIndex.value);
            // syncTextEditorPosition();
        });
    };

    const onZoomLevelChange = (event) => {
        let percentage = event.target.value;
        handleZoomLevel(percentage);
    }

    const zoom = (direction) => {
        if (!isFileLoaded.value) return;
        const newZoom = zoomPercentage.value + (direction * 25);
        handleZoomLevel(newZoom);
    }

    // Print
    const printModal = ref(null);
    const printPage = () => {
        printModal.value?.printPage();
    };

    // Comment Sidebar
    const documentComments = computed(() => {
        const flatComments = pages.value
            .flatMap((page) => (page.strokes || []).map((stroke, strokeIndex) => {
                const first = stroke?.[0] || null;
                if (!first) return null;
                const commentText = String(first.comment || '').trim();
                if (!commentText) return null;
                const isCommentIcon = first.type === 'comment';

                return {
                    id: isCommentIcon
                        ? String(first.id || `${page.id}-${strokeIndex}`)
                        : String(first.commentId || `${first.id || `${page.id}-${strokeIndex}`}-comment`),
                    pageId: page.id,
                    pageIndex: page.index,
                    strokeIndex,
                    stroke,
                    selectedText: isCommentIcon ? String(first.selectedText || '') : '',
                    comment: commentText,
                    author: String(first.author || ''),
                    source: String(first.source || first.commentSource || ''),
                    canJumpToText: isCommentIcon && Boolean(collapseWhitespace(first.selectedText || '')),
                    updatedAt: first.updatedAt || first.createdAt || null,
                };
            }))
            .filter(Boolean)
            .sort((left, right) => {
                if (left.pageIndex !== right.pageIndex) return left.pageIndex - right.pageIndex;
                const leftTime = left.updatedAt ? new Date(left.updatedAt).getTime() : 0;
                const rightTime = right.updatedAt ? new Date(right.updatedAt).getTime() : 0;
                return rightTime - leftTime;
            });

        const groups = new Map();

        flatComments.forEach((comment) => {
            const groupId = `${comment.pageId}-${comment.pageIndex}`;
            if (!groups.has(groupId)) {
                groups.set(groupId, {
                    id: groupId,
                    pageId: comment.pageId,
                    pageIndex: comment.pageIndex,
                    comments: [],
                });
            }

            groups.get(groupId).comments.push(comment);
        });

        return Array.from(groups.values())
            .sort((left, right) => left.pageIndex - right.pageIndex)
            .map((group) => ({
                ...group,
                count: group.comments.length,
            }));
    });

    const ensureCommentPageReady = async (commentRef) => {
        if (!commentRef) return null;
        const page = pages.value.find(entry => entry.id === commentRef?.pageId)
            || pages.value.find(entry => entry.index === commentRef?.pageIndex)
            || null;

        if (!page) return null;

        if (pageIndex.value !== page.index) {
            scrollToPage(page.index);
            await nextTick();
        }

        if (!page.rendered) {
            await renderPdfPage(page.id);
            await nextTick();
        }

        return page;
    };

    const revealCommentSourceText = async (commentRef) => {
        const page = await ensureCommentPageReady(commentRef);
        if (!page) return false;

        const match = findBestCommentTextRange(page, commentRef);
        if (!match?.range) return false;

        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(match.range);

        match.element?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
        return true;
    };

    return {
        fileId,
        pages,
        isFileLoaded,
        pdfReader,
        pagesContainer,
        fileInput,
        pageCount,
        pageIndex,
        pageNum,
        isFirstPage,
        isLastPage,
        zoomPercentage,
        loadFile,
        processFileOpenResult,
        handleFileOpen,
        handleSaveFile,
        intersectionObserver,
        lazyLoadObserver,
        scrollToPage,
        scrollToFirstPage,
        scrollToLastPage,
        activePage,
        activePages,
        deletePage,
        insertBlankPage,
        openNewBlankPage,
        createImageImportHandler,
        handlePageNumberInput,
        renderPdfPage,
        renderPageThumbnail,
        resyncRenderedTextLayers,
        ensureTextContentForSearch,
        searchTextIndex,
        showDocumentProperties,
        rotatePage,
        openPreferences,
        printModal,
        printPage,
        resetForm,
        handlePdfButtonAction,
        minZoom,
        maxZoom,
        zoomLevels,
        onZoomLevelChange,
        zoom,
        documentComments,
        annotationHydrationProgress,
        sidebarBookmarks,
        sidebarAttachments,
        sidebarLayers,
        downloadAttachment,
        previewCommentSelection,
        revealCommentSourceText,
        ensureCommentPageReady,
    }
}