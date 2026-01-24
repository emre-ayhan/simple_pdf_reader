<script setup>
import { Electron } from '../composables/useElectron';

const emit = defineEmits(['open-file']);

const openFile = () => emit('open-file');
</script>

<template>
    <div class="container h-100">
      <div class="row h-100">
        <div class="col-12 my-auto">
          <div class="empty-card">
            <div class="d-flex">
              <a href="https://emre-ayhan.github.io/simple_pdf_reader/" target="_blank" rel="noopener noreferrer" class="link-accent">
                <i class="bi bi-file-earmark-pdf-fill"></i>
                Simple PDF Reader
              </a>
              <a href="https://github.com/emre-ayhan/simple_pdf_reader" target="_blank" rel="noopener noreferrer" class="ms-auto" v-if="!Electron">
                <i class="bi bi-github"></i>
              </a>
            </div>
            <h1 class="empty-title">{{ $t('Fast, focused reading with ink-ready tools.') }}</h1>
            <p class="empty-lead d-none d-md-block">{{ $t('This reader keeps your PDFs and Images quick to open, easy to mark up, and ready for sharing.') }}</p>
      
            <div class="empty-actions">
              <button class="btn btn-primary" @click.prevent="openFile">
                {{ $t('Open PDF / Image') }}
              </button>
              <span class="empty-hint">
                {{ $t('or drag and drop a file anywhere') }}
              </span>
            </div>
      
            <div class="empty-grid row row-cols-1 row-cols-xl-3 g-3">
              <div class="col">
                <div class="empty-section">
                  <div class="empty-section-title">{{ $t('Smart Capture & Images') }}</div>
                  <ul>
                    <li>{{ $t('Open images as full documents with zoom.') }}</li>
                    <li>{{ $t('Capture PDF areas to a focused workspace.') }}</li>
                    <li>{{ $t('Export via clipboard or file download.') }}</li>
                    <li>{{ $t('Non-destructive markup on captured clips.') }}</li>
                  </ul>
                </div>
              </div>
              <div class="col">
                <div class="empty-section">
                  <div class="empty-section-title">{{ $t('Advanced PDF Tools') }}</div>
                  <ul>
                    <li v-html="$t('<strong>Multi-tab</strong> support for side-by-side work.')"></li>
                    <li>{{ $t('Insert blank pages or delete unwanted ones.') }}</li>
                    <li>{{ $t('Fit-to-Width and Fit-to-Height view modes.') }}</li>
                    <li>{{ $t('Auto-save reading position for every file.') }}</li>
                  </ul>
                </div>
              </div>
              <div class="col">
                <div class="empty-section">
                  <div class="empty-section-title">{{ $t('Rich Annotations') }}</div>
                  <ul>
                    <li>{{ $t('Pen, Shapes, Text, and Highlighter tools.') }}</li>
                    <li v-html="$t('<strong>Stroke Selection</strong> to move & resize notes.')"></li>
                    <li>{{ $t('Import images directly onto PDF pages.') }}</li>
                    <li>{{ $t('Full Stylus support & Touch Drawing mode.') }}</li>
                    <li>{{ $t('Customizable colors and Quick Styles.') }}</li>
                  </ul>
                </div>
              </div>
            </div>
            <div class="empty-footer">
              <div class="mx-auto" v-if="Electron">
                <a href="https://github.com/emre-ayhan/simple_pdf_reader" target="_blank" class="text-decoration-none" rel="noopener noreferrer">
                  <i class="bi bi-github"></i> github.com/emre-ayhan/simple_pdf_reader
                </a>
              </div>
              <div class="ms-auto" v-else>
                <div class="d-flex align-items-center gap-2">
                  <i class="bi bi-windows"></i>
                  <i class="bi bi-tux"></i>
                  <!-- <i class="bi bi-apple"></i> -->
                  <a href="https://github.com/emre-ayhan/simple_pdf_reader/releases/latest" target="_blank" rel="noopener noreferrer" class="btn btn-link text-decoration-none">
                    <i class="bi bi-download me-1"></i>
                    {{ $t('Download') }}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
</template>


