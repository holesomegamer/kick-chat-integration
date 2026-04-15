(function initBgCubes() {
    const FACE_TRANSFORMS = [
        ['front',  (h) => `translateZ(${h}px)`],
        ['back',   (h) => `rotateY(180deg) translateZ(${h}px)`],
        ['right',  (h) => `rotateY(90deg) translateZ(${h}px)`],
        ['left',   (h) => `rotateY(-90deg) translateZ(${h}px)`],
        ['top',    (h) => `rotateX(90deg) translateZ(${h}px)`],
        ['bottom', (h) => `rotateX(-90deg) translateZ(${h}px)`],
    ];

    function spawnBgCube() {
        const layer = document.getElementById('bgCubesLayer');
        if (!layer) return;

        const size      = 18 + Math.random() * 28;
        const half      = size / 2;
        const spin      = (2 + Math.random() * 4).toFixed(2);
        const life      = (8 + Math.random() * 10).toFixed(2);
        const peak      = (0.05 + Math.random() * 0.09).toFixed(3);
        const sideWidth = window.innerWidth * 0.18;
        const onLeft    = Math.random() < 0.5;
        const startX    = onLeft
            ? Math.random() * sideWidth
            : window.innerWidth - Math.random() * sideWidth;
        const startY    = Math.random() * window.innerHeight;
        const dx        = (onLeft ? 1 : -1) * (20 + Math.random() * 80).toFixed(1);
        const dy        = ((Math.random() - 0.5) * 200).toFixed(1);
        const scaleMax  = (1.0 + Math.random() * 1.0).toFixed(2);
        const scaleMid  = (0.5 + Math.random() * 0.4).toFixed(2);
        const scaleStart = (0.2 + Math.random() * 0.3).toFixed(2);

        const wrapper = document.createElement('div');
        wrapper.className = 'bg-cube-wrapper';
        wrapper.style.cssText = [
            `left:${startX}px`, `top:${startY}px`,
            `width:${size}px`, `height:${size}px`,
            `--life:${life}s`, `--spin:${spin}s`,
            `--peak:${peak}`, `--dx:${dx}px`, `--dy:${dy}px`,
            `--scale-max:${scaleMax}`, `--scale-mid:${scaleMid}`, `--scale-start:${scaleStart}`,
        ].join(';');

        const inner = document.createElement('div');
        inner.className = 'bg-cube-inner';
        inner.style.cssText = `width:${size}px;height:${size}px`;

        FACE_TRANSFORMS.forEach(([, tfn]) => {
            const face = document.createElement('span');
            face.className = 'bg-cube-face';
            face.style.cssText = `width:${size}px;height:${size}px;transform:${tfn(half)}`;
            inner.appendChild(face);
        });

        wrapper.appendChild(inner);
        layer.appendChild(wrapper);

        setTimeout(() => wrapper.remove(), (parseFloat(life) + 0.5) * 1000);
    }

    function scheduleBgCube() {
        const delay = 1250 + Math.random() * 3250;
        setTimeout(() => {
            spawnBgCube();
            scheduleBgCube();
        }, delay);
    }

    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => { spawnBgCube(); scheduleBgCube(); }, 600);
        setTimeout(() => { spawnBgCube(); scheduleBgCube(); }, 1800);
    });
}());
