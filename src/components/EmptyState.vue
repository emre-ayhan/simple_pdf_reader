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
          <ul class="d-none d-lg-block">
            <li>Open images as pages with full drawing, zoom, and persistence.</li>
            <li>Capture any PDF area into a whiteboard for focused markup and exports.</li>
            <li>Zoom whiteboards in and out while keeping aspect ratio tidy.</li>
            <li>Exit whiteboard safely and return to your exact page and zoom.</li>
          </ul>
        </div>
        <div class="empty-section">
          <div class="empty-section-title">PDF Viewing</div>
          <ul class="d-none d-lg-block">
            <li>Load local PDFs and keep your last viewed page.</li>
            <li>Navigate pages quickly with keyboard or toolbar controls.</li>
            <li>Adjust zoom with fit-width or fit-height modes.</li>
            <li>Responsive layout tuned for desktop and mobile.</li>
          </ul>
        </div>
        <div class="empty-section">
          <div class="empty-section-title">Drawing & Annotation Tools</div>
          <ul class="d-none d-lg-block">
            <li>Pen, line, rectangle, circle, and eraser tools with 30 colors.</li>
            <li>Adjustable stroke thickness and undo/redo history.</li>
            <li>Stylus-ready pointer support for smooth inking.</li>
            <li>One-click clear when you need a fresh slate.</li>
          </ul>
        </div>
        <div class="empty-section">
          <div class="empty-section-title">Technical Features</div>
          <ul class="d-none d-lg-block">
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

<style scoped>
.empty-state {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
}

.empty-card {
  width: 100%;
  max-width: 1200px;
  background: linear-gradient(145deg, #0f172a 0%, #0a1b2b 55%, #0b2538 100%);
  color: var(--bs-light);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 18px 45px rgba(0, 0, 0, 0.55);
  border-radius: 18px;
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  position: relative;
}

.empty-eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 16px;
  color: #1985ea;
  font-weight: 700;
}

.empty-title {
  font-size: clamp(26px, 3vw, 34px);
  margin: 0;
  color: #e8edf5;
}

.empty-lead {
  max-width: 760px;
  color: #c6d0de;
  margin: 0;
  font-size: 16px;
  line-height: 1.6;
}

.empty-actions {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 6px;
}

.empty-hint {
  color: #9fb3c8;
  font-size: 14px;
}

.empty-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 18px;
  margin-top: 4px;
}

.empty-section {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 16px;
  height: 100%;
}

.empty-section-title {
  font-weight: 700;
  margin-bottom: 10px;
  color: #dbeafe;
}

.empty-section ul {
  padding-left: 16px;
  margin: 0;
  color: #c5d5e6;
  line-height: 1.55;
}

.empty-section li + li {
  margin-top: 6px;
}

.empty-download {
  position: absolute;
  right: 24px;
  bottom: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.empty-footer {
  display: flex;
  justify-content: center;
  margin-top: 12px;
  padding-top: 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.empty-github-link {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #7dd3fc;
  text-decoration: none;
  font-weight: 500;
  font-size: 14px;
  transition: color 0.2s;
}

.empty-github-link:hover {
  color: #dbeafe;
}

.empty-github-link i {
  font-size: 16px;
}

.btn-primary {
  color: #0a1b2b !important;
  background-color: #7dd3fc !important;
  border-color: #7dd3fc !important;
  border-radius: var(--bs-border-radius-lg) !important;
}

.btn-primary:hover {
  background-color: #38bdf8 !important;
  border-color: #38bdf8 !important;
}
</style>
