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

        // Mirror dist to docs for GitHub Pages
        try {
          const distDir = resolve(__dirname, 'dist')
          const docsDir = resolve(__dirname, 'docs')
          if (existsSync(distDir)) {
            rmSync(docsDir, { recursive: true, force: true })
            mkdirSync(docsDir, { recursive: true })
            cpSync(distDir, docsDir, { recursive: true })
            console.log('✓ Copied dist to docs/')
          } else {
            console.warn('⚠ dist folder not found; skipping docs copy')
          }
        } catch (err) {
          console.warn('⚠ Could not copy dist to docs:', err.message)
        }

        // Create zip file inside dist and docs
        const createZip = async () => {
          try {
            const distDir = resolve(__dirname, 'dist')
            if (!existsSync(distDir)) return
            
            const zipPath = resolve(distDir, 'simple-pdf-reader.zip')
            const output = createWriteStream(zipPath)
            const archive = archiver('zip', { zlib: { level: 9 } })
            
            output.on('close', () => {
              console.log('✓ Created simple-pdf-reader.zip in dist/ (' + (archive.pointer() / 1024 / 1024).toFixed(2) + ' MB)')
              
              // Copy zip to docs if it exists
              const docsDir = resolve(__dirname, 'docs')
              if (existsSync(docsDir)) {
                copyFileSync(zipPath, resolve(docsDir, 'simple-pdf-reader.zip'))
                console.log('✓ Copied zip to docs/')
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
