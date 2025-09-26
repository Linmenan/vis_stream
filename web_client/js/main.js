// TODO 整个前端的几何坐标系，图像坐标系，要有一个统一的管理，实现几何体，网格线，刻度，十字光标值的统一对齐
// 目前存在的问题：
// 1、十字光标显示的坐标不是几何坐标，
// 2、网格线绘制范围在放大时还是存在不能充满整个图窗，
// 3、刻度值出现的位置与网格线没对应上
import * as THREE from './lib/three.module.js';
import { OrbitControls } from './lib/OrbitControls.js';
// import * as proto from './lib/protocol/visualization_pb.js';

const proto = window.proto;

/**
 * Manages the overall application state, creating the appropriate
 * 2D or 3D plotter based on messages from the backend.
 */
class AppManager {
    constructor() {
        this.activePlotter = null;
    }

    handleUpdate(sceneUpdate, updateType) {
        if (!this.activePlotter || this.activePlotter.type !== updateType) {
            this.createPlotter(updateType);
        }
        const commands = sceneUpdate.getCommandsList();
        commands.forEach(cmd => this.activePlotter.dispatch(cmd));
    }

    createPlotter(type) {
        if (this.activePlotter) {
            this.activePlotter.destroy();
        }
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }

        if (type === '2D') {
            const figureTemplate = `
                <div id="figure-container" class="figure-container">
                    
                    <h2 id="figure-title" class="figure-title">2D Plot</h2>
                    
                    <div class="plot-area">
                        <div id="y-axis-container" class="axis-container y-axis"></div>
                        <div id="canvas-container" class="canvas-container">
                            <div id="crosshair-x" class="crosshair"></div>
                            <div id="crosshair-y" class="crosshair"></div>
                            <div id="coord-tooltip" class="coord-tooltip"></div>
                        </div>
                        <div id="x-axis-container" class="axis-container x-axis"></div>
                    </div>

                    <div id="legend-container" class="legend-container"></div>

                    <div id="toolbar" class="toolbar">
                        <label class="toolbar-label">
                            <input type="checkbox" id="dynamic-fit-toggle">
                            动态适应
                        </label>
                        <button id="reset-view-btn">还原视角</button>
                    </div>
                    
                </div>`;
            document.body.innerHTML = figureTemplate;
            const container = document.getElementById('figure-container');
            this.activePlotter = new Plotter2D(container);
        } else { // 3D
            this.activePlotter = new Plotter3D(document.body);
        }
    }
}

/**
 * Base class for plotters to share common functionality.
 */
class BasePlotter {
    constructor(container) {
        this.container = container;
        this.sceneObjects = new Map();
        this.factory = new ObjectFactory();
        window.addEventListener('resize', this.onWindowResize, false);
    }

    animate = () => {
        this.animationFrameId = requestAnimationFrame(this.animate);
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    removeObject(objectId) {
        if (this.sceneObjects.has(objectId)) {
            const obj = this.sceneObjects.get(objectId);
            this.scene.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
                materials.forEach(m => m.dispose());
            }
            this.sceneObjects.delete(objectId);
        }
    }

    destroy() {
        window.removeEventListener('resize', this.onWindowResize, false);
        cancelAnimationFrame(this.animationFrameId);
        // Clean up scene objects
        this.sceneObjects.forEach(obj => this.removeObject(obj.name));
    }
    onDisconnect() {
        console.log(`${this.type} Plotter is now in static mode (disconnected).`);
    }
}

/**
 * Manages the immersive 3D scene.
 */
class Plotter3D extends BasePlotter {
    constructor(container) {
        super(container);
        this.type = '3D';

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x222222);
        // 初始化透视相机
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });

        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.container.appendChild(this.renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 10, 7.5);
        this.scene.add(directionalLight);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.gridHelper = new THREE.GridHelper(100, 100);
        this.axesHelper = new THREE.AxesHelper(5);
        this.scene.add(this.gridHelper, this.axesHelper);

        this.camera.position.set(5, 5, 5);
        this.controls.update();

        this.animate();
    }

    onWindowResize = () => {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    dispatch(command) {
        const commandType = command.getCommandTypeCase();
        switch (commandType) {
            case proto.visualization.Command3D.CommandTypeCase.ADD_OBJECT: {
                const cmd = command.getAddObject();
                const obj = this.factory.create3D(cmd);
                if (obj) {
                    if (this.sceneObjects.has(cmd.getId())) this.removeObject(cmd.getId());
                    obj.name = cmd.getId();
                    this.sceneObjects.set(cmd.getId(), obj);
                    this.scene.add(obj);
                }
                break;
            }
            case proto.visualization.Command3D.CommandTypeCase.UPDATE_OBJECT_GEOMETRY: {
                const cmd = command.getUpdateObjectGeometry();
                if (this.sceneObjects.has(cmd.getId())) {
                    this.factory.update3D(this.sceneObjects.get(cmd.getId()), cmd);
                }
                break;
            }
            case proto.visualization.Command3D.CommandTypeCase.DELETE_OBJECT:
                this.removeObject(command.getDeleteObject().getId());
                break;
            case proto.visualization.Command3D.CommandTypeCase.SET_GRID_VISIBLE:
                this.gridHelper.visible = command.getSetGridVisible().getVisible();
                break;
            case proto.visualization.Command3D.CommandTypeCase.SET_AXES_VISIBLE:
                this.axesHelper.visible = command.getSetAxesVisible().getVisible();
                break;
            case proto.visualization.Command3D.CommandTypeCase.SET_TITLE:
                document.title = command.getSetTitle().getTitle();
                break;
        }
    }

    onDisconnect() {
        super.onDisconnect();
        document.title = document.title + " (连接已断开)";
    }
}
/**
 * 统一的坐标系统管理器
 * 负责几何坐标、屏幕坐标、图像坐标之间的转换和一致性维护
 */
class CoordinateSystem {
    constructor(canvasContainer) {
        this.canvasContainer = canvasContainer;
        this.updateCanvasSize();
        this.debugCount = 0; // 添加调试计数器
        // 添加精度控制参数
        this.precisionThreshold = 1e-10; // 精度阈值
        this.maxRange = 1e6; // 最大有效范围
    }

    updateCanvasSize() {
        const rect = this.canvasContainer.getBoundingClientRect();
        this.canvasWidth = rect.width;
        this.canvasHeight = rect.height;
        this.canvasAspect = this.canvasWidth / this.canvasHeight;
    }

    // [关键修改] 直接从摄像机获取世界边界
    getWorldBounds(camera, controls = null) {
        // 更安全的边界计算
        const zoom = camera.zoom || 1;

        // 更严格的数值验证
        if (zoom <= 0 || !isFinite(zoom) || zoom > 1000) {
            console.warn('Invalid camera zoom, resetting to default:', zoom);
            return this.getDefaultBounds();
        }

        const zoomFactor = 1 / this.clampValue(zoom, 0.001, 1000);

        // 验证摄像机边界有效性
        if (!this.areValidCameraBounds(camera)) {
            console.warn('Invalid camera bounds, using defaults');
            return this.getDefaultBounds();
        }

        // 计算基础边界（应用精度控制）
        const baseBounds = {
            left: this.applyPrecision(camera.left * zoomFactor),
            right: this.applyPrecision(camera.right * zoomFactor),
            bottom: this.applyPrecision(camera.bottom * zoomFactor),
            top: this.applyPrecision(camera.top * zoomFactor)
        };

        // 应用目标点偏移（如果有控制器）
        let finalBounds = this.applyTargetOffset(baseBounds, controls);

        // 最终验证和修正
        return this.validateAndFixBounds(finalBounds);
    }
    // 数值精度控制方法
    applyPrecision(value) {
        if (Math.abs(value) < this.precisionThreshold) {
            return 0;
        }
        // 限制数值范围，避免极端值
        return this.clampValue(value, -this.maxRange, this.maxRange);
    }

    clampValue(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
    areValidCameraBounds(camera) {
        return isFinite(camera.left) && isFinite(camera.right) &&
            isFinite(camera.bottom) && isFinite(camera.top) &&
            Math.abs(camera.right - camera.left) > this.precisionThreshold &&
            Math.abs(camera.top - camera.bottom) > this.precisionThreshold;
    }
    applyTargetOffset(bounds, controls) {
        if (!controls || !controls.target) return bounds;

        const targetX = this.applyPrecision(controls.target.x || 0);
        const targetY = this.applyPrecision(controls.target.y || 0);

        return {
            left: this.applyPrecision(bounds.left + targetX),
            right: this.applyPrecision(bounds.right + targetX),
            bottom: this.applyPrecision(bounds.bottom + targetY),
            top: this.applyPrecision(bounds.top + targetY)
        };
    }
    validateAndFixBounds(bounds) {
        const { left, right, bottom, top } = bounds;

        // 检查边界有效性
        if (!isFinite(left) || !isFinite(right) ||
            !isFinite(bottom) || !isFinite(top) ||
            right - left <= this.precisionThreshold ||
            top - bottom <= this.precisionThreshold) {
            console.error('Bounds validation failed, using defaults');
            return this.getDefaultBounds();
        }

        return bounds;
    }

    getDefaultBounds() {
        return {
            left: -10, right: 10,
            bottom: -10, top: 10
        };
    }
    // 屏幕坐标转世界坐标
    screenToWorld(screenX, screenY, camera, controls = null) {
        const worldBounds = this.getWorldBounds(camera, controls);
        return {
            x: worldBounds.left + (screenX / this.canvasWidth) * (worldBounds.right - worldBounds.left),
            y: worldBounds.top - (screenY / this.canvasHeight) * (worldBounds.top - worldBounds.bottom)
        };
    }

    // 世界坐标转屏幕坐标
    worldToScreen(worldX, worldY, camera, controls = null) {
        const worldBounds = this.getWorldBounds(camera, controls);

        const screenX = ((worldX - worldBounds.left) / (worldBounds.right - worldBounds.left)) * this.canvasWidth;
        const screenY = (1 - (worldY - worldBounds.bottom) / (worldBounds.top - worldBounds.bottom)) * this.canvasHeight;

        // [调试] 添加转换信息
        if (this.debugCount < 10) { // 只打印前10次调试信息
            console.log(`坐标转换: 世界(${worldX.toFixed(2)}, ${worldY.toFixed(2)}) -> 屏幕(${screenX.toFixed(1)}, ${screenY.toFixed(1)})`);
            console.log(`  世界边界: [${worldBounds.left.toFixed(2)}, ${worldBounds.right.toFixed(2)}] x [${worldBounds.bottom.toFixed(2)}, ${worldBounds.top.toFixed(2)}]`);
            this.debugCount++;
        }

        return {
            x: screenX,
            y: screenY
        };
    }

    // 适应数据边界
    fitToData(dataBounds, camera, padding = 0.1) {
        const dataWidth = dataBounds.right - dataBounds.left;
        const dataHeight = dataBounds.top - dataBounds.bottom;

        // 处理零尺寸情况
        const safeWidth = Math.max(dataWidth, 0.1);  // 避免除零
        const safeHeight = Math.max(dataHeight, 0.1);

        const centerX = (dataBounds.left + dataBounds.right) / 2;
        const centerY = (dataBounds.bottom + dataBounds.top) / 2;

        const paddedWidth = safeWidth * (1 + padding);
        const paddedHeight = safeHeight * (1 + padding);

        // 根据画布宽高比调整
        let viewWidth, viewHeight;
        if (this.canvasAspect > paddedWidth / paddedHeight) {
            viewHeight = paddedHeight;
            viewWidth = viewHeight * this.canvasAspect;
        } else {
            viewWidth = paddedWidth;
            viewHeight = viewWidth / this.canvasAspect;
        }

        // [关键修复] 直接设置摄像机边界，以数据中心为中心
        camera.left = centerX - viewWidth / 2;
        camera.right = centerX + viewWidth / 2;
        camera.bottom = centerY - viewHeight / 2;
        camera.top = centerY + viewHeight / 2;

        // 重置zoom为1，确保边界计算正确
        camera.zoom = 1;

        // 更新摄像机
        camera.updateProjectionMatrix();

        console.log(`程序化适应: 中心(${centerX.toFixed(2)}, ${centerY.toFixed(2)}), 范围${viewWidth.toFixed(2)}x${viewHeight.toFixed(2)}`);

        return {
            centerX, centerY,
            viewWidth, viewHeight
        };
    }
}

/**
 * 一个辅助类，用于创建和管理一个动态的、自适应的2D网格和坐标轴刻度。
 * 它会根据摄像机的视野动态调整网格密度和刻度标签。
 */
class DynamicGrid {
    constructor(scene, camera, coordinateSystem, controls = null) {
        this.scene = scene;
        this.camera = camera;
        this.coordinateSystem = coordinateSystem;
        this.controls = controls; // 保存控制器引用

        // 网格材质
        const material = new THREE.LineBasicMaterial({
            color: 0xcccccc,
            transparent: true,
            opacity: 0.5
        });

        // 网格几何体
        const geometry = new THREE.BufferGeometry();
        this.gridLines = new THREE.LineSegments(geometry, material);
        this.gridLines.frustumCulled = false;
        this.scene.add(this.gridLines);

        // 刻度标签管理
        this.xLabels = [];
        this.yLabels = [];

        this.xAxisContainer = coordinateSystem.canvasContainer.parentElement.querySelector('#x-axis-container');
        this.yAxisContainer = coordinateSystem.canvasContainer.parentElement.querySelector('#y-axis-container');
    }

    update() {
        // [关键修复] 传递controls参数以获取正确的世界边界
        const worldBounds = this.coordinateSystem.getWorldBounds(this.camera, this.controls);
        const viewWidth = worldBounds.right - worldBounds.left;
        const viewHeight = worldBounds.top - worldBounds.bottom;

        // [关键修复] 改进的网格范围计算，确保完全覆盖
        const paddingFactor = this.calculateDynamicPadding(viewWidth, viewHeight);
        const extendedLeft = worldBounds.left - viewWidth * paddingFactor;
        const extendedRight = worldBounds.right + viewWidth * paddingFactor;
        const extendedBottom = worldBounds.bottom - viewHeight * paddingFactor;
        const extendedTop = worldBounds.top + viewHeight * paddingFactor;

        const xInterval = this.calculateNiceInterval(viewWidth);
        const yInterval = this.calculateNiceInterval(viewHeight);

        const vertices = [];
        const newXLabels = [];
        const newYLabels = [];

        // 生成X轴网格线和刻度
        const xStart = Math.floor(extendedLeft / xInterval) * xInterval;
        const xEnd = Math.ceil(extendedRight / xInterval) * xInterval;

        for (let x = xStart; x <= xEnd; x += xInterval) {
            const preciseX = this.roundToPrecision(x, 8);

            // 网格线（扩展到完整范围）
            vertices.push(preciseX, extendedBottom, 0, preciseX, extendedTop, 0);

            // 刻度标签（只在可见区域内显示）
            if (preciseX >= worldBounds.left && preciseX <= worldBounds.right) {
                const screenPos = this.coordinateSystem.worldToScreen(preciseX, worldBounds.bottom, this.camera, this.controls);
                newXLabels.push({ value: preciseX, position: screenPos.x });
            }
        }

        // 生成Y轴网格线和刻度
        const yStart = Math.floor(extendedBottom / yInterval) * yInterval;
        const yEnd = Math.ceil(extendedTop / yInterval) * yInterval;

        for (let y = yStart; y <= yEnd; y += yInterval) {
            const preciseY = this.roundToPrecision(y, 8);

            // 网格线（扩展到完整范围）
            vertices.push(extendedLeft, preciseY, 0, extendedRight, preciseY, 0);

            // 刻度标签（只在可见区域内显示）
            if (preciseY >= worldBounds.bottom && preciseY <= worldBounds.top) {
                const screenPos = this.coordinateSystem.worldToScreen(worldBounds.left, preciseY, this.camera, this.controls);
                newYLabels.push({ value: preciseY, position: screenPos.y });
            }
        }

        // 更新网格几何体
        this.gridLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        this.gridLines.geometry.attributes.position.needsUpdate = true;

        // 更新刻度标签
        this.updateAxisLabels(this.xAxisContainer, this.xLabels, newXLabels, 'x');
        this.updateAxisLabels(this.yAxisContainer, this.yLabels, newYLabels, 'y');

        // [调试] 网格更新信息
        console.log(`动态网格更新: 网格线${vertices.length / 6}条, X标签${newXLabels.length}个, Y标签${newYLabels.length}个`);
        // [调试] 显示第一个刻度标签的位置信息
        if (newXLabels.length > 0) {
            const firstLabel = newXLabels[0];
            console.log(`第一个X刻度: 世界坐标=${firstLabel.value.toFixed(2)}, 屏幕位置=${firstLabel.position.toFixed(1)}px`);
        }
        if (newYLabels.length > 0) {
            const firstLabel = newYLabels[0];
            console.log(`第一个Y刻度: 世界坐标=${firstLabel.value.toFixed(2)}, 屏幕位置=${firstLabel.position.toFixed(1)}px`);
        }
    }
    // [新增] 动态计算填充因子，根据缩放级别调整
    calculateDynamicPadding(viewWidth, viewHeight) {
        const maxDimension = Math.max(Math.abs(viewWidth), Math.abs(viewHeight));

        // 在放大时增加填充，确保网格覆盖
        if (maxDimension < 1) {
            return 0.5; // 高缩放级别，需要更多填充
        } else if (maxDimension < 10) {
            return 0.2; // 中等缩放级别
        } else {
            return 0.1; // 低缩放级别
        }
    }
    calculateNiceInterval(range) {
        const exponent = Math.floor(Math.log10(range));
        const powerOfTen = Math.pow(10, exponent);
        const relativeRange = range / powerOfTen;

        if (relativeRange < 2) return powerOfTen * 0.2;
        if (relativeRange < 5) return powerOfTen * 0.5;
        return powerOfTen * 1;
    }

    roundToPrecision(value, precision = 6) {
        const factor = Math.pow(10, precision);
        return Math.round(value * factor) / factor;
    }

    updateAxisLabels(container, oldLabels, newLabelsData, axis) {
        oldLabels.forEach(label => label.remove());
        oldLabels.length = 0;

        container.innerHTML = '';
        newLabelsData.forEach(data => {
            const label = document.createElement('div');
            label.className = `axis-label-${axis}`;
            label.innerText = data.value.toFixed(2);
            container.appendChild(label);

            if (axis === 'x') {
                label.style.left = `${data.position}px`;
            } else {
                label.style.top = `${data.position}px`;
            }

            oldLabels.push(label);
        });
    }

    forceUpdate() {
        this.update();
    }
}
/**
 * Manages the MATLAB-style 2D plot.
 */
class Plotter2D extends BasePlotter {
    constructor(container) {
        super(container);
        this.type = '2D';
        this.isDynamicFitEnabled = false;
        this.lastFitTime = 0; // 添加时间控制

        // 查找所有UI元素
        this.titleEl = container.querySelector('#figure-title');
        this.canvasContainer = container.querySelector('#canvas-container');
        this.xAxisContainer = container.querySelector('#x-axis-container');
        this.yAxisContainer = container.querySelector('#y-axis-container');
        this.resetBtn = container.querySelector('#reset-view-btn');
        this.dynamicFitToggle = container.querySelector('#dynamic-fit-toggle');
        this.tooltipEl = container.querySelector('#coord-tooltip');
        this.crosshairX = container.querySelector('#crosshair-x');
        this.crosshairY = container.querySelector('#crosshair-y');
        this.legendContainer = container.querySelector('#legend-container');
        this.legendElements = new Map();

        // 统一的坐标系统
        this.coordinateSystem = new CoordinateSystem(this.canvasContainer);
        // Three.js 场景设置
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xffffff);

        // 使用坐标系统初始化正交相机
        this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, -10, 10);
        // 确保摄像机有有效的初始状态
        this.camera.zoom = 1;
        this.camera.updateProjectionMatrix();

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(this.coordinateSystem.canvasWidth, this.coordinateSystem.canvasHeight);
        this.canvasContainer.appendChild(this.renderer.domElement);


        // OrbitControls配置
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableRotate = false;
        this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY };

        // [关键修复] 正交摄像机专用配置
        this.controls.screenSpacePanning = true; // 启用屏幕空间平移
        this.controls.enableDamping = false;     // 禁用阻尼，确保精确控制
        this.controls.minZoom = 0.1;            // 设置最小缩放
        this.controls.maxZoom = 10;             // 设置最大缩放

        // [重要] 设置合适的初始目标点
        this.controls.target.set(0, 0, 0);

        this.dynamicGrid = new DynamicGrid(this.scene, this.camera, this.coordinateSystem, this.controls);

        // [关键修复] 添加缩放事件监听
        this.controls.addEventListener('change', this.onControlsChange);
        // 保存最后鼠标位置，用于缩放时更新
        this.lastMousePosition = { x: 0, y: 0 };

        // 绑定所有新旧UI元素的事件监听器
        this.resetBtn.addEventListener('click', this.resetView);
        this.dynamicFitToggle.addEventListener('change', this.onDynamicFitChange);
        this.canvasContainer.addEventListener('mousemove', this.onMouseMove);
        this.canvasContainer.addEventListener('mouseleave', this.onMouseLeave);

        // 控制器状态监控
        this.lastControlState = {
            target: new THREE.Vector3(),
            zoom: this.camera.zoom
        };


        // 监控状态变化
        setInterval(() => {
            const currentTarget = this.controls.target.clone();
            const currentZoom = this.camera.zoom;

            if (!currentTarget.equals(this.lastControlState.target) ||
                Math.abs(currentZoom - this.lastControlState.zoom) > 0.01) {

                console.log('控制器状态 - 目标:',
                    currentTarget.x.toFixed(2), currentTarget.y.toFixed(2),
                    'Zoom:', currentZoom.toFixed(2));

                this.lastControlState.target.copy(currentTarget);
                this.lastControlState.zoom = currentZoom;
            }
        }, 1000); // 每秒检查一次

        this.animate();

    }
    // [新增] 统一的控制器变化处理
    onControlsChange = () => {
        this.camera.updateProjectionMatrix();

        // 强制更新网格
        if (this.dynamicGrid) {
            this.dynamicGrid.forceUpdate();
        }

        // [关键修复] 缩放时也更新十字光标坐标
        this.updateCrosshairCoordinates(this.lastMousePosition.x, this.lastMousePosition.y);
    }

    // [重构] 提取坐标更新逻辑到单独方法
    updateCrosshairCoordinates(mouseX, mouseY) {
        if (!this.crosshairX || !this.crosshairY || !this.tooltipEl) return;

        this.crosshairX.style.top = `${mouseY}px`;
        this.crosshairY.style.left = `${mouseX}px`;

        const worldCoords = this.coordinateSystem.screenToWorld(mouseX, mouseY, this.camera, this.controls);

        this.tooltipEl.style.display = 'block';
        this.tooltipEl.style.left = `${mouseX + 15}px`;
        this.tooltipEl.style.top = `${mouseY + 15}px`;
        this.tooltipEl.innerText = `X: ${worldCoords.x.toFixed(2)}, Y: ${worldCoords.y.toFixed(2)}`;
    }

    // 重写 animate 方法以加入动态适应逻辑
    animate = () => {
        this.animationFrameId = requestAnimationFrame(this.animate);

        // 1. 动态适应逻辑（如果需要）
        if (this.isDynamicFitEnabled) {
            // 只在需要时执行，避免频繁调用
            if (!this.lastFitTime || Date.now() - this.lastFitTime > 100) {
                this.fitViewToData();
                this.lastFitTime = Date.now();
            }
        }

        // 2. 更新控制器
        this.controls.update();

        // 3. 更新动态网格（使用最新的控制器状态）
        if (this.dynamicGrid) {
            this.dynamicGrid.update();
        }

        // 4. 渲染场景
        this.renderer.render(this.scene, this.camera);
    };

    // 处理动态适应开关变化的事件
    onDynamicFitChange = (event) => {
        this.isDynamicFitEnabled = event.target.checked;
        this.controls.enabled = !this.isDynamicFitEnabled; // 动态适应时，禁用用户手动控制
    };

    // 计算所有可见对象的边界并自适应视角的核心方法
    fitViewToData = (padding = 0.1) => {
        if (this.sceneObjects.size === 0) return;

        const sceneBBox = new THREE.Box3();
        sceneBBox.makeEmpty();
        this.sceneObjects.forEach(obj => {
            sceneBBox.expandByObject(obj);
        });

        if (sceneBBox.isEmpty()) return;

        const dataBounds = {
            left: sceneBBox.min.x,
            right: sceneBBox.max.x,
            bottom: sceneBBox.min.y,
            top: sceneBBox.max.y
        };

        // [关键修复] 不传递controls参数
        const result = this.coordinateSystem.fitToData(dataBounds, this.camera, padding);

        // [重要] 重置控制器目标点到新的中心，但不触发控制器更新
        this.controls.target.set(result.centerX, result.centerY, 0);
        this.controls.reset(); // 重置控制器状态，但不改变摄像机
    };

    resetView = () => {
        // 先重置控制器（但不改变摄像机）
        this.controls.reset();

        // 然后适应数据边界
        this.fitViewToData();

        // 确保摄像机更新
        this.camera.updateProjectionMatrix();
    };

    // 更新鼠标移动事件处理
    onMouseMove = (event) => {
        const rect = this.canvasContainer.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        // 保存鼠标位置
        this.lastMousePosition = { x: mouseX, y: mouseY };

        // 使用统一的方法更新坐标
        this.updateCrosshairCoordinates(mouseX, mouseY);
    };

    onMouseLeave = () => {
        this.crosshairX.style.top = '-100px';
        this.crosshairY.style.left = '-100px';
        this.tooltipEl.style.display = 'none';
    };

    onWindowResize = () => {
        // 更新坐标系统的画布尺寸
        this.coordinateSystem.updateCanvasSize();

        if (this.isDynamicFitEnabled) {
            this.fitViewToData();
        } else {
            // 保持当前视图，只更新渲染器尺寸
            this.renderer.setSize(this.coordinateSystem.canvasWidth, this.coordinateSystem.canvasHeight);
            this.camera.updateProjectionMatrix();
        }
    };

    dispatch(command) {
        const commandType = command.getCommandTypeCase();
        switch (commandType) {
            case proto.visualization.Command2D.CommandTypeCase.ADD_OBJECT: {
                const cmd = command.getAddObject();
                const obj = this.factory.create2D(cmd);
                if (obj) {
                    if (this.sceneObjects.has(cmd.getId())) this.removeObject(cmd.getId());
                    obj.name = cmd.getId();
                    this.sceneObjects.set(cmd.getId(), obj);
                    this.scene.add(obj);
                    this.updateLegend(cmd.getId(), cmd.getMaterial());
                }
                break;
            }
            case proto.visualization.Command2D.CommandTypeCase.UPDATE_OBJECT_GEOMETRY: {
                const cmd = command.getUpdateObjectGeometry();
                if (this.sceneObjects.has(cmd.getId())) {
                    this.factory.update2D(this.sceneObjects.get(cmd.getId()), cmd);
                }
                break;
            }
            case proto.visualization.Command2D.CommandTypeCase.DELETE_OBJECT:
                const id_to_delete = command.getDeleteObject().getId();
                this.removeObject(id_to_delete);
                this.updateLegend(id_to_delete, null);
                break;
            case proto.visualization.Command2D.CommandTypeCase.SET_GRID_VISIBLE:
                // this.gridHelper.visible = command.getSetGridVisible().getVisible();
                this.dynamicGrid.gridLines.visible = command.getSetGridVisible().getVisible();
                break;
            case proto.visualization.Command2D.CommandTypeCase.SET_AXIS_PROPERTIES: {
                const props = command.getSetAxisProperties();
                this.dynamicFitToggle.checked = false;
                this.isDynamicFitEnabled = false;
                this.controls.enabled = true;

                // [关键修复] 直接使用坐标系统的方法
                const dataBounds = {
                    left: props.getXMin(),
                    right: props.getXMax(),
                    bottom: props.getYMin(),
                    top: props.getYMax()
                };

                this.coordinateSystem.fitToData(dataBounds, this.camera);
                break;
            }
            case proto.visualization.Command2D.CommandTypeCase.SET_TITLE:
                this.titleEl.innerText = command.getSetTitle().getTitle();
                break;
        }
    }

    onDisconnect() {
        super.onDisconnect();
        this.titleEl.innerText = this.titleEl.innerText + " (连接已断开)";
        this.dynamicFitToggle.disabled = true;
        // [修正] 关键修复：无论之前状态如何，断开连接时必须重新启用用户控制器
        this.isDynamicFitEnabled = false;
        this.controls.enabled = true;
    }
    updateLegend(id, material) {
        if (!material) { // Corresponds to object deletion
            if (this.legendElements.has(id)) {
                this.legendElements.get(id).remove();
                this.legendElements.delete(id);
            }
            return;
        }

        const legendText = material.getLegend();
        if (!legendText) return;

        let legendItem = this.legendElements.get(id);
        if (!legendItem) {
            legendItem = document.createElement('div');
            legendItem.className = 'legend-item';
            this.legendContainer.appendChild(legendItem);
            this.legendElements.set(id, legendItem);
        }

        const color = material.getColor();
        const colorHex = new THREE.Color(color.getR(), color.getG(), color.getB()).getHexString();

        legendItem.innerHTML = `
            <span class="legend-color-swatch" style="background-color: #${colorHex};"></span>
            <span class="legend-label">${legendText}</span>
        `;
    }
    destroy() {
        // Call the parent class's destroy method to clean up common resources.
        if (this.controls) {
            this.controls.removeEventListener('change', this.onControlsChange);
        }
        super.destroy();

        // Specifically destroy the resources created by our dynamic grid.
        this.dynamicGrid.destroy();
    }
}
// [新增] 一个辅助对象，用于创建和缓存点的纹理
const PointTextureFactory = {
    cache: {},
    getTexture: function (shape) {
        if (this.cache[shape]) {
            return this.cache[shape];
        }

        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white';

        switch (shape) {
            case proto.visualization.Material.PointShape.CIRCLE:
                ctx.beginPath();
                ctx.arc(32, 32, 30, 0, 2 * Math.PI);
                ctx.fill();
                break;
            case proto.visualization.Material.PointShape.DIAMOND:
                ctx.beginPath();
                ctx.moveTo(32, 2); ctx.lineTo(62, 32); ctx.lineTo(32, 62); ctx.lineTo(2, 32);
                ctx.closePath();
                ctx.fill();
                break;
            case proto.visualization.Material.PointShape.CROSS:
                ctx.lineWidth = 10;
                ctx.strokeStyle = 'white';
                ctx.beginPath();
                ctx.moveTo(10, 10); ctx.lineTo(54, 54);
                ctx.moveTo(54, 10); ctx.lineTo(10, 54);
                ctx.stroke();
                break;
            case proto.visualization.Material.PointShape.SQUARE:
            default:
                ctx.fillRect(4, 4, 56, 56);
                break;
        }

        const texture = new THREE.CanvasTexture(canvas);
        this.cache[shape] = texture;
        return texture;
    }
};

/**
 * Creates and updates Three.js objects from Protobuf data.
 */
class ObjectFactory {
    // --- 3D Methods ---
    create3D(cmd) {
        const data = cmd.getGeometryDataCase();
        const mat = cmd.getMaterial();
        let obj = null;
        switch (data) {
            case proto.visualization.Add3DObject.GeometryDataCase.POINT_3D: {
                const geom = cmd.getPoint3d();
                const geometry = new THREE.BufferGeometry();
                const pos = geom.getPosition();
                geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([pos.getX(), pos.getY(), pos.getZ()]), 3));
                const color = mat.getColor();
                const material = this.createBasicPointsMaterial(mat);
                obj = new THREE.Points(geometry, material);
                break;
            }
            case proto.visualization.Add3DObject.GeometryDataCase.POSE_3D: {
                obj = new THREE.AxesHelper(1.0);
                this.updatePose(obj, cmd.getPose3d());
                break;
            }
            case proto.visualization.Add3DObject.GeometryDataCase.BALL: {
                const geom = cmd.getBall();
                const geometry = new THREE.SphereGeometry(geom.getRadius(), 32, 16);
                const color = mat.getColor();
                const material = new THREE.MeshStandardMaterial({
                    color: new THREE.Color(color.getR(), color.getG(), color.getB()),
                    roughness: 0.5
                });
                obj = new THREE.Mesh(geometry, material);
                obj.position.set(geom.getCenter().getPosition().getX(), geom.getCenter().getPosition().getY(), geom.getCenter().getPosition().getZ());
                break;
            }
            case proto.visualization.Add3DObject.GeometryDataCase.BOX_3D: {
                const geom = cmd.getBox3d();
                const geometry = new THREE.BoxGeometry(geom.getXLength(), geom.getYLength(), geom.getZLength());
                const color = mat.getColor();
                const material = new THREE.MeshStandardMaterial({
                    color: new THREE.Color(color.getR(), color.getG(), color.getB()),
                    roughness: 0.5
                });
                obj = new THREE.Mesh(geometry, material);
                this.updatePose(obj, geom.getCenter());
                break;
            }
        }
        return obj;
    }

    update3D(obj, cmd) {
        const data = cmd.getGeometryDataCase();
        switch (data) {
            case proto.visualization.Update3DObjectGeometry.GeometryDataCase.POINT_3D: {
                const pos = cmd.getPoint3d().getPosition();
                obj.geometry.attributes.position.setXYZ(0, pos.getX(), pos.getY(), pos.getZ());
                obj.geometry.attributes.position.needsUpdate = true;
                break;
            }
            case proto.visualization.Update3DObjectGeometry.GeometryDataCase.POSE_3D: {
                this.updatePose(obj, cmd.getPose3d());
                break;
            }
            case proto.visualization.Update3DObjectGeometry.GeometryDataCase.BALL: {
                const pos = cmd.getBall().getCenter().getPosition();
                obj.position.set(pos.getX(), pos.getY(), pos.getZ());
                break;
            }
            case proto.visualization.Update3DObjectGeometry.GeometryDataCase.BOX_3D: {
                this.updatePose(obj, cmd.getBox3d().getCenter());
                break;
            }
        }
    }

    // --- 2D Methods ---
    create2D(cmd) {
        const obj = this.create2DPlaceholder(cmd);
        // 对于简单类型，直接在这里更新
        const data = cmd.getGeometryDataCase();
        if (data === proto.visualization.Add2DObject.GeometryDataCase.POINT_2D) {
            const pos = cmd.getPoint2d().getPosition();
            obj.geometry.attributes.position.setXYZ(0, pos.getX(), pos.getY(), 0);
        } else if (data === proto.visualization.Add2DObject.GeometryDataCase.POSE_2D) {
            this.update2DPose(obj, cmd.getPose2d());
        } else {
            // 对于复杂类型，调用 update2D 来填充几何
            const updateCmd = this.packageAsUpdateCmd(cmd);
            this.update2D(obj, updateCmd, cmd.getMaterial());
        }
        return obj;
    }

    update2D(obj, cmd, material) {
        const mat = material || obj.material; // Allow passing material during creation
        const data = cmd.getGeometryDataCase();
        switch (data) {
            case proto.visualization.Update2DObjectGeometry.GeometryDataCase.POINT_2D: {
                const pos = cmd.getPoint2d().getPosition();
                obj.geometry.attributes.position.setXYZ(0, pos.getX(), pos.getY(), 0);
                obj.geometry.attributes.position.needsUpdate = true;
                break;
            }
            case proto.visualization.Update2DObjectGeometry.GeometryDataCase.POSE_2D: {
                this.update2DPose(obj, cmd.getPose2d());
                break;
            }
            case proto.visualization.Update2DObjectGeometry.GeometryDataCase.LINE_2D: {
                const geom = cmd.getLine2d();
                const points = geom.getPointsList().map(p => new THREE.Vector3(p.getPosition().getX(), p.getPosition().getY(), 0));
                obj.geometry.dispose(); // Dispose old geometry
                obj.geometry = new THREE.BufferGeometry().setFromPoints(points);
                if (obj.material.isLineDashedMaterial) {
                    obj.computeLineDistances();
                }
                break;
            }
            case proto.visualization.Update2DObjectGeometry.GeometryDataCase.POLYGON: {
                const geom = cmd.getPolygon();
                const vertices = geom.getVerticesList().map(p => p.getPosition());
                const shape = new THREE.Shape(vertices.map(v => new THREE.Vector2(v.getX(), v.getY())));
                obj.geometry.dispose();
                obj.geometry = mat.type === 'MeshBasicMaterial' ? new THREE.ShapeGeometry(shape) : new THREE.BufferGeometry().setFromPoints(shape.getPoints());
                break;
            }
            case proto.visualization.Update2DObjectGeometry.GeometryDataCase.CIRCLE: {
                const geom = cmd.getCircle();
                const center = geom.getCenter();
                const radius = geom.getRadius();
                obj.geometry.dispose();
                const curve = new THREE.EllipseCurve(center.getX(), center.getY(), radius, radius, 0, 2 * Math.PI, false, 0);
                const points = curve.getPoints(50);
                obj.geometry = new THREE.BufferGeometry().setFromPoints(points);
                if (mat.type === 'MeshBasicMaterial') {
                    const shape = new THREE.Shape(points);
                    obj.geometry.dispose();
                    obj.geometry = new THREE.ShapeGeometry(shape);
                }
                break;
            }
            case proto.visualization.Update2DObjectGeometry.GeometryDataCase.BOX_2D: {
                const geom = cmd.getBox2d();
                const center = geom.getCenter().getPosition();
                const theta = geom.getCenter().getTheta();
                const w = geom.getWidth();
                const lf = geom.getLengthFront();
                const lr = geom.getLengthRear();
                const corners = [
                    new THREE.Vector2(-lr, w / 2), new THREE.Vector2(lf, w / 2),
                    new THREE.Vector2(lf, -w / 2), new THREE.Vector2(-lr, -w / 2)
                ];
                corners.forEach(c => c.rotateAround(new THREE.Vector2(0, 0), theta).add(new THREE.Vector2(center.getX(), center.getY())));
                const points = corners.map(c => new THREE.Vector3(c.x, c.y, 0));
                obj.geometry.dispose();
                obj.geometry = new THREE.BufferGeometry().setFromPoints(points);
                break;
            }
        }
    }

    // --- Helper Methods ---
    createBasicPointsMaterial(mat) {
        const color = mat.getColor();
        return new THREE.PointsMaterial({
            color: new THREE.Color(color.getR(), color.getG(), color.getB()),

            // 关键：size 现在直接代表像素大小
            size: mat.getPointSize() || 10, // 提供一个默认值，例如10像素

            map: PointTextureFactory.getTexture(mat.getPointShape()),

            // 关键：关闭尺寸衰减，让 size 成为固定的像素单位
            sizeAttenuation: false,

            transparent: true,
            alphaTest: 0.5
        });
    }

    create2DPlaceholder(cmd) {
        const data = cmd.getGeometryDataCase();
        const mat = cmd.getMaterial();
        let obj;
        switch (data) {
            case proto.visualization.Add2DObject.GeometryDataCase.POINT_2D: {
                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
                const color = mat.getColor();
                const material = this.createBasicPointsMaterial(mat);
                obj = new THREE.Points(geometry, material);
                break;
            }
            case proto.visualization.Add2DObject.GeometryDataCase.POSE_2D: {
                const color = mat.getColor();
                const colorHex = new THREE.Color(color.getR(), color.getG(), color.getB()).getHex();
                const group = new THREE.Group();
                const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 0.25, colorHex, 0.1, 0.08);
                const pointGeom = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
                const pointMat = this.createBasicPointsMaterial(mat);
                const point = new THREE.Points(pointGeom, pointMat); group.add(arrow, point); obj = group;
                break;
            }
            // [修正] 为 Line2D 单独创建一个 case，确保它使用 THREE.Line
            case proto.visualization.Add2DObject.GeometryDataCase.LINE_2D: {
                const geometry = new THREE.BufferGeometry();
                const material = this.createLineMaterial(mat);
                obj = new THREE.Line(geometry, material);
                break;
            }
            default: { // Polygon, Circle, Box2D fall here
                const geometry = new THREE.BufferGeometry();
                const color = mat.getColor();
                const materialArgs = { color: new THREE.Color(color.getR(), color.getG(), color.getB()), side: THREE.DoubleSide };
                if (mat.getFilled()) {
                    const fillColor = mat.getFillColor();
                    materialArgs.opacity = fillColor.getA();
                    materialArgs.transparent = fillColor.getA() < 1.0;
                }
                const material = mat.getFilled() ? new THREE.MeshBasicMaterial(materialArgs) : new THREE.LineBasicMaterial(materialArgs);
                obj = mat.getFilled() ? new THREE.Mesh(geometry, material) : new THREE.LineLoop(geometry, material);
                break;
            }
        }
        return obj;
    }
    // 创建线材质的辅助函数，用于处理不同线型
    createLineMaterial(mat) {
        const color = mat.getColor();
        const lineStyle = mat.getLineStyle();
        const materialArgs = {
            color: new THREE.Color(color.getR(), color.getG(), color.getB()),
            linewidth: mat.getLineWidth() || 1 // Note: linewidth has no effect in modern THREE.js
        };

        if (lineStyle === proto.visualization.Material.LineStyle.DASHED) {
            materialArgs.dashSize = 0.1;
            materialArgs.gapSize = 0.05;
            return new THREE.LineDashedMaterial(materialArgs);
        }
        return new THREE.LineBasicMaterial(materialArgs);
    }
    packageAsUpdateCmd(addCmd) { const updateCmd = new proto.visualization.Update2DObjectGeometry(); const data = addCmd.getGeometryDataCase(); updateCmd.setId(addCmd.getId()); if (data === proto.visualization.Add2DObject.GeometryDataCase.POINT_2D) updateCmd.setPoint2d(addCmd.getPoint2d()); else if (data === proto.visualization.Add2DObject.GeometryDataCase.POSE_2D) updateCmd.setPose2d(addCmd.getPose2d()); else if (data === proto.visualization.Add2DObject.GeometryDataCase.LINE_2D) updateCmd.setLine2d(addCmd.getLine2d()); else if (data === proto.visualization.Add2DObject.GeometryDataCase.POLYGON) updateCmd.setPolygon(addCmd.getPolygon()); else if (data === proto.visualization.Add2DObject.GeometryDataCase.CIRCLE) updateCmd.setCircle(addCmd.getCircle()); else if (data === proto.visualization.Add2DObject.GeometryDataCase.BOX_2D) updateCmd.setBox2d(addCmd.getBox2d()); return updateCmd; }

    updatePose(obj, poseProto) {
        const pos = poseProto.getPosition().getPosition();
        const quat = poseProto.getQuaternion();
        obj.position.set(pos.getX(), pos.getY(), pos.getZ());
        obj.quaternion.set(quat.getX(), quat.getY(), quat.getZ(), quat.getW());
    }

    update2DPose(obj, pose2dProto) {
        const pos = pose2dProto.getPosition();
        const angle = pose2dProto.getTheta();
        obj.position.set(pos.getX(), pos.getY(), 0);
        obj.rotation.z = angle;
    }
}


/**
 * Handles WebSocket communication.
 */
class ConnectionManager {
    constructor(url, appManager) {
        this.ws = new WebSocket(url);
        this.ws.binaryType = "arraybuffer";
        this.appManager = appManager;

        this.ws.onopen = () => console.log("WebSocket connected to ws://localhost:9002");
        this.ws.onmessage = this.handleMessage;
        this.ws.onerror = (err) => console.error("WebSocket Error:", err);
        this.ws.onclose = () => {
            console.log("WebSocket disconnected.");
            if (this.appManager.activePlotter) {
                this.appManager.activePlotter.onDisconnect();
            }
        };
    }

    handleMessage = (event) => {
        const data = new Uint8Array(event.data);
        const visMessage = proto.visualization.VisMessage.deserializeBinary(data);

        const messageType = visMessage.getMessageDataCase();

        if (messageType === proto.visualization.VisMessage.MessageDataCase.SCENE_3D_UPDATE) {
            this.appManager.handleUpdate(visMessage.getScene3dUpdate(), '3D');
        } else if (messageType === proto.visualization.VisMessage.MessageDataCase.SCENE_2D_UPDATE) {
            this.appManager.handleUpdate(visMessage.getScene2dUpdate(), '2D');
        } else {
            console.warn("Received message of unknown type.");
        }
    }
}

// --- Main Entry Point ---
window.onload = () => {
    const appManager = new AppManager();
    const connectionManager = new ConnectionManager("ws://localhost:9002", appManager);
};