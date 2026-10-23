(() => {
    'use strict';

    const state = {
        samples: [],
        activeImage: null,
        resultUrl: null,
        requestSequence: 0,
        debounceTimer: null,
        toastTimer: null,
        processing: false,
    };

    const $ = (id) => document.getElementById(id);
    const ui = {
        sampleList: $('sampleList'), sampleCount: $('sampleCount'), sampleSearch: $('sampleSearch'),
        fileInput: $('fileInput'), uploadDropZone: $('uploadDropZone'),
        systemStatus: $('systemStatus'), systemStatusText: $('systemStatusText'),
        originalImage: $('originalImage'), resultImage: $('resultImage'),
        originalStage: $('originalStage'), resultStage: $('resultStage'),
        originalImageName: $('originalImageName'), originalDimensions: $('originalDimensions'), resultDimensions: $('resultDimensions'),
        blockSizeSlider: $('blockSizeSlider'), blockSizeValue: $('blockSizeValue'),
        cValueSlider: $('cValueSlider'), cValue: $('cValue'), denoiseToggle: $('denoiseToggle'),
        processButton: $('processButton'), downloadButton: $('downloadButton'), resetViewButton: $('resetViewButton'),
        parameterSummary: $('parameterSummary'), histogramCanvas: $('histogramCanvas'),
        metricResolution: $('metricResolution'), metricBlockSize: $('metricBlockSize'), metricTime: $('metricTime'),
        metricStatus: $('metricStatus'), metricStatusCaption: $('metricStatusCaption'),
        pixelCountLabel: $('pixelCountLabel'), whitePercent: $('whitePercent'), blackPercent: $('blackPercent'),
        whiteBar: $('whiteBar'), blackBar: $('blackBar'), toast: $('toast'), toastText: $('toastText'),
    };

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        bindEvents();
        resizeHistogramCanvas();
        await loadSamples();
    }

    function bindEvents() {
        ui.sampleSearch.addEventListener('input', () => renderSamples(ui.sampleSearch.value));
        ui.fileInput.addEventListener('change', (event) => {
            const file = event.target.files && event.target.files[0];
            if (file) uploadImage(file);
            event.target.value = '';
        });

        ['dragenter', 'dragover'].forEach((name) => ui.uploadDropZone.addEventListener(name, (event) => {
            event.preventDefault();
            ui.uploadDropZone.classList.add('is-dragging');
        }));
        ['dragleave', 'drop'].forEach((name) => ui.uploadDropZone.addEventListener(name, (event) => {
            event.preventDefault();
            ui.uploadDropZone.classList.remove('is-dragging');
        }));
        ui.uploadDropZone.addEventListener('drop', (event) => {
            const file = event.dataTransfer && event.dataTransfer.files[0];
            if (file) uploadImage(file);
        });

        ui.blockSizeSlider.addEventListener('input', () => {
            ui.blockSizeValue.textContent = `${ui.blockSizeSlider.value} px`;
            updateParameterSummary();
            scheduleProcessing();
        });
        ui.cValueSlider.addEventListener('input', () => {
            ui.cValue.textContent = ui.cValueSlider.value;
            updateParameterSummary();
            scheduleProcessing();
        });
        ui.denoiseToggle.addEventListener('change', scheduleProcessing);
        ui.processButton.addEventListener('click', runThresholding);
        ui.downloadButton.addEventListener('click', downloadResult);
        ui.resetViewButton.addEventListener('click', () => {
            ui.originalStage.scrollTop = 0;
            ui.resultStage.scrollTop = 0;
            showToast('Tampilan preview direset.');
        });
        window.addEventListener('resize', resizeHistogramCanvas);
    }

    async function loadSamples() {
        try {
            const response = await fetch('/api/samples');
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Gagal memuat sample image.');
            state.samples = Array.isArray(data.samples) ? data.samples : [];
            ui.sampleCount.textContent = `${String(state.samples.length).padStart(2, '0')} FILES`;
            renderSamples();
            setSystemStatus('online', 'SYSTEM READY');

            const preferred = state.samples.find((sample) => sample.id === 'peach.jpg') || state.samples[0];
            if (preferred) selectImage(preferred);
            else {
                ui.sampleList.innerHTML = '<div class="empty-library">Belum ada sample image di folder <code>sample_images/</code>.</div>';
                setSystemStatus('error', 'NO SAMPLES');
            }
        } catch (error) {
            console.error(error);
            ui.sampleList.innerHTML = '<div class="empty-library">Sample tidak dapat dimuat. Pastikan server Flask berjalan.</div>';
            setSystemStatus('error', 'CONNECTION ERROR');
            showToast(error.message || 'Tidak dapat terhubung ke server.', true);
        }
    }

    function renderSamples(query = '') {
        const normalizedQuery = query.trim().toLowerCase();
        const samples = state.samples.filter((sample) => `${sample.name} ${sample.filename || sample.id}`.toLowerCase().includes(normalizedQuery));
        ui.sampleList.replaceChildren();

        if (!samples.length) {
            const empty = document.createElement('div');
            empty.className = 'empty-library';
            empty.textContent = 'Tidak ada citra yang cocok dengan pencarian.';
            ui.sampleList.appendChild(empty);
            return;
        }

        samples.forEach((sample, index) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = `sample-item${state.activeImage && state.activeImage.id === sample.id ? ' is-active' : ''}`;
            item.setAttribute('aria-pressed', state.activeImage && state.activeImage.id === sample.id ? 'true' : 'false');
            item.style.setProperty('--item-delay', `${Math.min(index * 35, 210)}ms`);

            const image = document.createElement('img');
            image.className = 'sample-thumb';
            image.src = sample.thumb;
            image.alt = '';
            image.loading = 'lazy';

            const copy = document.createElement('span');
            copy.className = 'sample-copy';
            const title = document.createElement('strong');
            title.textContent = sample.name;
            const sub = document.createElement('small');
            sub.textContent = `${sample.width} × ${sample.height} px`;
            copy.append(title, sub);

            const check = document.createElement('span');
            check.className = 'sample-check';
            check.innerHTML = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3.2 8.2 3 3 6.6-6.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            item.append(image, copy, check);
            item.addEventListener('click', () => selectImage(sample));
            ui.sampleList.appendChild(item);
        });
    }

    function selectImage(sample) {
        state.activeImage = sample;
        state.resultUrl = null;
        ui.downloadButton.disabled = true;
        ui.originalImage.hidden = true;
        ui.resultImage.hidden = true;
        ui.originalStage.querySelector('.image-empty').hidden = false;
        ui.resultStage.querySelector('.image-empty').hidden = false;
        ui.whitePercent.textContent = '—';
        ui.blackPercent.textContent = '—';
        ui.whiteBar.style.width = '0%';
        ui.blackBar.style.width = '0%';
        ui.originalImageName.textContent = sample.name;
        ui.originalDimensions.textContent = `${sample.width} × ${sample.height} px`;
        ui.resultDimensions.textContent = 'PROCESSING';
        ui.metricResolution.textContent = `${sample.width} × ${sample.height}`;
        ui.metricTime.textContent = '—';
        ui.metricStatus.textContent = 'PROCESSING';
        ui.metricStatusCaption.textContent = 'Menghitung threshold lokal';
        ui.downloadButton.disabled = true;
        renderSamples(ui.sampleSearch.value);
        runThresholding();
    }

    async function uploadImage(file) {
        if (!file.type.startsWith('image/')) {
            showToast('File yang dipilih bukan gambar.', true);
            return;
        }
        if (file.size > 12 * 1024 * 1024) {
            showToast('Ukuran file maksimal 12 MB.', true);
            return;
        }

        const label = ui.uploadDropZone.querySelector('.upload-content strong');
        const previousLabel = label.textContent;
        label.textContent = 'Uploading image...';
        ui.uploadDropZone.classList.add('is-uploading');
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.error || 'Gagal mengunggah gambar.');
            const sample = {
                id: data.id,
                name: data.display_name || data.name,
                filename: data.name,
                thumb: data.thumb,
                width: data.width,
                height: data.height,
            };
            state.samples = [sample, ...state.samples.filter((item) => item.id !== sample.id)];
            ui.sampleCount.textContent = `${String(state.samples.length).padStart(2, '0')} FILES`;
            ui.sampleSearch.value = '';
            renderSamples();
            selectImage(sample);
            showToast('Gambar berhasil ditambahkan ke workspace.');
        } catch (error) {
            showToast(error.message || 'Upload gagal.', true);
        } finally {
            label.textContent = previousLabel;
            ui.uploadDropZone.classList.remove('is-uploading');
        }
    }

    function updateParameterSummary() {
        ui.parameterSummary.textContent = `Block size ${ui.blockSizeSlider.value} · C = ${ui.cValueSlider.value}`;
    }

    function scheduleProcessing() {
        window.clearTimeout(state.debounceTimer);
        state.debounceTimer = window.setTimeout(runThresholding, 260);
    }

    async function runThresholding() {
        if (!state.activeImage) return;
        const currentSequence = ++state.requestSequence;
        const payload = {
            image_id: state.activeImage.id,
            block_size: Number(ui.blockSizeSlider.value),
            c: Number(ui.cValueSlider.value),
            apply_blur: ui.denoiseToggle.checked,
        };

        setProcessing(true);
        setSystemStatus('working', 'PROCESSING');
        ui.metricStatus.textContent = 'PROCESSING';
        ui.metricStatusCaption.textContent = 'Adaptive threshold sedang dihitung';

        try {
            const response = await fetch('/api/threshold', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Pemrosesan gambar gagal.');
            if (currentSequence !== state.requestSequence) return;

            ui.originalImage.src = data.original;
            ui.originalImage.hidden = false;
            ui.originalStage.querySelector('.image-empty').hidden = true;
            ui.resultImage.src = data.result;
            ui.resultImage.hidden = false;
            ui.resultStage.querySelector('.image-empty').hidden = true;
            state.resultUrl = data.result;

            ui.originalImageName.textContent = state.activeImage.name;
            ui.originalDimensions.textContent = `${data.width} × ${data.height} px`;
            ui.resultDimensions.textContent = `${data.width} × ${data.height} px`;
            ui.metricResolution.textContent = `${data.width} × ${data.height}`;
            ui.metricBlockSize.innerHTML = `${data.block_size} <em>px</em>`;
            ui.metricTime.textContent = `${formatTime(data.processing_ms)}`;
            ui.metricStatus.textContent = 'COMPLETE';
            ui.metricStatusCaption.textContent = data.apply_blur ? 'Denoise + local threshold' : 'Local threshold applied';
            ui.pixelCountLabel.textContent = `${Number(data.pixels).toLocaleString('id-ID')} pixels`;
            ui.whitePercent.textContent = `${data.white_percent}%`;
            ui.blackPercent.textContent = `${data.black_percent}%`;
            ui.whiteBar.style.width = `${data.white_percent}%`;
            ui.blackBar.style.width = `${data.black_percent}%`;
            ui.downloadButton.disabled = false;
            renderHistogram(data.histogram);
            setSystemStatus('online', 'SYSTEM READY');
        } catch (error) {
            if (currentSequence !== state.requestSequence) return;
            console.error(error);
            ui.metricStatus.textContent = 'ERROR';
            ui.metricStatusCaption.textContent = 'Pemrosesan gagal';
            ui.resultDimensions.textContent = 'ERROR';
            setSystemStatus('error', 'PROCESS ERROR');
            showToast(error.message || 'Terjadi kesalahan saat memproses citra.', true);
        } finally {
            if (currentSequence === state.requestSequence) setProcessing(false);
        }
    }

    function setProcessing(isProcessing) {
        state.processing = isProcessing;
        ui.processButton.disabled = isProcessing;
        ui.processButton.classList.toggle('is-loading', isProcessing);
        const label = ui.processButton.querySelector('span');
        label.textContent = isProcessing ? 'Processing...' : 'Process image';
    }

    function renderHistogram(histogram) {
        if (!Array.isArray(histogram) || histogram.length !== 256) return;
        const canvas = ui.histogramCanvas;
        const context = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        context.clearRect(0, 0, width, height);

        const peak = Math.max(1, ...histogram);
        const gap = 1;
        const barWidth = width / 256;
        context.fillStyle = 'rgba(0, 240, 255, 0.72)';
        for (let index = 0; index < histogram.length; index += 1) {
            const barHeight = (histogram[index] / peak) * (height - 8);
            const x = index * barWidth;
            context.fillRect(x, height - barHeight, Math.max(1, barWidth - gap), barHeight);
        }
    }

    function resizeHistogramCanvas() {
        const canvas = ui.histogramCanvas;
        const rect = canvas.getBoundingClientRect();
        if (!rect.width) return;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.floor(rect.width * ratio));
        const height = Math.max(1, Math.floor(150 * ratio));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
            if (state.activeImage) scheduleProcessing();
        }
    }

    function downloadResult() {
        if (!state.resultUrl) return;
        const link = document.createElement('a');
        const baseName = (state.activeImage?.name || 'image').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'image';
        link.href = state.resultUrl;
        link.download = `${baseName}-adaptive-gaussian.png`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        showToast('Hasil binarisasi siap disimpan.');
    }

    function formatTime(milliseconds) {
        if (milliseconds < 1) return `${milliseconds.toFixed(2)} ms`;
        if (milliseconds < 100) return `${milliseconds.toFixed(1)} ms`;
        return `${Math.round(milliseconds)} ms`;
    }

    function setSystemStatus(kind, message) {
        ui.systemStatus.classList.remove('is-online', 'is-working', 'is-error');
        ui.systemStatus.classList.add(kind === 'online' ? 'is-online' : kind === 'working' ? 'is-working' : 'is-error');
        ui.systemStatusText.textContent = message;
    }

    function showToast(message, isError = false) {
        window.clearTimeout(state.toastTimer);
        ui.toastText.textContent = message;
        ui.toast.classList.toggle('is-error', isError);
        ui.toast.classList.add('is-visible');
        state.toastTimer = window.setTimeout(() => ui.toast.classList.remove('is-visible'), 3200);
    }
})();
