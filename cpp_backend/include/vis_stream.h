// vis_stream/cpp_backend/include/vis_stream.h
#pragma once

#include <cstdint>
#include <memory>
#include <string>
#include <vector>

// 前向声明
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
  static VisualizationServer& get();
  static void init(uint16_t port);

  // --- 禁用拷贝 ---
  VisualizationServer(const VisualizationServer&) = delete;
  VisualizationServer& operator=(const VisualizationServer&) = delete;

  // --- 核心服务控制 ---
  void run();
  void stop();
  std::vector<std::string> get_connected_windows();

  // --- 可视化对象管理 API ---
  void add(std::shared_ptr<Vis::Observable> obj, const std::string& window_name,
           const visualization::Material& material, bool is_3d);
  void add(std::shared_ptr<Vis::Observable> obj, const size_t& window_idx,
           const visualization::Material& material, bool is_3d);
  void add(const Vis::Observable& obj, const std::string& window_name,
           const visualization::Material& material, bool is_3d);
  void add(const Vis::Observable& obj, const size_t& window_idx,
           const visualization::Material& material, bool is_3d);

  void clear_static(const std::string& window_name);
  void clear_static(const size_t& window_idx);
  void clear_dynamic(const std::string& window_name);
  void clear_dynamic(const size_t& window_idx);
  void clear(const std::string& window_name);
  void clear(const size_t& window_idx);

  void drawnow(const std::string& name, const bool& is_3d);
  void drawnow(const size_t& window_idx, const bool& is_3d);
  void set_auto_update_policy(bool enabled, int threshold = 50,
                              int interval_ms = 33);

  // --- 窗口控制 API ---
  void create_window(const std::string& name = "", const bool& is_3d = false);
  bool remove_window(const std::string& name = "", const bool& is_3d = false);

  void set_title(const std::string& old_name, const std::string& name,
                 bool is_3d);
  void set_title(const size_t& window_idx, const std::string& name, bool is_3d);

  void set_grid_visible(const std::string& name, bool visible, bool is_3d);
  void set_grid_visible(const size_t& window_idx, bool visible, bool is_3d);

  void set_axes_visible(const std::string& name, bool visible, bool is_3d);
  void set_axes_visible(const size_t& window_idx, bool visible, bool is_3d);

  void set_legend_visible(const std::string& name, bool visible, bool is_3d);
  void set_legend_visible(const size_t& window_idx, bool visible, bool is_3d);

  std::vector<std::string> get_windows_name(const bool& is_3d);
  size_t getTotalWindows() const;
  size_t getTotalObservables() const;

 private:
  VisualizationServer();
  ~VisualizationServer();
  VisualizationServer(VisualizationServer&&) noexcept;
  VisualizationServer& operator=(VisualizationServer&&) noexcept;

  // 前向声明实现类
  class ServerImpl;
  std::unique_ptr<ServerImpl> m_impl;

  static uint16_t m_port;
  static bool m_initialized;
};