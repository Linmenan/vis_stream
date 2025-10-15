// vis_stream/cpp_backend/include/vis_stream.h
#pragma once

#include <cstdint>
#include <memory>
#include <string>
#include <vector>

#include "vis_primitives.h"
// 前向声明
namespace Vis {
class Observable;
}
namespace visualization {
class Material;
}  // namespace visualization

/**
 * @brief 可视化服务器主类 (单例模式)
 * 提供了与实时可视化前端交互的所有功能接口。
 */
class VisualizationServer {
 public:
  // --- 单例访问 ---
  static VisualizationServer& get();
  static void init(uint16_t port);

  // --- 禁用拷贝 ---
  VisualizationServer(const VisualizationServer&) = delete;
  VisualizationServer& operator=(const VisualizationServer&) = delete;

  // --- 核心服务控制 ---
  void run();
  void stop();
  std::vector<std::string> get_connected_windows();
  bool is_connected() const;
  void set_auto_update_policy(bool enabled, int threshold = 50,
                              int interval_ms = 33);
  // --- 可视化对象管理 API ---
  void add(std::shared_ptr<Vis::Observable> obj, const std::string& window_name,
           const Vis::MaterialProps& material, bool is_3d);
  void add(const Vis::Observable& obj, const std::string& window_name,
           const Vis::MaterialProps& material, bool is_3d);

  void clear_static(const std::string& window_name, bool is_3d);
  void clear_dynamic(const std::string& window_name, bool is_3d);
  void clear(const std::string& window_name, bool is_3d);

  void drawnow(const std::string& window_name, const bool& is_3d);
  // ...

  // --- 窗口控制 API ---
  // create_window 返回 bool，且 window_name 成为必需参数
  bool create_window(const std::string& window_name, const bool& is_3d = false);

  // remove_window
  bool remove_window(const std::string& window_name, const bool& is_3d = false);

  // rename_window 现在是重命名操作，需要返回 bool
  // 它需要知道旧名称来定位窗口，所以签名调整为：
  bool rename_window(const std::string& old_name, const std::string& new_name,
                     bool is_3d);

  void set_grid_visible(const std::string& window_name, bool visible,
                        bool is_3d);
  void set_axes_visible(const std::string& window_name, bool visible,
                        bool is_3d);
  void set_legend_visible(const std::string& window_name, bool visible,
                          bool is_3d);

  // 不再需要返回 map，可以提供一个获取所有窗口名称的接口
  std::vector<std::string> get_window_names(const bool& is_3d);

  size_t get_windows_number() const;
  size_t get_observables_number() const;

 private:
  VisualizationServer();
  ~VisualizationServer();
  VisualizationServer(VisualizationServer&&) noexcept;
  VisualizationServer& operator=(VisualizationServer&&) noexcept;
  visualization::Material convert_material(const Vis::MaterialProps& props);
  // 前向声明实现类
  class ServerImpl;
  std::unique_ptr<ServerImpl> m_impl;

  static uint16_t m_port;
  static bool m_initialized;
};