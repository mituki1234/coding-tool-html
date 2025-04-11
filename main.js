/**
 * Main Code Editor Application
 */
(function() {
    let fileSystem = {};
    let openFiles = [];
    let activeFile = null;
    let fileBlobs = {};
    let lastSavedState = {};
    let tabSize = 4;
    let extensions = {};
    
    window.addEventListener('load', init);
    
    function init() {
        setupDropdownMenus();
        setupDirectoryInput();
        setupSaveButton();
        setupExportButton();
        setupEventListeners();
        updateEditor();
        document.getElementById('date-display').textContent = "2025-04-11 01:39:36";
        document.getElementById('username-display').textContent = "mituki1234";
        window.CodeEditor = {
            registerExtension: function(name, extension) {
                extensions[name] = extension;
                console.log(`Extension registered: ${name}`);
            },
            getExtension: function(name) {
                return extensions[name];
            }
        };
        window.dispatchEvent(new CustomEvent('CodeEditorReady'));
    }
    
    function setupDropdownMenus() {
        const fileMenu = document.getElementById('file-menu');
        const fileDropdown = document.getElementById('file-dropdown');
        fileMenu.addEventListener('click', (e) => {
            fileDropdown.style.display = fileDropdown.style.display === 'block' ? 'none' : 'block';
            fileDropdown.style.top = (e.target.offsetTop + e.target.offsetHeight) + 'px';
            fileDropdown.style.left = e.target.offsetLeft + 'px';
            e.stopPropagation();
        });
        document.addEventListener('click', () => {
            fileDropdown.style.display = 'none';
        });
        document.getElementById('menu-open-folder').addEventListener('click', () => {
            document.getElementById('directory-input').click();
        });
        document.getElementById('menu-save').addEventListener('click', () => {
            saveFile();
        });
        document.getElementById('menu-export').addEventListener('click', () => {
            showExportModal();
        });
    }
    
    function setupDirectoryInput() {
        const directoryInput = document.getElementById('directory-input');
        directoryInput.addEventListener('change', handleDirectorySelect);
    }
    
    function setupSaveButton() {
        const saveBtn = document.getElementById('save-btn');
        saveBtn.addEventListener('click', saveFile);
        setupTooltips();
    }
    
    function setupTooltips() {
        const tooltip = document.getElementById('tooltip');
        const elements = document.querySelectorAll('[data-tooltip]');
        elements.forEach(element => {
            element.addEventListener('mouseenter', (e) => {
                const text = e.target.getAttribute('data-tooltip');
                tooltip.textContent = text;
                tooltip.style.display = 'block';
                const rect = e.target.getBoundingClientRect();
                tooltip.style.left = (rect.left + rect.width / 2 - tooltip.offsetWidth / 2) + 'px';
                tooltip.style.top = (rect.bottom + 5) + 'px';
            });
            element.addEventListener('mouseleave', () => {
                tooltip.style.display = 'none';
            });
        });
    }
    
    function setupExportButton() {
        const exportBtn = document.getElementById('export-btn');
        exportBtn.addEventListener('click', showExportModal);
        const closeModal = document.getElementById('close-modal');
        closeModal.addEventListener('click', () => {
            document.getElementById('export-modal').style.display = 'none';
        });
        const confirmExport = document.getElementById('confirm-export');
        confirmExport.addEventListener('click', handleExport);
        window.addEventListener('click', (e) => {
            const modal = document.getElementById('export-modal');
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }
    
    function showExportModal() {
        document.getElementById('export-modal').style.display = 'block';
    }
    
    function saveFile() {
        if (!activeFile) {
            showNotification('保存するファイルがありません');
            return;
        }
        saveCurrentFileChanges();
        const activeFileObj = openFiles.find(file => file.path === activeFile);
        if (!activeFileObj || activeFileObj.isBinary) {
            showNotification('このファイルは保存できません');
            return;
        }
        const blob = new Blob([activeFileObj.content], {type: 'text/plain'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = activeFileObj.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        activeFileObj.originalContent = activeFileObj.content;
        lastSavedState[activeFile] = activeFileObj.content;
        updateFileStatus('保存しました', 'saved');
        updateTabs();
    }
    
    function showNotification(message, type = '') {
        updateFileStatus(message, type);
        setTimeout(() => {
            updateFileStatus();
        }, 3000);
    }
    
    function updateFileStatus(message = '', type = '') {
        const fileStatus = document.getElementById('file-status');
        fileStatus.textContent = message;
        fileStatus.className = 'status-indicator';
        if (type) {
            fileStatus.classList.add(type);
        }
    }
    
    async function handleExport() {
        const exportType = document.querySelector('input[name="export-type"]:checked').value;
        saveCurrentFileChanges();
        if (exportType === 'zip') {
            await exportAsZip();
        } else if (exportType === 'current') {
            exportCurrentFile();
        }
        document.getElementById('export-modal').style.display = 'none';
    }
    
    async function exportAsZip() {
        try {
            if (typeof JSZip === 'undefined') {
                await loadJSZip();
            }
            const zip = new JSZip();
            openFiles.forEach(file => {
                zip.file(file.path, file.content);
            });
            for (const [path, blob] of Object.entries(fileBlobs)) {
                if (!openFiles.some(file => file.path === path)) {
                    zip.file(path, blob);
                }
            }
            const content = await zip.generateAsync({type: 'blob'});
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const a = document.createElement('a');
            a.href = URL.createObjectURL(content);
            a.download = `code-export-${timestamp}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            showNotification('ZIPファイルをエキスポートしました', 'saved');
        } catch (error) {
            console.error('Error exporting as ZIP:', error);
            showNotification('エキスポート中にエラーが発生しました: ' + error.message);
        }
    }
    
    function loadJSZip() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
            script.onload = resolve;
            script.onerror = () => reject(new Error('JSZip ライブラリの読み込みに失敗しました'));
            document.head.appendChild(script);
        });
    }
    
    function exportCurrentFile() {
        if (!activeFile) {
            showNotification('エキスポートするファイルがありません');
            return;
        }
        const activeFileObj = openFiles.find(file => file.path === activeFile);
        if (!activeFileObj) return;
        const blob = new Blob([activeFileObj.content], {type: 'text/plain'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = activeFileObj.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showNotification('ファイルをエキスポートしました', 'saved');
    }
    
    function handleDirectorySelect(event) {
        const files = event.target.files;
        if (files.length === 0) return;
        fileSystem = {};
        openFiles = [];
        activeFile = null;
        fileBlobs = {};
        lastSavedState = {};
        let fileCount = 0;
        let folderCount = 0;
        const paths = new Set();
        Array.from(files).forEach(file => {
            const path = file.webkitRelativePath;
            paths.add(path.split('/')[0]);
            addFileToSystem(path, file);
            fileBlobs[path] = file;
            fileCount++;
        });
        folderCount = countFolders(fileSystem);
        document.getElementById('export-btn').disabled = false;
        document.getElementById('save-btn').disabled = false;
        document.getElementById('file-import-info').textContent =
          `インポート完了: ${fileCount} ファイル, ${folderCount} フォルダ (${Array.from(paths).join(', ')})`;
        renderFileSystem();
        updateTabs();
        updateEditor();
    }
    
    function countFolders(structure) {
        let count = 0;
        Object.entries(structure).forEach(([name, item]) => {
            if (item.type === 'folder') {
                count++;
                count += countFolders(item.children);
            }
        });
        return count;
    }
    
    function addFileToSystem(path, fileObj) {
        const parts = path.split('/');
        let current = fileSystem;
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (!current[part]) {
                current[part] = { type: 'folder', children: {} };
            }
            current = current[part].children;
        }
        const fileName = parts[parts.length - 1];
        current[fileName] = { type: 'file', fileObj: fileObj };
    }
    
    function renderFileSystem(structure = fileSystem, parentPath = '', parentElement = null) {
        const sidebar = parentElement || document.getElementById('file-sidebar');
        if (parentPath === '' && !parentElement) {
            sidebar.innerHTML = '';
        }
        const entries = Object.entries(structure).sort((a, b) => {
            if (a[1].type === 'folder' && b[1].type !== 'folder') return -1;
            if (a[1].type !== 'folder' && b[1].type === 'folder') return 1;
            return a[0].localeCompare(b[0]);
        });
        entries.forEach(([name, item]) => {
            const currentPath = parentPath ? `${parentPath}/${name}` : name;
            if (item.type === 'file') {
                const fileElement = createFileElement(name, currentPath);
                sidebar.appendChild(fileElement);
            } else if (item.type === 'folder') {
                const folderElement = createFolderElement(name, currentPath);
                sidebar.appendChild(folderElement);
                const childrenContainer = document.createElement('div');
                childrenContainer.className = 'file-content';
                childrenContainer.id = `folder-content-${currentPath.replace(/\//g, '-')}`;
                childrenContainer.style.display = parentPath === '' ? 'block' : 'none';
                sidebar.appendChild(childrenContainer);
                renderFileSystem(item.children, currentPath, childrenContainer);
            }
        });
    }
    
    function createFileElement(name, path) {
        const fileExt = name.split('.').pop().toLowerCase();
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.dataset.path = path;
        let iconClass = '';
        switch (fileExt) {
            case 'html': iconClass = 'html-icon'; break;
            case 'css': iconClass = 'css-icon'; break;
            case 'js': iconClass = 'js-icon'; break;
            case 'jpg': case 'jpeg': case 'png': case 'gif': case 'svg': 
                iconClass = 'image-icon'; break;
            default: iconClass = 'text-icon'; break;
        }
        fileItem.innerHTML = `<span class="file-type-icon ${iconClass}"></span>${name}`;
        fileItem.addEventListener('click', () => {
            openFile(path);
        });
        return fileItem;
    }
    
    function createFolderElement(name, path) {
        const folderItem = document.createElement('div');
        folderItem.className = 'file-item folder';
        folderItem.dataset.path = path;
        folderItem.innerHTML = `<span class="file-type-icon folder-icon"></span>${name}`;
        folderItem.addEventListener('click', () => {
            const contentId = `folder-content-${path.replace(/\//g, '-')}`;
            const content = document.getElementById(contentId);
            content.style.display = content.style.display === 'none' ? 'block' : 'none';
        });
        return folderItem;
    }
    
    function getFile(path) {
        const parts = path.split('/');
        let current = fileSystem;
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (!current[part] || current[part].type !== 'folder') {
                return null;
            }
            current = current[part].children;
        }
        const fileName = parts[parts.length - 1];
        return current[fileName];
    }
    
    function isTextFile(file) {
        const textTypes = [
            'text/', 'application/json', 'application/javascript', 'application/xml',
            'application/xhtml+xml', 'application/x-httpd-php'
        ];
        const type = file.type;
        if (type && textTypes.some(textType => type.startsWith(textType))) {
            return true;
        }
        const ext = file.name.split('.').pop().toLowerCase();
        const textExtensions = [
            'txt', 'html', 'htm', 'css', 'js', 'json', 'xml', 'md', 'markdown',
            'php', 'py', 'rb', 'c', 'cpp', 'h', 'java', 'go', 'ts', 'tsx', 'jsx',
            'yaml', 'yml', 'conf', 'ini', 'cfg', 'sh', 'bat', 'csv'
        ];
        return textExtensions.includes(ext);
    }
    
    async function readFileContent(file) {
        return new Promise((resolve, reject) => {
            if (isTextFile(file)) {
                const reader = new FileReader();
                reader.onload = event => resolve(event.target.result);
                reader.onerror = error => reject(error);
                reader.readAsText(file);
            } else {
                resolve(`[バイナリファイルは編集できません: ${file.name} (${file.type || 'unknown type'})]`);
            }
        });
    }
    
    async function openFile(path) {
        const file = getFile(path);
        if (!file) return;
        saveCurrentFileChanges();
        const fileIndex = openFiles.findIndex(f => f.path === path);
        if (fileIndex === -1) {
            const fileName = path.split('/').pop();
            try {
                const content = await readFileContent(file.fileObj);
                const isBinary = !isTextFile(file.fileObj);
                openFiles.push({ path, fileName, content, originalContent: content, isBinary });
                lastSavedState[path] = content;
            } catch (error) {
                console.error('Error reading file:', error);
                return;
            }
        }
        activeFile = path;
        updateTabs();
        updateEditor();
        updateFileStatus();
    }
    
    function checkFileModified() {
        if (!activeFile) return;
        const activeFileObj = openFiles.find(file => file.path === activeFile);
        if (!activeFileObj) return;
        if (activeFileObj.content !== activeFileObj.originalContent) {
            updateFileStatus('変更あり', 'modified');
        } else {
            updateFileStatus();
        }
    }
    
    function updateTabs() {
        const tabsContainer = document.getElementById('tabs');
        tabsContainer.innerHTML = '';
        openFiles.forEach(file => {
            const tab = document.createElement('div');
            tab.className = 'filename-card';
            if (file.path === activeFile) {
                tab.className += ' active';
            }
            let fileName = file.fileName;
            if (file.content !== file.originalContent) {
                fileName += ' *';
            }
            tab.textContent = fileName;
            tab.dataset.path = file.path;
            tab.addEventListener('click', () => {
                saveCurrentFileChanges();
                activeFile = file.path;
                updateTabs();
                updateEditor();
                checkFileModified();
            });
            tabsContainer.appendChild(tab);
        });
    }
    
    function saveCurrentFileChanges() {
        if (!activeFile) return;
        const codeEditor = document.getElementById('code-editor');
        const currentContent = codeEditor.value;
        const activeFileObj = openFiles.find(file => file.path === activeFile);
        if (activeFileObj && !activeFileObj.isBinary) {
            activeFileObj.content = currentContent;
            updateTabs();
        }
    }
    
    function updateEditor() {
        const codeEditor = document.getElementById('code-editor');
        const lineNumbers = document.getElementById('line-numbers');
        const highlighter = document.getElementById('syntax-highlighter');
        if (!activeFile) {
            codeEditor.value = '';
            lineNumbers.innerHTML = '';
            codeEditor.disabled = true;
            highlighter.innerHTML = '';
            return;
        }
        const activeFileObj = openFiles.find(file => file.path === activeFile);
        if (!activeFileObj) {
            codeEditor.value = '';
            lineNumbers.innerHTML = '';
            codeEditor.disabled = true;
            highlighter.innerHTML = '';
            return;
        }
        if (activeFileObj.isBinary) {
            codeEditor.value = activeFileObj.content;
            codeEditor.disabled = true;
            highlighter.innerHTML = '';
        } else {
            codeEditor.disabled = false;
            codeEditor.value = activeFileObj.content;
            // Determine language by file extension and use appropriate extension if available
            const fileExt = activeFileObj.fileName.split('.').pop().toLowerCase();
            let highlighted = '';
            if (fileExt === 'js' && window.JSHighlighter) {
                highlighted = window.JSHighlighter.highlight(activeFileObj.content);
            } else if ((fileExt === 'html' || fileExt === 'htm') && window.HTMLHighlighter) {
                highlighted = window.HTMLHighlighter.highlight(activeFileObj.content);
            } else if (fileExt === 'css' && window.CSSHighlighter) {
                highlighted = window.CSSHighlighter.highlight(activeFileObj.content);
            } else {
                highlighted = activeFileObj.content;
            }
            highlighter.innerHTML = highlighted;
        }
        updateLineNumbers();
        if (!codeEditor.disabled) {
            codeEditor.focus();
        }
    }
    
    function updateLineNumbers() {
        const codeEditor = document.getElementById('code-editor');
        const lineNumbers = document.getElementById('line-numbers');
        const lines = codeEditor.value.split('\n');
        lineNumbers.innerHTML = lines.map((_, i) => `<div>${i + 1}</div>`).join('');
    }
    
    function updateCursorPosition() {
        const codeEditor = document.getElementById('code-editor');
        const cursorPosition = document.getElementById('cursor-position');
        const text = codeEditor.value;
        const cursorPos = codeEditor.selectionStart;
        const textBeforeCursor = text.substring(0, cursorPos);
        const line = (textBeforeCursor.match(/\n/g) || []).length + 1;
        const lastNewLine = textBeforeCursor.lastIndexOf('\n');
        const column = (lastNewLine === -1) ? cursorPos + 1 : cursorPos - lastNewLine;
        cursorPosition.textContent = `行: ${line}, 列: ${column}`;
    }
    
    function getLineIndentation(text, position) {
        const startOfLine = text.lastIndexOf('\n', position - 1) + 1;
        let indentation = '';
        for (let i = startOfLine; i < text.length && (text[i] === ' ' || text[i] === '\t'); i++) {
            indentation += text[i];
        }
        return indentation;
    }
    
    function setupEventListeners() {
        const codeEditor = document.getElementById('code-editor');
        codeEditor.addEventListener('input', () => {
            updateLineNumbers();
            if (activeFile) {
                const activeFileObj = openFiles.find(file => file.path === activeFile);
                if (activeFileObj && !activeFileObj.isBinary && codeEditor.value !== activeFileObj.content) {
                    saveCurrentFileChanges();
                    checkFileModified();
                    const fileExt = activeFileObj.fileName.split('.').pop().toLowerCase();
                    if (fileExt === 'js' && window.JSHighlighter) {
                        document.getElementById('syntax-highlighter').innerHTML = window.JSHighlighter.highlight(codeEditor.value);
                    } else if ((fileExt === 'html' || fileExt === 'htm') && window.HTMLHighlighter) {
                        document.getElementById('syntax-highlighter').innerHTML = window.HTMLHighlighter.highlight(codeEditor.value);
                    } else if (fileExt === 'css' && window.CSSHighlighter) {
                        document.getElementById('syntax-highlighter').innerHTML = window.CSSHighlighter.highlight(codeEditor.value);
                    }
                }
            }
        });
        codeEditor.addEventListener('click', updateCursorPosition);
        codeEditor.addEventListener('keyup', (e) => {
            if (!['Tab', 'Enter'].includes(e.key)) {
                updateCursorPosition();
            }
        });
        codeEditor.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = codeEditor.selectionStart;
                const end = codeEditor.selectionEnd;
                const spaces = ' '.repeat(tabSize);
                codeEditor.value = codeEditor.value.substring(0, start) + spaces + codeEditor.value.substring(end);
                codeEditor.selectionStart = codeEditor.selectionEnd = start + tabSize;
                codeEditor.dispatchEvent(new Event('input'));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const start = codeEditor.selectionStart;
                const text = codeEditor.value;
                const indentation = getLineIndentation(text, start);
                let extraIndent = '';
                const prevChar = start > 0 ? text[start - 1] : '';
                if (prevChar === '{' || prevChar === '(' || prevChar === '[') {
                    extraIndent = ' '.repeat(tabSize);
                }
                codeEditor.value = text.substring(0, start) + '\n' + indentation + extraIndent + text.substring(start);
                const newPosition = start + 1 + indentation.length + extraIndent.length;
                codeEditor.selectionStart = codeEditor.selectionEnd = newPosition;
                codeEditor.dispatchEvent(new Event('input'));
                updateCursorPosition();
            }
        });
        codeEditor.addEventListener('scroll', () => {
            document.getElementById('line-numbers').scrollTop = codeEditor.scrollTop;
            document.getElementById('syntax-highlighter').scrollTop = codeEditor.scrollTop;
        });
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                saveFile();
            }
        });
    }
    
    window.addEventListener('load', init);
})();
