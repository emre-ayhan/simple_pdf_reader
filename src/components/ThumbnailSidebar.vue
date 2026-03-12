<script setup>
import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps({
    pageCount: { type: Number, required: true },
    pages: { type: Array, required: true },
    pageIndex: { type: Number, required: true }, // 0-based
    scrollToPage: { type: Function, required: true },
    renderPageThumbnail: { type: Function, required: false },
    bookmarks: { type: Array, required: false, default: () => [] },
    attachments: { type: Array, required: false, default: () => [] },
    layers: { type: Array, required: false, default: () => [] },
    toggleLayer: { type: Function, required: false },
    downloadAttachment: { type: Function, required: false },
});

const thumbs = ref(new Map()); // Map<number, string dataURL>
const observer = ref(null);
const itemRefs = new Map();
const activeMode = ref('pages');

const sidebarModes = [
    { id: 'pages', icon: 'files', label: 'Pages' },
    { id: 'bookmarks', icon: 'bookmark-fill', label: 'Bookmarks' },
    { id: 'attachments', icon: 'paperclip', label: 'Attachments' },
    { id: 'layers', icon: 'layers-fill', label: 'Layers' },
];

const buildThumbnail = (page) => {
    const canvas = props.pages[page - 1]?.canvas;
    if (!canvas) return;
    try {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        thumbs.value.set(page, dataUrl);
    } catch (e) {
        // Ignore errors from toDataURL for now
    }
};

const loadThumbnail = (page) => {
    if (thumbs.value.has(page)) return;

    // Prefer taking existing render from main view
    if (props.pages[page - 1]?.rendered) {
        buildThumbnail(page);
    } else if (props.renderPageThumbnail) {
        // Slow path: offscreen render
        props.renderPageThumbnail(page).then((dataUrl) => {
        if (dataUrl) {
            thumbs.value.set(page, dataUrl);
        }
        }).catch(() => {});
    }
};

const onIntersect = (entries) => {
    entries.forEach((entry) => {
        if (entry.isIntersecting) {
        const page = Number(entry.target.dataset.page);
        if (page && !thumbs.value.has(page)) {
            loadThumbnail(page);
        }
        }
    });
};

const checkRenderedPages = () => {
    // If a page becomes rendered in main view, grab its thumbnail (if missing)
    props.pages.forEach((page, index) => {
        if (page.rendered && !thumbs.value.has(index + 1)) {
        buildThumbnail(index + 1);
        }
    });
};

const setItemRef = (el, page) => {
    if (el) {
        itemRefs.set(page, el);
        if (observer.value) {
        observer.value.observe(el);
        }
    } else {
        itemRefs.delete(page);
    }
};

onMounted(() => {
    observer.value = new IntersectionObserver(onIntersect, {
        root: null, // viewport
        rootMargin: '200px',
        threshold: 0.01,
    });

    // Observe existing refs
    itemRefs.forEach((el) => {
        observer.value.observe(el);
    });

    checkRenderedPages();
});

onBeforeUnmount(() => {
    if (observer.value) {
        observer.value.disconnect();
    }
});

watch(() => props.pages, checkRenderedPages);

watch(() => props.pageCount, () => {
    if (activeMode.value !== 'pages') return;
    checkRenderedPages();
});

// Active page is 1-based for display
const activePage = computed(() => props.pageIndex + 1);

const bookmarkItems = computed(() => {
    if (Array.isArray(props.bookmarks) && props.bookmarks.length > 0) {
        return props.bookmarks
        .map((item, index) => ({
            id: item?.id || `bookmark-${index}`,
            title: String(item?.title || item?.label || `Page ${Number(item?.page) || index + 1}`),
            page: Number(item?.page) || index + 1,
            offsetRatio: Number.isFinite(Number(item?.offsetRatio)) ? Number(item.offsetRatio) : null,
        }))
        .filter(item => item.page > 0 && item.page <= props.pageCount);
    }

    // Fallback: expose pages as lightweight bookmark targets.
    return props.pages
        .map((page, index) => {
        if (page?.deleted) return null;
        const pageNo = index + 1;
        return {
            id: page?.id || `bookmark-page-${pageNo}`,
            title: `Page ${pageNo}`,
            page: pageNo,
        };
        })
        .filter(Boolean);
});

const attachmentItems = computed(() => {
    if (!Array.isArray(props.attachments)) return [];
    return props.attachments.map((item, index) => ({
        id: item?.id || `attachment-${index}`,
        name: String(item?.name || item?.filename || `Attachment ${index + 1}`),
        size: item?.size || '',
        raw: item,
    }));
});

const layerItems = computed(() => {
    if (!Array.isArray(props.layers)) return [];
    return props.layers.map((layer, index) => ({
        id: layer?.id || `layer-${index}`,
        name: String(layer?.name || `Layer ${index + 1}`),
        visible: layer?.visible !== false,
        raw: layer,
    }));
});

const setMode = (modeId) => {
    activeMode.value = modeId;
};

const toggleLayerVisibility = (layer) => {
    if (typeof props.toggleLayer === 'function') {
        props.toggleLayer(layer.raw || layer);
    }
};

const goTo = (target) => {
    if (typeof target === 'number') {
        props.scrollToPage(target - 1);
        return;
    }

    const page = Number(target?.page);
    if (!Number.isFinite(page)) return;

    if (Number.isFinite(Number(target?.offsetRatio))) {
        props.scrollToPage(page - 1, { offsetRatio: Number(target.offsetRatio) });
        return;
    }

    props.scrollToPage(page - 1);
    };

const handleAttachmentClick = (attachment) => {
    if (typeof props.downloadAttachment === 'function') {
        props.downloadAttachment(attachment.raw || attachment);
    }
};
</script>

<template>
<aside class="thumbnail-sidebar">
    <div class="thumbnail-sidebar-rail">
    <button
        v-for="mode in sidebarModes"
        :key="mode.id"
        type="button"
        class="sidebar-rail-btn"
        :class="{ active: activeMode === mode.id }"
        :title="$t(mode.label)"
        @click="setMode(mode.id)"
    >
        <i class="bi" :class="`bi-${mode.icon}`"></i>
    </button>
    </div>

    <div class="thumbnail-sidebar-panel">
    <div class="thumbnail-sidebar-title p-2 fw-bold">
        {{ $t(sidebarModes.find(mode => mode.id === activeMode)?.label || 'Pages') }}
        ({{ props[activeMode] ? props[activeMode].length : pageCount }})
    </div>

    <div v-if="activeMode === 'pages'" class="thumbs-list">
        <template v-for="page in pageCount" :key="page">
        <div v-if="!props.pages[page - 1]?.deleted" 
            class="thumbnail-item" 
            :class="{ active: activePage === page }" 
            :data-page="page"
            :ref="(el) => setItemRef(el, page)"
            @click="goTo(page)">
            <div class="thumb-page-number">{{ page }}</div>
            <div class="thumb-image-wrapper">
            <img v-if="thumbs.get(page)" :src="thumbs.get(page)" class="thumb-image" alt="Page thumbnail" />
            <div v-else class="thumb-placeholder">
                <span>Rendering…</span>
            </div>
            </div>
        </div>
        </template>
    </div>

    <div v-else-if="activeMode === 'bookmarks'" class="sidebar-list-panel">
        <button
        v-for="bookmark in bookmarkItems"
        :key="bookmark.id"
        type="button"
        class="sidebar-list-item"
        @click="goTo(bookmark)"
        >
        <span class="sidebar-list-label">{{ bookmark.title }}</span>
        <span class="sidebar-list-kicker">{{ $t('page') }} {{ bookmark.page }}</span>
        </button>
        <div v-if="bookmarkItems.length === 0" class="sidebar-list-empty">{{ $t('No bookmarks found') }}</div>
    </div>

    <div v-else-if="activeMode === 'attachments'" class="sidebar-list-panel">
        <button
        v-for="file in attachmentItems"
        :key="file.id"
        type="button"
        class="sidebar-list-item"
        @click="handleAttachmentClick(file)"
        >
        <i class="bi bi-download me-2" aria-hidden="true"></i>
        <span class="sidebar-list-label">{{ file.name }}</span>
        <small v-if="file.size" class="sidebar-list-meta">{{ file.size }}</small>
        </button>
        <div v-if="attachmentItems.length === 0" class="sidebar-list-empty">{{ $t('No attachments found') }}</div>
    </div>

    <div v-else class="sidebar-list-panel">
        <label v-for="layer in layerItems" :key="layer.id" class="sidebar-list-item static layer-item">
        <input
            type="checkbox"
            class="form-check-input me-2"
            :checked="layer.visible"
            @change="toggleLayerVisibility(layer)"
        >
        <span class="sidebar-list-label">{{ layer.name }}</span>
        </label>
        <div v-if="layerItems.length === 0" class="sidebar-list-empty">{{ $t('No layers found') }}</div>
    </div>
    </div>
</aside>
</template>
