# Simple PDF Reader

A simple PDF reader application built with Vue 3 and Vite, containerized with Docker.

## Features

- Vue 3 with Composition API
- Vite for fast development and building
- Docker support for development and production
- Nginx for production serving

## Prerequisites

- Docker
- Docker Compose

## Getting Started

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

### Production Build

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
├── public/              # Static assets
├── src/
│   ├── assets/         # Images, fonts, etc.
│   ├── components/     # Vue components
│   ├── App.vue         # Root component
│   ├── main.js         # Application entry point
│   └── style.css       # Global styles
├── Dockerfile          # Production Dockerfile
├── Dockerfile.dev      # Development Dockerfile
├── docker-compose.yml  # Docker Compose configuration
├── index.html          # HTML template
├── package.json        # Dependencies and scripts
└── vite.config.js      # Vite configuration
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

- **Vue 3** - Progressive JavaScript framework
- **Vite** - Next generation frontend tooling
- **Docker** - Containerization platform
- **Nginx** - Web server for production

## License

MIT
