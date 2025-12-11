import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from "vite-plugin-singlefile"
import { copyFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, join } from 'path'


export default defineConfig({
  plugins: [
    vue(),
    viteSingleFile(),
    {
      name: 'copy-docs',
      async closeBundle() {
        const distDir = resolve(__dirname, 'dist')
        const docsDir = resolve(__dirname, 'docs')

        // Copy specific files to docs
        try {
          if (!existsSync(docsDir)) {
            mkdirSync(docsDir, { recursive: true })
          }
          
          const filesToCopy = ['index.html', 'icon.ico', 'pdf.worker.min.mjs']
          
          for (const file of filesToCopy) {
            const srcPath = join(distDir, file)
            const destPath = join(docsDir, file)
            
            if (existsSync(srcPath)) {
              copyFileSync(srcPath, destPath)
              console.log(`✓ Copied ${file} to docs/`)
            } else {
              console.warn(`⚠ ${file} not found in dist/`)
            }
          }
        } catch (err) {
          console.warn('⚠ Error during post-build operations:', err.message)
        }
      }
    }
  ],
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    watch: {
      usePolling: true
    }
  },
  optimizeDeps: {
    exclude: ['pdfjs-dist']
  },
  build: {
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          // Keep icon.ico name unchanged
          if (assetInfo.name === 'icon.ico') {
            return 'icon.ico'
          }
          // Default naming for other assets
          return 'assets/[name]-[hash][extname]'
        }
      }
    }
  }
})
