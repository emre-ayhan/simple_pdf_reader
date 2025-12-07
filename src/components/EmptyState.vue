<script setup>
const props = defineProps({
  isInstalled: { type: Boolean, default: false }
});

const emit = defineEmits(['open-file']);

const openFile = () => emit('open-file');
</script>

<template>
  <div class="empty-state">
    <div class="empty-card">
      <div class="empty-eyebrow">
        <i class="bi bi-file-earmark-pdf-fill"></i>
        Simple PDF Reader
      </div>
      <h1 class="empty-title">Fast, focused reading with ink-ready tools.</h1>
      <p class="empty-lead d-none d-md-block">This reader keeps your PDFs and images quick to open, easy to mark up, and ready for sharing.</p>

      <div class="empty-actions">
        <button class="btn btn-primary" @click.prevent="openFile">Open PDF or Image</button>
        <span class="empty-hint">or drop a file anywhere</span>
      </div>

      <div class="empty-grid">
        <div class="empty-section">
          <div class="empty-section-title">Whiteboard & Image Support</div>
          <ul>
            <li>Open images as pages with full drawing, zoom, and persistence.</li>
            <li>Capture any PDF area into a whiteboard for focused markup and exports.</li>
            <li>Zoom whiteboards in and out while keeping aspect ratio tidy.</li>
            <li>Exit whiteboard safely and return to your exact page and zoom.</li>
          </ul>
        </div>
        <div class="empty-section">
          <div class="empty-section-title">PDF Viewing</div>
          <ul>
            <li>Load local PDFs and keep your last viewed page.</li>
            <li>Navigate pages quickly with keyboard or toolbar controls.</li>
            <li>Adjust zoom with fit-width or fit-height modes.</li>
            <li>Responsive layout tuned for desktop and mobile.</li>
          </ul>
        </div>
        <div class="empty-section">
          <div class="empty-section-title">Drawing & Annotation Tools</div>
          <ul>
            <li>Pen, line, rectangle, circle, and eraser tools with 30 colors.</li>
            <li>Adjustable stroke thickness and undo/redo history.</li>
            <li>Stylus-ready pointer support for smooth inking.</li>
            <li>One-click clear when you need a fresh slate.</li>
          </ul>
        </div>
        <div class="empty-section">
          <div class="empty-section-title">Technical Features</div>
          <ul>
            <li>PDF.js rendering with lazy loading for speed.</li>
            <li>Bootstrap 5 UI with Bootstrap Icons.</li>
            <li>Docker and Nginx ready for production deploys.</li>
            <li>LocalStorage-powered page persistence.</li>
          </ul>
        </div>
      </div>
      <div class="empty-download" v-if="!props.isInstalled">
        <a class="btn btn-sm btn-primary" href="simple-pdf-reader.zip" download>
          Download
        </a>
      </div>
      <div class="empty-footer">
        <a href="https://github.com/emre-ayhan/simple_pdf_reader" target="_blank" rel="noopener noreferrer" class="empty-github-link">
          <i class="bi bi-github"></i>
          github/emre-ayhan
        </a>
      </div>
    </div>
  </div>
</template>


