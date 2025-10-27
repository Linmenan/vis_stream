import * as THREE from './lib/three.module.js';
import { OrbitControls } from './lib/OrbitControls.js';
// import * as proto from './lib/protocol/visualization_pb.js';

const proto = window.proto;

/**
 * Manages the overall application state, creating and managing multiple
 * 2D and 3D windows based on messages from the backend.
 */
class AppManager {
    constructor() {
        this.plotters = new Map(); // window_id -> plotter
        this.windowContainer = null;
        this.createWindowContainer();
    }

    createWindowContainer() {
        // 创建主容器
        this.windowContainer = document.createElement('div');
        this.windowContainer.id = 'window-container';
        this.windowContainer.style.cssText = `
            display: grid;
            grid-template-columns: 1fr;
            gap: 10px;
            padding: 10px;
            height: 100vh;
            width: 100vw;
            box-sizing: border-box;
        `;
        document.body.appendChild(this.windowContainer);
    }

    handleUpdate(sceneUpdate, updateType) {
        const windowId = sceneUpdate.getWindowId();
        const windowName = sceneUpdate.getWindowName();
        const commands = sceneUpdate.getCommandsList();

        console.log(`🔄 处理更新 - 窗口: ${windowId}, 类型: ${updateType}, 命令数量: ${commands.length}`);

        // 首先检查命令列表中是否包含删除窗口命令
        for (let cmd of commands) {
            const commandType = cmd.getCommandTypeCase();
            console.log(`  检查命令: 类型=${commandType}, 名称=${this.getCommandTypeName(commandType)}`);

            if (updateType === '2D' &&
                commandType === proto.visualization.Command2D.CommandTypeCase.DELETE_WINDOW) {
                console.log("🗑️ 收到2D窗口删除命令，窗口ID:", windowId);
                this.removePlotter(windowId);
                return; // 直接返回，不处理其他命令
            } else if (updateType === '3D' &&
                commandType === proto.visualization.Command3D.CommandTypeCase.DELETE_WINDOW) {
                console.log("🗑️ 收到3D窗口删除命令，窗口ID:", windowId);
                this.removePlotter(windowId);
                return; // 直接返回，不处理其他命令
            }
        }
        // 检查创建窗口命令
        for (let cmd of commands) {
            const commandType = cmd.getCommandTypeCase();
            if ((updateType === '2D' && commandType === proto.visualization.Command2D.CommandTypeCase.CREATE_WINDOW) ||
                (updateType === '3D' && commandType === proto.visualization.Command3D.CommandTypeCase.CREATE_WINDOW)) {
                console.log("🪟 收到创建窗口命令，窗口ID:", windowId);
                // 如果窗口已存在，警告并忽略
                if (this.plotters.has(windowId)) {
                    console.warn("🔄 窗口已存在！！！", windowId);
                    return;
                    // this.removePlotter(windowId);
                }
            }
        }
        // 如果没有删除窗口命令，继续正常处理
        if (!this.plotters.has(windowId)) {
            // console.log("➕ 创建新plotter:", windowId, "类型:", updateType);
            this.createPlotter(windowId, windowName, updateType);
        } else {
            // console.log("📝 使用现有plotter:", windowId);
        }

        const plotter = this.plotters.get(windowId);
        commands.forEach((cmd, index) => {
            const commandType = cmd.getCommandTypeCase();
            console.log(`  执行命令 ${index}: 类型=${commandType}, 名称=${this.getCommandTypeName(commandType)}`);
            plotter.dispatch(cmd);
        });
    }
    // 添加命令类型名称映射
    getCommandTypeName(commandType) {
        const typeMap = {
            1: 'ADD_OBJECT',
            2: 'UPDATE_OBJECT_GEOMETRY',
            3: 'UPDATE_OBJECT_PROPERTIES',
            4: 'DELETE_OBJECT',
            10: 'SET_GRID_VISIBLE',
            11: 'SET_AXES_VISIBLE',
            12: 'SET_TITLE',
            13: 'SET_LEGEND',
            14: 'SET_AXIS_PROPERTIES',
            15: 'CREATE_WINDOW',
            16: 'DELETE_WINDOW'
        };
        return typeMap[commandType] || `UNKNOWN_${commandType}`;
    }
    createPlotter(windowId, windowName, type) {
        // console.log(`🔄 创建plotter: ${windowId}, 名称: ${windowName}, 类型: ${type}`);

        const windowDiv = document.createElement('div');
        windowDiv.id = `window-${windowId}`;

        const windowType = type === '3D' ? 'plot-window-3d' : 'plot-window-2d';
        windowDiv.className = `plot-window ${windowType}`;

        this.windowContainer.appendChild(windowDiv);

        if (type === '2D') {
            const figureTemplate = `
                <div class="figure-container">
                    <h2 class="figure-title" id="title-${windowId}">${windowName}</h2>  <!-- 使用窗口名称 -->
                    
                    <div class="plot-area">
                        <div class="axis-container y-axis" id="y-axis-${windowId}"></div>
                        <div class="canvas-container" id="canvas-${windowId}">
                            <div class="crosshair crosshair-x" id="crosshair-x-${windowId}"></div>
                            <div class="crosshair crosshair-y" id="crosshair-y-${windowId}"></div>
                            <div class="coord-tooltip" id="tooltip-${windowId}"></div>
                        </div>
                        <div class="axis-container x-axis" id="x-axis-${windowId}"></div>
                    </div>

                    <div class="legend-container" id="legend-${windowId}"></div>

                    <div class="toolbar">
                        <label class="toolbar-label">
                            <input type="checkbox" id="dynamic-fit-${windowId}">
                            动态适应
                        </label>
                        <button id="reset-view-${windowId}">还原视角</button>
                    </div>
                </div>`;

            windowDiv.innerHTML = figureTemplate;
            this.plotters.set(windowId, new Plotter2D(windowDiv, windowId));
        } else { // 3D
            const figureTemplate = `
                <div class="figure-container">
                    <h2 class="figure-title" id="title-${windowId}">${windowName}</h2>
                    <div class="content-area">
                        <div class="canvas-container" id="canvas-${windowId}"></div>
                        <div class="legend-container" id="legend-${windowId}"></div>
                    </div>
                    <div class="toolbar">
                        <button id="reset-view-${windowId}">重置视角</button>
                    </div>
                </div>`;

            windowDiv.innerHTML = figureTemplate;
            this.plotters.set(windowId, new Plotter3D(windowDiv, windowId));
        }
    }

    removePlotter(windowId) {
        // console.log("🔍 尝试删除plotter:", windowId);

        if (this.plotters.has(windowId)) {
            const plotter = this.plotters.get(windowId);
            // console.log("✅ 找到plotter，开始销毁:", windowId);

            plotter.destroy();
            this.plotters.delete(windowId);

            const windowDiv = document.getElementById(`window-${windowId}`);
            if (windowDiv) {
                // console.log("✅ 找到DOM元素，开始移除:", `window-${windowId}`);
                windowDiv.remove();
            } else {
                console.warn("⚠️ 未找到对应的DOM元素:", `window-${windowId}`);
            }

            // console.log("🗑️ 成功删除窗口:", windowId);
        } else {
            console.warn("⚠️ 尝试删除不存在的plotter:", windowId);
        }
    }

    onDisconnect() {
        this.plotters.forEach((plotter, windowId) => {
            plotter.onDisconnect();
        });
    }
}

/**
 * Base class for plotters to share common functionality.
 */
class BasePlotter {
    constructor(container, windowId) {
        this.container = container;
        this.windowId = windowId;
        this.sceneObjects = new Map();
        this.factory = new ObjectFactory();
        window.addEventListener('resize', this.onWindowResize, false);
        this.highlightedObjectId = null; // 跟踪当前高亮的对象ID
        this.highlightInterval = null;   // 跟踪闪烁的定时器
        // 存储高亮前的原始材质状态
        this.originalMaterialState = null;
        // 存储高亮前的原始渲染顺序 (主要用于2D)
        this.originalRenderOrder = 0;
        // 定义用于存储动态计算的高亮色
        this.dynamicHighlightColor = null;
    }
    /**
     * 根据物体的原始颜色计算一个高对比度的高亮色
     * @param {THREE.Color} originalColor 
     * @returns {THREE.Color}
     */
    calculateHighlightColor(originalColor) {
        const hsl = { h: 0, s: 0, l: 0 };
        originalColor.getHSL(hsl);

        // 规则 2: 如果原始颜色很暗 (Lightness < 10%)，则使用亮黄色
        if (hsl.l < 0.1) {
            return new THREE.Color(0xFFFF00); // 亮黄色
        }

        // 规则 1: 计算互补色
        // HSL 色相 (Hue) 范围是 [0, 1]
        // 互补色 = (当前色相 + 0.5) % 1.0
        const complementaryHue = (hsl.h + 0.5) % 1.0;

        // 为了确保高亮足够显眼，我们强制使用高饱和度和中高亮度
        const highlightSaturation = 1.0;
        const highlightLightness = 0.6; // 60% 亮度，避免过曝或太暗

        return new THREE.Color().setHSL(
            complementaryHue,
            highlightSaturation,
            highlightLightness
        );
    }
    /**
     * 保存对象的原始材质颜色和渲染顺序
     */
    saveOriginalMaterial(obj) {
        this.originalMaterialState = [];
        let foundFirstColor = false; // 标记是否已找到颜色
        // 1. 保存材质
        // 1. 遍历并保存材质
        obj.traverse((child) => {
            if (child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach(mat => {
                    // 只处理有颜色属性的材质
                    if (mat.color) {

                        // --- 新增逻辑: 计算高亮色 ---
                        if (!foundFirstColor) {
                            // 使用找到的第一个材质颜色作为基准
                            this.dynamicHighlightColor = this.calculateHighlightColor(mat.color);
                            foundFirstColor = true;
                        }
                        // --- 结束新增 ---

                        this.originalMaterialState.push({
                            material: mat,
                            color: mat.color.clone()
                        });
                    }
                });
            }
        });
        // (例如对象是一个没有材质的 Group)
        if (!foundFirstColor) {
            this.dynamicHighlightColor = new THREE.Color(0xFFFF00); // 默认亮黄色
        }
        // 2. 保存渲染顺序 (用于2D) 并提升
        if (this.type === '2D') {
            this.originalRenderOrder = obj.renderOrder;
            obj.renderOrder = 1000; // 提升到顶层
        }
    }

    /**
     * 应用高亮材质（闪烁时调用）
     */
    applyHighlightMaterial(obj) {
        if (!this.dynamicHighlightColor) {
            console.warn("高亮失败: 未设置 dynamicHighlightColor");
            // 紧急回退
            this.dynamicHighlightColor = new THREE.Color(0xFFFF00);
        }
        obj.traverse((child) => {
            if (child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach(mat => {
                    if (mat.color) {
                        mat.color.set(this.dynamicHighlightColor);
                    }
                    // 3D 材质特殊处理：添加自发光
                    if (this.type === '3D' && mat.isMeshStandardMaterial) {
                        mat.emissive = this.dynamicHighlightColor;
                        mat.emissiveIntensity = 0.5;
                    }
                });
            }
        });
    }

    /**
     * 恢复对象的原始材质和渲染顺序
     */
    restoreOriginalMaterial(obj) {
        if (!obj || !this.originalMaterialState) return;

        // 1. 恢复材质
        this.originalMaterialState.forEach(state => {
            if (state.material && state.material.color) {
                state.material.color.copy(state.color);
            }
        });

        // 2. 恢复3D材质的自发光
        if (this.type === '3D') {
            obj.traverse((child) => {
                if (child.material) {
                    const materials = Array.isArray(child.material) ? child.material : [child.material];
                    materials.forEach(mat => {
                        if (mat.isMeshStandardMaterial) {
                            mat.emissive.set(0x000000);
                            mat.emissiveIntensity = 0;
                        }
                    });
                }
            });
        }

        // 3. 恢复2D渲染顺序
        if (this.type === '2D') {
            obj.renderOrder = this.originalRenderOrder;
        }
    }
    animate = () => {
        this.animationFrameId = requestAnimationFrame(this.animate);
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    removeObject(objectId) {
        console.log(`🧹 开始销毁图元id: ${objectId} `);
        if (objectId === this.highlightedObjectId) {
            this.clearHighlight();
            this.highlightedObjectId = null;
        }
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
        // console.log(`🧹 开始销毁Plotter: ${this.windowId}`);

        // 先停止动画循环
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        // 移除事件监听器
        window.removeEventListener('resize', this.onWindowResize, false);

        // 清理场景对象
        this.sceneObjects.forEach((obj, objectId) => {
            this.removeObject(objectId);
        });
        this.sceneObjects.clear();

        // 清理渲染器（放在最后）
        if (this.renderer) {
            // 先从DOM中移除canvas
            const canvas = this.renderer.domElement;
            if (canvas && canvas.parentNode) {
                canvas.parentNode.removeChild(canvas);
            }

            // 然后清理WebGL资源
            this.renderer.dispose();
            this.renderer.forceContextLoss();
            this.renderer = null;
        }

        // 清理控制器
        if (this.controls) {
            this.controls.dispose();
            this.controls = null;
        }

        // console.log(`✅ Plotter销毁完成: ${this.windowId}`);
    }
    onDisconnect() {
        // console.log(`${this.type} Plotter is now in static mode (disconnected).`);
    }
    onLegendClick = (id) => {
        const isAlreadyHighlighted = (this.highlightedObjectId === id);

        // 无论如何，先清除当前的高亮效果
        this.clearHighlight();

        if (isAlreadyHighlighted) {
            // 如果点击的是已高亮的对象，则取消高亮
            this.highlightedObjectId = null;
            return;
        }
        // 如果点击的是新对象，则开始高亮
        this.highlightedObjectId = id;
        const obj = this.sceneObjects.get(id);
        if (!obj) {
            console.warn("未找到要高亮的对象:", id);
            return;
        }

        // 3. 保存原始状态（材质和2D层级）
        this.saveOriginalMaterial(obj);

        // 4. 开始颜色闪烁
        let isHighlighted = true;
        // 立即应用一次高亮，避免延迟
        this.applyHighlightMaterial(obj);

        this.highlightInterval = setInterval(() => {
            // 检查对象是否仍然存在
            const currentObj = this.sceneObjects.get(this.highlightedObjectId);
            if (!currentObj) {
                this.clearHighlight(); // 对象可能被删除了
                return;
            }

            if (isHighlighted) {
                // 在高亮状态 -> 恢复原始状态
                this.restoreOriginalMaterial(currentObj);
                // 关键：对于2D，恢复原始颜色后，仍要保持顶层渲染
                if (this.type === '2D') {
                    currentObj.renderOrder = 1000;
                }
            } else {
                // 在原始状态 -> 应用高亮
                this.applyHighlightMaterial(currentObj);
            }
            isHighlighted = !isHighlighted;
        }, 400); // 每400ms切换一次颜色

    }
    /**
     * 彻底清除高亮状态和定时器
    */
    clearHighlight = () => {
        // 1. 停止定时器
        if (this.highlightInterval) {
            clearInterval(this.highlightInterval);
            this.highlightInterval = null;
        }

        // 2. 恢复高亮对象的原始材质
        if (this.highlightedObjectId) {
            const obj = this.sceneObjects.get(this.highlightedObjectId);
            if (obj) {
                // 确保对象可见（以防万一是从旧的闪烁逻辑残留的）
                obj.visible = true;
                // 恢复材质和renderOrder
                this.restoreOriginalMaterial(obj);
            }
        }

        // 3. 清理状态
        // 状态应该在这里被清空，而不是在 restoreOriginalMaterial 中
        this.highlightedObjectId = null;
        this.originalMaterialState = null;
        this.originalRenderOrder = 0;
        this.dynamicHighlightColor = null; // 清除动态颜色
    }
}

/**
 * Manages the immersive 3D scene.
 */
class Plotter3D extends BasePlotter {
    constructor(container, windowId) {
        super(container, windowId);
        this.type = '3D';
        this.windowId = windowId;

        // console.log(`🎮 Plotter3D初始化: ${windowId}`);

        // UI元素
        this.titleEl = container.querySelector(`#title-${windowId}`);
        this.canvasContainer = container.querySelector(`#canvas-${windowId}`);
        this.legendContainer = container.querySelector(`#legend-${windowId}`);
        this.resetBtn = container.querySelector(`#reset-view-${windowId}`);

        // 图例元素管理
        this.legendElements = new Map();

        // console.log(`📐 3D容器尺寸:`, {
        //     container: this.canvasContainer.clientWidth,
        //     height: this.canvasContainer.clientHeight
        // });

        // Three.js 初始化
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x222222);

        this.camera = new THREE.PerspectiveCamera(75, this.canvasContainer.clientWidth / this.canvasContainer.clientHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });

        this.renderer.setSize(this.canvasContainer.clientWidth, this.canvasContainer.clientHeight);
        this.canvasContainer.appendChild(this.renderer.domElement);

        // 灯光
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 20, 15);
        this.scene.add(directionalLight);

        // 控制器
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);

        // 网格和坐标轴
        this.gridHelper = new THREE.GridHelper(20, 20);
        this.axesHelper = new THREE.AxesHelper(5);
        this.scene.add(this.gridHelper, this.axesHelper);

        // 相机位置 - 确保可以看到物体
        this.camera.position.set(10, 10, 10);
        this.controls.update();

        // console.log('✅ Plotter3D初始化完成');

        // 事件
        this.resetBtn.addEventListener('click', this.resetView);

        this.animate();
    }

    onWindowResize = () => {
        // 获取容器的最新尺寸
        const container = this.canvasContainer;
        const width = container.clientWidth;
        const height = container.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);

        // console.log(`🔄 3D窗口调整尺寸: ${width}x${height}`);
    }
    resetView = () => {
        this.camera.position.set(5, 5, 5);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
        // console.log('🔄 3D视角重置');
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
                    // 添加图例
                    this.updateLegend(cmd.getId(), cmd);
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
                const id_to_delete_3d = command.getDeleteObject().getId();
                this.removeObject(id_to_delete_3d);
                this.updateLegend(id_to_delete_3d, null);
                break;
            case proto.visualization.Command3D.CommandTypeCase.SET_GRID_VISIBLE:
                this.gridHelper.visible = command.getSetGridVisible().getVisible();
                break;
            case proto.visualization.Command3D.CommandTypeCase.SET_AXES_VISIBLE:
                this.axesHelper.visible = command.getSetAxesVisible().getVisible();
                break;
            case proto.visualization.Command3D.CommandTypeCase.SET_TITLE:
                if (this.titleEl) {
                    this.titleEl.innerText = command.getSetTitle().getTitle();
                }
                break;
            case proto.visualization.Command3D.CommandTypeCase.SET_LEGEND:
                // 处理图例设置命令（如果需要）
                break;
            case proto.visualization.Command3D.CommandTypeCase.CREATE_WINDOW:
                // 窗口创建命令已经在AppManager中处理，这里可以记录日志
                // console.log("✅ 3D窗口创建命令已处理:", this.windowId);
                break;
            case proto.visualization.Command3D.CommandTypeCase.DELETE_WINDOW:
                // 删除窗口命令在AppManager级别处理，这里可以记录日志
                // console.log("🔄 3D窗口收到删除命令，准备销毁:", this.windowId);
                break;
            default:
                console.warn("⚠️ 未知的3D命令类型:", commandType);
        }
    }
    /**
         * 更新3D窗口图例
         */
    updateLegend(id, cmd) {
        // console.log(`📝 更新3D图例: ${id}`);

        // 1. 获取数据
        const material = cmd ? cmd.getMaterial() : null;
        const legendText = material ? material.getLegend() : null;

        // 2. 处理删除 (或没有图例文字的对象)
        if (!cmd || !legendText) {
            if (this.legendElements.has(id)) {
                this.legendElements.get(id).element.remove(); // 从DOM移除
                this.legendElements.delete(id); // 从Map移除
            }
            return; // 完成删除，退出
        }

        // 3. 处理添加/更新
        let legendItemData = this.legendElements.get(id);

        if (!legendItemData) {
            // 如果是新图例
            const element = document.createElement('div');
            element.className = 'legend-item';
            element.addEventListener('click', () => this.onLegendClick(id));

            // 存储元素和用于排序的文本
            legendItemData = { element: element, text: legendText };
            this.legendElements.set(id, legendItemData);
        } else {
            // 如果是更新，只需更新排序文本
            legendItemData.text = legendText;
        }

        // 4. 更新 DOM 元素的内容 (您原有的逻辑)
        const color = material.getColor();
        const colorHex = new THREE.Color(color.getR(), color.getG(), color.getB()).getHexString();
        legendItemData.element.innerHTML = `
            <span class="legend-color-swatch" style="background-color: #${colorHex};"></span>
            <span class="legend-label">${legendText}</span>
        `;

        // 5. 【修复】按图例文字排序并重新追加到DOM

        // 从Map中获取所有图例项
        const itemsArray = Array.from(this.legendElements.values());

        // 关键：按 'text' 属性进行字符串增序排列
        itemsArray.sort((a, b) => a.text.localeCompare(b.text));

        // 按照排好序的数组，依次将DOM元素追加到容器末尾
        // (appendChild 会自动处理移动，无需先清空)
        itemsArray.forEach(itemData => {
            this.legendContainer.appendChild(itemData.element);
        });
    }

    onDisconnect() {
        super.onDisconnect();
        this.titleEl.innerText = this.titleEl.innerText + " (连接已断开)";
    }
    destroy() {
        console.log(`🧹 开始销毁3D Plotter: ${this.windowId}`);
        // 清理图例
        if (this.legendElements) {
            this.legendElements.forEach((element, id) => {
                element.remove();
            });
            this.legendElements.clear();
        }

        // 移除DOM事件监听器
        if (this.resetBtn) {
            this.resetBtn.removeEventListener('click', this.resetView);
            this.resetBtn = null;
        }

        // 移除控制器事件
        if (this.controls) {
            this.controls.dispose();
            this.controls = null;
        }

        // 清理辅助对象
        if (this.gridHelper) {
            this.scene.remove(this.gridHelper);
            this.gridHelper.geometry.dispose();
            this.gridHelper = null;
        }
        if (this.axesHelper) {
            this.scene.remove(this.axesHelper);
            this.axesHelper.geometry.dispose();
            this.axesHelper = null;
        }

        // 清理灯光
        const lights = [];
        this.scene.traverse(child => {
            if (child.isLight) {
                lights.push(child);
            }
        });
        lights.forEach(light => this.scene.remove(light));

        // 清理UI元素引用
        this.titleEl = null;
        this.canvasContainer = null;

        // 最后调用父类销毁方法
        super.destroy();

        console.log(`✅ 3D Plotter销毁完成: ${this.windowId}`);
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
    }

    updateCanvasSize() {
        const rect = this.canvasContainer.getBoundingClientRect();
        this.canvasWidth = rect.width;
        this.canvasHeight = rect.height;
        this.canvasAspect = this.canvasWidth / this.canvasHeight;
    }

    // 获取世界边界（基于正交相机原理）
    getWorldBounds(camera, controls = null) {
        // 确保相机矩阵是更新的
        // 在Plotter2D的animate循环中，controls.update()会更新相机矩阵
        // camera.updateMatrixWorld(); // 通常不需要，但如果遇到问题可以尝试
        // camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

        // 验证相机类型
        if (!camera.isOrthographicCamera) {
            console.warn("getWorldBounds: 非正交相机");
            return this.getDefaultBounds();
        }

        const zoom = camera.zoom;
        if (zoom <= 0 || !isFinite(zoom)) {
            return this.getDefaultBounds();
        }

        // 1. 反投影屏幕的左上角 (0, 0)
        const topLeftWorld = this.screenToWorld(0, 0, camera, controls);

        // 2. 反投影屏幕的右下角 (width, height)
        const bottomRightWorld = this.screenToWorld(this.canvasWidth, this.canvasHeight, camera, controls);

        // 3. 构建边界
        // 注意：screenToWorld 已经处理了Y轴翻转
        const bounds = {
            left: topLeftWorld.x,
            right: bottomRightWorld.x,
            bottom: bottomRightWorld.y,
            top: topLeftWorld.y
        };

        // 4. 使用您原有的验证逻辑
        return this.validateAndFixBounds(bounds);

        // if (!camera.isOrthographicCamera) {
        //     return this.getDefaultBounds();
        // }

        // const zoom = camera.zoom;
        // if (zoom <= 0 || !isFinite(zoom)) {
        //     return this.getDefaultBounds();
        // }

        // // 计算缩放后的相机边界
        // const scaledLeft = camera.left / zoom;
        // const scaledRight = camera.right / zoom;
        // const scaledBottom = camera.bottom / zoom;
        // const scaledTop = camera.top / zoom;

        // // 应用目标点偏移
        // let targetX = 0, targetY = 0;
        // if (controls && controls.target) {
        //     targetX = controls.target.x;
        //     targetY = controls.target.y;
        // }

        // const bounds = {
        //     left: scaledLeft + targetX,
        //     right: scaledRight + targetX,
        //     bottom: scaledBottom + targetY,
        //     top: scaledTop + targetY
        // };

        // return this.validateAndFixBounds(bounds);
    }
    validateBounds(bounds) {
        return isFinite(bounds.left) && isFinite(bounds.right) &&
            isFinite(bounds.bottom) && isFinite(bounds.top) &&
            bounds.right > bounds.left && bounds.top > bounds.bottom;
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
        // 1. 将屏幕像素坐标 [0, canvasSize] 转换回 NDC坐标 [-1, 1]
        const ndcX = (screenX / this.canvasWidth) * 2 - 1;
        const ndcY = -(screenY / this.canvasHeight) * 2 + 1; // Y轴翻转

        // 2. 创建一个向量（Z=-1，指向近裁剪平面）
        const vector = new THREE.Vector3(ndcX, ndcY, -1);

        // 3. 使用相机的逆矩阵将其“反投影”回世界坐标
        vector.unproject(camera);

        return {
            x: vector.x,
            y: vector.y
        };
        // const worldBounds = this.getWorldBounds(camera, controls);
        // // 归一化屏幕坐标 (0到1)
        // const normalizedX = screenX / this.canvasWidth;
        // const normalizedY = 1 - (screenY / this.canvasHeight); // Y轴翻转

        // return {
        //     x: worldBounds.left + normalizedX * (worldBounds.right - worldBounds.left),
        //     y: worldBounds.bottom + normalizedY * (worldBounds.top - worldBounds.bottom)
        // };
    }

    // 世界坐标转屏幕坐标
    worldToScreen(worldX, worldY, camera, controls = null) {
        // 1. 创建一个三维向量（Z=0，因为是2D）
        const vector = new THREE.Vector3(worldX, worldY, 0);

        // 2. 使用相机的矩阵将其投影到“归一化设备坐标”(NDC) [-1, 1]
        // 这一步同时完成了视图变换(平移)和投影变换(缩放)
        // 必须确保相机矩阵在调用前是更新的（在Plotter2D的animate循环中会更新）
        vector.project(camera);

        // 3. 将NDC坐标 [-1, 1] 转换为屏幕像素坐标 [0, canvasSize]
        const screenX = (vector.x + 1) * 0.5 * this.canvasWidth;
        const screenY = (-vector.y + 1) * 0.5 * this.canvasHeight; // Y轴翻转

        return {
            x: screenX,
            y: screenY
        };
        // const worldBounds = this.getWorldBounds(camera, controls);

        // // 归一化世界坐标
        // const normalizedX = (worldX - worldBounds.left) / (worldBounds.right - worldBounds.left);
        // const normalizedY = (worldY - worldBounds.bottom) / (worldBounds.top - worldBounds.bottom);

        // return {
        //     x: normalizedX * this.canvasWidth,
        //     y: (1 - normalizedY) * this.canvasHeight // Y轴翻转
        // };
    }

    // 适应数据边界
    fitToData(dataBounds, camera, controls = null, padding = 0.1) {
        // console.log('🔧 开始适应数据:', dataBounds);

        // 验证数据边界
        if (!this.validateDataBounds(dataBounds)) {
            console.warn('无效的数据边界，使用默认视图');
            return this.resetToDefault(camera, controls);
        }

        // 计算数据尺寸和中心
        const dataWidth = dataBounds.right - dataBounds.left;
        const dataHeight = dataBounds.top - dataBounds.bottom;

        const centerX = (dataBounds.left + dataBounds.right) / 2;
        const centerY = (dataBounds.bottom + dataBounds.top) / 2;

        // 处理极小尺寸情况
        const minSize = 0.1;
        const effectiveWidth = Math.max(dataWidth, minSize);
        const effectiveHeight = Math.max(dataHeight, minSize);

        // 添加填充
        const paddedWidth = effectiveWidth * (1 + padding);
        const paddedHeight = effectiveHeight * (1 + padding);

        // 根据画布宽高比计算视图尺寸
        let viewWidth, viewHeight;
        const dataAspect = dataWidth / dataHeight;

        if (dataAspect > this.canvasAspect) {
            // 数据更宽，以宽度为准
            viewWidth = paddedWidth;
            viewHeight = viewWidth / this.canvasAspect;
        } else {
            // 数据更高，以高度为准
            viewHeight = paddedHeight;
            viewWidth = viewHeight * this.canvasAspect;
        }

        // 正交相机的left/right/bottom/top是相对于相机位置的
        const halfWidth = viewWidth / 2;
        const halfHeight = viewHeight / 2;

        // 保存当前状态用于调试
        const previousState = {
            left: camera.left, right: camera.right,
            bottom: camera.bottom, top: camera.top,
            zoom: camera.zoom,
            target: controls ? controls.target.clone() : null
        };

        // 设置相机参数 - 这是最重要的部分！
        camera.left = -halfWidth;
        camera.right = halfWidth;
        camera.bottom = -halfHeight;
        camera.top = halfHeight;
        camera.near = 0.1;
        camera.far = 1000;
        camera.zoom = 1; // 必须重置zoom

        // 更新相机位置和目标点
        camera.position.set(centerX, centerY, 10); // Z位置不影响2D正交视图
        camera.lookAt(centerX, centerY, 0);

        // 必须调用此方法使参数生效
        camera.updateProjectionMatrix();

        // 同步OrbitControls
        if (controls) {
            controls.target.set(centerX, centerY, 0);
            controls.update();
        }

        // console.log('✅ 适应完成:', {
        //     数据中心: `(${centerX.toFixed(2)}, ${centerY.toFixed(2)})`,
        //     视图尺寸: `${viewWidth.toFixed(2)}x${viewHeight.toFixed(2)}`,
        //     画布比例: this.canvasAspect.toFixed(3),
        //     相机边界: {
        //         left: camera.left.toFixed(2), right: camera.right.toFixed(2),
        //         bottom: camera.bottom.toFixed(2), top: camera.top.toFixed(2)
        //     }
        // });

        return {
            centerX, centerY,
            viewWidth, viewHeight
        };
    }
    validateDataBounds(dataBounds) {
        return dataBounds &&
            isFinite(dataBounds.left) && isFinite(dataBounds.right) &&
            isFinite(dataBounds.bottom) && isFinite(dataBounds.top) &&
            dataBounds.right > dataBounds.left &&
            dataBounds.top > dataBounds.bottom &&
            Math.abs(dataBounds.right - dataBounds.left) < 1e6 &&
            Math.abs(dataBounds.top - dataBounds.bottom) < 1e6;
    }
    // 重置到默认视图的方法
    resetToDefault(camera, controls = null) {
        // console.log('🔄 重置到默认视图');

        // 使用对称的默认视图
        const defaultSize = 10;
        camera.left = -defaultSize;
        camera.right = defaultSize;
        camera.bottom = -defaultSize;
        camera.top = defaultSize;
        camera.zoom = 1;
        camera.position.set(0, 0, 10);

        camera.updateProjectionMatrix();

        if (controls) {
            controls.target.set(0, 0, 0);
            controls.update();
        }

        return {
            centerX: 0, centerY: 0,
            viewWidth: defaultSize * 2, viewHeight: defaultSize * 2
        };
    }
}

/**
 * 一个辅助类，用于创建和管理一个动态的、自适应的2D网格和坐标轴刻度。
 * 它会根据摄像机的视野动态调整网格密度和刻度标签。
 */
class DynamicGrid {
    constructor(scene, camera, coordinateSystem, controls = null, windowId) {
        this.scene = scene;
        this.camera = camera;
        this.coordinateSystem = coordinateSystem;
        this.controls = controls;
        this.windowId = windowId;

        this.labelsVisible = true;
        // 修复1：添加调试信息和错误处理
        // console.log(`🔍 DynamicGrid初始化 - 窗口: ${windowId}`, {
        //     coordinateSystem: !!coordinateSystem,
        //     canvasContainer: !!coordinateSystem?.canvasContainer
        // });

        if (!coordinateSystem || !coordinateSystem.canvasContainer) {
            console.error('❌ DynamicGrid: coordinateSystem或canvasContainer为null');
            return;
        }

        // 修复2：正确的选择器路径
        // canvasContainer的父元素是plot-area，在plot-area中查找轴容器
        const plotArea = coordinateSystem.canvasContainer.parentElement;

        if (!plotArea) {
            console.error('❌ 找不到plot-area容器');
            // 创建备用容器
            this.createFallbackContainers();
        } else {
            // 使用正确的选择器
            this.xAxisContainer = plotArea.querySelector(`#x-axis-${windowId}`);
            this.yAxisContainer = plotArea.querySelector(`#y-axis-${windowId}`);

            // console.log(`📊 找到轴容器:`, {
            //     plotArea: !!plotArea,
            //     xAxis: !!this.xAxisContainer,
            //     yAxis: !!this.yAxisContainer
            // });

            // 如果找不到，创建备用容器
            if (!this.xAxisContainer || !this.yAxisContainer) {
                console.warn('⚠️ 找不到轴容器，创建备用容器');
                this.createFallbackContainers(plotArea);
            }
        }

        // 网格材质
        const material = new THREE.LineBasicMaterial({
            color: 0xcccccc,
            transparent: true,
            opacity: 0.5
        });
        // 坐标轴网格材质（更粗更明显）
        const axisMaterial = new THREE.LineBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.6,
        });

        // 网格几何体
        const geometry = new THREE.BufferGeometry();
        const axisGeometry = new THREE.BufferGeometry();    // 坐标轴网格几何体
        this.gridLines = new THREE.LineSegments(geometry, material);
        this.axisGridLines = new THREE.LineSegments(axisGeometry, axisMaterial);
        this.gridLines.frustumCulled = false;
        this.axisGridLines.frustumCulled = false;
        this.scene.add(this.gridLines);
        this.scene.add(this.axisGridLines);

        // 刻度标签管理
        this.xLabels = [];
        this.yLabels = [];

        // console.log('✅ DynamicGrid初始化完成');
    }
    // 设置刻度标签可见性
    setLabelsVisible(visible) {
        this.labelsVisible = visible;
        this.updateLabelsVisibility();
    }
    updateLabelsVisibility() {
        if (this.xAxisContainer) {
            this.xAxisContainer.style.display = this.labelsVisible ? 'block' : 'none';
        }
        if (this.yAxisContainer) {
            this.yAxisContainer.style.display = this.labelsVisible ? 'block' : 'none';
        }
    }
    // 修复3：添加备用容器创建方法
    createFallbackContainers(plotArea = null) {
        if (!plotArea) {
            // 如果找不到plotArea，在body中创建临时容器
            plotArea = document.createElement('div');
            plotArea.className = 'plot-area';
            plotArea.style.cssText = 'position: absolute; top: 0; left: 0; width: 100px; height: 100px; z-index: -1;';
            document.body.appendChild(plotArea);
        }

        if (!this.xAxisContainer) {
            this.xAxisContainer = document.createElement('div');
            this.xAxisContainer.id = `x-axis-${this.windowId}`;
            this.xAxisContainer.className = 'axis-container x-axis';
            this.xAxisContainer.style.cssText = 'position: relative; height: 30px; border-top: 1px solid #aaa;';
            plotArea.appendChild(this.xAxisContainer);
            // console.log('➕ 创建备用X轴容器');
        }

        if (!this.yAxisContainer) {
            this.yAxisContainer = document.createElement('div');
            this.yAxisContainer.id = `y-axis-${this.windowId}`;
            this.yAxisContainer.className = 'axis-container y-axis';
            this.yAxisContainer.style.cssText = 'position: relative; width: 50px; border-right: 1px solid #aaa;';
            plotArea.appendChild(this.yAxisContainer);
            // console.log('➕ 创建备用Y轴容器');
        }
    }

    update() {
        try {
            // 修复4：添加前置检查
            if (!this.xAxisContainer || !this.yAxisContainer) {
                console.warn('⚠️ 网格更新: 轴容器不存在');
                return;
            }

            if (!this.coordinateSystem || !this.camera) {
                console.warn('⚠️ 网格更新: 缺少必要组件');
                return;
            }

            const worldBounds = this.coordinateSystem.getWorldBounds(this.camera, this.controls);

            // 添加边界验证
            if (!this.validateBounds(worldBounds)) {
                console.warn('Invalid world bounds, skipping grid update');
                return;
            }

            const viewWidth = worldBounds.right - worldBounds.left;
            const viewHeight = worldBounds.top - worldBounds.bottom;

            // 确保视图范围有效
            if (viewWidth <= 0 || viewHeight <= 0 || !isFinite(viewWidth) || !isFinite(viewHeight)) {
                console.warn('Invalid view dimensions, skipping grid update');
                return;
            }

            // 动态计算扩展范围，确保完全覆盖
            const dynamicPadding = this.calculateDynamicPadding(viewWidth, viewHeight);

            const extendedBounds = {
                left: worldBounds.left - viewWidth * dynamicPadding,
                right: worldBounds.right + viewWidth * dynamicPadding,
                bottom: worldBounds.bottom - viewHeight * dynamicPadding,
                top: worldBounds.top + viewHeight * dynamicPadding
            };

            const xInterval = this.calculateNiceInterval(viewWidth);
            const yInterval = this.calculateNiceInterval(viewHeight);
            // 统一使用最小间隔，保持网格一致性
            const unifiedInterval = Math.min(xInterval, yInterval);

            const vertices = [];
            const axisVertices = []; // 专门存储坐标轴网格线
            const newXLabels = [];
            const newYLabels = [];

            // 生成X轴网格线
            const xStart = Math.floor(extendedBounds.left / unifiedInterval) * unifiedInterval;
            const xEnd = Math.ceil(extendedBounds.right / unifiedInterval) * unifiedInterval;

            for (let x = xStart; x <= xEnd; x += unifiedInterval) {
                const preciseX = this.roundToPrecision(x, 8);

                // 判断是否为坐标轴（过原点）
                const isAxisLine = Math.abs(x) < unifiedInterval * 0.1; // 容差范围内视为坐标轴

                if (isAxisLine) {
                    // 坐标轴网格线 - 添加到axisVertices
                    axisVertices.push(preciseX, extendedBounds.bottom, 0, preciseX, extendedBounds.top, 0);
                } else {
                    // 普通网格线 - 添加到vertices
                    vertices.push(preciseX, extendedBounds.bottom, 0, preciseX, extendedBounds.top, 0);
                }
                // X轴刻度标签（只在可见区域显示）
                if (x >= worldBounds.left && x <= worldBounds.right) {
                    const screenPos = this.coordinateSystem.worldToScreen(x, worldBounds.bottom, this.camera, this.controls);
                    if (screenPos.x >= 0 && screenPos.x <= this.coordinateSystem.canvasWidth) {
                        newXLabels.push({ value: x, position: screenPos.x });
                    }
                }
            }

            // 生成Y轴网格线
            const yStart = Math.floor(extendedBounds.bottom / unifiedInterval) * unifiedInterval;
            const yEnd = Math.ceil(extendedBounds.top / unifiedInterval) * unifiedInterval;

            for (let y = yStart; y <= yEnd; y += unifiedInterval) {
                const preciseY = this.roundToPrecision(y, 8);

                // 判断是否为坐标轴（过原点）
                const isAxisLine = Math.abs(y) < unifiedInterval * 0.1; // 容差范围内视为坐标轴

                if (isAxisLine) {
                    // 坐标轴网格线 - 添加到axisVertices
                    axisVertices.push(extendedBounds.left, preciseY, 0, extendedBounds.right, preciseY, 0);
                } else {
                    // 普通网格线 - 添加到vertices
                    vertices.push(extendedBounds.left, preciseY, 0, extendedBounds.right, preciseY, 0);
                }
                // Y轴刻度标签（只在可见区域显示）
                if (y >= worldBounds.bottom && y <= worldBounds.top) {
                    const screenPos = this.coordinateSystem.worldToScreen(worldBounds.left, y, this.camera, this.controls);
                    if (screenPos.y >= 0 && screenPos.y <= this.coordinateSystem.canvasHeight) {
                        newYLabels.push({ value: y, position: screenPos.y });
                    }
                }
            }

            // 更新几何体
            this.gridLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            this.gridLines.geometry.attributes.position.needsUpdate = true;
            this.axisGridLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(axisVertices, 3));
            this.axisGridLines.geometry.attributes.position.needsUpdate = true;

            // 更新标签
            this.updateAxisLabels(this.xAxisContainer, this.xLabels, newXLabels, 'x');
            this.updateAxisLabels(this.yAxisContainer, this.yLabels, newYLabels, 'y');

            // 更新标签可见性
            this.updateLabelsVisibility();

            // 如果标签不可见，清空标签
            if (!this.labelsVisible) {
                this.xLabels.forEach(label => label.remove());
                this.xLabels.length = 0;
                this.yLabels.forEach(label => label.remove());
                this.yLabels.length = 0;
                return; // 不生成新标签
            }
            // console.log(`✅ 动态网格更新: 网格线${vertices.length / 6}条, X标签${newXLabels.length}个, Y标签${newYLabels.length}个`);
        } catch (error) {
            console.error('❌ 网格更新失败:', error);
        }
    }

    // 边界验证方法
    validateBounds(bounds) {
        return bounds &&
            isFinite(bounds.left) && isFinite(bounds.right) &&
            isFinite(bounds.bottom) && isFinite(bounds.top) &&
            bounds.right > bounds.left &&
            bounds.top > bounds.bottom &&
            Math.abs(bounds.right - bounds.left) < 1e6 && // 避免过大范围
            Math.abs(bounds.top - bounds.bottom) < 1e6;
    }

    // 动态计算填充因子，根据缩放级别调整
    calculateDynamicPadding(viewWidth, viewHeight) {
        const maxDimension = Math.max(Math.abs(viewWidth), Math.abs(viewHeight));

        // 根据视图大小动态调整填充
        if (maxDimension < 0.1) return 2.0;    // 极大缩放
        if (maxDimension < 1) return 1.0;      // 大缩放
        if (maxDimension < 10) return 0.5;     // 中等缩放
        return 0.2;                            // 小缩放
    }

    calculateNiceInterval(range) {
        if (range <= 0) return 1;

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
        // 如果标签不可见，直接返回
        if (!this.labelsVisible) {
            return;
        }
        // 修复5：添加容器检查
        if (!container) {
            console.warn(`⚠️ 更新${axis.toUpperCase()}轴标签: 容器不存在`);
            return;
        }

        oldLabels.forEach(label => label.remove());
        oldLabels.length = 0;

        container.innerHTML = '';
        newLabelsData.forEach(data => {
            const label = document.createElement('div');
            label.className = `axis-label-${axis}`;

            // 智能格式化显示值
            let displayValue = data.value;
            if (Math.abs(displayValue) < 0.001) displayValue = 0;
            label.innerText = displayValue.toFixed(2);

            container.appendChild(label);

            if (axis === 'x') {
                label.style.left = `${data.position}px`;
                label.style.transform = 'translateX(-50%)'; // 居中显示
            } else {
                label.style.top = `${data.position}px`;
                label.style.transform = 'translateY(-50%)'; // 居中显示
            }

            oldLabels.push(label);
        });
    }

    forceUpdate() {
        this.updateLabelsVisibility();
        this.update();
    }

    // 修复6：添加销毁方法
    destroy() {
        // console.log(`🧹 销毁动态网格: ${this.windowId}`);

        if (this.gridLines) {
            // 先从场景中移除
            if (this.scene && this.gridLines.parent) {
                this.scene.remove(this.gridLines);
            }

            // 然后清理几何体和材质
            if (this.gridLines.geometry) {
                this.gridLines.geometry.dispose();
            }
            if (this.gridLines.material) {
                this.gridLines.material.dispose();
            }
            this.gridLines = null;
        }
        // 清理坐标轴网格
        if (this.axisGridLines) {
            if (this.scene && this.axisGridLines.parent) {
                this.scene.remove(this.axisGridLines);
            }
            if (this.axisGridLines.geometry) {
                this.axisGridLines.geometry.dispose();
            }
            if (this.axisGridLines.material) {
                this.axisGridLines.material.dispose();
            }
            this.axisGridLines = null;
        }

        // 清理标签
        if (this.xLabels) {
            this.xLabels.forEach(label => label.remove());
            this.xLabels = [];
        }
        if (this.yLabels) {
            this.yLabels.forEach(label => label.remove());
            this.yLabels = [];
        }

        // 清理容器引用
        this.xAxisContainer = null;
        this.yAxisContainer = null;
        this.scene = null;
        this.camera = null;
        this.coordinateSystem = null;
        this.controls = null;

        // console.log(`✅ 动态网格销毁完成: ${this.windowId}`);
    }
}

/**
 * Manages the MATLAB-style 2D plot.
 */
class Plotter2D extends BasePlotter {
    constructor(container, windowId) {
        super(container, windowId);
        this.type = '2D';
        this.windowId = windowId;
        this.isDynamicFitEnabled = false;
        this.lastSceneHash = '';
        this.dynamicFitPadding = 0.1;

        // 使用窗口ID查找UI元素
        this.titleEl = container.querySelector(`#title-${windowId}`);
        this.canvasContainer = container.querySelector(`#canvas-${windowId}`);
        this.xAxisContainer = container.querySelector(`#x-axis-${windowId}`);
        this.yAxisContainer = container.querySelector(`#y-axis-${windowId}`);
        this.resetBtn = container.querySelector(`#reset-view-${windowId}`);
        this.dynamicFitToggle = container.querySelector(`#dynamic-fit-${windowId}`);
        this.tooltipEl = container.querySelector(`#tooltip-${windowId}`);
        this.crosshairX = container.querySelector(`#crosshair-x-${windowId}`);
        this.crosshairY = container.querySelector(`#crosshair-y-${windowId}`);
        this.legendContainer = container.querySelector(`#legend-${windowId}`);
        this.legendElements = new Map();

        // 默认隐藏十字光标和工具提示
        this.crosshairX.style.display = 'none';
        this.crosshairY.style.display = 'none';
        this.tooltipEl.style.display = 'none';

        // 初始化坐标系统
        this.coordinateSystem = new CoordinateSystem(this.canvasContainer);

        // Three.js 场景设置
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xffffff);

        const aspect = this.coordinateSystem.canvasWidth / this.coordinateSystem.canvasHeight;
        const viewSize = 10;
        this.camera = new THREE.OrthographicCamera(
            -viewSize * aspect,  // left
            viewSize * aspect,   // right
            viewSize,            // top
            -viewSize,           // bottom
            -10, 10
        );
        this.camera.zoom = 1;
        this.camera.updateProjectionMatrix();

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(this.coordinateSystem.canvasWidth, this.coordinateSystem.canvasHeight);
        this.canvasContainer.appendChild(this.renderer.domElement);

        // OrbitControls配置
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableRotate = false;
        this.controls.screenSpacePanning = true;
        this.controls.enableDamping = false;
        this.controls.mouseButtons = {
            LEFT: THREE.MOUSE.PAN,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN
        };
        this.controls.minZoom = 0.05;
        this.controls.maxZoom = 50;
        this.controls.zoomSpeed = 1.0;
        this.controls.target.set(0, 0, 0);
        this.controls.update();

        this.dynamicGrid = new DynamicGrid(this.scene, this.camera, this.coordinateSystem, this.controls);

        // 事件监听
        this.controls.addEventListener('change', this.onControlsChange);
        this.lastMousePosition = { x: 0, y: 0 };

        this.resetBtn.addEventListener('click', this.resetView);
        this.dynamicFitToggle.addEventListener('change', this.onDynamicFitChange);
        this.canvasContainer.addEventListener('mousemove', this.onMouseMove);
        this.canvasContainer.addEventListener('mouseenter', this.onMouseEnter);
        this.canvasContainer.addEventListener('mouseleave', this.onMouseLeave);

        this.lastControlState = {
            target: new THREE.Vector3(),
            zoom: this.camera.zoom
        };

        this.animate();
    }
    // 统一的控制器变化处理
    onControlsChange = () => {
        this.camera.updateProjectionMatrix();

        // 强制更新网格
        if (this.dynamicGrid && !this.isDynamicFitEnabled) {
            this.dynamicGrid.update();
        }

        // 缩放时也更新十字光标坐标
        this.updateCrosshairCoordinates(this.lastMousePosition.x, this.lastMousePosition.y);
    }

    // 提取坐标更新逻辑到单独方法
    updateCrosshairCoordinates(mouseX, mouseY) {
        if (!this.crosshairX || !this.crosshairY || !this.tooltipEl) return;

        this.crosshairX.style.top = `${mouseY}px`;
        this.crosshairY.style.left = `${mouseX}px`;

        const worldCoords = this.coordinateSystem.screenToWorld(mouseX, mouseY, this.camera, this.controls);

        // this.tooltipEl.style.display = 'block';
        this.tooltipEl.style.left = `${mouseX + 15}px`;
        this.tooltipEl.style.top = `${mouseY + 15}px`;
        this.tooltipEl.innerText = `X: ${worldCoords.x.toFixed(2)}, Y: ${worldCoords.y.toFixed(2)}`;
    }

    // 重写 animate 方法以加入动态适应逻辑
    animate = () => {
        this.animationFrameId = requestAnimationFrame(this.animate);

        // 1. 动态适应逻辑（如果需要）
        if (this.isDynamicFitEnabled) {
            this.handleDynamicFit();
        } else {
            // 标准用户控制模式
            this.controls.update();
        }
        // 2. 更新动态网格
        if (this.dynamicGrid) {
            this.dynamicGrid.update();
        }
        // 3. 渲染场景
        this.renderer.render(this.scene, this.camera);
    };

    /**
     * 处理动态适应的核心逻辑
     */
    handleDynamicFit = () => {
        // 检查场景是否有变化
        const currentSceneHash = this.calculateSceneHash();

        if (currentSceneHash !== this.lastSceneHash) {
            // console.log('🔄 检测到场景变化，执行动态适应');
            this.executeDynamicFit();
            this.lastSceneHash = currentSceneHash;
        }

        // 即使没有场景变化，也定期检查（防止漏检）
        const now = Date.now();
        if (!this.lastPeriodicCheck || now - this.lastPeriodicCheck > 10) {
            this.executeDynamicFit(); // 强制执行适应
            this.lastPeriodicCheck = now;
        }
    };
    /**
     * 计算场景哈希值，用于检测变化
     */
    calculateSceneHash = () => {
        if (this.sceneObjects.size === 0) {
            return 'empty';
        }

        let hash = '';
        this.sceneObjects.forEach((obj, id) => {
            // 基于对象ID和位置计算简单哈希
            if (obj.position) {
                hash += `${id}_${obj.position.x.toFixed(2)}_${obj.position.y.toFixed(2)}_`;
            }
            // 如果是组对象，检查子对象
            if (obj.children && obj.children.length > 0) {
                obj.children.forEach(child => {
                    if (child.position) {
                        hash += `child_${child.position.x.toFixed(2)}_${child.position.y.toFixed(2)}_`;
                    }
                });
            }
        });

        return hash || 'no_changes';
    };
    /**
     * 执行动态适应（优化版本）
     */
    executeDynamicFit = () => {
        if (this.sceneObjects.size === 0) {
            this.resetToDefaultView();
            return;
        }

        try {
            const sceneBBox = this.calculateAccurateBoundingBox();
            if (!sceneBBox || sceneBBox.isEmpty()) {
                this.resetToDefaultView();
                return;
            }

            const dataBounds = {
                left: sceneBBox.min.x,
                right: sceneBBox.max.x,
                bottom: sceneBBox.min.y,
                top: sceneBBox.max.y
            };

            // 只在边界变化较大时才重新适应
            if (this.shouldRefit(dataBounds)) {
                this.coordinateSystem.fitToData(dataBounds, this.camera, this.controls, this.dynamicFitPadding);
                this.lastDataBounds = dataBounds;

                // 立即更新渲染
                this.camera.updateProjectionMatrix();
                if (this.dynamicGrid) {
                    this.dynamicGrid.update();
                }
            }

        } catch (error) {
            console.error('动态适应执行失败:', error);
        }
    };
    /**
     * 判断是否需要重新适应（避免频繁调整）
     */
    shouldRefit = (newBounds) => {
        // return true;
        if (!this.lastDataBounds) return true;

        // 计算边界变化程度
        const widthChange = Math.abs((newBounds.right - newBounds.left) -
            (this.lastDataBounds.right - this.lastDataBounds.left));
        const heightChange = Math.abs((newBounds.top - newBounds.bottom) -
            (this.lastDataBounds.top - this.lastDataBounds.bottom));

        const centerXChange = Math.abs(((newBounds.left + newBounds.right) / 2) -
            ((this.lastDataBounds.left + this.lastDataBounds.right) / 2));
        const centerYChange = Math.abs(((newBounds.bottom + newBounds.top) / 2) -
            ((this.lastDataBounds.bottom + this.lastDataBounds.top) / 2));

        // 只有变化超过阈值时才重新适应
        const threshold = 0.01; // 1%的变化阈值
        const maxDimension = Math.max(
            this.lastDataBounds.right - this.lastDataBounds.left,
            this.lastDataBounds.top - this.lastDataBounds.bottom,
            1.0 // 避免除零
        );

        return (widthChange > maxDimension * threshold ||
            heightChange > maxDimension * threshold ||
            centerXChange > maxDimension * threshold ||
            centerYChange > maxDimension * threshold);
    };
    /**
     * 动态适应开关处理
     */
    onDynamicFitChange = (event) => {
        this.isDynamicFitEnabled = event.target.checked;
        this.controls.enabled = !this.isDynamicFitEnabled;

        if (this.isDynamicFitEnabled) {
            // console.log('✅ 开启动态适应模式');
            // 立即执行一次适应并重置状态
            this.lastSceneHash = '';
            this.lastDataBounds = null;
            setTimeout(() => {
                this.executeDynamicFit();
            }, 50);
        } else {
            // console.log('❌ 关闭动态适应模式');
        }
    };

    /**
     * 适应视图到数据（用于手动调用）
     */
    fitViewToData = (padding = 0.1) => {
        // console.log('🎯 手动执行适应视图到数据（保持等比例）');
        this.dynamicFitPadding = padding; // 更新填充值

        // 临时禁用动态适应避免循环
        const wasEnabled = this.isDynamicFitEnabled;
        this.isDynamicFitEnabled = false;

        try {
            if (this.sceneObjects.size === 0) {
                // console.log('又检测到没有图元对象，重置默认视角');
                this.resetToDefaultView();
                return;
            }

            const sceneBBox = this.calculateAccurateBoundingBox();
            if (!sceneBBox || sceneBBox.isEmpty()) {
                console.warn('获取不到场景边界，重置默认视角');
                this.resetToDefaultView();
                return;
            }

            const dataBounds = {
                left: sceneBBox.min.x,
                right: sceneBBox.max.x,
                bottom: sceneBBox.min.y,
                top: sceneBBox.max.y
            };

            // 计算数据范围
            const { left, right, bottom, top } = dataBounds;
            const dataWidth = right - left;
            const dataHeight = top - bottom;
            // 如果数据范围无效，使用默认适应
            if (dataWidth === 0 || dataHeight === 0) {
                this.coordinateSystem.fitToData(dataBounds, this.camera, this.controls, padding);
                return;
            }
            // 计算画布宽高比和数据宽高比
            const canvasAspect = this.coordinateSystem.canvasWidth / this.coordinateSystem.canvasHeight;
            const dataAspect = dataWidth / dataHeight;
            // console.log('📐 画布比例:', canvasAspect.toFixed(3), '数据比例:', dataAspect.toFixed(3));
            // 添加padding
            const paddedWidth = dataWidth * (1 + padding);
            const paddedHeight = dataHeight * (1 + padding);

            // 计算中心点
            const centerX = (left + right) / 2;
            const centerY = (bottom + top) / 2;

            let viewWidth, viewHeight;

            // 根据宽高比决定适应策略
            if (dataAspect > canvasAspect) {
                // 数据比画布"宽"，以宽度为准保持比例
                viewWidth = paddedWidth;
                viewHeight = viewWidth / canvasAspect;
            } else {
                // 数据比画布"高"，以高度为准保持比例
                viewHeight = paddedHeight;
                viewWidth = viewHeight * canvasAspect;
            }

            // 确保适应后的范围至少包含原始数据范围（考虑padding）
            if (viewHeight < paddedHeight) {
                viewHeight = paddedHeight;
                viewWidth = viewHeight * canvasAspect;
            }
            if (viewWidth < paddedWidth) {
                viewWidth = paddedWidth;
                viewHeight = viewWidth / canvasAspect;
            }

            // 构建保持比例的新边界
            const proportionalBounds = {
                left: centerX - viewWidth / 2,
                right: centerX + viewWidth / 2,
                bottom: centerY - viewHeight / 2,
                top: centerY + viewHeight / 2
            };

            // 使用新的边界进行适应（padding设为0，因为已经在计算中考虑了）
            this.coordinateSystem.fitToData(proportionalBounds, this.camera, this.controls, 0);
            this.forceImmediateRender();

        } catch (error) {
            console.error('适应数据失败:', error);
            this.resetToDefaultView();
        } finally {
            // 恢复状态
            this.isDynamicFitEnabled = wasEnabled;
        }
    };
    /**
     * 精确计算边界框
     */
    calculateAccurateBoundingBox() {
        const bbox = new THREE.Box3();
        let hasValidGeometry = false;

        this.sceneObjects.forEach((obj) => {
            try {
                const objBBox = new THREE.Box3().setFromObject(obj);
                if (!objBBox.isEmpty()) {
                    bbox.union(objBBox);
                    hasValidGeometry = true;
                }
            } catch (error) {
                console.error('边界框计算失败:', error);
            }
        });

        return hasValidGeometry ? bbox : null;
    }

    /**
    * 重置视角方法
    */
    resetView = () => {
        // console.log('🔁 用户点击重置视角，当前对象数量:', this.sceneObjects.size);

        // 禁用动态适应
        this.isDynamicFitEnabled = false;
        if (this.dynamicFitToggle) {
            this.dynamicFitToggle.checked = false;
        }


        if (this.sceneObjects.size === 0) {
            // console.log('📭 没有图元对象，重置到默认视图');
            this.resetToDefaultView();
        } else {
            // 使用较小的padding确保图元完全可见
            // console.log('🎯 有图元对象，执行适应视图');
            this.fitViewToData(0.05);
        }

        this.forceImmediateRender();
    };
    /**
    * 重置到默认视图
    */
    resetToDefaultView = () => {
        // console.log('🏠 重置到默认视图');
        this.coordinateSystem.resetToDefault(this.camera, this.controls);
        this.forceImmediateRender();
    };
    /**
     * 强制立即渲染
     */
    forceImmediateRender = () => {
        // 更新网格
        if (this.dynamicGrid && typeof this.dynamicGrid.update === 'function') {
            this.dynamicGrid.update();
        }

        // 更新相机
        this.camera.updateProjectionMatrix();

        // 立即渲染（不等待动画循环）
        this.renderer.render(this.scene, this.camera);

        // console.log('🖼️ 立即渲染完成');
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
    onMouseEnter = (event) => {
        // 鼠标进入时，显示十字光标和工具提示
        this.crosshairX.style.display = 'block';
        this.crosshairY.style.display = 'block';
        this.tooltipEl.style.display = 'block';
        // 立即更新一次位置
        this.onMouseMove(event);
    };
    onMouseLeave = () => {
        this.crosshairX.style.display = 'none';
        this.crosshairY.style.display = 'none';
        this.tooltipEl.style.display = 'none';
    };
    /**
    * 窗口大小变化处理
    */
    onWindowResize = () => {
        this.coordinateSystem.updateCanvasSize();
        const width = this.coordinateSystem.canvasWidth;
        const height = this.coordinateSystem.canvasHeight;

        // 更新渲染器尺寸
        this.renderer.setSize(width, height);
        // 更新相机比例
        const aspect = width / height;
        this.camera.left = -this.camera.top * aspect;
        this.camera.right = this.camera.top * aspect;
        this.camera.updateProjectionMatrix();

        if (this.isDynamicFitEnabled) {
            // 延迟执行避免频繁调整
            clearTimeout(this.resizeTimeout);
            this.resizeTimeout = setTimeout(() => {
                this.fitViewToData();
            }, 250);
        } else {
            this.camera.updateProjectionMatrix();
        }

        this.forceImmediateRender();
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
                    this.updateLegend(cmd.getId(), cmd);
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
                this.dynamicGrid.gridLines.visible = command.getSetGridVisible().getVisible();
                break;
            case proto.visualization.Command2D.CommandTypeCase.SET_AXES_VISIBLE:
                const axesVisible = command.getSetAxesVisible().getVisible();
                if (this.dynamicGrid) {
                    this.dynamicGrid.setLabelsVisible(axesVisible);
                }
                break;
            case proto.visualization.Command2D.CommandTypeCase.SET_AXIS_PROPERTIES: {
                const props = command.getSetAxisProperties();
                this.dynamicFitToggle.checked = false;
                this.isDynamicFitEnabled = false;
                this.controls.enabled = true;

                const dataBounds = {
                    left: props.getXMin(),
                    right: props.getXMax(),
                    bottom: props.getYMin(),
                    top: props.getYMax()
                };

                // 传递controls参数
                this.coordinateSystem.fitToData(dataBounds, this.camera, this.controls);

                // 强制更新网格
                if (this.dynamicGrid) {
                    this.dynamicGrid.forceUpdate();
                }
                break;
            }
            case proto.visualization.Command2D.CommandTypeCase.SET_TITLE:
                if (this.titleEl) {
                    this.titleEl.innerText = command.getSetTitle().getTitle();
                }
                break;
            case proto.visualization.Command2D.CommandTypeCase.CREATE_WINDOW:
                // 窗口创建命令已经在AppManager中处理，这里可以记录日志
                // console.log("✅ 2D窗口创建命令已处理:", this.windowId);
                break;
            case proto.visualization.Command2D.CommandTypeCase.DELETE_WINDOW:
                // 删除窗口命令在AppManager级别处理，这里可以记录日志
                // console.log("🔄 2D窗口收到删除命令，准备销毁:", this.windowId);
                break;
            default:
                console.warn("⚠️ 未知的2D命令类型:", commandType);
        }
    }

    onDisconnect() {
        super.onDisconnect();
        this.titleEl.innerText = this.titleEl.innerText + " (连接已断开)";
        this.dynamicFitToggle.disabled = true;
        // 关键修复：无论之前状态如何，断开连接时必须重新启用用户控制器
        this.isDynamicFitEnabled = false;
        this.controls.enabled = true;
    }
    _getProtoColor(protoColor, defaultAlpha = 1.0) {
        if (!protoColor) {
            // 提供一个安全的默认值
            return { hex: '#888888', rgba: 'rgba(136, 136, 136, 1.0)', alpha: 1.0 };
        }

        const r = (protoColor.getR() * 255).toFixed(0);
        const g = (protoColor.getG() * 255).toFixed(0);
        const b = (protoColor.getB() * 255).toFixed(0);

        // 检查 protoColor 对象上是否存在 getA 方法
        const alpha = (typeof protoColor.getA === 'function') ? protoColor.getA() : defaultAlpha;

        const hex = new THREE.Color(protoColor.getR(), protoColor.getG(), protoColor.getB()).getHexString();

        return {
            hex: `#${hex}`,
            rgba: `rgba(${r}, ${g}, ${b}, ${alpha})`,
            alpha: alpha
        };
    }
    updateLegend(id, cmd) {
        console.log(`🧹 更新2D图例 id: ${id} `);

        // 1. 获取数据
        const material = cmd ? cmd.getMaterial() : null;
        const legendText = material ? material.getLegend() : null;

        // 2. 处理删除 (或没有图例文字的对象)
        if (!cmd || !legendText) {
            if (this.legendElements.has(id)) {
                this.legendElements.get(id).element.remove(); // 从DOM移除
                this.legendElements.delete(id); // 从Map移除
            }
            return; // 完成删除，退出
        }

        // 3. 处理添加/更新
        let legendItemData = this.legendElements.get(id);

        if (!legendItemData) {
            // 如果是新图例
            const element = document.createElement('div');
            element.className = 'legend-item';
            element.addEventListener('click', () => this.onLegendClick(id));

            // 存储元素和用于排序的文本
            legendItemData = { element: element, text: legendText };
            this.legendElements.set(id, legendItemData);
        } else {
            // 如果是更新，只需更新排序文本
            legendItemData.text = legendText;
        }

        // 4. 更新 DOM 元素的内容 (您原有的SVG图标逻辑)
        // [ --- 您原有的SVG图标生成逻辑开始 --- ]
        const geomType = cmd.getGeometryDataCase();
        const primaryColor = this._getProtoColor(material.getColor());
        let fillColor = 'none';
        let strokeColor = primaryColor.hex;

        if (material.getFilled()) {
            const fillProto = (material.hasFillColor && material.hasFillColor())
                ? material.getFillColor()
                : material.getColor();
            const defaultAlpha = (material.hasFillColor && material.hasFillColor()) ? 1.0 : 0.5;
            const fill = this._getProtoColor(fillProto, defaultAlpha);
            fillColor = fill.rgba;
        }
        let strokeDasharray = '';
        if (material.getLineStyle && material.getLineStyle() === proto.visualization.Material.LineStyle.DASHED) {
            strokeDasharray = '3 2'; // SVG的虚线样式
        }
        let iconHtml = `<svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" class="legend-icon">`;
        switch (geomType) {
            case proto.visualization.Add2DObject.GeometryDataCase.LINE_2D:
            case proto.visualization.Add2DObject.GeometryDataCase.TRAJECTORY_2D:
                iconHtml += `<line x1="2" y1="10" x2="18" y2="10" 
                                  stroke="${strokeColor}" 
                                  stroke-width="2" 
                                  stroke-dasharray="${strokeDasharray}" />`;
                break;

            case proto.visualization.Add2DObject.GeometryDataCase.POLYGON:
                iconHtml += `<polygon points="10,2 18,8 15,18 5,18 2,8"
                                  fill="${fillColor}" 
                                  stroke="${strokeColor}" 
                                  stroke-width="2" 
                                  stroke-dasharray="${strokeDasharray}" />`;
                break;
            case proto.visualization.Add2DObject.GeometryDataCase.BOX_2D:
                iconHtml += `<rect x="3" y="3" width="14" height="14" 
                                  fill="${fillColor}" 
                                  stroke="${strokeColor}" 
                                  stroke-width="2" 
                                  stroke-dasharray="${strokeDasharray}" />`;
                break;

            case proto.visualization.Add2DObject.GeometryDataCase.CIRCLE:
                iconHtml += `<circle cx="10" cy="10" r="7" 
                                  fill="${fillColor}" 
                                  stroke="${strokeColor}" 
                                  stroke-width="2" 
                                  stroke-dasharray="${strokeDasharray}" />`;
                break;

            case proto.visualization.Add2DObject.GeometryDataCase.POSE_2D:
                iconHtml += `<path d="M 2 10 L 18 10 M 12 5 L 18 10 L 12 15" 
                                  fill="none" 
                                  stroke="${strokeColor}" 
                                  stroke-width="2" />`;
                break;

            case proto.visualization.Add2DObject.GeometryDataCase.POINT_2D:
                const pointShape = material.getPointShape();
                switch (pointShape) {
                    case proto.visualization.Material.PointShape.CROSS:
                        iconHtml += `<path d="M 4 4 L 16 16 M 16 4 L 4 16" 
                                          fill="none" 
                                          stroke="${strokeColor}" 
                                          stroke-width="2" />`;
                        break;
                    case proto.visualization.Material.PointShape.DIAMOND:
                        iconHtml += `<path d="M 10 2 L 18 10 L 10 18 L 2 10 Z" 
                                          fill="${strokeColor}" />`;
                        break;
                    case proto.visualization.Material.PointShape.SQUARE:
                        iconHtml += `<rect x="4" y="4" width="12" height="12" 
                                          fill="${strokeColor}" />`;
                        break;
                    case proto.visualization.Material.PointShape.CIRCLE:
                    default:
                        iconHtml += `<circle cx="10" cy="10" r="6" 
                                          fill="${strokeColor}" />`;
                        break;
                }
                break;

            default:
                iconHtml += `<rect x="3" y="3" width="14" height="14" fill="${primaryColor.hex}" />`;
        }
        iconHtml += `</svg>`;
        // [ --- 您原有的SVG图标生成逻辑结束 --- ]

        legendItemData.element.innerHTML = `
            ${iconHtml}
             <span class="legend-label">${legendText}</span>
        `;


        // 5. 【修复】按图例文字排序并重新追加到DOM

        // 从Map中获取所有图例项
        const itemsArray = Array.from(this.legendElements.values());

        // 关键：按 'text' 属性进行字符串增序排列
        itemsArray.sort((a, b) => a.text.localeCompare(b.text));

        // 按照排好序的数组，依次将DOM元素追加到容器末尾
        itemsArray.forEach(itemData => {
            this.legendContainer.appendChild(itemData.element);
        });
    }
    destroy() {
        console.log(`🧹 开始销毁2D Plotter: ${this.windowId}`);

        // 先停止所有可能的事件和动画
        if (this.resizeTimeout) {
            clearTimeout(this.resizeTimeout);
            this.resizeTimeout = null;
        }

        // 移除DOM事件监听器
        if (this.resetBtn) {
            this.resetBtn.removeEventListener('click', this.resetView);
            this.resetBtn = null;
        }
        if (this.dynamicFitToggle) {
            this.dynamicFitToggle.removeEventListener('change', this.onDynamicFitChange);
            this.dynamicFitToggle = null;
        }
        if (this.canvasContainer) {
            this.canvasContainer.removeEventListener('mousemove', this.onMouseMove);
            this.canvasContainer.removeEventListener('mouseleave', this.onMouseLeave);
            this.canvasContainer = null;
        }

        // 移除控制器事件
        if (this.controls) {
            this.controls.removeEventListener('change', this.onControlsChange);
        }

        // 销毁动态网格
        if (this.dynamicGrid) {
            this.dynamicGrid.destroy();
            this.dynamicGrid = null;
        }

        // 清理坐标系统
        this.coordinateSystem = null;

        // 清理UI元素引用
        this.titleEl = null;
        this.xAxisContainer = null;
        this.yAxisContainer = null;
        this.tooltipEl = null;
        this.crosshairX = null;
        this.crosshairY = null;
        this.legendContainer = null;
        this.legendElements.clear();

        // 最后调用父类销毁方法
        super.destroy();

        console.log(`✅ 2D Plotter销毁完成: ${this.windowId}`);
    }
}
// 一个辅助对象，用于创建和缓存点的纹理
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
        console.log('3D几何数据类型检查：', {
            case: data,
            hasPoint2D: cmd.hasPoint2d(),
            hasPose2D: cmd.hasPose2d(),
            hasCircle: cmd.hasCircle(),
            hasBox2D: cmd.hasBox2d(),
            hasLine2D: cmd.hasLine2d(),
            hasPolygon: cmd.hasPolygon(),
            hasPoint3D: cmd.hasPose3d(),
            hasPose3D: cmd.hasPose3d(),
            hasBall: cmd.hasBall(),
            hasBox3D: cmd.hasBox3d()
        });
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
            // 添加对2D图元的特殊处理
            case proto.visualization.Add3DObject.GeometryDataCase.POINT_2D: {
                const geom = cmd.getPoint2d();
                const geometry = new THREE.BufferGeometry();
                const pos = geom.getPosition();
                // 在Z=0平面显示，但设置不同的渲染属性
                geometry.setAttribute('position', new THREE.BufferAttribute(
                    new Float32Array([pos.getX(), pos.getY(), 0]), 3));

                const material = this.createBasicPointsMaterial(mat);
                material.depthTest = false; // 禁用深度测试，确保显示在最前面
                material.sizeAttenuation = false; // 固定大小

                obj = new THREE.Points(geometry, material);
                obj.renderOrder = 999; // 设置高渲染顺序
                // console.log(`📍 创建3D窗口中的2D点: (${pos.getX()}, ${pos.getY()}, 0)`);
                break;
            }
            case proto.visualization.Add3DObject.GeometryDataCase.LINE_2D: {
                const geom = cmd.getLine2d();
                const points = geom.getPointsList().map(p =>
                    new THREE.Vector3(p.getPosition().getX(), p.getPosition().getY(), 0));

                const geometry = new THREE.BufferGeometry().setFromPoints(points);
                const material = this.createLineMaterial(mat);
                material.depthTest = false; // 禁用深度测试
                material.transparent = true;
                material.opacity = 0.8;

                obj = new THREE.Line(geometry, material);
                obj.renderOrder = 998; // 设置高渲染顺序

                // console.log(`📏 创建3D窗口中的2D线，点数: ${points.length}`);
                break;
            }
            case proto.visualization.Add3DObject.GeometryDataCase.POSE_2D: {
                const geom = cmd.getPose2d();
                const pos = geom.getPosition();
                const angle = geom.getTheta();

                // 创建2D姿态（箭头+点）
                const group = new THREE.Group();

                // 箭头表示方向
                const arrowColor = new THREE.Color(
                    mat.getColor().getR(),
                    mat.getColor().getG(),
                    mat.getColor().getB()
                );
                const arrowDirection = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
                const arrowHelper = new THREE.ArrowHelper(
                    arrowDirection,
                    new THREE.Vector3(0, 0, 0),
                    0.5,
                    arrowColor.getHex(),
                    0.1,
                    0.05
                );

                // 点表示位置
                const pointGeometry = new THREE.BufferGeometry();
                pointGeometry.setAttribute('position', new THREE.BufferAttribute(
                    new Float32Array([0, 0, 0]), 3));
                const pointMaterial = this.createBasicPointsMaterial(mat);
                pointMaterial.depthTest = false;
                const point = new THREE.Points(pointGeometry, pointMaterial);

                group.add(arrowHelper);
                group.add(point);
                group.position.set(pos.getX(), pos.getY(), 0);

                obj = group;
                obj.renderOrder = 997;
                // console.log(`🎯 创建2D姿态: 位置(${pos.getX()}, ${pos.getY()}), 角度: ${angle}`);
                break;
            }
            case proto.visualization.Add3DObject.GeometryDataCase.CIRCLE: {
                const geom = cmd.getCircle();
                const center = geom.getCenter();
                const radius = geom.getRadius();

                // 创建圆形几何体
                const curve = new THREE.EllipseCurve(
                    center.getX(), center.getY(),  // 中心X, Y
                    radius, radius,                // x半径, y半径
                    0, 2 * Math.PI,                // 起始角, 结束角
                    false, 0                       // 顺时针, 旋转角
                );

                const points = curve.getPoints(50); // 50个点使圆形光滑
                const vertices = points.map(p => new THREE.Vector3(p.x, p.y, 0));
                const geometry = new THREE.BufferGeometry().setFromPoints(vertices);

                const material = this.createLineMaterial(mat);
                material.depthTest = false;
                material.transparent = true;
                material.opacity = 0.8;

                obj = new THREE.Line(geometry, material);
                obj.renderOrder = 996;
                // console.log(`⭕ 创建圆形: 中心(${center.getX()}, ${center.getY()}), 半径: ${radius}`);
                break;
            }
            case proto.visualization.Add3DObject.GeometryDataCase.BOX_2D: {
                const geom = cmd.getBox2d();
                const center = geom.getCenter().getPosition();
                const theta = geom.getCenter().getTheta();
                const w = geom.getWidth();
                const lf = geom.getLengthFront();
                const lr = geom.getLengthRear();

                // 计算矩形的四个角点（在局部坐标系）
                const localCorners = [
                    new THREE.Vector2(-lr, w / 2),
                    new THREE.Vector2(lf, w / 2),
                    new THREE.Vector2(lf, -w / 2),
                    new THREE.Vector2(-lr, -w / 2)
                ];

                // 旋转并平移角点
                const worldCorners = localCorners.map(corner => {
                    const rotated = new THREE.Vector2(
                        corner.x * Math.cos(theta) - corner.y * Math.sin(theta),
                        corner.x * Math.sin(theta) + corner.y * Math.cos(theta)
                    );
                    return new THREE.Vector3(
                        rotated.x + center.getX(),
                        rotated.y + center.getY(),
                        0
                    );
                });

                // 闭合矩形（添加第一个点到最后）
                const closedCorners = [...worldCorners, worldCorners[0]];
                const geometry = new THREE.BufferGeometry().setFromPoints(closedCorners);

                const material = this.createLineMaterial(mat);
                material.depthTest = false;
                material.transparent = true;
                material.opacity = 0.8;

                obj = new THREE.Line(geometry, material);
                obj.renderOrder = 995;
                // console.log(`📦 创建2D矩形: 中心(${center.getX()}, ${center.getY()}), 角度: ${theta}, 尺寸: ${w}x${lf + lr}`);
                break;
            }
            case proto.visualization.Add3DObject.GeometryDataCase.POLYGON: {
                const geom = cmd.getPolygon();
                const vertices = geom.getVerticesList().map(p =>
                    new THREE.Vector3(p.getPosition().getX(), p.getPosition().getY(), 0));

                const geometry = new THREE.BufferGeometry().setFromPoints(vertices);
                const material = this.createLineMaterial(mat);
                material.depthTest = false;
                material.transparent = true;
                material.opacity = 0.8;

                obj = new THREE.LineLoop(geometry, material);
                obj.renderOrder = 994;
                // console.log(`🔺 创建多边形，顶点数: ${vertices.length}`);
                break;
            }
            default: {
                console.warn("❓ 未知的3D几何类型:", data);
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
            // 添加2D图元更新
            case proto.visualization.Update3DObjectGeometry.GeometryDataCase.POINT_2D: {
                const pos = cmd.getPoint2d().getPosition();
                if (obj.geometry && obj.geometry.attributes.position) {
                    obj.geometry.attributes.position.setXYZ(0, pos.getX(), pos.getY(), 0);
                    obj.geometry.attributes.position.needsUpdate = true;
                    // console.log(`📍 更新2D点位置: (${pos.getX()}, ${pos.getY()})`);
                }
                break;
            }
            case proto.visualization.Update3DObjectGeometry.GeometryDataCase.LINE_2D: {
                const geom = cmd.getLine2d();
                const points = geom.getPointsList().map(p =>
                    new THREE.Vector3(p.getPosition().getX(), p.getPosition().getY(), 0));

                // 创建新的几何体
                const newGeometry = new THREE.BufferGeometry().setFromPoints(points);

                // 保持原有材质
                const oldMaterial = obj.material;

                // 替换几何体
                obj.geometry.dispose();
                obj.geometry = newGeometry;

                // console.log(`📏 更新2D线，新点数: ${points.length}`);
                break;
            }
            case proto.visualization.Update3DObjectGeometry.GeometryDataCase.POSE_2D: {
                const geom = cmd.getPose2d();
                const pos = geom.getPosition();
                const angle = geom.getTheta();

                if (obj.isGroup) {
                    // 更新组的位置
                    obj.position.set(pos.getX(), pos.getY(), 0);

                    // 更新箭头的方向
                    const arrowHelper = obj.children.find(child => child.isArrowHelper);
                    if (arrowHelper) {
                        const newDirection = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
                        arrowHelper.setDirection(newDirection);
                    }
                }
                // console.log(`🎯 更新2D姿态: 位置(${pos.getX()}, ${pos.getY()}), 角度: ${angle}`);
                break;
            }
            case proto.visualization.Update3DObjectGeometry.GeometryDataCase.CIRCLE: {
                const geom = cmd.getCircle();
                const center = geom.getCenter();
                const radius = geom.getRadius();

                // 重新创建圆形几何体
                const curve = new THREE.EllipseCurve(
                    center.getX(), center.getY(),
                    radius, radius,
                    0, 2 * Math.PI,
                    false, 0
                );

                const points = curve.getPoints(50);
                const vertices = points.map(p => new THREE.Vector3(p.x, p.y, 0));
                const newGeometry = new THREE.BufferGeometry().setFromPoints(vertices);

                // 保持原有材质
                const oldMaterial = obj.material;
                obj.geometry.dispose();
                obj.geometry = newGeometry;

                // console.log(`⭕ 更新圆形: 中心(${center.getX()}, ${center.getY()}), 半径: ${radius}`);
                break;
            }
            case proto.visualization.Update3DObjectGeometry.GeometryDataCase.BOX_2D: {
                const geom = cmd.getBox2d();
                const center = geom.getCenter().getPosition();
                const theta = geom.getCenter().getTheta();
                const w = geom.getWidth();
                const lf = geom.getLengthFront();
                const lr = geom.getLengthRear();

                // 重新计算矩形角点
                const localCorners = [
                    new THREE.Vector2(-lr, w / 2),
                    new THREE.Vector2(lf, w / 2),
                    new THREE.Vector2(lf, -w / 2),
                    new THREE.Vector2(-lr, -w / 2)
                ];

                const worldCorners = localCorners.map(corner => {
                    const rotated = new THREE.Vector2(
                        corner.x * Math.cos(theta) - corner.y * Math.sin(theta),
                        corner.x * Math.sin(theta) + corner.y * Math.cos(theta)
                    );
                    return new THREE.Vector3(
                        rotated.x + center.getX(),
                        rotated.y + center.getY(),
                        0
                    );
                });

                const closedCorners = [...worldCorners, worldCorners[0]];
                const newGeometry = new THREE.BufferGeometry().setFromPoints(closedCorners);

                // 保持原有材质
                const oldMaterial = obj.material;
                obj.geometry.dispose();
                obj.geometry = newGeometry;

                // console.log(`📦 更新2D矩形: 中心(${center.getX()}, ${center.getY()}), 角度: ${theta}`);
                break;
            }
            case proto.visualization.Update3DObjectGeometry.GeometryDataCase.POLYGON: {
                const geom = cmd.getPolygon();
                const vertices = geom.getVerticesList().map(p =>
                    new THREE.Vector3(p.getPosition().getX(), p.getPosition().getY(), 0));

                const newGeometry = new THREE.BufferGeometry().setFromPoints(vertices);
                obj.geometry.dispose();
                obj.geometry = newGeometry;
                // console.log(`🔺 更新多边形，新顶点数: ${vertices.length}`);
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
        const mat = material || obj.material;
        const data = cmd.getGeometryDataCase();

        console.log(`🔄 更新2D对象，类型: ${data}, obj类型: ${obj.type}, isMesh: ${obj.isMesh}`);

        // 只在有 material 的对象上处理材质
        if (mat && obj.material) {
            console.log(`🎨 材质处理 - 有材质: ${!!mat}, obj有材质: ${!!obj.material}`);

            // 修正：先检查是否有填充颜色，再获取
            if (obj.isMesh && mat.hasFillColor && mat.hasFillColor()) {
                const fillColor = mat.getFillColor();
                console.log(`🟦 设置填充颜色: R=${fillColor.getR()}, G=${fillColor.getG()}, B=${fillColor.getB()}, A=${fillColor.getA()}`);
                obj.material.color.setRGB(fillColor.getR(), fillColor.getG(), fillColor.getB());
                obj.material.opacity = fillColor.getA();
                obj.material.transparent = fillColor.getA() < 1.0;
            } else if (mat.getColor) {
                const color = mat.getColor();
                console.log(`🟨 设置线条颜色: R=${color.getR()}, G=${color.getG()}, B=${color.getB()}`);
                obj.material.color.setRGB(color.getR(), color.getG(), color.getB());
            }
        } else {
            console.log(`⚠️ 跳过材质处理 - obj没有material属性或没有材质`);
        }


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
                const vertices = geom.getVerticesList().map(p => new THREE.Vector2(p.getPosition().getX(), p.getPosition().getY()));
                console.log(`📐 POLYGON更新 - 顶点数量: ${vertices.length}, obj.isMesh: ${obj.isMesh}`);
                if (obj.isMesh) {
                    console.log(`🟦 创建填充POLYGON几何体`);
                    // 填充的多边形 - 使用 ShapeGeometry
                    const shape = new THREE.Shape(vertices);
                    obj.geometry.dispose();
                    obj.geometry = new THREE.ShapeGeometry(shape);

                    // 使用传入的材质颜色
                    if (mat && mat.color) {
                        obj.material.color.copy(mat.color);
                    }
                    console.log(`✅ 填充POLYGON几何体创建完成`);
                } else {
                    console.log(`🟨 创建线框POLYGON几何体`);
                    // 线框多边形 - 使用闭合的线
                    const points = vertices.map(v => new THREE.Vector3(v.x, v.y, 0));
                    // 闭合多边形
                    if (points.length > 0) {
                        points.push(points[0].clone());
                    }
                    obj.geometry.dispose();
                    obj.geometry = new THREE.BufferGeometry().setFromPoints(points);

                    // 使用传入的材质颜色
                    if (mat && mat.color) {
                        obj.material.color.copy(mat.color);
                    }
                    console.log(`✅ 线框POLYGON几何体创建完成`);
                }
                break;
            }
            case proto.visualization.Update2DObjectGeometry.GeometryDataCase.CIRCLE: {
                console.log(`📐 CIRCLE更新 - obj.isMesh: ${obj.isMesh}`);
                const geom = cmd.getCircle();
                const center = geom.getCenter();
                const radius = geom.getRadius();

                if (obj.isMesh) {
                    obj.geometry.dispose();
                    obj.geometry = new THREE.CircleGeometry(radius, 32);
                    obj.position.set(center.getX(), center.getY(), 0);

                    // 使用传入的材质颜色
                    if (mat && mat.color) {
                        obj.material.color.copy(mat.color);
                    }
                } else {
                    const curve = new THREE.EllipseCurve(
                        center.getX(), center.getY(),
                        radius, radius,
                        0, 2 * Math.PI,
                        false, 0
                    );
                    const points = curve.getPoints(50);
                    obj.geometry.dispose();
                    obj.geometry = new THREE.BufferGeometry().setFromPoints(points);

                    // 使用传入的材质颜色
                    if (mat && mat.color) {
                        obj.material.color.copy(mat.color);
                    }
                }
                break;
            }

            case proto.visualization.Update2DObjectGeometry.GeometryDataCase.BOX_2D: {
                console.log(`📐 BOX_2D更新 - obj.isMesh: ${obj.isMesh}`);
                const geom = cmd.getBox2d();
                const center = geom.getCenter().getPosition();
                const theta = geom.getCenter().getTheta();
                const w = geom.getWidth();
                const lf = geom.getLengthFront();
                const lr = geom.getLengthRear();

                // 计算矩形的四个角点
                const localCorners = [
                    new THREE.Vector2(-lr, w / 2),
                    new THREE.Vector2(lf, w / 2),
                    new THREE.Vector2(lf, -w / 2),
                    new THREE.Vector2(-lr, -w / 2)
                ];

                // 旋转并平移角点
                const worldCorners = localCorners.map(corner => {
                    const rotated = new THREE.Vector2(
                        corner.x * Math.cos(theta) - corner.y * Math.sin(theta),
                        corner.x * Math.sin(theta) + corner.y * Math.cos(theta)
                    );
                    return new THREE.Vector3(
                        rotated.x + center.getX(),
                        rotated.y + center.getY(),
                        0
                    );
                });

                if (obj.isMesh) {
                    const shape = new THREE.Shape(worldCorners.map(v => new THREE.Vector2(v.x, v.y)));
                    obj.geometry.dispose();
                    obj.geometry = new THREE.ShapeGeometry(shape);

                    // 使用传入的材质颜色
                    if (mat && mat.color) {
                        obj.material.color.copy(mat.color);
                    }
                } else {
                    const closedCorners = [...worldCorners, worldCorners[0]];
                    obj.geometry.dispose();
                    obj.geometry = new THREE.BufferGeometry().setFromPoints(closedCorners);

                    // 使用传入的材质颜色
                    if (mat && mat.color) {
                        obj.material.color.copy(mat.color);
                    }
                }
                break;
            }
            case proto.visualization.Update2DObjectGeometry.GeometryDataCase.TRAJECTORY_2D: {
                console.log(`📐 TRAJECTORY_2D更新 - 轨迹点数量: ${cmd.getTrajectory2d().getPosesList().length}`);
                const geom = cmd.getTrajectory2d();

                // 清除现有的子对象
                while (obj.children.length > 0) {
                    const child = obj.children[0];
                    obj.remove(child);
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) child.material.dispose();
                }

                const poses = geom.getPosesList();

                // 安全地获取颜色 - 修正这部分
                let fillColor, lineColor;

                // 获取填充颜色
                if (mat && mat.hasFillColor && mat.hasFillColor()) {
                    const fillColorObj = mat.getFillColor();
                    fillColor = new THREE.Color(fillColorObj.getR(), fillColorObj.getG(), fillColorObj.getB());
                } else if (mat && mat.getColor) {
                    const colorObj = mat.getColor();
                    fillColor = new THREE.Color(colorObj.getR(), colorObj.getG(), colorObj.getB());
                } else {
                    fillColor = new THREE.Color(0x00ff00); // 默认颜色
                }

                // 获取线条颜色
                if (mat && mat.getColor) {
                    const colorObj = mat.getColor();
                    lineColor = new THREE.Color(colorObj.getR(), colorObj.getG(), colorObj.getB());
                } else {
                    lineColor = new THREE.Color(0x006600); // 默认颜色
                }

                const opacity = 0.3;
                const lineWidth = 1;

                console.log(`🎨 TRAJECTORY颜色 - 填充: ${fillColor.getHexString()}, 线条: ${lineColor.getHexString()}`);

                poses.forEach((pose, index) => {
                    const center = pose.getCenter();
                    const centerX = center.getPosition().getX();
                    const centerY = center.getPosition().getY();

                    // 从 center 中获取朝向角 theta，就像 BOX_2D 中一样
                    const theta = center.getTheta();

                    // 获取安全盒尺寸 - 需要根据 TRAJECTORY_2D 的实际字段名调整
                    // 这里假设和 BOX_2D 有相同的字段名
                    const w = pose.getWidth ? pose.getWidth() : 1.0;
                    const lf = pose.getLengthFront ? pose.getLengthFront() : 1.0;
                    const lr = pose.getLengthRear ? pose.getLengthRear() : 1.0;

                    // 计算矩形的四个角点（与 BOX_2D 相同的逻辑）
                    const localCorners = [
                        new THREE.Vector2(-lr, w / 2),
                        new THREE.Vector2(lf, w / 2),
                        new THREE.Vector2(lf, -w / 2),
                        new THREE.Vector2(-lr, -w / 2)
                    ];

                    // 旋转并平移角点
                    const worldCorners = localCorners.map(corner => {
                        const rotated = new THREE.Vector2(
                            corner.x * Math.cos(theta) - corner.y * Math.sin(theta),
                            corner.x * Math.sin(theta) + corner.y * Math.cos(theta)
                        );
                        return new THREE.Vector3(
                            rotated.x + centerX,
                            rotated.y + centerY,
                            0
                        );
                    });

                    // 创建填充的矩形 - 使用 ShapeGeometry
                    const shape = new THREE.Shape(worldCorners.map(v => new THREE.Vector2(v.x, v.y)));
                    const fillGeometry = new THREE.ShapeGeometry(shape);
                    const fillMesh = new THREE.Mesh(fillGeometry, new THREE.MeshBasicMaterial({
                        color: fillColor, // 使用修正后的颜色
                        transparent: true,
                        opacity: opacity,
                        side: THREE.DoubleSide
                    }));
                    fillMesh.position.z = -0.01;
                    fillMesh.name = `trajectory_fill_${index}`;

                    // 创建线框 - 使用闭合的线
                    const closedCorners = [...worldCorners, worldCorners[0]];
                    const lineGeometry = new THREE.BufferGeometry().setFromPoints(closedCorners);
                    const lineMesh = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({
                        color: lineColor, // 使用修正后的颜色
                        linewidth: lineWidth
                    }));
                    lineMesh.position.z = 0.02;
                    lineMesh.name = `trajectory_line_${index}`;

                    obj.add(fillMesh);
                    obj.add(lineMesh);
                });

                break;
            }
        }
        // 只在有 material 的对象上检查最终状态
        if (obj.material) {
            console.log(`🔍 最终材质状态 - 颜色:`, obj.material.color, `透明度:`, obj.material.opacity, `是否透明:`, obj.material.transparent);
        } else {
            console.log(`🔍 最终状态 - obj没有material属性`);
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
        console.log(`🆕 创建2D对象，类型: ${data}, 材质填充: ${mat.getFilled()}`);

        // 调试：检查材质对象的完整结构
        console.log('🔍 材质对象:', mat);
        console.log('🔍 材质对象方法:', Object.getOwnPropertyNames(mat).filter(name => name.startsWith('get') || name.startsWith('has')));

        // 检查填充颜色相关方法
        console.log('🔍 getFillColor:', typeof mat.getFillColor);
        console.log('🔍 hasFillColor:', typeof mat.hasFillColor);

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
            // 为 Line2D 单独创建一个 case，确保它使用 THREE.Line
            case proto.visualization.Add2DObject.GeometryDataCase.LINE_2D: {
                const geometry = new THREE.BufferGeometry();
                const material = this.createLineMaterial(mat);
                obj = new THREE.Line(geometry, material);
                break;
            }
            case proto.visualization.Add2DObject.GeometryDataCase.POLYGON: {
                console.log(`🔍 POLYGON - 填充状态: ${mat.getFilled()}`);

                const geometry = new THREE.BufferGeometry();
                const materialArgs = {
                    side: THREE.DoubleSide
                };

                if (mat.getFilled()) {
                    // 安全地获取填充颜色：先检查是否存在，再获取
                    let fillColor;
                    if (mat.hasFillColor && mat.hasFillColor()) {
                        fillColor = mat.getFillColor();
                        console.log(`🎨 POLYGON - 填充颜色:`, fillColor);
                    } else {
                        // 如果没有填充颜色，使用线条颜色作为填充颜色
                        const color = mat.getColor();
                        fillColor = color;
                        console.log(`⚠️ POLYGON - 无填充颜色，使用线条颜色作为填充`);
                    }

                    materialArgs.color = new THREE.Color(fillColor.getR(), fillColor.getG(), fillColor.getB());

                    // 安全地获取透明度
                    if (fillColor && typeof fillColor.getA === 'function') {
                        materialArgs.opacity = fillColor.getA();
                        materialArgs.transparent = fillColor.getA() < 1.0;
                    } else {
                        materialArgs.opacity = 0.3; // 默认透明度
                        materialArgs.transparent = true;
                    }

                    obj = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial(materialArgs));
                    obj.isMesh = true;
                    console.log(`✅ 创建填充POLYGON Mesh, 颜色:`, materialArgs.color, `透明度:`, materialArgs.opacity);
                } else {
                    const color = mat.getColor();
                    materialArgs.color = new THREE.Color(color.getR(), color.getG(), color.getB());
                    obj = new THREE.LineLoop(geometry, new THREE.LineBasicMaterial(materialArgs));
                    obj.isMesh = false;
                    console.log(`✅ 创建线框POLYGON LineLoop, 颜色:`, materialArgs.color);
                }
                break;
            }
            case proto.visualization.Add2DObject.GeometryDataCase.CIRCLE: {
                console.log(`🔍 CIRCLE - 填充状态: ${mat.getFilled()}`);

                const geometry = new THREE.BufferGeometry();
                const materialArgs = {
                    side: THREE.DoubleSide
                };

                if (mat.getFilled()) {
                    let fillColor;
                    if (mat.hasFillColor && mat.hasFillColor()) {
                        fillColor = mat.getFillColor();
                    } else {
                        fillColor = mat.getColor();
                    }

                    materialArgs.color = new THREE.Color(fillColor.getR(), fillColor.getG(), fillColor.getB());

                    if (fillColor && typeof fillColor.getA === 'function') {
                        materialArgs.opacity = fillColor.getA();
                        materialArgs.transparent = fillColor.getA() < 1.0;
                    } else {
                        materialArgs.opacity = 0.3;
                        materialArgs.transparent = true;
                    }

                    obj = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial(materialArgs));
                    obj.isMesh = true;
                    console.log(`✅ 创建填充CIRCLE Mesh, 颜色:`, materialArgs.color, `透明度:`, materialArgs.opacity);
                } else {
                    const color = mat.getColor();
                    materialArgs.color = new THREE.Color(color.getR(), color.getG(), color.getB());
                    obj = new THREE.LineLoop(geometry, new THREE.LineBasicMaterial(materialArgs));
                    obj.isMesh = false;
                    console.log(`✅ 创建线框CIRCLE LineLoop, 颜色:`, materialArgs.color);
                }
                break;
            }
            case proto.visualization.Add2DObject.GeometryDataCase.BOX_2D: {
                console.log(`🔍 BOX_2D - 填充状态: ${mat.getFilled()}`);

                const geometry = new THREE.BufferGeometry();
                const materialArgs = {
                    side: THREE.DoubleSide
                };

                if (mat.getFilled()) {
                    let fillColor;
                    if (mat.hasFillColor && mat.hasFillColor()) {
                        fillColor = mat.getFillColor();
                    } else {
                        fillColor = mat.getColor();
                    }

                    materialArgs.color = new THREE.Color(fillColor.getR(), fillColor.getG(), fillColor.getB());

                    if (fillColor && typeof fillColor.getA === 'function') {
                        materialArgs.opacity = fillColor.getA();
                        materialArgs.transparent = fillColor.getA() < 1.0;
                    } else {
                        materialArgs.opacity = 0.3;
                        materialArgs.transparent = true;
                    }

                    obj = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial(materialArgs));
                    obj.isMesh = true;
                    console.log(`✅ 创建填充BOX_2D Mesh, 颜色:`, materialArgs.color, `透明度:`, materialArgs.opacity);
                } else {
                    const color = mat.getColor();
                    materialArgs.color = new THREE.Color(color.getR(), color.getG(), color.getB());
                    obj = new THREE.LineLoop(geometry, new THREE.LineBasicMaterial(materialArgs));
                    obj.isMesh = false;
                    console.log(`✅ 创建线框BOX_2D LineLoop, 颜色:`, materialArgs.color);
                }
                break;
            }
            case proto.visualization.Add2DObject.GeometryDataCase.TRAJECTORY_2D: {
                // 修正：轨迹应该创建 Group 而不是 Line
                obj = new THREE.Group();
                obj.isMesh = false; // Group 本身不是 Mesh，但包含 Mesh 子对象
                break;
            }
            default: {
                console.warn("❓ 未知的2D几何类型:", data);
                const geometry = new THREE.BufferGeometry();
                const color = mat.getColor();
                const material = new THREE.PointsMaterial({
                    color: new THREE.Color(color.getR(), color.getG(), color.getB()),
                    size: mat.getPointSize() || 5
                });
                obj = new THREE.Points(geometry, material);
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
    packageAsUpdateCmd(addCmd) {
        const updateCmd = new proto.visualization.Update2DObjectGeometry();
        const data = addCmd.getGeometryDataCase();
        updateCmd.setId(addCmd.getId());
        if (data === proto.visualization.Add2DObject.GeometryDataCase.POINT_2D) { updateCmd.setPoint2d(addCmd.getPoint2d()); }
        else if (data === proto.visualization.Add2DObject.GeometryDataCase.POSE_2D) { updateCmd.setPose2d(addCmd.getPose2d()); }
        else if (data === proto.visualization.Add2DObject.GeometryDataCase.LINE_2D) { updateCmd.setLine2d(addCmd.getLine2d()); }
        else if (data === proto.visualization.Add2DObject.GeometryDataCase.POLYGON) { updateCmd.setPolygon(addCmd.getPolygon()); }
        else if (data === proto.visualization.Add2DObject.GeometryDataCase.CIRCLE) { updateCmd.setCircle(addCmd.getCircle()); }
        else if (data === proto.visualization.Add2DObject.GeometryDataCase.BOX_2D) { updateCmd.setBox2d(addCmd.getBox2d()); }
        else if (data === proto.visualization.Add2DObject.GeometryDataCase.TRAJECTORY_2D) {
            updateCmd.setTrajectory2d(addCmd.getTrajectory2d());
        }
        return updateCmd;
    }

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
        // console.log("📥 收到WebSocket消息，数据大小:", event.data.byteLength, "字节");

        const data = new Uint8Array(event.data);
        const visMessage = proto.visualization.VisMessage.deserializeBinary(data);

        const messageType = visMessage.getMessageDataCase();
        console.log("📋 消息类型:", messageType);

        if (messageType === proto.visualization.VisMessage.MessageDataCase.SCENE_3D_UPDATE) {
            const sceneUpdate = visMessage.getScene3dUpdate();
            // console.log("🎮 3D更新 - 窗口ID:", sceneUpdate.getWindowId(),
            //     "命令数量:", sceneUpdate.getCommandsList().length);
            this.appManager.handleUpdate(sceneUpdate, '3D');
        } else if (messageType === proto.visualization.VisMessage.MessageDataCase.SCENE_2D_UPDATE) {
            const sceneUpdate = visMessage.getScene2dUpdate();
            // console.log("📊 2D更新 - 窗口ID:", sceneUpdate.getWindowId(),
            //     "命令数量:", sceneUpdate.getCommandsList().length);
            this.appManager.handleUpdate(sceneUpdate, '2D');
        } else {
            console.warn("❓ 收到未知类型的消息:", messageType);
        }
    }
}

// --- Main Entry Point ---
window.onload = () => {
    const appManager = new AppManager();
    const connectionManager = new ConnectionManager("ws://localhost:9002", appManager);
};