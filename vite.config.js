import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from "vite-plugin-singlefile"
import { copyFileSync, existsSync, mkdirSync, createWriteStream, readdirSync, statSync } from 'fs'
import { resolve, join } from 'path'
import archiver from 'archiver'


export default defineConfig({
  plugins: [
    vue(),
    viteSingleFile(),
    {
      name: 'copy-docs',
      async closeBundle() {
        const distDir = resolve(__dirname, 'dist')
        const docsDir = resolve(__dirname, 'docs')

        // Copy scripts to dist
        try {
          const scriptsDir = resolve(__dirname, 'scripts')
          if (existsSync(scriptsDir) && existsSync(distDir)) {
            const files = readdirSync(scriptsDir)
            for (const file of files) {
              copyFileSync(join(scriptsDir, file), join(distDir, file))
            }
            console.log('✓ Copied scripts to dist/')
          }
        } catch (err) {
          console.warn('⚠ Could not copy scripts to dist:', err.message)
        }

        // Create zip file inside dist
        const createZip = () => {
          return new Promise((resolvePromise, rejectPromise) => {
            try {
              if (!existsSync(distDir)) {
                resolvePromise()
                return
              }
              
              const zipPath = resolve(distDir, 'simple-pdf-reader.zip')
              const output = createWriteStream(zipPath)
              const archive = archiver('zip', { zlib: { level: 9 } })
              
              output.on('close', () => {
                console.log('✓ Created simple-pdf-reader.zip in dist/ (' + (archive.pointer() / 1024 / 1024).toFixed(2) + ' MB)')
                resolvePromise()
              })
              
              archive.on('error', (err) => {
                rejectPromise(err)
              })
              
              archive.pipe(output)
              
              // Add all files from dist except the zip itself
              const files = readdirSync(distDir)
              for (const file of files) {
                if (file === 'simple-pdf-reader.zip') continue
                const filePath = join(distDir, file)
                const stat = statSync(filePath)
                if (stat.isDirectory()) {
                  archive.directory(filePath, file)
                } else {
                  archive.file(filePath, { name: file })
                }
              }
              
              archive.finalize()
            } catch (err) {
              rejectPromise(err)
            }
          })
        }
        
        try {
          await createZip()
          
          // Copy specific files to docs
          if (!existsSync(docsDir)) {
            mkdirSync(docsDir, { recursive: true })
          }
          
          const filesToCopy = ['index.html', 'logo.ico', 'simple-pdf-reader.zip', 'pdf.worker.min.mjs']
          
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
