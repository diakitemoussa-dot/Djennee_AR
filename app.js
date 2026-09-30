const canvas = document.getElementById('canvas');
const timeInfo = document.getElementById('time-info');
const progressFill = document.getElementById('progress-fill');
const loadingEl = document.getElementById('loading');
const loadText = document.getElementById('load-text');
const loadProgress = document.getElementById('load-progress');
const errorMsg = document.getElementById('error-msg');
const arButton = document.getElementById('ar-button');
const hint = document.getElementById('hint');

const VIDEO_SRC = 'French.mp4';
const VIDEO_DURATION = 210;

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

let renderer = null;
let scene = null;
let camera = null;
let sphere = null;
let video = null;
let texture = null;
let material = null;
let videoReady = false;
let isLoading = true;
let targetTime = 0;
let currentTime = 0;
let scrollAccumulator = 0;
let lastScrollTime = 0;
let rafId = null;
let contextLost = false;

function initThree() {
    try {
        renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: !isMobile,
            alpha: true,
            powerPreference: 'high-performance',
            failIfMajorPerformanceCaveat: false
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1 : 1.5));
        renderer.xr.enabled = true;

        renderer.getContext().addEventListener('webglcontextlost', onContextLost, false);
        renderer.getContext().addEventListener('webglcontextrestored', onContextRestored, false);

        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);

        const segments = isMobile ? 32 : 60;
        const geometry = new THREE.SphereGeometry(500, segments, segments / 2);
        geometry.scale(-1, 1, 1);

        video = document.createElement('video');
        video.src = VIDEO_SRC;
        video.crossOrigin = 'anonymous';
        video.playsInline = true;
        video.muted = true;
        video.loop = true;
        video.preload = 'metadata';
        video.disablePictureInPicture = true;

        texture = new THREE.VideoTexture(video);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;

        material = new THREE.MeshBasicMaterial({ map: texture });
        sphere = new THREE.Mesh(geometry, material);
        scene.add(sphere);

        video.addEventListener('loadedmetadata', onVideoProgress);
        video.addEventListener('progress', onVideoProgress);
        video.addEventListener('error', onVideoError);
        video.addEventListener('canplay', () => { videoReady = true; });

        return true;
    } catch (e) {
        console.error('Three.js init failed:', e);
        showError('Erreur initialisation 3D: ' + e.message);
        return false;
    }
}

function onContextLost(e) {
    e.preventDefault();
    contextLost = true;
    console.warn('WebGL context lost');
    showError('Contexte WebGL perdu (mémoire insuffisante). Rechargez la page.');
    cancelAnimationFrame(rafId);
}

function onContextRestored() {
    console.log('WebGL context restored');
    contextLost = false;
    if (initThree()) {
        animate();
    }
}

function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.style.display = 'block';
    loadText.textContent = 'Erreur';
    loadingEl.classList.remove('hidden');
}

function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

function updateUI() {
    timeInfo.textContent = `${formatTime(currentTime)} / ${formatTime(VIDEO_DURATION)}`;
    progressFill.style.width = `${(currentTime / VIDEO_DURATION) * 100}%`;
}

function onVideoProgress() {
    if (!videoReady && video.readyState >= 1) {
        videoReady = true;
        isLoading = false;
        loadingEl.classList.add('hidden');
        video.play().catch(() => {});
        updateUI();
        checkARSupport();
    }
    if (videoReady) {
        const buffered = video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0;
        const pct = Math.round((buffered / VIDEO_DURATION) * 100);
        loadProgress.textContent = `${pct}%`;
    }
}

function onVideoError(e) {
    const err = video.error;
    let msg = 'Erreur chargement vidéo';
    if (err) {
        switch (err.code) {
            case MediaError.MEDIA_ERR_ABORTED: msg = 'Chargement annulé'; break;
            case MediaError.MEDIA_ERR_NETWORK: msg = 'Erreur réseau'; break;
            case MediaError.MEDIA_ERR_DECODE: msg = 'Erreur décodage (format non supporté)'; break;
            case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: msg = 'Format vidéo non supporté'; break;
        }
        msg += ` (code: ${err.code})`;
    }
    console.error('Video error:', err);
    showError(msg);
}

function onWheel(e) {
    if (contextLost) return;
    e.preventDefault();
    const now = performance.now();
    if (now - lastScrollTime > 50) scrollAccumulator = 0;
    lastScrollTime = now;

    scrollAccumulator += e.deltaY > 0 ? 1 : -1;
    if (Math.abs(scrollAccumulator) >= 2) {
        targetTime = Math.max(0, Math.min(VIDEO_DURATION, currentTime + (scrollAccumulator > 0 ? 0.5 : -0.5)));
        scrollAccumulator = 0;
    }
}

let touchStartY = 0;
let touchStartTime = 0;
function onTouchStart(e) { touchStartY = e.touches[0].clientY; touchStartTime = currentTime; }
function onTouchMove(e) {
    if (touchStartY === 0 || contextLost) return;
    const deltaY = touchStartY - e.touches[0].clientY;
    const sensitivity = VIDEO_DURATION / window.innerHeight * 1.5;
    targetTime = Math.max(0, Math.min(VIDEO_DURATION, touchStartTime + deltaY * sensitivity));
}
function onTouchEnd() { touchStartY = 0; }

window.addEventListener('wheel', onWheel, { passive: false });
window.addEventListener('touchstart', onTouchStart, { passive: true });
window.addEventListener('touchmove', onTouchMove, { passive: true });
window.addEventListener('touchend', onTouchEnd);

function animate() {
    if (contextLost) return;
    rafId = requestAnimationFrame(animate);
    render();
}

function render() {
    if (!videoReady || contextLost) return;

    const diff = targetTime - currentTime;
    if (Math.abs(diff) > 0.02) {
        currentTime += diff * 0.15;
        video.currentTime = currentTime;
    } else {
        currentTime = targetTime;
        video.currentTime = currentTime;
    }
    updateUI();

    try {
        renderer.render(scene, camera);
    } catch (e) {
        console.error('Render error:', e);
    }
}

window.addEventListener('resize', () => {
    if (!renderer || !camera) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

async function checkARSupport() {
    if (isIOS) {
        arButton.textContent = 'AR: utilisez WebXR Viewer';
        arButton.style.opacity = '0.7';
        arButton.disabled = false;
        arButton.onclick = () => alert('iOS Safari ne supporte pas WebXR.\nInstallez "WebXR Viewer" (Mozilla) depuis l\'App Store.');
        return;
    }
    try {
        if (!navigator.xr) throw new Error('WebXR non supporté');
        const session = await navigator.xr.requestSession('immersive-ar', {
            requiredFeatures: ['local-floor', 'hit-test'],
            optionalFeatures: ['dom-overlay'],
            domOverlay: { root: document.body }
        });
        await session.end();
        arButton.disabled = false;
        arButton.textContent = 'Entrer en AR';
    } catch (e) {
        arButton.textContent = 'AR non supporté';
        arButton.style.opacity = '0.5';
        console.log('AR check:', e.message);
    }
}

window.enterAR = async function() {
    if (isIOS) {
        alert('iOS Safari ne supporte pas WebXR.\nInstallez "WebXR Viewer" (Mozilla) depuis l\'App Store.');
        return;
    }
    hint.style.display = 'none';
    try {
        const session = await navigator.xr.requestSession('immersive-ar', {
            requiredFeatures: ['local-floor', 'hit-test'],
            optionalFeatures: ['dom-overlay'],
            domOverlay: { root: document.body }
        });
        renderer.xr.setReferenceSpaceType('local-floor');
        await renderer.xr.setSession(session);
        arButton.textContent = 'Quitter AR';
        arButton.onclick = exitAR;
    } catch (e) {
        console.error('Erreur AR:', e);
        alert('Impossible de démarrer AR: ' + e.message);
        hint.style.display = 'block';
    }
};

function exitAR() {
    renderer.xr.setSession(null);
    arButton.textContent = 'Entrer en AR';
    arButton.onclick = enterAR;
    hint.style.display = 'block';
}

if (!initThree()) {
    console.error('Failed to initialize Three.js');
} else {
    animate();
}