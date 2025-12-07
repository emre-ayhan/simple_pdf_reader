import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from "vite-plugin-singlefile"
import { copyFileSync, cpSync, rmSync, existsSync, mkdirSync, createWriteStream, readdirSync, statSync } from 'fs'
import { resolve, join } from 'path'
import archiver from 'archiver'


export default defineConfig({
  plugins: [
    vue(),
    viteSingleFile(),
    {
      name: 'copy-docs',
      closeBundle() {
        // Copy only index.html to docs for GitHub Pages
        try {
          const distDir = resolve(__dirname, 'dist')
          const docsDir = resolve(__dirname, 'docs')
          const indexPath = join(distDir, 'index.html')
          
          if (existsSync(indexPath)) {
            mkdirSync(docsDir, { recursive: true })
            copyFileSync(indexPath, join(docsDir, 'index.html'))
            console.log('✓ Copied index.html to docs/')
          } else {
            console.warn('⚠ index.html not found in dist; skipping docs copy')
          }
        } catch (err) {
          console.warn('⚠ Could not copy index.html to docs:', err.message)
        }

        // Create zip file inside dist
        const createZip = async () => {
          try {
            const distDir = resolve(__dirname, 'dist')
            if (!existsSync(distDir)) return
            
            const zipPath = resolve(distDir, 'simple-pdf-reader.zip')
            const output = createWriteStream(zipPath)
            const archive = archiver('zip', { zlib: { level: 9 } })
            
            output.on('close', () => {
              console.log('✓ Created simple-pdf-reader.zip in dist/ (' + (archive.pointer() / 1024 / 1024).toFixed(2) + ' MB)')
              
              // Copy zip to docs
              const docsDir = resolve(__dirname, 'docs')
              try {
                copyFileSync(zipPath, resolve(docsDir, 'simple-pdf-reader.zip'))
                console.log('✓ Copied zip to docs/')
              } catch (err) {
                console.warn('⚠ Could not copy zip to docs:', err.message)
              }
            })
            
            archive.on('error', (err) => {
              throw err
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
            
            await archive.finalize()
          } catch (err) {
            console.warn('⚠ Could not create zip:', err.message)
          }
        }
        
        createZip()
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
