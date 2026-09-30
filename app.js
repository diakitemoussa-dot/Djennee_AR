const canvas = document.getElementById('canvas');
const frameInfo = document.getElementById('frame-info');
const progressFill = document.getElementById('progress-fill');
const loadingEl = document.getElementById('loading');
const loadText = document.getElementById('load-text');
const loadProgress = document.getElementById('load-progress');
const errorMsg = document.getElementById('error-msg');
const arButton = document.getElementById('ar-button');

const TOTAL_FRAMES = 421;

function getFramePath(index) {
    if (index < 121) {
        // 1JPEG: frames 030-150 (121 frames)
        const frameNum = index + 30;
        return `1JPEG/ezgif-frame-${frameNum.toString().padStart(3, '0')}.jpg`;
    } else if (index < 271) {
        // 2JPEG: frames 001-150 (150 frames)
        const frameNum = index - 120;
        return `2JPEG/ezgif-frame-${frameNum.toString().padStart(3, '0')}.jpg`;
    } else {
        // 3JPEG: frames 001-150 (150 frames)
        const frameNum = index - 270;
        return `3JPEG/ezgif-frame-${frameNum.toString().padStart(3, '0')}.jpg`;
    }
}

const framePaths = Array.from({ length: TOTAL_FRAMES }, (_, i) => getFramePath(i));

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.xr.enabled = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);

const geometry = new THREE.SphereGeometry(500, 60, 40);
geometry.scale(-1, 1, 1);

let currentTexture = null;
let currentFrame = 0;
let textures = new Array(TOTAL_FRAMES).fill(null);
let loadedCount = 0;
let isLoading = true;

const material = new THREE.MeshBasicMaterial({ map: null });
const sphere = new THREE.Mesh(geometry, material);
scene.add(sphere);

const textureLoader = new THREE.TextureLoader();

function loadTexture(index) {
    return new Promise((resolve, reject) => {
        textureLoader.load(
            framePaths[index],
            (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                resolve({ index, texture: tex });
            },
            undefined,
            (err) => reject(err)
        );
    });
}

async function preloadTextures() {
    loadText.textContent = 'Chargement des images...';
    const batchSize = 6;
    for (let i = 0; i < TOTAL_FRAMES; i += batchSize) {
        const end = Math.min(i + batchSize, TOTAL_FRAMES);
        const batch = [];
        for (let j = i; j < end; j++) {
            batch.push(loadTexture(j));
        }
        try {
            const results = await Promise.all(batch);
            results.forEach(({ index, texture }) => {
                textures[index] = texture;
                loadedCount++;
                const pct = Math.round((loadedCount / TOTAL_FRAMES) * 100);
                loadProgress.textContent = `${loadedCount} / ${TOTAL_FRAMES} (${pct}%)`;
            });
        } catch (e) {
            console.error('Erreur chargement batch:', e);
            errorMsg.textContent = 'Erreur: ' + e.message;
            errorMsg.style.display = 'block';
        }
    }
    isLoading = false;
    loadingEl.classList.add('hidden');
    setFrame(0);
    checkARSupport();
}

function setFrame(index) {
    if (index < 0) index = 0;
    if (index >= TOTAL_FRAMES) index = TOTAL_FRAMES - 1;
    if (currentFrame === index) return;

    currentFrame = index;
    const tex = textures[index];
    if (tex) {
        if (currentTexture) currentTexture.dispose();
        material.map = tex;
        material.needsUpdate = true;
        currentTexture = tex;
    }

    frameInfo.textContent = `Frame ${index + 1} / ${TOTAL_FRAMES}`;
    progressFill.style.width = `${((index + 1) / TOTAL_FRAMES) * 100}%`;
}

let scrollAccumulator = 0;
let lastScrollTime = 0;
let targetFrame = 0;

function onWheel(e) {
    e.preventDefault();
    const now = performance.now();
    if (now - lastScrollTime > 50) scrollAccumulator = 0;
    lastScrollTime = now;

    scrollAccumulator += e.deltaY > 0 ? 1 : -1;
    const threshold = 3;

    if (Math.abs(scrollAccumulator) >= threshold) {
        targetFrame = Math.max(0, Math.min(TOTAL_FRAMES - 1, currentFrame + (scrollAccumulator > 0 ? 1 : -1)));
        scrollAccumulator = 0;
    }
}

let touchStartY = 0;
function onTouchStart(e) { touchStartY = e.touches[0].clientY; }
function onTouchMove(e) {
    if (touchStartY === 0) return;
    const delta = touchStartY - e.touches[0].clientY;
    if (Math.abs(delta) > 30) {
        targetFrame = Math.max(0, Math.min(TOTAL_FRAMES - 1, currentFrame + (delta > 0 ? 1 : -1)));
        touchStartY = 0;
    }
}
function onTouchEnd() { touchStartY = 0; }

window.addEventListener('wheel', onWheel, { passive: false });
window.addEventListener('touchstart', onTouchStart, { passive: true });
window.addEventListener('touchmove', onTouchMove, { passive: true });
window.addEventListener('touchend', onTouchEnd);

function animate() {
    renderer.setAnimationLoop(render);
}

function render() {
    if (targetFrame !== currentFrame) {
        const diff = targetFrame - currentFrame;
        const step = Math.sign(diff);
        setFrame(currentFrame + step);
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
    try {
        const session = await navigator.xr.requestSession('immersive-ar', {
            requiredFeatures: ['local-floor', 'hit-test'],
            optionalFeatures: ['dom-overlay'],
            domOverlay: { root: document.body }
        });
        await renderer.xr.setSession(session);
        arButton.textContent = 'Quitter AR';
        arButton.onclick = exitAR;
    } catch (e) {
        console.error('Erreur AR:', e);
        alert('Impossible de démarrer AR: ' + e.message);
    }
};

function exitAR() {
    renderer.xr.setSession(null);
    arButton.textContent = 'Entrer en AR';
    arButton.onclick = enterAR;
}

preloadTextures();
animate();