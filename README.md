# Simple PDF Reader

A feature-rich PDF reader application built with Vue 3 and Vite, containerized with Docker. This application allows you to view PDF documents and annotate them with various drawing tools.

## Workspace & Image Support

- 🖼️ **Open images as pages**: Drop or select PNG/JPG/GIF/WebP/BMP/SVG files; they render as a single page with full drawing tools, zoom, and page persistence.
- ✂️ **Capture to Workspace**: Select any area of a PDF and pop it into a workspace for focused markup; export via download, copy-to-clipboard, or native share (where supported).
- 🔍 **Workspace zoom**: Zoom in/out while preserving aspect ratio; overflow is clipped to keep the view tidy.
- ↩️ **Exit safely**: Closing workspace returns you to the PDF (or the opened image) with prior zoom and page preserved.

## Features

### 📄 PDF Viewing & Management
- **Multi-Tab Interface**: Open and switch between multiple PDF files or images in a single window.
- **Page Management**: Insert blank pages for extra notes or delete unwanted pages from your document.
- **Navigation Controls**: Jump to specific pages, go to first/last page, and use standard next/previous navigation.
- **View Options**: Zoom in/out with presets, **Fit Width** / **Fit Height** modes, and Fullscreen toggle.
- **Smart History**: Automatically saves and restores your last viewed page for every file.

### 🎨 Drawing & Annotation
- **Comprehensive Toolset**: 
  - ✏️ **Pen**: Free-hand drawing with pressure sensitivity.
  - 📏 **Shapes**: Lines, Rectangles, and Circles (perfect or ellipse).
  - 📝 **Text**: Insert text boxes anywhere on the page.
  - 🖍️ **Highlight**: Transparent highlighter for emphasizing text.
  - 🖼️ **Image Import**: Paste or import images directly onto PDF pages.
- **Stroke Selection**: Select, move, and modify existing drawings.
- **Stylus & Touch**: Dedicated toggle for Touch Drawing and full Stylus support.
- **Customization**: 
  - 30 predefined colors.
  - Adjustable line thickness.
  - 4 programmable "Quick Style" slots for your favorite pen settings.
- **History**: Robust Undo/Redo system for all annotations.

###  User Interface
- **Flexible Layout**: Move the main toolbar to the Top or Bottom of the screen based on your preference.
- **Localization**: Fully localized in **English**, **Turkish**, and **Portuguese**.
- **Responsive**: layouts optimized for both desktop pointers and touch devices.
- **Theme**: Clean, modern interface using Bootstrap 5.

### Technical Features
- Vue 3 with Composition API
- PDF.js for reliable rendering
- Electron for native desktop experience
- Docker support for containerized deployment
- LocalStorage for setting persistence

## Prerequisites

### For Web Usage
- Node.js (v16 or higher)
- npm or yarn
- Modern web browser (Chrome, Firefox, Edge, Safari)

### For Electron Desktop App
- Node.js (v16 or higher)
- npm or yarn

### For Docker Development
- Docker
- Docker Compose

## Getting Started

### Electron Desktop App

Build and run the desktop application:

1. Install dependencies:
```bash
npm install
```

2. Run in development mode:
```bash
npm run electron:dev
```

3. Build the desktop app for your platform:

**Windows:**
```bash
npm run electron:build:win
```
The installer will be in `dist-electron/windows/`

**macOS:**
```bash
npm run electron:build:mac
```
The DMG file will be in `dist-electron/macos/`

**Linux:**
```bash
npm run electron:build:linux
```
The DEB package will be in `dist-electron/linux/`

### Web Usage (Standalone)

Build the application for web browser use:

1. Install dependencies and build:
```bash
npm install
npm run build
```

2. The built files will be in the `dist/` folder.

3. Open `dist/index.html` in your browser to use the application.

### Development

1. Start the development server with Docker Compose:
```bash
cd simple_pdf_reader
docker-compose up
```

2. Open your browser and navigate to:
```
http://localhost:5173
```

The app will automatically reload when you make changes to the source files.

### Production Build (Docker)

1. Build the production Docker image:
```bash
docker build -t simple_pdf_reader:latest .
```

2. Run the production container:
```bash
docker run -p 8080:80 simple_pdf_reader:latest
```

3. Open your browser and navigate to:
```
http://localhost:8080
```

## Project Structure

```
simple_pdf_reader/
├── public/
│   └── pdf.worker.min.mjs    # PDF.js worker file
├── src/
│   ├── assets/               # Images, fonts, etc.
│   ├── components/
│   │   └── PdfReader.vue     # Main PDF reader component with annotations
│   ├── App.vue               # Root component
│   ├── main.js               # Application entry point
│   └── style.css             # Global styles
├── Dockerfile                # Production Dockerfile
├── Dockerfile.dev            # Development Dockerfile
├── docker-compose.yml        # Docker Compose configuration
├── nginx.conf                # Nginx configuration for production
├── index.html                # HTML template
├── package.json              # Dependencies and scripts
├── vite.config.js            # Vite configuration
└── README.md                 # This file
```

## Available Scripts

### Electron Desktop App
- `npm run electron:dev` - Run Electron app in development mode
- `npm run electron:start` - Build and start Electron app
- `npm run electron:build` - Build Electron app for current platform
- `npm run electron:build:win` - Build for Windows (NSIS installer)
- `npm run electron:build:mac` - Build for macOS (DMG)
- `npm run electron:build:linux` - Build for Linux (DEB package)

### Web Development
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## Docker Commands

### Development
```bash
# Start development environment
docker-compose up

# Stop development environment
docker-compose down

# Rebuild and start
docker-compose up --build
```

### Production
```bash
# Build production image
docker build -t simple_pdf_reader:latest .

# Run production container
docker run -p 8080:80 simple_pdf_reader:latest
```

## Technologies Used

- **Vue 3** - Progressive JavaScript framework with Composition API
- **Vite** - Next generation frontend tooling
- **Electron** - Desktop application framework
- **PDF.js** - PDF rendering library (v5.4.449)
- **Bootstrap 5** - CSS framework for responsive design
- **Bootstrap Icons** - Icon library for UI elements
- **Docker** - Containerization platform
- **Nginx** - Web server for production

## Browser Support

This application works best in modern browsers with support for:
- Pointer Events API (for stylus/pen input)
- Canvas API (for drawing and PDF rendering)
- LocalStorage API (for saving page positions)

Recommended browsers: Chrome, Firefox, Edge, Safari (latest versions)

## Usage

1. Click the **"Open PDF"** button to select a PDF file from your computer
2. Use the navigation controls:
   - **Previous/Next** buttons to navigate pages
   - **Zoom** dropdown to adjust viewing size
   - **Lock View** toggle to prevent accidental page changes
3. Select a drawing tool from the toolbar:
   - **Pen**: Draw freehand
   - **Line**: Draw straight lines
   - **Rectangle**: Draw rectangles
   - **Circle**: Draw circles
   - **Eraser**: Remove annotations
4. Choose a color from the color palette (30 colors available)
5. Select line thickness (1-4px)
6. Click **"Clear Drawing"** to remove all annotations

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License

Copyright (c) 2025 Emre Ayhan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

See the [LICENSE](LICENSE) file for more details.
