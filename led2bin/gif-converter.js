// ESP32 GIF Converter - JavaScript
// This file should be saved as "gif-converter.js"

// Global variables
let selectedFiles = [];
let convertedFiles = [];

// DOM elements
const fileInput = document.getElementById('fileInput');
const uploadArea = document.getElementById('uploadArea');
const fileList = document.getElementById('fileList');
const convertBtn = document.getElementById('convertBtn');
const downloadAllBtn = document.getElementById('downloadAllBtn');
const selectFilesBtn = document.getElementById('selectFilesBtn');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const results = document.getElementById('results');
const downloadList = document.getElementById('downloadList');

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
    updateConvertButton();
});

// Event listeners setup
function initializeEventListeners() {
    selectFilesBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    convertBtn.addEventListener('click', convertAllFiles);
    downloadAllBtn.addEventListener('click', downloadAllFiles);

    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = Array.from(e.dataTransfer.files).filter(file => file.type === 'image/gif');
        if (files.length > 0) {
            addFiles(files);
        }
    });
}

// GIF Reader Class - Parses actual GIF frame delays
class GifReader {
    constructor(arrayBuffer) {
        this.data = new Uint8Array(arrayBuffer);
        this.pos = 0;
    }

    readByte() {
        return this.data[this.pos++];
    }

    readBytes(count) {
        const result = this.data.slice(this.pos, this.pos + count);
        this.pos += count;
        return result;
    }

    readShort() {
        const low = this.readByte();
        const high = this.readByte();
        return low | (high << 8);
    }

    skipDataSubBlocks() {
        let blockSize;
        do {
            blockSize = this.readByte();
            this.pos += blockSize;
        } while (blockSize > 0);
    }

    parseGif() {
        try {
            // Check GIF signature
            const signature = String.fromCharCode(...this.readBytes(6));
            if (!signature.startsWith('GIF')) {
                throw new Error('Not a valid GIF file');
            }

            // Read logical screen descriptor
            const width = this.readShort();
            const height = this.readShort();
            
            const packed = this.readByte();
            const globalColorTableFlag = (packed & 0x80) !== 0;
            const globalColorTableSize = 2 << (packed & 0x07);
            
            this.readByte(); // Background color index
            this.readByte(); // Pixel aspect ratio

            // Skip global color table if present
            if (globalColorTableFlag) {
                this.pos += globalColorTableSize * 3;
            }

            // Parse data stream
            let frameDelay = 100;
            let frameCount = 0;
            const delays = [];

            while (this.pos < this.data.length) {
                const separator = this.readByte();
                
                if (separator === 0x21) { // Extension introducer
                    const label = this.readByte();
                    
                    if (label === 0xF9) { // Graphic control extension
                        const blockSize = this.readByte();
                        if (blockSize === 4) {
                            this.readByte(); // Packed field
                            frameDelay = this.readShort() * 10; // Convert to milliseconds
                            this.readByte(); // Transparent color index
                            this.readByte(); // Block terminator
                            
                            if (frameDelay === 0) frameDelay = 100;
                        }
                    } else {
                        this.skipDataSubBlocks();
                    }
                } else if (separator === 0x2C) { // Image separator
                    // Image descriptor
                    this.readShort(); // Left
                    this.readShort(); // Top
                    this.readShort(); // Width
                    this.readShort(); // Height
                    
                    const packed = this.readByte();
                    const localColorTableFlag = (packed & 0x80) !== 0;
                    const localColorTableSize = localColorTableFlag ? 2 << (packed & 0x07) : 0;
                    
                    // Skip local color table
                    if (localColorTableFlag) {
                        this.pos += localColorTableSize * 3;
                    }
                    
                    // Skip LZW minimum code size
                    this.readByte();
                    
                    // Skip image data
                    this.skipDataSubBlocks();
                    
                    delays.push(frameDelay);
                    frameCount++;
                    frameDelay = 100;
                    
                } else if (separator === 0x3B) { // Trailer
                    break;
                }
            }

            return {
                width: width,
                height: height,
                frameCount: Math.max(frameCount, 1),
                delays: delays.length > 0 ? delays : [100],
                averageDelay: delays.length > 0 ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : 100,
                isAnimated: frameCount > 1
            };

        } catch (error) {
            console.error('GIF parsing error:', error);
            return {
                width: 16,
                height: 16,
                frameCount: 1,
                delays: [100],
                averageDelay: 100,
                isAnimated: false
            };
        }
    }
}

// File handling functions
function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    addFiles(files);
}

function addFiles(files) {
    files.forEach(file => {
        if (file.type === 'image/gif') {
            selectedFiles.push({
                file: file,
                id: Date.now() + Math.random(),
                status: 'ready'
            });
        }
    });
    updateFileList();
    updateConvertButton();
}

function removeFile(id) {
    selectedFiles = selectedFiles.filter(item => item.id !== id);
    updateFileList();
    updateConvertButton();
}

function updateFileList() {
    fileList.innerHTML = '';
    
    selectedFiles.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'file-item';
        
        // Create file info section
        const fileInfo = document.createElement('div');
        fileInfo.className = 'file-info';
        
        const preview = document.createElement('img');
        preview.className = 'file-preview';
        preview.src = URL.createObjectURL(item.file);
        
        const details = document.createElement('div');
        details.className = 'file-details';
        
        const fileName = document.createElement('div');
        fileName.className = 'file-name';
        fileName.textContent = item.file.name;
        
        const fileMeta = document.createElement('div');
        fileMeta.className = 'file-meta';
        fileMeta.textContent = `SIZE: ${(item.file.size / 1024).toFixed(1)} KB | OUTPUT: GIF${index + 1}.BIN`;
        
        details.appendChild(fileName);
        details.appendChild(fileMeta);
        fileInfo.appendChild(preview);
        fileInfo.appendChild(details);
        
        // Create controls section
        const controls = document.createElement('div');
        controls.style.display = 'flex';
        controls.style.alignItems = 'center';
        controls.style.gap = '10px';
        
        const status = document.createElement('span');
        status.className = `file-status status-${item.status}`;
        status.textContent = getStatusText(item.status);
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn btn-danger';
        removeBtn.style.padding = '8px 16px';
        removeBtn.style.fontSize = '0.8em';
        removeBtn.textContent = 'REMOVE';
        removeBtn.addEventListener('click', () => removeFile(item.id));
        
        controls.appendChild(status);
        controls.appendChild(removeBtn);
        
        div.appendChild(fileInfo);
        div.appendChild(controls);
        fileList.appendChild(div);
    });
}

function getStatusText(status) {
    switch (status) {
        case 'ready': return 'READY';
        case 'processing': return 'PROCESSING';
        case 'success': return 'CONVERTED';
        case 'error': return 'ERROR';
        default: return 'UNKNOWN';
    }
}

function updateConvertButton() {
    convertBtn.disabled = selectedFiles.length === 0;
}

// GIF analysis
async function getGifProperties(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const gifReader = new GifReader(e.target.result);
                const properties = gifReader.parseGif();
                resolve(properties);
            } catch (error) {
                console.error('Error parsing GIF:', error);
                resolve({
                    width: 16,
                    height: 16,
                    frameCount: 1,
                    delays: [100],
                    averageDelay: 100,
                    isAnimated: false
                });
            }
        };
        reader.readAsArrayBuffer(file);
    });
}

// Image processing
function convertColorOrder(r, g, b, order) {
    switch (order) {
        case 'rgb': return [r, g, b];
        case 'grb': return [g, r, b];
        case 'bgr': return [b, g, r];
        default: return [r, g, b];
    }
}

async function resizeImage(file, targetWidth, targetHeight) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            
            ctx.drawImage(this, 0, 0, targetWidth, targetHeight);
            
            const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
            resolve(imageData);
        };
        img.src = URL.createObjectURL(file);
    });
}

// Conversion functions
async function convertGifToBinary(fileItem, index) {
    const matrixWidth = parseInt(document.getElementById('matrixWidth').value);
    const matrixHeight = parseInt(document.getElementById('matrixHeight').value);
    const colorOrder = document.getElementById('colorOrder').value;
    const minDelay = parseInt(document.getElementById('minDelay').value);

    try {
        fileItem.status = 'processing';
        updateFileList();

        const props = await getGifProperties(fileItem.file);
        console.log(`GIF Analysis for ${fileItem.file.name}:`, props);
        
        const actualDelay = Math.max(props.averageDelay, minDelay);
        const imageData = await resizeImage(fileItem.file, matrixWidth, matrixHeight);
        
        const headerSize = 8;
        const pixelsPerFrame = matrixWidth * matrixHeight;
        const bytesPerFrame = pixelsPerFrame * 3;
        const totalFrames = props.frameCount;
        const totalSize = headerSize + (bytesPerFrame * totalFrames);
        
        const buffer = new ArrayBuffer(totalSize);
        const view = new DataView(buffer);
        const uint8View = new Uint8Array(buffer);
        
        view.setUint32(0, totalFrames, true);
        view.setUint32(4, actualDelay, true);
        
        let bufferIndex = headerSize;
        
        for (let frame = 0; frame < totalFrames; frame++) {
            for (let y = 0; y < matrixHeight; y++) {
                for (let x = 0; x < matrixWidth; x++) {
                    const pixelIndex = (y * matrixWidth + x) * 4;
                    
                    const r = imageData.data[pixelIndex];
                    const g = imageData.data[pixelIndex + 1];
                    const b = imageData.data[pixelIndex + 2];
                    
                    const [c1, c2, c3] = convertColorOrder(r, g, b, colorOrder);
                    
                    uint8View[bufferIndex++] = c1;
                    uint8View[bufferIndex++] = c2;
                    uint8View[bufferIndex++] = c3;
                }
            }
        }

        fileItem.status = 'success';
        updateFileList();
        
        return {
            success: true,
            data: buffer,
            fileName: `gif${index + 1}.bin`,
            originalName: fileItem.file.name,
            size: buffer.byteLength,
            properties: props,
            actualDelay: actualDelay
        };

    } catch (error) {
        console.error('Conversion error:', error);
        fileItem.status = 'error';
        updateFileList();
        
        return {
            success: false,
            error: error.message,
            fileName: `gif${index + 1}.bin`,
            originalName: fileItem.file.name
        };
    }
}

async function convertAllFiles() {
    if (selectedFiles.length === 0) return;

    progressContainer.style.display = 'block';
    convertBtn.disabled = true;
    
    convertedFiles = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < selectedFiles.length; i++) {
        progressText.textContent = `CONVERTING ${i + 1} OF ${selectedFiles.length}: ${selectedFiles[i].file.name.toUpperCase()}`;
        progressFill.style.width = `${((i) / selectedFiles.length) * 100}%`;

        const result = await convertGifToBinary(selectedFiles[i], i);
        convertedFiles.push(result);

        if (result.success) {
            successCount++;
        } else {
            failCount++;
        }

        await new Promise(resolve => setTimeout(resolve, 100));
    }

    progressFill.style.width = '100%';
    progressText.textContent = `CONVERSION COMPLETE! SUCCESS: ${successCount}, FAILED: ${failCount}`;

    displayResults();
    
    if (successCount > 0) {
        downloadAllBtn.style.display = 'inline-block';
    }

    convertBtn.disabled = false;
}

function displayResults() {
    results.style.display = 'block';
    downloadList.innerHTML = '';

    convertedFiles.forEach((result, index) => {
        const div = document.createElement('div');
        div.className = 'download-item';
        
        const info = document.createElement('div');
        
        if (result.success) {
            const delayInfo = result.actualDelay ? ` | ${result.actualDelay}MS DELAY` : '';
            const frameInfo = result.properties ? ` | ${result.properties.frameCount} FRAMES` : '';
            
            const fileName = document.createElement('strong');
            fileName.textContent = result.fileName.toUpperCase();
            
            const details = document.createElement('small');
            details.innerHTML = `<br>FROM: ${result.originalName.toUpperCase()} (${result.size} BYTES${delayInfo}${frameInfo})`;
            
            info.appendChild(fileName);
            info.appendChild(details);
            
            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'btn';
            downloadBtn.style.padding = '8px 16px';
            downloadBtn.style.fontSize = '0.9em';
            downloadBtn.textContent = 'DOWNLOAD';
            downloadBtn.addEventListener('click', () => downloadFile(index));
            
            div.appendChild(info);
            div.appendChild(downloadBtn);
        } else {
            const fileName = document.createElement('strong');
            fileName.style.color = '#ff6666';
            fileName.textContent = result.fileName.toUpperCase();
            
            const details = document.createElement('small');
            details.innerHTML = `<br>ERROR: ${result.error.toUpperCase()}`;
            
            info.appendChild(fileName);
            info.appendChild(details);
            
            const failedSpan = document.createElement('span');
            failedSpan.style.color = '#ff6666';
            failedSpan.textContent = 'FAILED';
            
            div.appendChild(info);
            div.appendChild(failedSpan);
        }
        
        downloadList.appendChild(div);
    });
}

function downloadFile(index) {
    const result = convertedFiles[index];
    if (!result || !result.success) return;

    const blob = new Blob([result.data], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = result.fileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
}

function downloadAllFiles() {
    const successfulFiles = convertedFiles.filter(result => result.success);
    
    if (successfulFiles.length === 0) return;

    successfulFiles.forEach((result, index) => {
        setTimeout(() => {
            const originalIndex = convertedFiles.findIndex(item => item === result);
            if (originalIndex !== -1) {
                downloadFile(originalIndex);
            }
        }, index * 500);
    });
}