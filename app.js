// SecureFileShare - File Transfer Application

// Configuration
// const API_BASE_URL = 'http://localhost:7071/api'; // ローカル開発用
const API_BASE_URL = '/api'; // 本番用（Azure Static Web Appsの統合API）
// const API_BASE_URL = 'https://your-function-app.azurewebsites.net/api'; // 独立したFunction App用

// State
const state = {
    files: [],
    maxFileSize: 5 * 1024 * 1024 * 1024, // 5GB
    maxFiles: 100
};

// DOM Elements (初期化はDOMContentLoaded後に行う)
let dropZone, fileInput, fileList, fileItems, totalFiles, totalSize;
let clearAllBtn, uploadOptions, uploadBtn, uploadCard, progressCard, resultCard;
let progressFill, progressText, shareLink, copyLinkBtn, expirationDate;
let customFilename, expirationDays, bundleFiles;

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded - Initializing...');
    
    // DOM Elements取得
    dropZone = document.getElementById('dropZone');
    fileInput = document.getElementById('fileInput');
    fileList = document.getElementById('fileList');
    fileItems = document.getElementById('fileItems');
    totalFiles = document.getElementById('totalFiles');
    totalSize = document.getElementById('totalSize');
    clearAllBtn = document.getElementById('clearAllBtn');
    uploadOptions = document.getElementById('uploadOptions');
    uploadBtn = document.getElementById('uploadBtn');
    uploadCard = document.getElementById('uploadCard');
    progressCard = document.getElementById('progressCard');
    resultCard = document.getElementById('resultCard');
    progressFill = document.getElementById('progressFill');
    progressText = document.getElementById('progressText');
    shareLink = document.getElementById('shareLink');
    copyLinkBtn = document.getElementById('copyLinkBtn');
    expirationDate = document.getElementById('expirationDate');
    customFilename = document.getElementById('customFilename');
    expirationDays = document.getElementById('expirationDays');
    bundleFiles = document.getElementById('bundleFiles');

    console.log('Elements:', { dropZone, fileInput, uploadBtn });

    // Event Listeners
    if (fileInput) fileInput.addEventListener('change', handleFileSelect);
    if (dropZone) {
        dropZone.addEventListener('dragover', handleDragOver);
        dropZone.addEventListener('dragleave', handleDragLeave);
        dropZone.addEventListener('drop', handleDrop);
    }
    if (clearAllBtn) clearAllBtn.addEventListener('click', clearAllFiles);
    if (uploadBtn) uploadBtn.addEventListener('click', handleUpload);
    if (copyLinkBtn) copyLinkBtn.addEventListener('click', copyToClipboard);

    console.log('Event listeners attached');
});

// Drag & Drop Handlers
function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('dragover');
    
    const files = Array.from(e.dataTransfer.files);
    addFiles(files);
}

// File Selection Handler
function handleFileSelect(e) {
    console.log('File select triggered', e.target.files);
    const files = Array.from(e.target.files);
    console.log('Files array:', files);
    addFiles(files);
}

// File Management
function addFiles(newFiles) {
    console.log('addFiles called with:', newFiles);
    
    if (state.files.length + newFiles.length > state.maxFiles) {
        alert(`最大${state.maxFiles}個までのファイルをアップロードできます。`);
        return;
    }

    newFiles.forEach(file => {
        console.log('Processing file:', file.name, file.size);
        
        if (file.size > state.maxFileSize) {
            alert(`${file.name} のサイズが大きすぎます (最大5GB)。`);
            return;
        }

        const fileObject = {
            id: Date.now() + Math.random(),
            file: file,
            name: file.name,
            size: file.size
        };

        state.files.push(fileObject);
        console.log('File added to state:', fileObject);
    });

    console.log('Current state.files:', state.files);
    renderFileList();
}

function removeFile(id) {
    state.files = state.files.filter(f => f.id !== id);
    renderFileList();
}

function clearAllFiles() {
    state.files = [];
    fileInput.value = '';
    renderFileList();
}

// UI Rendering
function renderFileList() {
    console.log('renderFileList called, files count:', state.files.length);
    
    if (state.files.length === 0) {
        fileList.style.display = 'none';
        uploadOptions.style.display = 'none';
        uploadBtn.disabled = true;
        console.log('No files, hiding UI');
        return;
    }

    console.log('Showing file list UI');
    fileList.style.display = 'block';
    uploadOptions.style.display = 'block';
    uploadBtn.disabled = false;

    fileItems.innerHTML = state.files.map(fileObj => `
        <div class="file-item">
            <div class="file-item-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                    <polyline points="13 2 13 9 20 9"></polyline>
                </svg>
            </div>
            <div class="file-item-info">
                <div class="file-item-name">${escapeHtml(fileObj.name)}</div>
                <div class="file-item-size">${formatFileSize(fileObj.size)}</div>
            </div>
            <button type="button" class="file-item-remove" onclick="removeFile(${fileObj.id})">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"></path>
                </svg>
            </button>
        </div>
    `).join('');

    const totalSizeBytes = state.files.reduce((sum, f) => sum + f.size, 0);
    totalFiles.textContent = state.files.length;
    totalSize.textContent = formatFileSize(totalSizeBytes);
}

// Upload Handler
async function handleUpload() {
    if (state.files.length === 0) return;

    const filename = customFilename.value.trim();
    const days = parseInt(expirationDays.value);
    const shouldBundle = bundleFiles.checked;

    if (state.files.length > 1 && !shouldBundle && !filename) {
        alert('複数のファイルをアップロードする場合は、「ファイルをまとめる」をチェックするか、カスタムファイル名を入力してください。');
        return;
    }

    uploadCard.style.display = 'none';
    progressCard.style.display = 'block';

    try {
        let finalFilename;
        let fileToUpload;

        if (shouldBundle && state.files.length > 1) {
            // ZIP化処理
            console.log('Creating ZIP file...');
            const zipBlob = await createZipFile(state.files);
            fileToUpload = zipBlob;
            finalFilename = (filename || 'files') + '.zip';
        } else if (state.files.length === 1) {
            fileToUpload = state.files[0].file;
            finalFilename = filename || state.files[0].name;
        } else {
            fileToUpload = state.files[0].file;
            finalFilename = filename || state.files[0].name;
        }

        // Step 1: Azure FunctionsからSAS URL取得
        const urlResponse = await fetch(`${API_BASE_URL}/generateUploadUrl`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filename: finalFilename,
                expirationDays: days,
                contentType: fileToUpload.type || 'application/octet-stream',
                fileSize: fileToUpload.size
            })
        });

        if (!urlResponse.ok) {
            const error = await urlResponse.json();
            
            // レート制限エラーの特別処理
            if (urlResponse.status === 429) {
                const retryAfter = error.retryAfter || 60;
                throw new Error(`リクエストが多すぎます。${retryAfter}秒後に再試行してください。`);
            }
            
            throw new Error(error.error || 'Failed to get upload URL');
        }

        const { uploadUrl, downloadUrl, expiresOn } = await urlResponse.json();

        // Step 2: Azure Blob Storageへ直接アップロード
        await uploadToBlob(uploadUrl, fileToUpload);

        // Step 3: 結果表示
        showResult(finalFilename, days, downloadUrl, expiresOn);

    } catch (error) {
        console.error('Upload error:', error);
        alert('アップロードに失敗しました: ' + error.message);
        uploadCard.style.display = 'block';
        progressCard.style.display = 'none';
    }
}

// Azure Blob Storageへのアップロード
function uploadToBlob(uploadUrl, file) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // 進捗イベント
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percentComplete = (e.loaded / e.total) * 100;
                progressFill.style.width = percentComplete + '%';
                progressText.textContent = Math.floor(percentComplete) + '%';
            }
        });

        // 完了イベント
        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
            } else {
                reject(new Error(`Upload failed with status ${xhr.status}`));
            }
        });

        // エラーイベント
        xhr.addEventListener('error', () => {
            reject(new Error('Network error during upload'));
        });

        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('x-ms-blob-type', 'BlockBlob');
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.send(file);
    });
}

// ZIP File Creation
async function createZipFile(fileObjects) {
    console.log('Starting ZIP creation with', fileObjects.length, 'files');
    
    const zip = new JSZip();
    
    // 各ファイルをZIPに追加
    for (const fileObj of fileObjects) {
        console.log('Adding to ZIP:', fileObj.name);
        zip.file(fileObj.name, fileObj.file);
    }
    
    // ZIP生成（進捗表示付き）
    const zipBlob = await zip.generateAsync(
        { 
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: {
                level: 6
            }
        },
        (metadata) => {
            // ZIP生成の進捗
            const percent = metadata.percent.toFixed(0);
            progressFill.style.width = percent + '%';
            progressText.textContent = `ZIP作成中: ${percent}%`;
        }
    );
    
    console.log('ZIP created, size:', zipBlob.size);
    return zipBlob;
}

// Result Display
function showResult(filename, days, downloadUrl, expiresOn) {
    progressCard.style.display = 'none';
    resultCard.style.display = 'block';

    // 共有リンクを設定
    shareLink.value = downloadUrl;

    // 有効期限を表示
    const expDate = new Date(expiresOn);
    expirationDate.textContent = expDate.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Copy to Clipboard
function copyToClipboard() {
    shareLink.select();
    shareLink.setSelectionRange(0, 99999);
    
    try {
        document.execCommand('copy');
        const originalHTML = copyLinkBtn.innerHTML;
        copyLinkBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>コピーしました</span>
        `;
        
        setTimeout(() => {
            copyLinkBtn.innerHTML = originalHTML;
        }, 2000);
    } catch (err) {
        alert('コピーに失敗しました');
    }
}

// Utility Functions
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}
