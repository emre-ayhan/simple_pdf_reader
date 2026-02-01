import { ref, nextTick, computed, watch } from "vue";
import { PDFDocument, rgb, degrees as pdfDegrees } from "pdf-lib";
import { Electron } from "./useElectron";
import { useStore } from "./useStore";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import { uuid } from "./useUuid";
import { showModal } from "./useModal";
import { fileDataCache, openNewTab, setCurrentTab } from "./useTabs";

GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.449/build/pdf.worker.min.mjs';

export function useFile(loadFileCallback, renderImageFileCallback, lazyLoadCallback, fileSavedCallback) {
    const { set: storeSet, get: storeGet } = useStore();
    const fileId = uuid();

    var pdfDoc = null;

    // Prevent concurrent render() calls per page/canvas
    const pageRenderPromises = new Map();

    const renderPdfPage = async (pageNumber) => {
        if (!pdfDoc) return;
        if (imagePage.value) return;
        if (!pageNumber || pageNumber < 1) return;
        if (renderedPages.value.has(pageNumber)) return;

        if (pageRenderPromises.has(pageNumber)) {
            return pageRenderPromises.get(pageNumber);
        }

        const promise = (async () => {
            const pageIndex = pageNumber - 1;
            const page = await pdfDoc.getPage(pageNumber);

            const pixelRatio = window.devicePixelRatio || 1;
            const containerWidth = pdfReader.value?.clientWidth || window.innerWidth;
            const zoomFactor = Math.max(zoomPercentage.value, 100) / 100;
            const desiredDisplayWidth = containerWidth * zoomFactor;
            const unscaledViewport = page.getViewport({ scale: 1 });
            const scale = Math.max((desiredDisplayWidth * pixelRatio) / unscaledViewport.width, 3);
            const viewport = page.getViewport({ scale });

            const canvas = pdfCanvases.value[pageIndex];
            const drawCanvas = drawingCanvases.value[pageIndex];
            if (!canvas || !drawCanvas) return;

            canvas.style.width = '';
            canvas.style.height = '';
            drawCanvas.style.width = '';
            drawCanvas.style.height = '';

            const ctx = canvas.getContext('2d');

            canvas.height = viewport.height;
            canvas.width = viewport.width;
            drawCanvas.height = viewport.height;
            drawCanvas.width = viewport.width;

            drawingContexts.value[pageIndex] = drawCanvas.getContext('2d', { willReadFrequently: true });

            const renderContext = {
                canvasContext: ctx,
                viewport,
            };

            await page.render(renderContext).promise;

            const textLayerDiv = textLayerDivs.value[pageIndex];
            if (textLayerDiv) {
                textLayerDiv.innerHTML = '';

                const cssWidth = canvas.offsetWidth;
                const cssHeight = canvas.offsetHeight;
                const scaleX = cssWidth / canvas.width;
                const scaleY = cssHeight / canvas.height;

                textLayerDiv.style.width = `${canvas.width}px`;
                textLayerDiv.style.height = `${canvas.height}px`;
                textLayerDiv.style.transform = `scale(${scaleX}, ${scaleY})`;

                const textContent = await page.getTextContent();
                pageTextContent.value[pageIndex] = textContent;

                for (const item of textContent.items) {
                    if (!item.str) continue;

                    const span = document.createElement('span');
                    span.textContent = item.str;

                    const tx = viewport.transform;
                    const m = item.transform;

                    const x = tx[0] * m[4] + tx[2] * m[5] + tx[4];
                    const y = tx[1] * m[4] + tx[3] * m[5] + tx[5];

                    const fontHeight = Math.hypot(
                        tx[0] * m[2] + tx[2] * m[3],
                        tx[1] * m[2] + tx[3] * m[3]
                    );

                    const fontWidth = Math.hypot(
                        tx[0] * m[0] + tx[2] * m[1],
                        tx[1] * m[0] + tx[3] * m[1]
                    );

                    const textWidth = item.width * viewport.scale;

                    span.style.left = `${x}px`;
                    span.style.top = `${y - fontHeight * 0.85}px`;
                    span.style.fontSize = `${fontHeight}px`;
                    span.style.fontFamily = item.fontName || 'sans-serif';

                    const angle = Math.atan2(
                        tx[1] * m[0] + tx[3] * m[1],
                        tx[0] * m[0] + tx[2] * m[1]
                    );

                    let transform = `rotate(${angle}rad)`;
                    if (fontWidth > 0 && fontHeight > 0) {
                        const scaleX2 = fontWidth / fontHeight;
                        if (Math.abs(scaleX2 - 1) > 0.001) {
                            transform += ` scaleX(${scaleX2})`;
                        }
                    }
                    span.style.transform = transform;

                    const measureSpan = document.createElement('span');
                    measureSpan.style.font = span.style.font || `${fontHeight}px ${item.fontName || 'sans-serif'}`;
                    measureSpan.style.position = 'absolute';
                    measureSpan.style.visibility = 'hidden';
                    measureSpan.style.whiteSpace = 'pre';
                    measureSpan.textContent = item.str;
                    textLayerDiv.appendChild(measureSpan);
                    const naturalWidth = measureSpan.offsetWidth;
                    textLayerDiv.removeChild(measureSpan);

                    if (textWidth > 0 && naturalWidth > 0 && item.str.length > 1) {
                        const extraSpace = textWidth - naturalWidth;
                        const letterSpacing = extraSpace / (item.str.length - 1);
                        span.style.letterSpacing = `${letterSpacing}px`;
                    }

                    textLayerDiv.appendChild(span);
                }
            }

            renderedPages.value.add(pageNumber);
            lazyLoadCallback(pageIndex);
        })();

        pageRenderPromises.set(pageNumber, promise);

        try {
            await promise;
        } finally {
            pageRenderPromises.delete(pageNumber);
        }
    };

    // Render a low-res offscreen thumbnail for a page (independent of lazy loading)
    const renderPageThumbnail = async (pageNumber, maxWidth = 160) => {
        try {
            if (!pdfDoc) return null;
            if (!pageNumber || pageNumber < 1 || pageNumber > pdfDoc.numPages) return null;

            const page = await pdfDoc.getPage(pageNumber);
            const viewport1x = page.getViewport({ scale: 1 });
            const scale = Math.min(maxWidth / viewport1x.width, 0.5); // cap scale to avoid heavy work
            const viewport = page.getViewport({ scale });

            const offscreen = document.createElement('canvas');
            offscreen.width = viewport.width;
            offscreen.height = viewport.height;
            const ctx = offscreen.getContext('2d');

            await page.render({ canvasContext: ctx, viewport }).promise;
            return offscreen.toDataURL('image/jpeg', 0.6);
        } catch (e) {
            console.warn('Thumbnail render failed for page', pageNumber, e);
            return null;
        }
    };

    // Observers
    const intersectionObserver = ref(null);
    const lazyLoadObserver = ref(null);

    // General State Variables
    const fileInput = ref(null);
    const filename = ref(null);
    const filepath = ref(null);
    const internalFileSize = ref(0);
    const pagesContainer = ref(null);
    const renderedPages = ref(new Set());
    const pdfReader = ref(null);
    const pdfCanvases = ref([]); // Reference to PDF canvases for selection capture
    const textLayerDivs = ref([]); // Reference to text layer divs for text selection
    const pageTextContent = ref({}); // Store text content by page index
    const isFileLoaded = ref(false);
    const originalPdfData = ref(null);

    // Deleted Pages Set
    const deletedPages = ref(new Set());

    // Drawing State Variables
    const strokesPerPage = ref({}); // Store strokes per page
    const drawingCanvases = ref([]); // Array of drawing canvas elements
    const drawingContexts = ref([]); // Array of drawing contexts
    
    // when opening images as a single page
    const imagePage = ref(null);

    // Zoom State Variables
    const zoomPercentage = ref(100); // 25 to 100

    // Saved State Variables
    const fileRecentlySaved = ref(false);

    // Pagination State Variables
    const pageCount = ref(0);
    const pageIndex = ref(0);
    const pageNum = ref(1);
    const activePages = computed(() => {
        return Array.from({ length: pageCount.value }, (_, i) => i + 1).filter(p => !deletedPages.value.has(p));
    });

    const activePage = computed(() => {
        return activePages.value[pageIndex.value] || 1;
    });

    watch(pageIndex, (newIndex) => {
        pageNum.value = newIndex + 1;
        storePageIndex(filename.value, newIndex);
    });

    const isFirstPage = computed(() => {
        return pageNum.value <= 1;
    });

    const isLastPage = computed(() => {
        return pageNum.value >= (pageCount.value - deletedPages.value.size);
    });

    const handlePageNumberInput = (event) => {
        const page = parseInt(event.target.value);
        const lastPageNum = pageCount.value - deletedPages.value.size;

        if (isNaN(page) || page < 1 || page > lastPageNum) {
            // Invalid page number
            pageNum.value = lastPageNum;
            return;
        }

        scrollToPage(page - 1);
    }

    const setupLazyLoadObserver = () => {
        // Clean up existing observer
        if (lazyLoadObserver.value) {
            lazyLoadObserver.value.disconnect();
        }
        
        const options = {
            root: pdfReader.value,
            rootMargin: '200px', // Start loading 200px before entering viewport
            threshold: 0.01
        };
        
        lazyLoadObserver.value = new IntersectionObserver((entries) => {
            entries.forEach(async entry => {
                if (entry.isIntersecting) {
                    const pageNumber = parseInt(entry.target.getAttribute('data-page'));
                    if (!pdfDoc) return;
                    await renderPdfPage(pageNumber);
                }
            });
        }, options);
        
        // Observe all page containers
        if (pagesContainer.value) {
            const pageContainers = pagesContainer.value.querySelectorAll('.page-container');
            pageContainers.forEach(container => {
                lazyLoadObserver.value.observe(container);
            });
        }
    };

    const setupIntersectionObserver = () => {
        // Clean up existing observer
        if (intersectionObserver.value) {
            intersectionObserver.value.disconnect();
        }
        
        const options = {
            root: pdfReader.value,
            rootMargin: '-45% 0px -45% 0px', // Trigger when middle of viewport
            threshold: 0
        };
        
        intersectionObserver.value = new IntersectionObserver((entries) => {
            // Find the most visible page
            let maxRatio = 0;
            let mostVisiblePage = null;
            
            entries.forEach(entry => {
                if (entry.isIntersecting && entry.intersectionRatio > maxRatio) {
                    maxRatio = entry.intersectionRatio;
                    mostVisiblePage = entry.target;
                }
            });
            
            if (mostVisiblePage) {
                const pageNumber = parseInt(mostVisiblePage.getAttribute('data-page'));
                if (pageNumber && pageNumber !== activePage.value) {
                    pageIndex.value = activePages.value.indexOf(pageNumber);
                    storePageIndex();
                }
            }
        }, options);
        
        // Observe all page containers
        if (pagesContainer.value) {
            const pageContainers = pagesContainer.value.querySelectorAll('.page-container');
            pageContainers.forEach(container => {
                intersectionObserver.value.observe(container);
            });
        }
    };

    const storePageIndex = () => {
        storeSet(filename.value, {
            pageIndex: pageIndex.value
        });
    }

    const getStoredPageIndex = () => {
        storeGet(filename.value).then(data => {
            if (data?.pageIndex) {
                pageIndex.value = data.pageIndex;
            }
        })
    }
    
    const scrollToPage = (targetPageIndex) => {
        if (!isNaN(targetPageIndex)) {
            pageIndex.value = targetPageIndex;
        }

        const page = activePage.value;
        if (!isFileLoaded.value || deletedPages.value.has(page)) return;

        if (page >= 1 && page <= pageCount.value) {
            const canvasIndex = page - 1;
            const canvas = pdfCanvases.value[canvasIndex];
            if (!canvas) return;
            canvas.scrollIntoView({ block: 'start' });
        }
    };

    const scrollToFirstPage = () => {
        scrollToPage(0);
    };

    const scrollToLastPage = () => {
        scrollToPage(activePages.value.length - 1);
    };

    // File Loaded Event Emitter
    const handleFileLoadEvent = (type, page_count) => {
        isFileLoaded.value = true;
        pageCount.value = page_count || 1;
        getStoredPageIndex();

        setCurrentTab({
            id: fileId,
            filename: filename.value,
            path: filepath.value,
            type,
        });
    };

    const extractAllText = async () => {
        if (!pdfDoc) return;
        
        const numPages = pdfDoc.numPages;
        const promises = [];

        for (let i = 1; i <= numPages; i++) {
            // Check if we already have it
            if (pageTextContent.value[i-1]) continue;

            promises.push(
                pdfDoc.getPage(i).then(async (page) => {
                    const textContent = await page.getTextContent();
                    pageTextContent.value[i-1] = textContent;
                })
            );
        }
        
        // Wait for all text to be extracted
        await Promise.all(promises);
    };

    const renderAllPages = async () => {
        if (imagePage.value) {
            pageCount.value = 1;
            await renderImageFileCallback(imagePage.value);
            pageIndex.value = 0;
            return;
        }
        
        if (!pdfDoc) return;
        
        const numPages = pdfDoc.numPages;
        pageCount.value = numPages;
        
        // Initialize strokes for each page
        for (let i = 1; i <= numPages; i++) {
            if (!strokesPerPage.value[i]) {
                strokesPerPage.value[i] = [];
            }
        }

        // Start extracting text for search capability (non-blocking)
        extractAllText();

        // Don't render any pages here - let lazy loading handle it
    };

    const loadImageFile = (file) => {
        if (!file) return;

        filename.value = file.name || 'image';
        filepath.value = file.path || null;
        const reader = new FileReader();
        reader.onload = () => {
            loadFileCallback();
            renderedPages.value.clear();
            drawingContexts.value = [];
            pageTextContent.value = {};
            
            imagePage.value = reader.result;
            strokesPerPage.value = { 1: [] };
            
            handleFileLoadEvent('image');

            nextTick(() => {
                renderAllPages();
            });
        };
        reader.readAsDataURL(file);
    };

    const renderAllPagesAndSetupObservers = () => {
        // Wait for next tick to ensure refs are populated
        nextTick(() => {
            renderAllPages().then(() => {
                // Setup observers after pages structure is ready
                if (imagePage.value) return;
                setupIntersectionObserver();
                setupLazyLoadObserver();
            });
        });
    };

    const getDocumentCallback = (pdfDoc_) => {
        loadFileCallback();
        strokesPerPage.value = {};
        renderedPages.value.clear();
        drawingContexts.value = [];
        pageTextContent.value = {};
        pdfDoc = pdfDoc_;
        imagePage.value = null;
        handleFileLoadEvent('pdf', pdfDoc.numPages);
        renderAllPagesAndSetupObservers();
    }

    const loadPdfFile = (file) => {
        if (file) {
            internalFileSize.value = file.size;
            filename.value = file.name;
            filepath.value = file.path || null;
            const url = URL.createObjectURL(file);
            getDocument(url).promise.then(getDocumentCallback).catch(async error => {
                console.error('Error loading PDF:', error);
                await showModal('Error loading PDF: ' + error.message);
            });
        }
    };

    const loadFile = async (event) => {
        const file = event?.target?.files?.[0] || event;
        
        if (!file) {
            await showModal('Unsupported file type. Please select a PDF or image.');
            return
        };

        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            loadPdfFile(file);
        } else if (file.type.startsWith('image/') || file.name.toLowerCase().match(/\.(png|jpe?g|gif|webp|bmp|svg)$/)) {
            loadImageFile(file);
        } else {
            await showModal('Unsupported file type. Please select a PDF or image.');
        }
    };

    const processFileOpenResult =  async (result) => {
        if (!result) return;

        filepath.value = result.filepath;
        
        // Handle PDF files
        if (result.type === 'pdf' && result.encoding === 'base64') {
            filename.value = result.filename || 'document.pdf';
            
            // Convert base64 to Uint8Array
            const binaryString = atob(result.content);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            // Store a copy of the original PDF data for saving (avoid detached ArrayBuffer issue)
            originalPdfData.value = new Uint8Array(bytes);
            
            // Load PDF from binary data
            getDocument({ data: bytes }).promise.then(getDocumentCallback).catch(async error => {
                console.error('Error loading PDF:', error);
                await showModal('Error loading PDF: ' + error.message);
            });
        }
        // Handle image files
        else if (result.type === 'image' && result.encoding === 'base64') {
            filename.value = result.filename || 'image';
            const dataUrl = `data:${result.mimeType};base64,${result.content}`;

            loadFileCallback();
            renderedPages.value.clear();
            drawingContexts.value = [];
            pageTextContent.value = {};
            
            imagePage.value = dataUrl;
            strokesPerPage.value = { 1: [] };
            handleFileLoadEvent('image');

            nextTick(() => {
                renderAllPages();
            });
        }
        else {
            await showModal('Unsupported file type. Please select a PDF or image.');
        }
    };

    const handleFileOpen = async () => {
        if (Electron.value) {
            const result = await Electron.value.openFile();
            processFileOpenResult(result);
            return;
        }

        if (fileInput.value) {
            fileInput.value.click();
        }
    };

    let saveFileTimeout = null;

    const handleSaveFile = async () => {
        if (!pdfDoc || !isFileLoaded.value) return;

        try {
            // Get the original PDF data
            let arrayBuffer;

            if (originalPdfData.value) {
                // Electron mode - use stored data (convert Uint8Array to ArrayBuffer)
                arrayBuffer = originalPdfData.value.buffer.slice(originalPdfData.value.byteOffset, originalPdfData.value.byteOffset + originalPdfData.value.byteLength);
            } else if (fileInput.value?.files[0]) {
                // Browser mode - read from file input
                const file = fileInput.value.files[0];
                arrayBuffer = await file.arrayBuffer();
            } else {
                console.error('No PDF data available');
                return;
            }
            
            const pdfLibDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

            // Process each page with annotations
            for (let pageNo = 1; pageNo <= pageCount.value; pageNo++) {
                const strokes = strokesPerPage.value[pageNo];
                if (!strokes || strokes.length === 0) continue;

                const page = pdfLibDoc.getPage(pageNo - 1);
                const { width, height } = page.getSize();

                // Get the canvas dimensions for scaling
                const canvas = pdfCanvases.value[pageNo - 1];
                if (!canvas) continue;

                const scaleX = width / canvas.width;
                const scaleY = height / canvas.height;

                // Draw each stroke on the PDF
                for (const stroke of strokes) {
                    if (stroke.length === 0) continue;

                    const first = stroke[0];

                    // Convert color string to RGB
                    const colorMap = {
                        'black': [0, 0, 0], 'dimgray': [0.41, 0.41, 0.41], 'gray': [0.5, 0.5, 0.5],
                        'darkgray': [0.66, 0.66, 0.66], 'silver': [0.75, 0.75, 0.75], 'white': [1, 1, 1],
                        'magenta': [1, 0, 1], 'red': [1, 0, 0], 'orangered': [1, 0.27, 0],
                        'orange': [1, 0.65, 0], 'gold': [1, 0.84, 0], 'yellow': [1, 1, 0],
                        'green': [0, 0.5, 0], 'darkgreen': [0, 0.39, 0], 'lime': [0, 1, 0],
                        'teal': [0, 0.5, 0.5], 'cyan': [0, 1, 1], 'navy': [0, 0, 0.5],
                        'blue': [0, 0, 1], 'darkblue': [0, 0, 0.55], 'royalblue': [0.25, 0.41, 0.88],
                        'purple': [0.5, 0, 0.5], 'pink': [1, 0.75, 0.8],
                        'brown': [0.65, 0.16, 0.16], 'sienna': [0.63, 0.32, 0.18],
                        'olive': [0.5, 0.5, 0], 'maroon': [0.5, 0, 0], 'coral': [1, 0.5, 0.31],
                        'salmon': [0.98, 0.5, 0.45]
                    };

                    const getColor = (colorName) => {
                        const rgbArray = colorMap[colorName] || [0, 0, 0];
                        return rgb(rgbArray[0], rgbArray[1], rgbArray[2]);
                    };

                    const color = getColor(first.color);
                    const thickness = (first.thickness || 2) * scaleX;

                    // Handle text
                    if (first.type === 'text') {
                        const x = first.x * scaleX;
                        const y = height - (first.y * scaleY);
                        const textSize = (first.fontSize || 16) * scaleX;
                        
                        page.drawText(first.text, {
                            x: x,
                            y: y - textSize,
                            size: textSize,
                            color: color
                        });
                    }
                    // Handle shapes
                    else if (first.type === 'line') {
                        const startX = first.startX * scaleX;
                        const startY = height - (first.startY * scaleY);
                        const endX = first.endX * scaleX;
                        const endY = height - (first.endY * scaleY);

                        page.drawLine({
                            start: { x: startX, y: startY },
                            end: { x: endX, y: endY },
                            thickness: thickness,
                            color: color,
                            opacity: 1
                        });
                    } else if (first.type === 'rectangle') {
                        const x = first.startX * scaleX;
                        const y = height - (first.startY * scaleY);
                        const w = (first.endX - first.startX) * scaleX;
                        const h = (first.endY - first.startY) * scaleY;

                        page.drawRectangle({
                            x: x,
                            y: y - h,
                            width: w,
                            height: h,
                            borderColor: color,
                            borderWidth: thickness,
                            opacity: 0
                        });
                    } else if (first.type === 'circle') {
                        const centerX = first.startX * scaleX;
                        const centerY = height - (first.startY * scaleY);
                        const radius = Math.sqrt(
                            Math.pow((first.endX - first.startX) * scaleX, 2) +
                            Math.pow((first.endY - first.startY) * scaleY, 2)
                        );

                        page.drawCircle({
                            x: centerX,
                            y: centerY,
                            size: radius,
                            borderColor: color,
                            borderWidth: thickness,
                            opacity: 0
                        });
                    } else if (first.type === 'highlight-rect') {
                        const rects = first.rects || [{ x: first.x, y: first.y, width: first.width, height: first.height }];
                        
                        for (const rect of rects) {
                            const x = rect.x * scaleX;
                            const h = rect.height * scaleY;
                            const y = height - (rect.y * scaleY) - h;
                            const w = rect.width * scaleX;

                            page.drawRectangle({
                                x: x,
                                y: y,
                                width: w,
                                height: h,
                                color: color,
                                opacity: 0.3,
                                borderWidth: 0
                            });
                        }
                    } else if (first.type === 'pen') {
                        // Draw pen strokes as connected lines
                        for (let i = 0; i < stroke.length - 1; i++) {
                            const point1 = stroke[i];
                            const point2 = stroke[i + 1];

                            const x1 = point1.x * scaleX;
                            const y1 = height - (point1.y * scaleY);
                            const x2 = point2.x * scaleX;
                            const y2 = height - (point2.y * scaleY);

                            page.drawLine({
                                start: { x: x1, y: y1 },
                                end: { x: x2, y: y2 },
                                thickness: (point1.thickness || 2) * scaleX,
                                color: getColor(point1.color),
                                opacity: 1
                            });
                        }
                    } else if (first.type === 'image' && first.imageData) {
                        try {
                            const dataUrl = first.imageData;
                            const base64Data = dataUrl.split(',')[1];
                            
                            let image;
                            if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) {
                                image = await pdfLibDoc.embedJpg(base64Data);
                            } else {
                                image = await pdfLibDoc.embedPng(base64Data);
                            }

                            const imageWidth = first.width * scaleX;
                            const imageHeight = first.height * scaleY;
                            
                            page.drawImage(image, {
                                x: first.x * scaleX,
                                y: height - (first.y * scaleY) - imageHeight,
                                width: imageWidth,
                                height: imageHeight,
                            });
                        } catch (err) {
                            console.error('Error embedding image stroke:', err);
                        }
                    }
                }
            }

            // Remove any pages that were deleted by the user before saving
            if (deletedPages.value && deletedPages.value.size > 0) {
                try {
                    // Convert deleted page numbers to zero-based indexes and sort descending
                    const indices = Array.from(deletedPages.value)
                        .map(p => p - 1)
                        .filter(i => Number.isInteger(i) && i >= 0)
                        .sort((a, b) => b - a);

                    // Remove pages from the PDF document in descending order
                    indices.forEach(idx => {
                        try {
                            if (typeof pdfLibDoc.removePage === 'function') {
                                pdfLibDoc.removePage(idx);
                            }
                        } catch (err) {
                            console.error('Failed to remove page index', idx, err);
                        }
                    });
                } catch (err) {
                    console.error('Error removing deleted pages before save:', err);
                }
            }

            // Save the modified PDF
            const pdfBytes = await pdfLibDoc.save();
            
            // If running in Electron and we have the original filepath, overwrite it
            if (Electron.value && filepath.value) {
                try {
                    // Convert Uint8Array to base64 in chunks to avoid call stack overflow
                    const uint8Array = new Uint8Array(pdfBytes);
                    let base64Content = '';
                    const chunkSize = 8192; // Process 8KB at a time
                    
                    for (let i = 0; i < uint8Array.length; i += chunkSize) {
                        const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
                        base64Content += String.fromCharCode.apply(null, Array.from(chunk));
                    }
                    base64Content = btoa(base64Content);
                    
                    const result = await Electron.value.saveFile(filepath.value, base64Content, 'base64');
                    
                    if (result.success) {
                        console.log('PDF saved successfully to:', result.filepath);
                        fileSavedCallback();
                        fileRecentlySaved.value = true;
                        clearTimeout(saveFileTimeout);
                        saveFileTimeout = setTimeout(() => {
                            fileRecentlySaved.value = false;
                        }, 2000);
                        return;
                    } else {
                        console.error('Electron save failed:', result.error);
                        console.error('Error code:', result.errorCode);
                        await showModal(`Failed to save PDF: ${result.error}\nError code: ${result.errorCode || 'unknown'}\nFalling back to download.`);
                        // Don't throw - fall through to download method
                    }
                } catch (err) {
                    console.error('Error saving with Electron:', err);
                    console.error('Error details:', {
                        message: err.message,
                        stack: err.stack,
                        filepath: filepath.value
                    });
                    await showModal(`Failed to save PDF with Electron: ${err.message}\nFalling back to download.`);
                    // Don't throw - fall through to download method
                }
            }
        
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            
            // Try to use File System Access API if available (Chrome/Edge)
            if ('showSaveFilePicker' in window) {
                try {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: filename.value,
                        types: [{
                            description: 'PDF Files',
                            accept: { 'application/pdf': ['.pdf'] }
                        }]
                    });
                    const writable = await handle.createWritable();
                    await writable.write(pdfBytes);
                    await writable.close();
                    console.log('PDF saved successfully with annotations to:', handle.name);
                    fileSavedCallback();
                    return;
                } catch (err) {
                    if (err.name === 'AbortError') {
                        console.log('Save cancelled by user');
                        return;
                    }
                    console.warn('File System Access API failed, falling back to download:', err);
                }
            }
        
            // Fallback: use download method
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename.value;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            console.log('PDF downloaded with annotations');
            fileSavedCallback();
        } catch (error) {
            console.error('Error saving PDF:', error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                hasElectron: !!Electron.value,
                hasFilepath: !!filepath.value,
                hasPdfData: !!originalPdfData.value
            });
            await showModal('Failed to save PDF: ' + error.message);
        }
    };

    const deletePage = async (index, callback) => {
        const page = activePages.value[index];
        if (!pdfDoc || !page) return;
        
        const confirmed = await showModal(`Are you sure you want to delete page \{${page}\}?`, true);
        if (!confirmed) return;

        deletedPages.value.add(page);

        if (typeof callback !== 'function') return;
        callback({ type: 'delete-page', page });
    };

    const createBlankPage = async (callback) => {
        // Create a new single blank page PDF
        const pdfLibDoc = await PDFDocument.create();
        
        // Use standard letter size
        const width = 595; // 8.3 inches * 72 points/inch
        const height = 842; // 11.7 inches * 72 points/inch
        
        const blankPage = pdfLibDoc.addPage([width, height]);
        
        // Draw a white background
        blankPage.drawRectangle({
            x: 0,
            y: 0,
            width,
            height,
            color: rgb(1, 1, 1),
        });
        
        // Save and load the new PDF
        const pdfBytes = await pdfLibDoc.save();
        originalPdfData.value = new Uint8Array(pdfBytes);
        
        // Load the new PDF
        getDocument({ data: pdfBytes }).promise.then(async (pdfDoc_) => {
            filename.value = `Document_${Date.now()}.pdf`;
            filepath.value = null;
            loadFileCallback();
            strokesPerPage.value = { 1: [] };
            renderedPages.value.clear();
            drawingContexts.value = [];
            pageTextContent.value = {};
            pdfDoc = pdfDoc_;
            imagePage.value = null;
            handleFileLoadEvent('pdf', pdfDoc.numPages);
            
            await nextTick();
            await renderAllPages();
            setupIntersectionObserver();
            setupLazyLoadObserver();
            
            // Wait for the page to be rendered by lazy load observer
            await nextTick();
            
            // Reset page index to 0 for the new blank page
            pageIndex.value = 0;
            
            // Poll for canvas to be ready
            if (typeof callback === 'function') {
                callback();
            }
        }).catch(async error => {
            console.error('Error creating blank PDF:', error);
            await showModal('Error creating blank page: ' + error.message);
        });
    };

    const rotatePage = async (direction) => {
        if (!pdfDoc) return;

        const rotationChange = direction === 'clockwise' ? 90 : -90;
        const pageNum = activePage.value;
        const pageIdx = pageNum - 1;

        // We can't easily rotate the page in the viewer client-side without re-rendering everything
        // So we'll rotate it in the PDF document model (pdf-lib) and reload the document.
        // This is a heavy operation but ensures consistency.

        try {
            // Get current PDF data
            let arrayBuffer;
            if (originalPdfData.value) {
                arrayBuffer = originalPdfData.value.buffer.slice(
                    originalPdfData.value.byteOffset, 
                    originalPdfData.value.byteOffset + originalPdfData.value.byteLength
                );
            } else if (fileInput.value?.files[0]) {
                 const file = fileInput.value.files[0];
                 arrayBuffer = await file.arrayBuffer();
            } else {
                return;
            }

            const pdfLibDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
            const page = pdfLibDoc.getPage(pageIdx);
            
            const currentRotation = page.getRotation().angle;
            const newRotation = (currentRotation + rotationChange) % 360;
            const normalizedRotation = newRotation < 0 ? newRotation + 360 : newRotation;

            page.setRotation(pdfDegrees(normalizedRotation));

            // Save modified PDF
            const pdfBytes = await pdfLibDoc.save();
            originalPdfData.value = new Uint8Array(pdfBytes);

            // Reload PDF
            const pdfDoc_ = await getDocument({ data: pdfBytes }).promise;
            
            // Re-initialize viewer state
             renderedPages.value.clear();
             drawingContexts.value = [];
             pageTextContent.value = {};
             pdfDoc = pdfDoc_;
             
             // Strokes might need adjustment if logic was relative to unrotated coordinates
             // For now, let's keep them as is (user might need to manually adjust if they drew something)
             // Ideally we should rotate strokes too, but that's complex math for now.

             await nextTick();
             await renderAllPages();
             setupIntersectionObserver();
             setupLazyLoadObserver();
             
             // Restore position
             await nextTick();
             scrollToPage(pageIdx);
             
        } catch (error) {
            console.error('Error rotating page:', error);
            await showModal('Falied to rotate page: ' + error.message);
        }
    };

    const insertBlankPage = async () => {
        if (!pdfDoc) return;
        
        // Get the current page number where we want to insert after
        const currentPageNum = activePage.value;
        
        // Increment page count
        const newPageNumber = pageCount.value + 1;
        pageCount.value = newPageNumber;
        
        // Shift all strokes from pages after the current page
        const newStrokesPerPage = {};
        for (let i = 1; i <= currentPageNum; i++) {
            newStrokesPerPage[i] = strokesPerPage.value[i] || [];
        }
        // Insert blank page with no strokes
        newStrokesPerPage[currentPageNum + 1] = [];
        // Shift remaining pages
        for (let i = currentPageNum + 1; i < newPageNumber; i++) {
            newStrokesPerPage[i + 1] = strokesPerPage.value[i] || [];
        }
        strokesPerPage.value = newStrokesPerPage;
        
        // Load the original PDF and add a blank page
        let arrayBuffer;
        if (originalPdfData.value) {
            arrayBuffer = originalPdfData.value.buffer.slice(
                originalPdfData.value.byteOffset, 
                originalPdfData.value.byteOffset + originalPdfData.value.byteLength
            );
        } else if (fileInput.value?.files[0]) {
            const file = fileInput.value.files[0];
            arrayBuffer = await file.arrayBuffer();
        } else {
            console.error('No PDF data available');
            return;
        }
        
        const pdfLibDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        
        // Get dimensions from current page or use default
        const currentPage = pdfLibDoc.getPage(currentPageNum - 1);
        const { width, height } = currentPage.getSize();
        
        // Create a blank page with same dimensions
        const blankPage = pdfLibDoc.insertPage(currentPageNum, [width, height]);
        
        // Draw a white background
        blankPage.drawRectangle({
            x: 0,
            y: 0,
            width,
            height,
            color: rgb(1, 1, 1),
        });
        
        // Save the modified PDF back
        const pdfBytes = await pdfLibDoc.save();
        originalPdfData.value = new Uint8Array(pdfBytes);
        
        // Reload the PDF
        getDocument({ data: pdfBytes }).promise.then(async (pdfDoc_) => {
            pdfDoc = pdfDoc_;
            renderedPages.value.clear();
            drawingContexts.value = [];
            pageTextContent.value = {};
            
            await nextTick();
            await renderAllPages();
            setupIntersectionObserver();
            setupLazyLoadObserver();
            
            // Scroll to the newly inserted page
            await nextTick();
            scrollToPage(currentPageNum);
            
            if (typeof callback === 'function') {
                callback({ type: 'insert-blank-page', pageNumber: currentPageNum + 1 });
            }
        }).catch(async error => {
            console.error('Error reloading PDF after blank page insertion:', error);
            await showModal('Error inserting blank page: ' + error.message);
        });
    };

    const createImage = (imageData, redrawAllStrokesCallback, addToHistoryCallback) => {
        if(!imageData) return;
        const img = new Image();
        img.onload = () => {
            // Add image to current page in visible viewport
            const canvasIndex = pageIndex.value;
            const canvas = drawingCanvases.value[canvasIndex];
            
            if (!canvas) return;
            
            // Calculate visible viewport position on the canvas
            const pageContainer = pagesContainer.value?.querySelector(`.page-container[data-page="${pageIndex.value + 1}"]`);
            const pdfReaderEl = pdfReader.value;
            
            let viewportCenterX = canvas.width / 2;
            let viewportCenterY = canvas.height / 2;
            
            if (pageContainer && pdfReaderEl) {
                const containerRect = pageContainer.getBoundingClientRect();
                const readerRect = pdfReaderEl.getBoundingClientRect();
                
                // Calculate visible center relative to the page
                const visibleCenterX = (readerRect.left + readerRect.width / 2) - containerRect.left;
                const visibleCenterY = (readerRect.top + readerRect.height / 2) - containerRect.top;
                
                // Convert to canvas coordinates
                const scaleX = canvas.width / containerRect.width;
                const scaleY = canvas.height / containerRect.height;
                
                viewportCenterX = visibleCenterX * scaleX;
                viewportCenterY = visibleCenterY * scaleY;
            }
            
            // Use the full image dimensions without artificial limits
            let width = img.width;
            let height = img.height;
            
            // Only scale down if image is larger than canvas
            if (width > canvas.width || height > canvas.height) {
                const ratio = Math.min(canvas.width / width, canvas.height / height);
                width *= ratio;
                height *= ratio;
            }
            
            // Center the image in the visible viewport on the canvas
            const x = Math.max(0, Math.min(canvas.width - width, viewportCenterX - width / 2));
            const y = Math.max(0, Math.min(canvas.height - height, viewportCenterY - height / 2));
            
            const imageStroke = [{
                type: 'image',
                x,
                y,
                width,
                height,
                imageData,
                originalWidth: width,
                originalHeight: height
            }];
            
            const strokeId = uuid();
            // Assign a stable id to the image stroke for history ops
            imageStroke[0].id = strokeId;
            const pageNumber = pageIndex.value + 1;
            if (!strokesPerPage.value[pageNumber]) {
                strokesPerPage.value[pageNumber] = [];
            }
            strokesPerPage.value[pageNumber].push(imageStroke);
            
            redrawAllStrokesCallback(canvasIndex);
            // Use unified history action shape
            addToHistoryCallback({ type: 'add', id: strokeId, page: pageNumber, stroke: imageStroke });
        };

        img.src = imageData;
    }

    const createImageImportHandler = (redrawAllStrokesCallback, addToHistoryCallback) => {
        return async (event) => {
            const file = event.target.files?.[0];
            if (!file || !file.type.startsWith('image/')) return;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                createImage(e.target.result, redrawAllStrokesCallback, addToHistoryCallback);
            };
            reader.readAsDataURL(file);
            
            // Reset input
            event.target.value = '';
        };
    };

    // Open a blank page
    const openNewBlankPage = (redrawAllStrokes, addToHistory, imageData) => {
        if (isFileLoaded.value) {
            openNewTab();
            fileDataCache.value = {
                type: 'blank',
            }
            return;
        }
        
        createBlankPage(() => {
            createImage(imageData, redrawAllStrokes, addToHistory);
        });
    };

    // Keep the PDF.js text layer aligned with the canvas after zoom/resize.
    // Pages are rendered once and then CSS size changes; we must update the text-layer scale.
    const resyncRenderedTextLayers = async () => {
        if (!isFileLoaded.value) return;
        await nextTick();

        const pages = Array.from(renderedPages.value || new Set());
        for (const pageNumber of pages) {
            if (deletedPages.value?.has?.(pageNumber)) continue;
            const index = pageNumber - 1;
            const canvas = pdfCanvases.value?.[index];
            const textLayerDiv = textLayerDivs.value?.[index];
            if (!canvas || !textLayerDiv) continue;

            const cssWidth = canvas.offsetWidth;
            const cssHeight = canvas.offsetHeight;
            if (!cssWidth || !cssHeight || !canvas.width || !canvas.height) continue;

            const scaleX = cssWidth / canvas.width;
            const scaleY = cssHeight / canvas.height;

            textLayerDiv.style.width = `${canvas.width}px`;
            textLayerDiv.style.height = `${canvas.height}px`;
            textLayerDiv.style.transformOrigin = '0 0';
            textLayerDiv.style.transform = `scale(${scaleX}, ${scaleY})`;
        }
    };

    const showDocumentProperties = async () => {
        if (!pdfDoc) return;
        
        try {
            const { info } = await pdfDoc.getMetadata();
            
            const formatBytes = (bytes, decimals = 2) => {
                if (!+bytes) return '0 Bytes';
                const k = 1024;
                const dm = decimals < 0 ? 0 : decimals;
                const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
                const i = Math.floor(Math.log(bytes) / Math.log(k));
                return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
            };

            const formatPdfDate = (dateStr) => {
                if (!dateStr) return '-';
                // Simple cleanup for PDF date string D:YYYYMMDDHHmmss...
                if (dateStr.startsWith('D:')) {
                    return dateStr.substring(2).replace(/'/g, '');
                }
                return dateStr;
            };

            const size = originalPdfData.value ? originalPdfData.value.byteLength : internalFileSize.value;
            const fileSize = size ? formatBytes(size) : 'Unknown';
            console.log(info);
            
            const properties = {
                "File Name": filename.value,
                "File Size": fileSize,
                "Title": info?.Title || '-',
                "Author": info?.Author || '-',
                "Subject": info?.Subject || '-',
                "Keywords": info?.Keywords || '-',
                "Creator": info?.Creator || '-',
                "Producer": info?.Producer || '-',
                "Creation Date": formatPdfDate(info?.CreationDate),
                "Modification Date": formatPdfDate(info?.ModDate),
                "PDF Format Version": info?.PDFFormatVersion || '-',
                "Page Count": pageCount.value

            };

            await showModal(properties);
            
        } catch (error) {
            console.error('Error getting document properties:', error);
            await showModal('Failed to retrieve document properties.');
        }
    };

    return {
        fileId,
        pagesContainer,
        pdfCanvases,
        textLayerDivs,
        pageTextContent,
        strokesPerPage,
        drawingCanvases,
        drawingContexts,
        renderedPages,
        pdfReader,
        isFileLoaded,
        originalPdfData,
        fileInput,
        filename,
        filepath,
        imagePage,
        pageCount,
        pageNum,
        pageIndex,
        activePages,
        isFirstPage,
        isLastPage,
        zoomPercentage,
        fileRecentlySaved,
        handlePageNumberInput,
        renderAllPages,
        loadImageFile,
        loadPdfFile,
        loadFile,
        renderAllPagesAndSetupObservers,
        getDocumentCallback,
        processFileOpenResult,
        handleFileOpen,
        handleSaveFile,
        intersectionObserver,
        lazyLoadObserver,
        setupIntersectionObserver,
        setupLazyLoadObserver,
        renderPdfPage,
        renderPageThumbnail,
        resyncRenderedTextLayers,
        scrollToPage,
        scrollToFirstPage,
        scrollToLastPage,
        storePageIndex,
        getStoredPageIndex,
        deletedPages,
        deletePage,
        createBlankPage,
        openNewBlankPage,
        insertBlankPage,
        createImageImportHandler,
        createImage,
        extractAllText,
        showDocumentProperties,
        rotatePage
    }
}