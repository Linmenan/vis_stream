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
                        <div id="y-axis-label" class="y-axis-label">Y-Axis</div>
                        <div id="canvas-container" class="canvas-container">
                            <div id="crosshair-x" class="crosshair"></div>
                            <div id="crosshair-y" class="crosshair"></div>
                            <div id="coord-tooltip" class="coord-tooltip"></div>
                        </div>
                        <div id="legend-container" class="legend-container"></div>
                        <div id="x-axis-label" class="x-axis-label">X-Axis</div>
                    </div>
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
 * Manages the MATLAB-style 2D plot.
 */
class Plotter2D extends BasePlotter {
    constructor(container) {
        super(container);
        this.type = '2D';
        this.isDynamicFitEnabled = false;

        // 查找所有UI元素
        this.titleEl = container.querySelector('#figure-title');
        this.canvasContainer = container.querySelector('#canvas-container');
        this.xLabelEl = container.querySelector('#x-axis-label');
        this.yLabelEl = container.querySelector('#y-axis-label');
        this.resetBtn = container.querySelector('#reset-view-btn');
        this.dynamicFitToggle = container.querySelector('#dynamic-fit-toggle');
        this.tooltipEl = container.querySelector('#coord-tooltip');
        this.crosshairX = container.querySelector('#crosshair-x');
        this.crosshairY = container.querySelector('#crosshair-y');
        this.legendContainer = container.querySelector('#legend-container');
        this.legendElements = new Map();

        // Three.js 场景设置
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xffffff);

        const rect = this.canvasContainer.getBoundingClientRect();
        this.camera = new THREE.OrthographicCamera(rect.width / -2, rect.width / 2, rect.height / 2, rect.height / -2, -10, 10);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(rect.width, rect.height);
        this.canvasContainer.appendChild(this.renderer.domElement);

        this.gridHelper = new THREE.GridHelper(10, 10);
        this.gridHelper.rotation.x = Math.PI / 2;
        this.scene.add(this.gridHelper);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableRotate = false;
        this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY };

        // 绑定所有新旧UI元素的事件监听器
        this.resetBtn.addEventListener('click', this.resetView);
        this.dynamicFitToggle.addEventListener('change', this.onDynamicFitChange);
        this.canvasContainer.addEventListener('mousemove', this.onMouseMove);
        this.canvasContainer.addEventListener('mouseleave', this.onMouseLeave);

        this.animate();
    }
    // 重写 animate 方法以加入动态适应逻辑
    animate = () => {
        this.animationFrameId = requestAnimationFrame(this.animate);

        // 如果开启了动态适应，则在每一帧都重新计算并设置视角
        if (this.isDynamicFitEnabled) {
            this.controls.reset();
            this.fitViewToData();
        }

        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

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

        const center = new THREE.Vector3();
        sceneBBox.getCenter(center);

        const size = new THREE.Vector3();
        sceneBBox.getSize(size);

        // 健壮性增强：处理边界框宽高为0的情况 (例如只有一个点)
        if (size.x < 1e-6) size.x = 1;
        if (size.y < 1e-6) size.y = 1;
        const paddedWidth = size.x * (1 + padding);
        const paddedHeight = size.y * (1 + padding);

        const rect = this.canvasContainer.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const canvasAspect = rect.width / rect.height;
        const dataAspect = paddedWidth / paddedHeight;

        let viewWidth, viewHeight;

        if (canvasAspect > dataAspect) {
            viewHeight = paddedHeight;
            viewWidth = viewHeight * canvasAspect;
        } else {
            viewWidth = paddedWidth;
            viewHeight = viewWidth / canvasAspect;
        }

        this.camera.left = center.x - viewWidth / 2;
        this.camera.right = center.x + viewWidth / 2;
        this.camera.top = center.y + viewHeight / 2;
        this.camera.bottom = center.y - viewHeight / 2;

        this.camera.zoom = 1;
        this.camera.updateProjectionMatrix();
    };

    resetView = () => {
        this.controls.reset();
        this.fitViewToData();
    };

    onMouseMove = (event) => {
        const rect = this.canvasContainer.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        this.crosshairX.style.top = `${mouseY}px`;
        this.crosshairY.style.left = `${mouseX}px`;

        const worldX = this.camera.left + (this.camera.right - this.camera.left) * (mouseX / rect.width);
        const worldY = this.camera.top - (this.camera.top - this.camera.bottom) * (mouseY / rect.height);

        this.tooltipEl.style.display = 'block';
        this.tooltipEl.style.left = `${mouseX + 15}px`;
        this.tooltipEl.style.top = `${mouseY + 15}px`;
        this.tooltipEl.innerText = `X: ${worldX.toFixed(2)}, Y: ${worldY.toFixed(2)}`;
    };

    onMouseLeave = () => {
        this.crosshairX.style.top = '-100px';
        this.crosshairY.style.left = '-100px';
        this.tooltipEl.style.display = 'none';
    };

    onWindowResize = () => {
        const rect = this.canvasContainer.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        // 保持当前的视图中心和视图高度，只根据新的宽高比调整视图宽度
        const center = this.controls.target.clone();
        const viewHeight = this.camera.top - this.camera.bottom;
        const newAspect = rect.width / rect.height;
        const newViewWidth = viewHeight * newAspect;

        this.camera.left = center.x - newViewWidth / 2;
        this.camera.right = center.x + newViewWidth / 2;
        this.camera.top = center.y + viewHeight / 2;
        this.camera.bottom = center.y - viewHeight / 2;

        this.renderer.setSize(rect.width, rect.height);
        this.camera.updateProjectionMatrix();
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
                this.gridHelper.visible = command.getSetGridVisible().getVisible();
                break;
            case proto.visualization.Command2D.CommandTypeCase.SET_AXIS_PROPERTIES: {
                const props = command.getSetAxisProperties();
                this.xLabelEl.innerText = props.getXLabel();
                this.yLabelEl.innerText = props.getYLabel();
                this.dynamicFitToggle.checked = false;
                this.isDynamicFitEnabled = false;
                this.controls.enabled = true;
                this.camera.left = props.getXMin();
                this.camera.right = props.getXMax();
                this.camera.bottom = props.getYMin();
                this.camera.top = props.getYMax();
                this.camera.updateProjectionMatrix();
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
                const material = this.createAdvancedPointsMaterial(mat);
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
    createAdvancedPointsMaterial(mat) {
        // 在这里定义最小和最大的像素尺寸
        const minPixelSize = 2000.0;
        const maxPixelSize = 25000.0;

        const color = mat.getColor();
        const material = new THREE.PointsMaterial({
            color: new THREE.Color(color.getR(), color.getG(), color.getB()),
            // point_size 现在是纯粹的世界单位，作为基础尺寸
            size: mat.getPointSize() || 0.1,
            map: PointTextureFactory.getTexture(mat.getPointShape()),
            sizeAttenuation: true, // 必须开启，以便在着色器中获得透视缩放效果
            transparent: true,
            alphaTest: 0.5
        });

        // onBeforeCompile Hook: 在编译着色器前对其进行修改
        material.onBeforeCompile = (shader) => {
            // 1. 注入我们自定义的 uniform 变量 (从JS传递到GPU的变量)
            shader.uniforms.minPixelSize = { value: minPixelSize };
            shader.uniforms.maxPixelSize = { value: maxPixelSize };

            // 2. 在顶点着色器的 main 函数之前，声明我们的 uniform
            shader.vertexShader = `
                uniform float minPixelSize;
                uniform float maxPixelSize;
            ` + shader.vertexShader;

            // 3. 替换掉 Three.js 默认的点尺寸计算逻辑
            shader.vertexShader = shader.vertexShader.replace(
                '#include <points_vertex>',
                `
                vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );

                // [修正] projected_size 的计算公式
                // 旧公式适用于3D透视相机，新公式适用于2D正交相机
                float projected_size = size * projectionMatrix[1][1] * rendererSize.y * 0.5;
                
                // 使用 clamp() 函数将理论像素大小限制在 [min, max] 区间内
                gl_PointSize = clamp(projected_size, minPixelSize, maxPixelSize);
                `
            );
        };

        // Three.js v154+ 需要这个自定义的 defines
        // 以确保我们的 uniform 能被识别
        material.defines = { 'USE_SIZEATTENUATION': '' };

        return material;
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
                const material = this.createAdvancedPointsMaterial(mat);
                obj = new THREE.Points(geometry, material);
                break;
            }
            case proto.visualization.Add2DObject.GeometryDataCase.POSE_2D: {
                const color = mat.getColor();
                const colorHex = new THREE.Color(color.getR(), color.getG(), color.getB()).getHex();
                const group = new THREE.Group();
                const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 0.25, colorHex, 0.1, 0.08);
                const pointGeom = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
                const pointMat = this.createAdvancedPointsMaterial(mat);
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