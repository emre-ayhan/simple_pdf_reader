# Simple PDF Reader

A feature-rich PDF reader application built with Vue 3 and Vite, containerized with Docker. This application allows you to view PDF documents and annotate them with various drawing tools.

## Features

### PDF Viewing
- 📄 Load and view PDF files from your local system
- 🔢 Navigate through pages with next/previous buttons
- 🔍 Adjustable zoom with multiple preset levels (50%, 75%, 100%, 150%, 200%)
- 📱 Responsive design that works on desktop and mobile devices
- 💾 Automatic page position memory (saves your last viewed page)

### Drawing & Annotation Tools
- ✏️ **Pen Tool**: Free-hand drawing on PDF pages
- 📏 **Line Tool**: Draw straight lines
- ⬛ **Rectangle Tool**: Draw rectangular shapes
- ⭕ **Circle Tool**: Draw circular shapes
- 🧹 **Eraser Tool**: Remove annotations
- 🎨 **Color Palette**: 30 predefined colors organized in 5 rows
- 📐 **Adjustable Thickness**: Choose from 4 line thickness options (1-4px)
- ♿ **Stylus Support**: Full support for digital pen/stylus input with pointer events
- 🔄 **Undo/Clear**: Clear all annotations with one click

### Technical Features
- Vue 3 with Composition API
- PDF.js for reliable PDF rendering
- Bootstrap 5 for modern UI components
- Vite for fast development and building
- Docker support for development and production
- Nginx for production serving
- LocalStorage integration for page persistence

## Prerequisites

### For Local Usage
- Node.js (v16 or higher)
- npm or yarn
- A modern web browser (Chrome, Firefox, Edge, or Safari)

### For Docker Development
- Docker
- Docker Compose

## Getting Started

### Local Usage (Standalone)

Build the application for local use without Docker:

1. Install dependencies and build:
```bash
npm install
npm run build
```

2. The built files will be in the `dist/` folder, including:
   - `index.html` - The main application file
   - `logo.ico` - Application icon
   - `create_shortcut.bat` - Windows shortcut creator
   - `create_shortcut.sh` - macOS shortcut creator

3. Create a desktop shortcut:

   **Windows:**
   ```bash
   cd dist
   create_shortcut.bat
   ```
   This creates a Start Menu shortcut that opens the PDF reader in Chrome as a standalone app.

   **macOS:**
   ```bash
   cd dist
   chmod +x create_shortcut.sh
   ./create_shortcut.sh
   ```
   This creates an application bundle in `~/Applications/Simple PDF Reader.app` that can be:
   - Launched from Finder
   - Added to your Dock
   - Moved to `/Applications` for system-wide access

4. Alternatively, open `dist/index.html` directly in your browser.

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

MIT
