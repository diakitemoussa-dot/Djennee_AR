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
const VIDEO_DURATION = 210; // 3min30 en secondes

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.xr.enabled = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);

const geometry = new THREE.SphereGeometry(500, 60, 40);
geometry.scale(-1, 1, 1);

const video = document.createElement('video');
video.src = VIDEO_SRC;
video.crossOrigin = 'anonymous';
video.playsInline = true;
video.muted = true;
video.loop = true;
video.preload = 'metadata';

const texture = new THREE.VideoTexture(video);
texture.colorSpace = THREE.SRGBColorSpace;
texture.minFilter = THREE.LinearFilter;
texture.magFilter = THREE.LinearFilter;
texture.generateMipmaps = false;

const material = new THREE.MeshBasicMaterial({ map: texture });
const sphere = new THREE.Mesh(geometry, material);
scene.add(sphere);

let videoReady = false;
let isLoading = true;
let targetTime = 0;
let currentTime = 0;
let scrollAccumulator = 0;
let lastScrollTime = 0;
let rafId = null;

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

video.addEventListener('loadedmetadata', onVideoProgress);
video.addEventListener('progress', onVideoProgress);
video.addEventListener('error', (e) => {
    errorMsg.textContent = 'Erreur chargement vidéo: ' + e.message;
    errorMsg.style.display = 'block';
    loadText.textContent = 'Échec du chargement';
});

function onWheel(e) {
    e.preventDefault();
    const now = performance.now();
    if (now - lastScrollTime > 50) scrollAccumulator = 0;
    lastScrollTime = now;

    scrollAccumulator += e.deltaY > 0 ? 1 : -1;
    const threshold = 2;

    if (Math.abs(scrollAccumulator) >= threshold) {
        const delta = scrollAccumulator > 0 ? 0.5 : -0.5;
        targetTime = Math.max(0, Math.min(VIDEO_DURATION, currentTime + delta));
        scrollAccumulator = 0;
    }
}

let touchStartY = 0;
let touchStartTime = 0;
function onTouchStart(e) {
    touchStartY = e.touches[0].clientY;
    touchStartTime = currentTime;
}
function onTouchMove(e) {
    if (touchStartY === 0) return;
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
    rafId = requestAnimationFrame(animate);
    render();
}

function render() {
    if (videoReady) {
        const diff = targetTime - currentTime;
        if (Math.abs(diff) > 0.02) {
            currentTime += diff * 0.15;
            video.currentTime = currentTime;
        } else {
            currentTime = targetTime;
            video.currentTime = currentTime;
        }
        updateUI();
    }
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

async function checkARSupport() {
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

animate();