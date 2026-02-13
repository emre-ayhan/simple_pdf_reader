<script setup>
import { Modal } from 'bootstrap';
import { ref, computed, nextTick, onMounted } from 'vue';
import { Electron } from '../composables/useElectron';

const props = defineProps({
    pageCount: {
        type: Number,
        required: true,
    },
    activePages: {
        type: Array,
        required: true,
    },
    pdfCanvases: {
        type: Array,
        required: true,
    },
    drawingCanvases: {
        type: Array,
        required: true,
    },
    renderPdfPage: {
        type: Function,
        required: true,
    },
});

// Ensure all pages are rendered before printing.
const renderAllPagesForPrint = async () => {
    // Ensure refs/canvases exist
    await nextTick();

    if (!pageCount.value || typeof props.renderPdfPage !== 'function') return;

    for (let page = 1; page <= pageCount.value; page++) {
        if (deletedPages.value.has(page)) continue;
        await props.renderPdfPage(page);
        await nextTick();
    }

    // Give the DOM a moment to apply final sizes before print
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 150));
};

// Custom Print Modal (Electron)
const printModalEl = ref(null);
let printModalInstance = null;

const printPageRange = ref('');
const printCopies = ref(1);
const printPrinters = ref([]);
const printDeviceName = ref('');
const printIncludeAnnotations = ref(true);
const printOrientation = ref('portrait'); // 'portrait' | 'landscape'

const printPreviewPageIndex = ref(0);

const printPreviewDataUrl = ref('');
const printBusy = ref(false);
const printError = ref('');
let printPreviewTimer = null;

const canSilentPrint = computed(() => !!Electron.value?.printImages);

const parsePageRange = (rangeText) => {
    const active = new Set(props.activePages);
    const total = props.pageCount || 0;

    const raw = (rangeText || '').trim();
    if (!raw || raw.toLowerCase() === 'all') {
        return Array.from(active);
    }

    const out = new Set();
    const parts = raw.split(',').map(p => p.trim()).filter(Boolean);
    for (const part of parts) {
        const dashIndex = part.indexOf('-');
        if (dashIndex === -1) {
            const n = parseInt(part, 10);
            if (!Number.isFinite(n)) continue;
            if (n < 1 || n > total) continue;
            if (!active.has(n)) continue;
            out.add(n);
            continue;
        }

        const startText = part.slice(0, dashIndex).trim();
        const endText = part.slice(dashIndex + 1).trim();
        const start = parseInt(startText, 10);
        const end = parseInt(endText, 10);
        if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
        const a = Math.max(1, Math.min(start, end));
        const b = Math.min(total, Math.max(start, end));
        for (let n = a; n <= b; n++) {
            if (active.has(n)) out.add(n);
        }
    }

    return Array.from(out).sort((a, b) => a - b);
};

const compositePageToDataUrl = (pageNumber) => {
    const pdfCanvas = props.pdfCanvases?.[pageNumber - 1];
    if (!pdfCanvas) return null;

    const out = document.createElement('canvas');
    out.width = pdfCanvas.width;
    out.height = pdfCanvas.height;

    const ctx = out.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(pdfCanvas, 0, 0);

    if (printIncludeAnnotations.value) {
        const drawCanvas = props.drawingCanvases?.[pageNumber - 1];
        if (drawCanvas) {
            ctx.drawImage(drawCanvas, 0, 0);
        }
    }

    return out.toDataURL('image/png');
};

const refreshPrinters = async () => {
    if (!Electron.value?.getPrinters) {
        printPrinters.value = [];
        printDeviceName.value = '';
        return;
    }

    const printers = await Electron.value.getPrinters();
    printPrinters.value = Array.isArray(printers) ? printers : [];

    const current = printDeviceName.value;
    if (current && printPrinters.value.some(p => p.name === current)) return;
    const def = printPrinters.value.find(p => p.isDefault);
    printDeviceName.value = def?.name || '';
};

const updatePrintPreview = async () => {
    printError.value = '';

    const pages = parsePageRange(printPageRange.value);
    if (!pages.length) {
        printPreviewDataUrl.value = '';
        printError.value = 'No pages selected.';
        return;
    }

    const maxIndex = pages.length - 1;
    if (printPreviewPageIndex.value < 0) printPreviewPageIndex.value = 0;
    if (printPreviewPageIndex.value > maxIndex) printPreviewPageIndex.value = maxIndex;

    const pageNumber = pages[printPreviewPageIndex.value];
    try {
        await props.renderPdfPage(pageNumber)
        await nextTick();
        printPreviewDataUrl.value = compositePageToDataUrl(pageNumber) || '';
    } catch (error) {
        console.error('[Renderer] Preview generation failed:', error);
        printPreviewDataUrl.value = '';
    }
};

const previewPrevPage = () => {
    if (printBusy.value) return;
    if (printPreviewPageIndex.value <= 0) return;
    printPreviewPageIndex.value -= 1;
    updatePrintPreview();
};

const previewNextPage = () => {
    if (printBusy.value) return;
    const pages = parsePageRange(printPageRange.value);
    if (printPreviewPageIndex.value >= pages.length - 1) return;
    printPreviewPageIndex.value += 1;
    updatePrintPreview();
};

const schedulePrintPreview = () => {
    if (printPreviewTimer) clearTimeout(printPreviewTimer);
    printPreviewTimer = setTimeout(() => {
        printPreviewPageIndex.value = 0;
        updatePrintPreview();
    }, 250);
};

const openPrintModal = async () => {
    if (!props.isFileLoaded) return;
    printError.value = '';

    if (!printPageRange.value) {
        printPageRange.value = props.pageCount ? `1-${props.pageCount}` : '';
    }

    await refreshPrinters();
    await updatePrintPreview();

    if (printModalInstance) {
        printModalInstance.show();
    }
};

const doSilentPrint = async () => {
    if (!props.isFileLoaded) return;
    if (!Electron.value?.printImages) {
        printError.value = 'Silent print is not available.';
        return;
    }

    const pages = parsePageRange(printPageRange.value);
    if (!pages.length) {
        printError.value = 'No pages selected.';
        return;
    }

    printBusy.value = true;
    printError.value = '';

    try {
        // Ensure all pages to be printed are rendered sequentially
        for (const pageNumber of pages) {
            await props.renderPdfPage(pageNumber)
        }
        await nextTick();

        const images = [];
        for (const pageNumber of pages) {
            const dataUrl = compositePageToDataUrl(pageNumber);
            if (dataUrl) images.push(dataUrl);
        }

        const copies = Math.max(1, parseInt(String(printCopies.value || 1), 10) || 1);
        const landscape = printOrientation.value === 'landscape';

        const result = await Electron.value.printImages(images, {
            deviceName: printDeviceName.value || undefined,
            copies,
            landscape,
        });

        if (!result?.success) {
            printError.value = result?.failureReason || result?.error || 'Print failed.';
            return;
        }

        printModalInstance?.hide();
    } catch (error) {
        console.error('[Renderer] Silent print failed:', error);
        printError.value = error?.message || 'Print failed.';
    } finally {
        printBusy.value = false;
    }
};

const printPage = async () => {
    if (!props.isFileLoaded) return;

    // Prefer custom in-app print modal when available.
    if (canSilentPrint.value) {
        await openPrintModal();
        return;
    }

    // Fallback: best-effort render everything, then use system print.
    try {
        await renderAllPagesForPrint();
    } catch (error) {
        console.error('[Renderer] Pre-print render failed:', error);
    }

    if (Electron.value?.print) {
        try {
            await Electron.value.print({ silent: false, printBackground: true });
        } catch (error) {
            console.error('[Renderer] Print failed:', error);
        }
        return;
    }

    if (typeof window?.print === 'function') window.print();
};

onMounted(() => {
    if (!printModalEl.value) return;
    printModalInstance = new Modal(printModalEl.value, {
        backdrop: 'static',
        focus: true,
    });

    printModalEl.value.addEventListener('hidden.bs.modal', () => {
        printBusy.value = false;
        printError.value = '';
        printPreviewDataUrl.value = '';
    });
});

defineExpose({
    printPage,
});
</script>
<template>
<div class="modal fade" tabindex="-1" ref="printModalEl" aria-hidden="true">
    <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content bg-dark text-white">
            <div class="modal-header">
                <h5 class="modal-title">{{ $t('Print') }}</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <div class="row g-3">
                    <div class="col-12 col-lg-4">
                        <label class="form-label">{{ $t('Pages') }}</label>
                        <input
                            type="text"
                            class="form-control"
                            v-model="printPageRange"
                            @input="schedulePrintPreview"
                            :placeholder="$t('Example: 1-3,5')"
                        />
                        <div class="form-text text-secondary">{{ $t('Use: 1-3,5') }}</div>

                        <label class="form-label mt-2">{{ $t('Copies') }}</label>
                        <input
                            type="number"
                            min="1"
                            class="form-control"
                            v-model.number="printCopies"
                        />

                        <label class="form-label mt-2">{{ $t('Orientation') }}</label>
                        <select class="form-select" v-model="printOrientation" @change="schedulePrintPreview">
                            <option value="portrait">{{ $t('Portrait') }}</option>
                            <option value="landscape">{{ $t('Landscape') }}</option>
                        </select>

                        <label class="form-label mt-2">{{ $t('Printer') }}</label>
                        <select
                            class="form-select"
                            v-model="printDeviceName"
                            :disabled="!printPrinters.length"
                        >
                            <option value="">{{ $t('Default printer') }}</option>
                            <option v-for="p in printPrinters" :key="p.name" :value="p.name">
                                {{ p.displayName || p.name }}
                            </option>
                        </select>

                        <div class="form-check mt-3">
                            <input
                                class="form-check-input"
                                type="checkbox"
                                id="printIncludeAnnotations"
                                v-model="printIncludeAnnotations"
                                @change="schedulePrintPreview"
                            />
                            <label class="form-check-label" for="printIncludeAnnotations">
                                {{ $t('Include annotations') }}
                            </label>
                        </div>

                        <div v-if="printError" class="alert alert-danger mt-3 mb-0 py-2">
                            {{ printError }}
                        </div>
                    </div>

                    <div class="col-12 col-lg-8">
                        <div class="d-flex align-items-center justify-content-between mb-2">
                            <button type="button" class="btn btn-outline-light btn-sm" @click="previewPrevPage" :disabled="printBusy || printPreviewPageIndex <= 0">
                                {{ $t('Prev') }}
                            </button>
                            <div class="text-secondary small">
                                {{ $t('Preview') }}
                                {{ parsePageRange(printPageRange).length ? (printPreviewPageIndex + 1) : 0 }}
                                {{ $t('of') }}
                                {{ parsePageRange(printPageRange).length }}
                            </div>
                            <button
                                type="button"
                                class="btn btn-outline-light btn-sm"
                                @click="previewNextPage"
                                :disabled="printBusy || printPreviewPageIndex >= (parsePageRange(printPageRange).length - 1)"
                            >
                                {{ $t('Next') }}
                            </button>
                        </div>
                        <div
                            class="border rounded bg-white d-flex align-items-center justify-content-center mx-auto"
                            :style="{
                                width: '100%',
                                maxWidth: '900px',
                                maxHeight: '70vh',
                                aspectRatio: printOrientation === 'landscape' ? '1.414 / 1' : '1 / 1.414',
                                overflow: 'hidden',
                            }"
                        >
                            <img
                                v-if="printPreviewDataUrl"
                                :src="printPreviewDataUrl"
                                :alt="$t('Print preview')"
                                :style="{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'contain',
                                }"
                            />
                            <div v-else class="text-muted px-3 text-center">
                                {{ $t('Preview will appear here') }}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal" :disabled="printBusy">
                    {{ $t('Cancel') }}
                </button>
                <button type="button" class="btn btn-primary" @click="doSilentPrint" :disabled="printBusy || !canSilentPrint">
                    {{ printBusy ? $t('Printing...') : $t('Print') }}
                </button>
            </div>
        </div>
    </div>
</div>
</template>