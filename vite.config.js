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
        // Copy create_shortcut.bat to dist folder
        try {
          copyFileSync(
            resolve(__dirname, 'scripts/create_shorcut.bat'),
            resolve(__dirname, 'dist/create_shortcut.bat')
          )
          console.log('✓ Copied create_shortcut.bat to dist/')
        } catch (err) {
          console.warn('⚠ Could not copy create_shortcut.bat:', err.message)
        }
        
        // Copy create_shortcut.sh to dist folder
        try {
          copyFileSync(
            resolve(__dirname, 'scripts/create_shortcut.sh'),
            resolve(__dirname, 'dist/create_shortcut.sh')
          )
          console.log('✓ Copied create_shortcut.sh to dist/')
        } catch (err) {
          console.warn('⚠ Could not copy create_shortcut.sh:', err.message)
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
