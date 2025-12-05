import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from "vite-plugin-singlefile"
import { copyFileSync } from 'fs'
import { resolve } from 'path'


export default defineConfig({
  plugins: [
    vue(),
    viteSingleFile(),
    {
      name: 'copy-files',
      closeBundle() {
        // Copy install_app.bat to dist folder
        try {
          copyFileSync(
            resolve(__dirname, 'scripts/install_app.bat'),
            resolve(__dirname, 'dist/install_app.bat')
          )
          console.log('✓ Copied install_app.bat to dist/')
        } catch (err) {
          console.warn('⚠ Could not copy install_app.bat:', err.message)
        }

        // Copy open_pdf.bat to dist folder
        try {
          copyFileSync(
            resolve(__dirname, 'scripts/open_pdf.bat'),
            resolve(__dirname, 'dist/open_pdf.bat')
          )
          console.log('✓ Copied open_pdf.bat to dist/')
        } catch (err) {
          console.warn('⚠ Could not copy open_pdf.bat:', err.message)
        }

        // Copy install_app.sh to dist folder
        try {
          copyFileSync(
            resolve(__dirname, 'scripts/install_app.sh'),
            resolve(__dirname, 'dist/install_app.sh')
          )
          console.log('✓ Copied install_app.sh to dist/')
        } catch (err) {
          console.warn('⚠ Could not copy install_app.sh:', err.message)
        }

        // Copy uninstall_app.bat to dist folder
        try {
          copyFileSync(
            resolve(__dirname, 'scripts/uninstall_app.bat'),
            resolve(__dirname, 'dist/uninstall_app.bat')
          )
          console.log('✓ Copied uninstall_app.bat to dist/')
        } catch (err) {
          console.warn('⚠ Could not copy uninstall_app.bat:', err.message)
        }

        // Copy uninstall_app.sh to dist folder
        try {
          copyFileSync(
            resolve(__dirname, 'scripts/uninstall_app.sh'),
            resolve(__dirname, 'dist/uninstall_app.sh')
          )
          console.log('✓ Copied uninstall_app.sh to dist/')
        } catch (err) {
          console.warn('⚠ Could not copy uninstall_app.sh:', err.message)
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
          // Keep logo.ico name unchanged
          if (assetInfo.name === 'logo.ico') {
            return 'logo.ico'
          }
          // Default naming for other assets
          return 'assets/[name]-[hash][extname]'
        }
      }
    }
  }
})
