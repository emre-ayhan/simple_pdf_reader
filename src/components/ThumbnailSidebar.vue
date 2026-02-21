<script setup>
import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps({
    pageCount: { type: Number, required: true },
    pages: { type: Array, required: true },
    pageIndex: { type: Number, required: true }, // 0-based
    scrollToPage: { type: Function, required: true },
    renderPageThumbnail: { type: Function, required: false },
});

const thumbs = ref(new Map()); // Map<number, string dataURL>
const observer = ref(null);
const itemRefs = new Map();

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

// Active page is 1-based for display
const activePage = computed(() => props.pageIndex + 1);

const goTo = (page) => {
  props.scrollToPage(page - 1);
};
</script>

<template>
  <aside class="thumbnail-sidebar">
    <div class="p-2 fw-bold">Thumbnails</div>
    <div class="thumbs-list">
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
  </aside>
</template>
