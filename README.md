# VisStream: C++ Real-time 3D Visualization System

这是一个高性能、跨平台的科学可视化系统。它采用解耦的客户端-服务器架构，允许高性能的C++后端将实时生成的3D数据流式传输到任何现代浏览器中进行渲染。

## 核心技术栈

  * **后端**: C++
  * **前端渲染**: Three.js / JavaScript
  * **通信协议**: WebSocket
  * **数据序列化**: Protocol Buffers (Protobuf)
  * **构建系统**: CMake
  * **C++ WebSocket库**: WebSocket++ (通过 Git Submodule 管理)
  * **C++ 异步IO库**: Asio (通过 Git Submodule 管理)

## 项目结构

```
vis_stream
├── build/                           # 编译输出目录
├── cpp_backend
│   ├── include
│   │   ├── vis_primitives.h         # 公共数据结构
│   │   └── vis_stream.h             # 公共API头文件
│   ├── src
│   │   └── visualization_server.cpp # 核心实现
│   └── CMakeLists.txt
├── examples
│   └── basic_usage
│       ├── CMakeLists.txt
│       └── main.cpp                 # 后端调用示例
├── protocol
│   └── visualization.proto          # 核心数据接口模板
├── third_party                        # Git Submodules
│   ├── asio/
│   └── websocketpp/
├── web_client                         # 前端代码
│   ├── js
│   │   ├── lib                      # 第三方JS库
│   │   │   ├── protocol
│   │   │   │   └── visualization_pb.js
│   │   │   ├── google-protobuf.js
│   │   │   ├── OrbitControls.js
│   │   │   └── three.module.js
│   │   └── main.js                  # 应用主逻辑
│   └── index.html                   # 入口页面
├── .gitignore
├── .gitmodules                      # Git Submodule 配置文件
├── CMakeLists.txt                   # 顶层CMakeLists.txt
└── README.md
```

-----

## (一) 环境配置与依赖安装

在编译和运行本系统前，请确保您的环境中已安装以下依赖。

(以 **Ubuntu / Debian** 系统为例)

### 1\. 基础构建工具与第三方库

**a. 安装基础工具**

您需要 `g++` 编译器, `cmake`, `make`, 和 `git`。

```bash
sudo apt-get update
sudo apt-get install build-essential g++ cmake git
```

**b. 下载第三方库 (通过 Git Submodule)**

本项目的第三方依赖库 (Asio, WebSocket++) 是通过 Git Submodule 进行管理的。当您克隆本项目后，需要运行以下命令来下载这些库的源代码：

```bash
# 确保在项目的根目录下运行
git submodule update --init --recursive
```

*(注：项目所有者使用的 `git submodule add` 命令是将这些库“注册”到项目中，该操作只需执行一次。其他用户克隆后只需通过本步骤的 `update` 命令下载即可。)*

### 2\. Boost 库

WebSocket++ 依赖于 Boost 的 Asio 和其他组件。

```bash
sudo apt-get install libboost-all-dev
```

### 3\. Protocol Buffers (编译器与库)

系统包管理器 (`apt`) 中的 `protobuf-compiler` 版本通常过旧，会导致前端JS文件生成错误。**强烈建议从 GitHub 下载最新的预编译版本**。

1.  访问 [Protobuf Releases](https://github.com/protocolbuffers/protobuf/releases) 页面。
2.  在最新版本中，找到适用于您系统的压缩包，例如 `protoc-2x.x-linux-x86_64.zip`。
3.  下载并解压，然后将 `bin/protoc` 可执行文件复制到您的系统路径下（如 `/usr/local/bin`），确保其版本高于 3.12。

同时，您仍需要安装C++的开发库：

```bash
sudo apt-get install libprotobuf-dev
```

### 4\. 前端依赖库 (手动下载)

本项目采用无打包工具的纯浏览器前端方案。请手动下载以下JavaScript库：

1.  **Three.js (核心库)**:

      * 链接: `https://unpkg.com/three@0.158.0/build/three.module.js`
      * 操作: 打开链接并 "Ctrl+A" 全选复制网页内文字到 `web_client/js/lib/three.module.js` 中。

2.  **OrbitControls.js (轨道控制器)**:

      * 链接: `https://unpkg.com/three@0.158.0/examples/jsm/controls/OrbitControls.js`
      * 操作: 打开链接并 "Ctrl+A" 全选复制网页内文字到 `web_client/js/lib/OrbitControls.js` 中。

3.  **Protobuf-javascript (运行时库)**:

      * 链接: `https://cdn.jsdelivr.net/npm/google-protobuf@3.21.2/google-protobuf.js`
      * 操作: 打开链接并 "Ctrl+A" 全选复制网页内文字到 `web_client/js/lib/google-protobuf.js` 中。

### 5\. Python 3

用于启动一个简单的本地Web服务器来运行前端页面。现代Linux发行版通常已自带。

```bash
sudo apt-get install python3
```

-----

## (二) 构建项目

### 步骤 2.1: 编译C++后端

此步骤会编译 `vis_stream_core` 静态库以及示例程序。

1.  **创建 build 目录并进入**

    ```bash
    mkdir -p build
    cd build
    ```

2.  **运行 CMake 和 Make**

    ```bash
    cmake ..
    make
    ```

### 步骤 2.2: 生成并修正前端JavaScript文件

1.  **生成 Protobuf 消息文件**

      * 回到项目根目录 (`vis_stream/`)。
      * 运行以下 `protoc` 命令：
        ```bash
        protoc --proto_path=protocol --js_out=library=visualization_proto,binary:web_client/js/lib/protocol protocol/visualization.proto
        ```

2.  **【关键】手动修正 `visualization_pb.js`**

      * 打开文件 `web_client/js/lib/protocol/visualization_pb.js`。
      * 使用编辑器的“查找与替换”功能，将文件中 **所有** 的 `global` 替换为 `window`。
      * 保存文件。
      * *(原因：protoc生成的代码试图使用一个名为 `global` 的变量来访问全局作用域，但这在现代浏览器的严格模式下会失败。我们将其修正为浏览器环境专用的 `window`。)*

3.  **【关键】手动修正 `OrbitControls.js`**

      * 打开您下载的 `web_client/js/lib/OrbitControls.js` 文件。
      * 在文件顶部找到 `import ... from 'three';` 这一行。
      * 将其修改为相对路径：`import ... from './three.module.js';`
      * 保存文件。

-----

## (三) 运行示例

### 步骤 1: 启动C++后端服务器

  * 打开 **第一个** 终端，进入 `build` 目录并运行示例程序。
    ```bash
    # 确保在项目根目录的 build/ 目录下
    ./build/examples/basic_usage/example_basic_usage
    ```

### 步骤 2: 启动前端Web服务器

  * 打开 **第二个** 终端，进入 `web_client` 目录。
    ```bash
    # 确保在项目根目录的 web_client/ 目录下
    cd web_client/
    python3 -m http.server 8000
    ```

### 步骤 3: 在浏览器中查看

  * 打开浏览器并访问: `http://localhost:8000`

-----

## (四) 项目开发路线图

### 阶段一：核心基础设施与连接性验证

  * [x] **任务1.1**：集成 C++ WebSocket 库 (WebSocket++ & Asio)。
  * [x] **任务1.2**：实现极简 C++ 服务器，接受 WebSocket 连接。
  * [x] **任务1.3**：创建基础 HTML/JS 前端，连接到服务器。
  * [x] **任务1.4**：集成 Protobuf 编译器到构建流程中。
  * [x] **任务1.5**：成功交换 Protobuf 格式的二进制消息，打通通信管道。

### 阶段二：基础可视化图元渲染

  * [x] **任务2.1**：在 `.proto` 中设计 `AddObject`、`UpdateObjectGeometry`、`DeleteObject` 等核心指令。
  * [x] **任务2.2**：在 C++ `VisualizationServer` 中实现公共API，用于管理和更新可视化对象。
  * [x] **任务2.3**：在前端 `ObjectFactory` 中，实现接收指令并创建/更新/删除相应的 Three.js 对象。
  * [x] **任务2.4**：完整支持 `Point3D`、`Pose3D`、`Ball`、`Box3D` 等多种3D图元。
  * [ ] **任务2.5**：增加对 `LineStrip`（折线）、`Polygon`（多边形）等更多2D/3D图元的支持。

### 阶段三：高级功能与UI元素

  * [x] **任务3.1**：集成 `THREE.GridHelper` 和 `THREE.AxesHelper`，并可通过后端指令控制其显隐。
  * [ ] **任务3.2**：扩展后端API和前端工厂，支持更复杂的几何体，如 `Surface`（曲面）、`Vector`（向量场）。
  * [ ] **任务3.3**：在后端 `VisualizationServer` 中，实现完整的多窗口管理机制，支持向特定客户端窗口发送指令。
  * [ ] **任务3.4**：在 `.proto` 中定义用于创建和更新HTML标签的指令，在前端实现2D UI叠加渲染。

### 阶段四：优化、集成与部署

  * [ ] **任务4.1**：进行系统性能分析和优化，检查序列化开销、网络传输瓶颈和前端渲染帧率。
  * [ ] **任务4.2**：编写 `pybind11` 封装代码，为 `VisualizationServer` 类创建Python模块，并进行测试。
  * [ ] **任务4.3**：为C++和Python API编写详尽的文档和更丰富的使用示例。
  * [ ] **任务4.4**：进行全面的跨平台兼容性测试（Windows, macOS），并将前端资源打包，以便于部署。