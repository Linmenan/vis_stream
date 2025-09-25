// vis_stream/cpp_backend/include/vis_stream.h
#pragma once

#include <cstdint>
#include <memory>
#include <string>
#include <vector>

// 前向声明，保持头文件整洁，避免暴露内部依赖
namespace Vis {
class Observable;
}
namespace visualization {
class Material;
}

/**
 * @brief 可视化服务器主类 (单例模式)
 * 提供了与实时可视化前端交互的所有功能接口。
 */
class VisualizationServer {
 public:
  // --- 单例访问 ---

  /**
   * @brief 获取全局唯一的 VisualizationServer 实例。
   * @return VisualizationServer的引用。
   * @throws std::runtime_error 如果在使用前未调用 init()。
   */
  static VisualizationServer &get();

  /**
   * @brief 初始化服务器。此方法必须在首次调用 get() 之前在主线程中调用一次。
   * @param port WebSocket 服务器监听的端口号。
   */
  static void init(uint16_t port);

  // --- 禁用拷贝 ---
  VisualizationServer(const VisualizationServer &) = delete;
  VisualizationServer &operator=(const VisualizationServer &) = delete;

  // --- 核心服务控制 ---

  /**
   * @brief 启动服务器的后台网络线程。
   */
  void run();

  /**
   * @brief 停止服务器并清理所有资源。
   */
  void stop();

  /**
   * @brief 获取当前所有已连接的前端窗口ID列表。
   * @return 包含所有window_id的字符串向量。
   */
  std::vector<std::string> get_connected_windows();

  // --- 可视化对象管理 API ---

  /**
   * @brief 在场景中显示一个几何对象，并开始追踪其变化。
   * @param obj 一个指向您创建的几何对象的共享指针 (例如
   * Vis::Point3D::create())。
   * @param id 在前端场景中标识此对象的唯一字符串ID。
   * @param material 对象初始的材质属性。
   * @param is_3d 标记此对象是属于3D场景(true)还是2D场景(false)。
   */
  void show(std::shared_ptr<Vis::Observable> obj, const std::string &id,
            const visualization::Material &material, bool is_3d);

  /**
   * @brief 从场景中移除一个几何对象。
   * @param id 要移除的对象的ID。
   */
  void remove(const std::string &id);

  // --- 动态更新策略 API ---

  /**
   * @brief 手动触发一次2D场景的更新，将所有累积的变化打包发送。
   */
  void drawnow2D();

  /**
   * @brief 手动触发一次3D场景的更新，将所有累积的变化打包发送。
   */
  void drawnow3D();

  /**
   * @brief 设置自动更新策略。
   * @param enabled 是否启用自动更新。
   * @param threshold
   * 脏对象数量阈值。当任一场景待更新对象数超过此值时，立即刷新该场景。
   * @param interval_ms 时间间隔(毫秒)。每隔这段时间自动刷新所有有变化的场景。
   */
  void set_auto_update_policy(bool enabled, int threshold = 50,
                              int interval_ms = 33);

  // --- 窗口控制 API ---

  /**
   * @brief 设置图窗标题。
   * @param window_id 目标窗口ID。
   * @param title 新的标题。
   * @param is_3d 目标是3D场景(true)还是2D场景(false)。
   */
  void set_title(const std::string &window_id, const std::string &title,
                 bool is_3d);

  /**
   * @brief 设置图窗网格是否可见。
   * @param window_id 目标窗口ID。
   * @param visible 是否可见。
   * @param is_3d 目标是3D场景(true)还是2D场景(false)。
   */
  void set_grid_visible(const std::string &window_id, bool visible, bool is_3d);

  /**
   * @brief 设置坐标轴是否可见。
   * @param window_id 目标窗口ID。
   * @param visible 是否可见。
   * @param is_3d 目标是3D场景(true)还是2D场景(false)。
   */
  void set_axes_visible(const std::string &window_id, bool visible, bool is_3d);

  /**
   * @brief 设置图例是否可见。
   * @param window_id 目标窗口ID。
   * @param visible 是否可见。
   * @param is_3d 目标是3D场景(true)还是2D场景(false)。
   */
  void set_legend_visible(const std::string &window_id, bool visible,
                          bool is_3d);

 private:
  // --- 私有实现 ---
  VisualizationServer();
  ~VisualizationServer();
  VisualizationServer(VisualizationServer &&) noexcept;
  VisualizationServer &operator=(VisualizationServer &&) noexcept;

  class ServerImpl;
  std::unique_ptr<ServerImpl> m_impl;

  static uint16_t m_port;
  static bool m_initialized;
};