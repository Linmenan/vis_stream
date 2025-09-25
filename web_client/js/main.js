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
                        <div id="x-axis-label" class="x-axis-label">X-Axis</div>
                    </div>
                    <div id="toolbar" class="toolbar">
                        <button id="reset-view-btn">Reset View</button>
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
}

/**
 * Manages the MATLAB-style 2D plot.
 */
class Plotter2D extends BasePlotter {
    constructor(container) {
        super(container);
        this.type = '2D';

        this.titleEl = container.querySelector('#figure-title');
        this.canvasContainer = container.querySelector('#canvas-container');
        this.xLabelEl = container.querySelector('#x-axis-label');
        this.yLabelEl = container.querySelector('#y-axis-label');
        this.resetBtn = container.querySelector('#reset-view-btn');
        this.tooltipEl = container.querySelector('#coord-tooltip');
        this.crosshairX = container.querySelector('#crosshair-x');
        this.crosshairY = container.querySelector('#crosshair-y');

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

        this.resetBtn.addEventListener('click', this.resetView);
        this.canvasContainer.addEventListener('mousemove', this.onMouseMove);
        this.canvasContainer.addEventListener('mouseleave', this.onMouseLeave);

        this.animate();
    }

    resetView = () => this.controls.reset();

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
        // Fullscreen 3D plotter handles this differently
        const containerRect = this.container.getBoundingClientRect();
        this.container.style.width = `${containerRect.width}px`;
        this.container.style.height = `${containerRect.height}px`;

        const rect = this.canvasContainer.getBoundingClientRect();
        this.camera.left = -1; this.camera.right = 1;
        this.camera.top = 1; this.camera.bottom = -1;

        const aspect = rect.width / rect.height;
        if (aspect > 1) { // wider than tall
            this.camera.left *= aspect;
            this.camera.right *= aspect;
        } else { // taller than wide
            this.camera.top /= aspect;
            this.camera.bottom /= aspect;
        }

        this.camera.updateProjectionMatrix();
        this.renderer.setSize(rect.width, rect.height);
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
                this.removeObject(command.getDeleteObject().getId());
                break;
            case proto.visualization.Command2D.CommandTypeCase.SET_GRID_VISIBLE:
                this.gridHelper.visible = command.getSetGridVisible().getVisible();
                break;
            case proto.visualization.Command2D.CommandTypeCase.SET_AXIS_PROPERTIES: {
                const props = command.getSetAxisProperties();
                this.xLabelEl.innerText = props.getXLabel();
                this.yLabelEl.innerText = props.getYLabel();
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
}

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
                const material = new THREE.PointsMaterial({
                    color: new THREE.Color(color.getR(), color.getG(), color.getB()),
                    size: mat.getPointSize() || 15.0,
                    sizeAttenuation: false
                });
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
        const data = cmd.getGeometryDataCase();
        const mat = cmd.getMaterial();
        let obj = null;
        switch (data) {
            case proto.visualization.Add2DObject.GeometryDataCase.POINT_2D: {
                const geom = cmd.getPoint2d();
                const geometry = new THREE.BufferGeometry();
                const pos = geom.getPosition();
                geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([pos.getX(), pos.getY(), 0]), 3));
                const color = mat.getColor();
                const material = new THREE.PointsMaterial({
                    color: new THREE.Color(color.getR(), color.getG(), color.getB()),
                    size: mat.getPointSize() || 10.0,
                    sizeAttenuation: false
                });
                obj = new THREE.Points(geometry, material);
                break;
            }
            case proto.visualization.Add2DObject.GeometryDataCase.POSE_2D: {
                const geom = cmd.getPose2d();
                const color = mat.getColor();
                const colorHex = new THREE.Color(color.getR(), color.getG(), color.getB()).getHex();

                const group = new THREE.Group();
                const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 0.25, colorHex, 0.1, 0.08);
                const pointGeom = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
                const pointMat = new THREE.PointsMaterial({ color: colorHex, size: mat.getPointSize() || 6.0, sizeAttenuation: false });
                const point = new THREE.Points(pointGeom, pointMat);
                group.add(arrow, point);
                obj = group;
                this.update2DPose(obj, geom);
                break;
            }
            case proto.visualization.Add2DObject.GeometryDataCase.LINE_2D: {
                obj = new THREE.Line(); // Create empty, update will populate
                this.update2D(obj, cmd.getUpdateObjectGeometry());
                break;
            }
            case proto.visualization.Add2DObject.GeometryDataCase.POLYGON:
            case proto.visualization.Add2DObject.GeometryDataCase.CIRCLE: {
                obj = mat.getFilled() ? new THREE.Mesh() : new THREE.LineLoop();
                this.update2D(obj, cmd.getUpdateObjectGeometry());
                break;
            }
            case proto.visualization.Add2DObject.GeometryDataCase.BOX_2D: {
                obj = new THREE.LineLoop();
                this.update2D(obj, cmd.getUpdateObjectGeometry());
                break;
            }
        }
        return obj;
    }

    update2D(obj, cmd) {
        const data = cmd.getGeometryDataCase();
        switch (data) {
            case proto.visualization.Add2DObject.GeometryDataCase.POINT_2D: {
                const pos = cmd.getPoint2d().getPosition();
                obj.geometry.attributes.position.setXYZ(0, pos.getX(), pos.getY(), 0);
                obj.geometry.attributes.position.needsUpdate = true;
                break;
            }
            case proto.visualization.Add2DObject.GeometryDataCase.POSE_2D: {
                this.update2DPose(obj, cmd.getPose2d());
                break;
            }
            case proto.visualization.Add2DObject.GeometryDataCase.LINE_2D: {
                const geom = cmd.getLine2d();
                const points = geom.getPointsList().map(p => new THREE.Vector3(p.getPosition().getX(), p.getPosition().getY(), 0));
                obj.geometry.dispose(); // Dispose old geometry
                obj.geometry = new THREE.BufferGeometry().setFromPoints(points);
                if (!obj.material) {
                    const mat = cmd.getMaterial(); // Assumes material is on update for lines
                    const color = mat.getColor();
                    obj.material = new THREE.LineBasicMaterial({
                        color: new THREE.Color(color.getR(), color.getG(), color.getB()),
                        linewidth: mat.getLineWidth() || 1
                    });
                }
                break;
            }
        }
    }

    // --- Helper Methods ---
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
        this.ws.onclose = () => console.log("WebSocket disconnected.");
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