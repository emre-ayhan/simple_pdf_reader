<script setup>
import { ref, watch, nextTick } from "vue";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";

const pdfCanvas = ref(null);
const fileInput = ref(null);
const filename = ref("PDF Reader");
const pageNum = ref(localStorage.getItem(filename.value) ? Number(localStorage.getItem(filename.value)) : 1);
const pageCount = ref(0);
const scale = 2;
const lockView = ref(false);
const width = ref(100);
const isFileLoaded = ref(false);

const colors = [
    ['black', 'dimgray', 'gray', 'darkgray', 'silver', 'white'],
    ['magenta', 'red', 'orangered', 'orange', 'gold', 'yellow'],
    ['green', 'darkgreen', 'lime', 'teal', 'cyan', 'navy'],
    ['blue', 'darkblue', 'royalblue', 'purple', 'magenta', 'pink'],
    ['brown', 'sienna', 'olive', 'maroon', 'coral', 'salmon']
];

// Drawing variables
const isDrawing = ref(false);
const isEraser = ref(false);
const drawMode = ref('pen'); // 'pen', 'line', 'rectangle', 'circle'
const drawColor = ref('blue');
const drawThickness = ref(2);
const drawingCanvas = ref(null);


let drawingContext = null;
let lastX = 0;
let lastY = 0;
let strokes = [];
let currentStroke = [];
let startX = 0;
let startY = 0;
let canvasSnapshot = null;

const isMouseDown = ref(false);
const activePointerId = ref(null);
const activePointerType = ref(null);

var pdfDoc = null;
var pageRendering = ref(false);
var pageNumPending = null;

GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.449/build/pdf.worker.min.mjs';

const renderPage = (num) => {
    pageRendering.value = true;
    pdfDoc.getPage(num).then((page) => {
        const viewport = page.getViewport({ scale });
        const canvas = pdfCanvas.value;
        const ctx = canvas.getContext("2d");

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
            canvasContext: ctx,
            viewport,
        };

        const renderTask = page.render(renderContext);

        pageNum.value = num;
        localStorage.setItem(filename.value, num);

        renderTask.promise.then(() => {
            pageRendering.value = false;
            if (pageNumPending !== null) {
                renderPage(pageNumPending);
                pageNumPending = null;
            }
            // Sync drawing canvas after render
            syncDrawingCanvas();
        });
    });
};

const queueRenderPage = (page) => {
    if (pageRendering.value) {
        pageNumPending = page;
    } else {
        renderPage(page);
    }
};

// Drawing functions
const startDrawing = (e) => {
    if (!isDrawing.value && !isEraser.value) return;
    
    // Track active pointer type
    activePointerType.value = e.pointerType;

    // Only allow pen/stylus and mouse input, not touch
    if (e.pointerType === 'touch') return;
    
    // Prevent default to avoid interference with touch/pen
    e.preventDefault();
    e.stopPropagation();
    
    // Capture the pointer to ensure we get all events
    const canvas = drawingCanvas.value;
    if (canvas && e.pointerId !== undefined) {
        canvas.setPointerCapture(e.pointerId);
    }
    
    // Track this pointer
    activePointerId.value = e.pointerId;
    isMouseDown.value = true;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    // Support pointer, touch, and mouse events
    const clientX = e.clientX !== undefined ? e.clientX : (e.touches?.[0]?.clientX || 0);
    const clientY = e.clientY !== undefined ? e.clientY : (e.touches?.[0]?.clientY || 0);
    
    lastX = (clientX - rect.left) * scaleX;
    lastY = (clientY - rect.top) * scaleY;
    startX = lastX;
    startY = lastY;
    
    if (isEraser.value) {
        eraseAtPoint(lastX, lastY);
    } else if (drawMode.value === 'pen') {
        currentStroke = [{
            x: lastX,
            y: lastY,
            color: drawColor.value,
            thickness: drawThickness.value,
            type: 'pen'
        }];
        drawingContext.beginPath();
        drawingContext.moveTo(lastX, lastY);
    } else {
        // For shapes, save canvas state
        canvasSnapshot = drawingContext.getImageData(0, 0, canvas.width, canvas.height);
    }
};

const draw = (e) => {
    if ((!isDrawing.value && !isEraser.value) || !isMouseDown.value) return;
    
    // Only continue with the same pointer that started
    if (e.pointerId !== activePointerId.value) return;
    
    // Block touch
    if (e.pointerType === 'touch') return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const canvas = drawingCanvas.value;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const clientX = e.clientX !== undefined ? e.clientX : (e.touches?.[0]?.clientX || 0);
    const clientY = e.clientY !== undefined ? e.clientY : (e.touches?.[0]?.clientY || 0);
    
    const currentX = (clientX - rect.left) * scaleX;
    const currentY = (clientY - rect.top) * scaleY;
    
    if (isEraser.value) {
        eraseAtPoint(currentX, currentY);
    } else if (drawMode.value === 'pen') {
        currentStroke.push({
            x: currentX,
            y: currentY,
            color: drawColor.value,
            thickness: drawThickness.value,
            type: 'pen'
        });
        
        drawingContext.lineTo(currentX, currentY);
        drawingContext.strokeStyle = drawColor.value;
        drawingContext.lineWidth = drawThickness.value;
        drawingContext.lineCap = 'round';
        drawingContext.lineJoin = 'round';
        drawingContext.stroke();
    } else {
        // For shapes, restore snapshot and draw preview
        if (canvasSnapshot) {
            drawingContext.putImageData(canvasSnapshot, 0, 0);
        }
        
        drawingContext.strokeStyle = drawColor.value;
        drawingContext.lineWidth = drawThickness.value;
        drawingContext.lineCap = 'round';
        drawingContext.lineJoin = 'round';
        
        if (drawMode.value === 'line') {
            drawingContext.beginPath();
            drawingContext.moveTo(startX, startY);
            drawingContext.lineTo(currentX, currentY);
            drawingContext.stroke();
        } else if (drawMode.value === 'rectangle') {
            drawingContext.strokeRect(startX, startY, currentX - startX, currentY - startY);
        } else if (drawMode.value === 'circle') {
            const radius = Math.sqrt(Math.pow(currentX - startX, 2) + Math.pow(currentY - startY, 2));
            drawingContext.beginPath();
            drawingContext.arc(startX, startY, radius, 0, 2 * Math.PI);
            drawingContext.stroke();
        }
    }
    
    lastX = currentX;
    lastY = currentY;
};

const stopDrawing = (e) => {
    if (!isDrawing.value && !isEraser.value) return;
    
    // Only stop if it's the same pointer
    if (e && e.pointerId !== activePointerId.value) return;
    
    // Release pointer capture
    const canvas = drawingCanvas.value;
    if (canvas && e && e.pointerId !== undefined) {
        try {
            canvas.releasePointerCapture(e.pointerId);
        } catch (err) {
            // Ignore if capture was already released
        }
    }
    
    isMouseDown.value = false;
    activePointerId.value = null;
    activePointerType.value = null;
    
    if (isDrawing.value && drawMode.value !== 'pen' && canvasSnapshot) {
        // Save shape as a stroke
        const shape = {
            type: drawMode.value,
            startX,
            startY,
            endX: lastX,
            endY: lastY,
            color: drawColor.value,
            thickness: drawThickness.value
        };
        strokes.push([shape]);
        canvasSnapshot = null;
    } else if (isDrawing.value && currentStroke.length > 0) {
        strokes.push([...currentStroke]);
        currentStroke = [];
    }
    
    drawingContext.closePath();
};

const initDrawingCanvas = () => {
    const canvas = drawingCanvas.value;
    if (canvas) {
        drawingContext = canvas.getContext('2d');
    }
};

const clearDrawing = () => {
    const canvas = drawingCanvas.value;
    if (canvas && drawingContext) {
        drawingContext.clearRect(0, 0, canvas.width, canvas.height);
        strokes = [];
        currentStroke = [];
    }
};

const redrawAllStrokes = () => {
    const canvas = drawingCanvas.value;
    if (!canvas || !drawingContext) return;
    
    drawingContext.clearRect(0, 0, canvas.width, canvas.height);
    
    strokes.forEach(stroke => {
        if (stroke.length === 0) return;
        
        const first = stroke[0];
        
        // Check if it's a shape
        if (first.type === 'line' || first.type === 'rectangle' || first.type === 'circle') {
            drawingContext.strokeStyle = first.color;
            drawingContext.lineWidth = first.thickness;
            drawingContext.lineCap = 'round';
            drawingContext.lineJoin = 'round';
            
            if (first.type === 'line') {
                drawingContext.beginPath();
                drawingContext.moveTo(first.startX, first.startY);
                drawingContext.lineTo(first.endX, first.endY);
                drawingContext.stroke();
            } else if (first.type === 'rectangle') {
                drawingContext.strokeRect(first.startX, first.startY, first.endX - first.startX, first.endY - first.startY);
            } else if (first.type === 'circle') {
                const radius = Math.sqrt(Math.pow(first.endX - first.startX, 2) + Math.pow(first.endY - first.startY, 2));
                drawingContext.beginPath();
                drawingContext.arc(first.startX, first.startY, radius, 0, 2 * Math.PI);
                drawingContext.stroke();
            }
        } else {
            // It's a pen stroke
            drawingContext.beginPath();
            drawingContext.moveTo(stroke[0].x, stroke[0].y);
            
            for (let i = 1; i < stroke.length; i++) {
                drawingContext.lineTo(stroke[i].x, stroke[i].y);
            }
            
            drawingContext.strokeStyle = stroke[0].color;
            drawingContext.lineWidth = stroke[0].thickness;
            drawingContext.lineCap = 'round';
            drawingContext.lineJoin = 'round';
            drawingContext.stroke();
        }
    });
};

const eraseAtPoint = (x, y) => {
    const eraserRadius = 10;
    let strokesRemoved = false;
    
    strokes = strokes.filter(stroke => {
        for (let point of stroke) {
            const distance = Math.sqrt(Math.pow(point.x - x, 2) + Math.pow(point.y - y, 2));
            if (distance < eraserRadius) {
                strokesRemoved = true;
                return false;
            }
        }
        return true;
    });
    
    if (strokesRemoved) {
        redrawAllStrokes();
    }
};

const syncDrawingCanvas = () => {
    nextTick(() => {
        const pdfCanvasEl = pdfCanvas.value;
        const drawCanvasEl = drawingCanvas.value;
        if (pdfCanvasEl && drawCanvasEl) {
            drawCanvasEl.width = pdfCanvasEl.width;
            drawCanvasEl.height = pdfCanvasEl.height;
        }
    });
};

// Watch for width changes to sync drawing canvas
watch(width, () => {
    syncDrawingCanvas();
});

const loadPdfDocument = () => {
    const file = fileInput.value.files[0];

    if (file) {
        filename.value = file.name;
        const url = URL.createObjectURL(file);
        getDocument(url).promise.then((pdfDoc_) => {
            pdfDoc = pdfDoc_;
            pageCount.value = pdfDoc.numPages;
            pageNum.value = localStorage.getItem(filename.value) ? Number(localStorage.getItem(filename.value)) : 1;
            isFileLoaded.value = true;
            renderPage(pageNum.value);
            
            // Initialize drawing canvas after PDF loads
            setTimeout(() => {
                const pdfCanvasEl = pdfCanvas.value;
                const drawCanvasEl = drawingCanvas.value;
                if (pdfCanvasEl && drawCanvasEl) {
                    drawCanvasEl.width = pdfCanvasEl.width;
                    drawCanvasEl.height = pdfCanvasEl.height;
                    initDrawingCanvas();
                }
            }, 100);
        });
    }
};
</script>
<template>
    <div class="container-fluid">
        <nav class="navbar navbar-expand navbar-dark bg-dark fixed-top">
            <div class="container">
                <!-- Filename -->
                <a class="navbar-brand" href="#" @click.prevent>{{ filename }}</a>

                <!-- Toolbar -->
                <ul class="navbar-nav mx-auto">
                    <!-- Drawing -->
                    <li class="nav-item btn-group">
                        <a class="nav-link" href="#" @click.prevent="isFileLoaded && (isDrawing = !isDrawing, isEraser = false, drawMode = 'pen')" :class="{ disabled: !isFileLoaded }" :style="{ color: isDrawing && drawMode === 'pen' ? drawColor : '' }">
                            <i class="bi bi-pen-fill"></i>
                        </a>
                        <a class="nav-link dropdown-toggle dropdown-toggle-split" href="#" role="button" data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-expanded="false" :class="{ disabled: !isFileLoaded }"></a>
                        <div class="dropdown-menu dropdown-menu-dark p-3">
                            <div class="mb-3">
                                <label class="form-label">Color</label>
                                <template v-for="(colorGroup, groupIndex) in colors">
                                    <div class="d-flex gap-2 mb-2">
                                        <div v-for="(color, colorIndex) in colorGroup" :key="`color-${groupIndex}-${colorIndex}`">
                                            <input type="radio" class="btn-check" name="colors" :id="`color-${groupIndex}-${colorIndex}`" autocomplete="off" v-model="drawColor" :value="color" />
                                            <label class="btn border rounded-circle p-3" :for="`color-${groupIndex}-${colorIndex}`" :title="color" :style="{ backgroundColor: color }" ></label>
                                        </div>
                                    </div>
                                </template>
                                <div class="mb-2">
                                    <svg width="100%" height="40" viewBox="0 0 200 40" preserveAspectRatio="none">
                                        <path 
                                            d="M 0,20 Q 25,5 50,20 T 100,20 T 150,20 T 200,20" 
                                            fill="none" 
                                            :stroke="drawColor" 
                                            :stroke-width="drawThickness" 
                                            stroke-linecap="round"
                                        />
                                    </svg>
                                </div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Thickness</label>
                                <div class="d-flex align-items-center">
                                    <input type="range" class="form-range" min="1" max="10" v-model="drawThickness" />
                                    <input type="text" class="form-control-plaintext" min="1" max="10" v-model="drawThickness" readonly />
                                </div>
                            </div>
                            <button class="btn btn-sm btn-danger w-100" @click="clearDrawing()">Clear All Drawing</button>
                        </div>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#" @click.prevent="isFileLoaded && (isEraser = !isEraser, isDrawing = false)" :class="{ active: isEraser, disabled: !isFileLoaded }">
                            <i class="bi bi-eraser-fill"></i>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#" @click.prevent="isFileLoaded && (isDrawing = true, isEraser = false, drawMode = 'line')" :class="{ active: drawMode === 'line', disabled: !isFileLoaded }" title="Line">
                            <i class="bi bi-slash-lg"></i>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#" @click.prevent="isFileLoaded && (isDrawing = true, isEraser = false, drawMode = 'rectangle')" :class="{ active: drawMode === 'rectangle', disabled: !isFileLoaded }" title="Rectangle">
                            <i class="bi bi-square"></i>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#" @click.prevent="isFileLoaded && (isDrawing = true, isEraser = false, drawMode = 'circle')" :class="{ active: drawMode === 'circle', disabled: !isFileLoaded }" title="Circle">
                            <i class="bi bi-circle"></i>
                        </a>
                    </li>
                    <li class="nav-item vr bg-white mx-2"></li>
                    <!-- Pagination -->
                    <li class="nav-item">
                        <a href="#" class="nav-link" @click.prevent="isFileLoaded && queueRenderPage(1)" :class="{ disabled: !isFileLoaded || pageNum <= 1 }">
                            <i class="bi bi-chevron-double-left"></i>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="#" class="nav-link" @click.prevent="isFileLoaded && queueRenderPage(pageNum - 1)" :class="{ disabled: !isFileLoaded || pageNum <= 1 }">
                            <i class="bi bi-chevron-left"></i>
                        </a>
                    </li>
                    <li class="nav-item">
                        <input type="text" class="form-control-plaintext" :value="pageNum" @input="event => isFileLoaded && queueRenderPage(Number(event.target.value))" :disabled="!isFileLoaded" />
                    </li>
                    <li class="nav-item">
                        <a href="#" class="nav-link" @click.prevent="isFileLoaded && queueRenderPage(pageNum + 1)" :class="{ disabled: !isFileLoaded || pageNum >= pageCount }">
                            <i class="bi bi-chevron-right"></i>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="#" class="nav-link" @click.prevent="isFileLoaded && queueRenderPage(pageCount)" :class="{ disabled: !isFileLoaded || pageNum >= pageCount }">
                            <i class="bi bi-chevron-double-right"></i>
                        </a>
                    </li>
                    <li class="nav-item vr bg-white mx-2"></li>
                    <!-- Zoom -->
                    <li class="nav-item">
                        <a href="#" class="nav-link" @click.prevent="isFileLoaded && (width = Math.max(width - 10, 30))" :class="{ disabled: !isFileLoaded || lockView }">
                            <i class="bi bi-zoom-out"></i>
                        </a>
                    </li>
                    <li class="nav-item">
                        <input type="text" class="form-control-plaintext" v-model="width" :disabled="!isFileLoaded || lockView">
                    </li>
                    <li class="nav-item">
                        <a href="#" class="nav-link" @click.prevent="isFileLoaded && (width = Math.min(width + 10, 100))" :class="{ disabled: !isFileLoaded || lockView }">
                            <i class="bi bi-zoom-in"></i>
                        </a>
                    </li>
                    <li class="nav-item">
                        <a href="#" class="nav-link" @click.prevent="isFileLoaded && (width = width === 100 ? 40 : 100)" :class="{ disabled: !isFileLoaded || lockView }">
                            <i :class="`bi bi-arrows-expand${width == 100 ? '' : '-vertical'}`"></i>
                        </a>
                    </li>
                </ul>

                <!-- Menu -->
                <ul class="navbar-nav">
                    <li class="nav-item" :title="lockView ? 'Unlock View' : 'Lock View'">
                        <a href="#" class="nav-link" @click.prevent="isFileLoaded && (lockView = !lockView)" :class="{ disabled: !isFileLoaded }">
                            <i class="bi" :class="lockView ? 'bi-lock-fill' : 'bi-lock'"></i>
                        </a>
                    </li>
                    <li class="nav-item" :title="isFileLoaded ? 'Open Another PDF' : 'Open PDF'">
                        <a href="#" class="nav-link" @click.prevent="fileInput.click()">
                            <i class="bi bi-folder-fill"></i>
                        </a>
                    </li>
                </ul>
            </div>
        </nav>
        <div class="pdf-reader" :class="{ 'overflow-hidden': lockView }">
            <div class="canvas-container" :style="{ width: `${width}%` }">
                <canvas class="pdf-canvas" ref="pdfCanvas"></canvas>
                <canvas 
                    ref="drawingCanvas" 
                    class="drawing-canvas"
                    @pointerdown="startDrawing"
                    @pointermove="draw"
                    @pointerup="stopDrawing"
                    @pointerleave="stopDrawing"
                    @pointercancel="stopDrawing"
                    :style="{ 
                        cursor: isDrawing ? 'crosshair' : isEraser ? 'pointer' : 'default',
                        pointerEvents: 'auto',
                        touchAction: lockView || activePointerType !== 'touch' ? 'none' : 'pan-y pan-x'
                    }"
                ></canvas>
            </div>
        </div>
        <input ref="fileInput" type="file"  accept="application/pdf" class="d-none" @change="loadPdfDocument" />
    </div>
</template>
<style>
body, #app, .container-fluid {
    margin: 0;
    padding: 0;
    overflow: hidden;
}

.pdf-reader {
    margin-top: 56px;
    width: 100%;
    height: calc(100vh - 56px);
    background-color: var(--bs-secondary);
    overflow: auto;
    display: flex;
    justify-content: center;
    touch-action: pan-y pan-x;
}

.pdf-reader.overflow-hidden {
    touch-action: none;
}

.form-control-plaintext {
    width: 50px !important;
    text-align: center;
    color: var(--bs-light) !important;
    border: none;
    background-color: transparent;
}

.form-control-plaintext:disabled {
    color: var(--bs-secondary) !important;
}

.canvas-container {
    position: relative;
    display: inline-block;
    touch-action: pan-y pan-x;
}

.pdf-canvas {
    width: 100%;
    height: auto;
}

.drawing-canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: auto;
    pointer-events: auto;
}
</style>