// vis_stream/cpp_backend/src/visualization_server.cpp
#include <atomic>
#include <boost/asio/steady_timer.hpp>
#include <boost/uuid/uuid.hpp>
#include <boost/uuid/uuid_generators.hpp>
#include <boost/uuid/uuid_io.hpp>
#include <iostream>
#include <map>
#include <mutex>
#include <set>
#include <stdexcept>
#include <thread>
#include <websocketpp/config/asio_no_tls.hpp>
#include <websocketpp/server.hpp>

#include "typed_window.h"
#include "vis_primitives.h"
#include "vis_stream.h"
#include "visualization.pb.h"
#include "window_2d.h"
#include "window_3d.h"
#include "window_base.h"

// Helper function to convert Vis types to Proto types
namespace {
// 所有的 to_proto 辅助函数...
void to_proto(const Vis::Vec2& in, visualization::Vec2* out) {
  out->set_x(in.x);
  out->set_y(in.y);
}

void to_proto(const Vis::Vec3& in, visualization::Vec3* out) {
  out->set_x(in.x);
  out->set_y(in.y);
  out->set_z(in.z);
}

void to_proto(const Vis::Quaternion& in, visualization::Quaternion* out) {
  out->set_w(in.w);
  out->set_x(in.x);
  out->set_y(in.y);
  out->set_z(in.z);
}

void to_proto(const Vis::Point2D& in, visualization::Point2D* out) {
  to_proto(in.get_position(), out->mutable_position());
}

void to_proto(const Vis::Pose2D& in, visualization::Pose2D* out) {
  to_proto(in.get_position(), out->mutable_position());
  out->set_theta(in.get_angle());
}

void to_proto(const Vis::Point3D& in, visualization::Point3D* out) {
  to_proto(in.get_position(), out->mutable_position());
}

void to_proto(const Vis::Pose3D& in, visualization::Pose3D* out) {
  to_proto(in.get_position(), out->mutable_position()->mutable_position());
  to_proto(in.get_orientation(), out->mutable_quaternion());
}

void to_proto(const Vis::Circle& in, visualization::Circle* out) {
  to_proto(in.get_center(), out->mutable_center());
  out->set_radius(in.get_radius());
}

void to_proto(const Vis::Box2D& in, visualization::Box2D* out) {
  to_proto(in.get_center(), out->mutable_center());
  out->set_width(in.get_width());
  out->set_length_front(in.get_length_front());
  out->set_length_rear(in.get_length_rear());
}

void to_proto(const Vis::Line2D& in, visualization::Line2D* out) {
  for (const auto& pt : in.get_points()) {
    to_proto(pt, out->add_points()->mutable_position());
  }
}

void to_proto(const Vis::Trajectory2D& in, visualization::Trajectory2D* out) {
  for (const auto& pose : in.get_poses()) {
    to_proto(pose, out->add_poses());
  }
}

void to_proto(const Vis::Polygon& in, visualization::Polygon* out) {
  for (const auto& vtx : in.get_vertices()) {
    to_proto(vtx, out->add_vertices()->mutable_position());
  }
}

void to_proto(const Vis::Ball& in, visualization::Ball* out) {
  to_proto(in.get_center(), out->mutable_center()->mutable_position());
  out->set_radius(in.get_radius());
}

void to_proto(const Vis::Box3D& in, visualization::Box3D* out) {
  to_proto(in.get_center(), out->mutable_center());
  auto len = in.get_lengths();
  out->set_x_length(len.x);
  out->set_y_length(len.y);
  out->set_z_length(len.z);
}

// Helper to clone Observable objects
std::shared_ptr<Vis::Observable> clone_to_shared(const Vis::Observable& obj) {
  if (auto p = dynamic_cast<const Vis::Point2D*>(&obj)) {
    return std::make_shared<Vis::Point2D>(*p);
  } else if (auto p = dynamic_cast<const Vis::Pose2D*>(&obj)) {
    return std::make_shared<Vis::Pose2D>(*p);
  } else if (auto p = dynamic_cast<const Vis::Circle*>(&obj)) {
    return std::make_shared<Vis::Circle>(*p);
  } else if (auto p = dynamic_cast<const Vis::Box2D*>(&obj)) {
    return std::make_shared<Vis::Box2D>(*p);
  } else if (auto p = dynamic_cast<const Vis::Line2D*>(&obj)) {
    return std::make_shared<Vis::Line2D>(*p);
  } else if (auto p = dynamic_cast<const Vis::Trajectory2D*>(&obj)) {
    return std::make_shared<Vis::Trajectory2D>(*p);
  } else if (auto p = dynamic_cast<const Vis::Polygon*>(&obj)) {
    return std::make_shared<Vis::Polygon>(*p);
  } else if (auto p = dynamic_cast<const Vis::Point3D*>(&obj)) {
    return std::make_shared<Vis::Point3D>(*p);
  } else if (auto p = dynamic_cast<const Vis::Pose3D*>(&obj)) {
    return std::make_shared<Vis::Pose3D>(*p);
  } else if (auto p = dynamic_cast<const Vis::Ball*>(&obj)) {
    return std::make_shared<Vis::Ball>(*p);
  } else if (auto p = dynamic_cast<const Vis::Box3D*>(&obj)) {
    return std::make_shared<Vis::Box3D>(*p);
  }
  return nullptr;
}

}  // namespace

// ServerImpl 作为 VisualizationServer 的内部类实现
class VisualizationServer::ServerImpl : public Vis::IObserver {
 public:
  using server = websocketpp::server<websocketpp::config::asio>;
  using connection_hdl = websocketpp::connection_hdl;
  using steady_timer = boost::asio::steady_timer;

  struct TrackedObject {
    std::string id;  // 图元的UUID
    std::weak_ptr<Vis::Observable> obj_ptr;
    bool is_3d;
    std::string window_uuid;  // 所在窗口的UUID
    visualization::Material material;
  };

  struct WindowInfo {
    std::string uuid;
    bool is_3d;
    std::string display_name;
  };

  ServerImpl(uint16_t port)
      : m_port(port),
        m_auto_update_enabled(false),
        m_update_threshold(0),
        m_update_interval(0) {
    m_server.clear_access_channels(websocketpp::log::alevel::all);
    m_server.clear_error_channels(websocketpp::log::elevel::all);

    m_server.init_asio();
    m_server.set_reuse_addr(true);
    m_server.set_open_handler(
        std::bind(&ServerImpl::on_open, this, std::placeholders::_1));
    m_server.set_close_handler(
        std::bind(&ServerImpl::on_close, this, std::placeholders::_1));
    m_timer = std::make_unique<steady_timer>(m_server.get_io_service());
  }

  void run() {
    m_thread = std::thread([this]() {
      m_server.listen(m_port);
      m_server.start_accept();
      std::cout << "Server started on port " << m_port << std::endl;
      if (m_auto_update_enabled && m_update_interval > 0) {
        schedule_auto_flush();
      }
      m_server.run();
    });
  }

  void stop() {
    m_server.get_io_service().post([this]() { m_timer->cancel(); });
    if (!m_server.stopped()) {
      m_server.stop_listening();
      if (m_has_connection) {
        websocketpp::lib::error_code ec;
        m_server.close(m_current_connection,
                       websocketpp::close::status::going_away, "", ec);
      }
      m_server.stop();
    }
    if (m_thread.joinable()) {
      m_thread.join();
    }
  }
  bool is_connected() const {
    std::lock_guard<std::mutex> lock(m_mutex);
    return m_has_connection;
  }
  template <typename T>
  void send_update(const T& update) {
    if (!m_has_connection) {
      std::cout << "❌ 没有活跃连接，无法发送更新" << std::endl;
      return;
    }

    // std::cout << "🔄 准备发送更新，窗口ID: " << update.window_id() << ",
    // 类型: "
    //           << (std::is_same_v<T, visualization::Scene3DUpdate> ? "3D" :
    //           "2D")
    //           << std::endl;

    visualization::VisMessage vis_msg;

    if constexpr (std::is_same_v<T, visualization::Scene3DUpdate>) {
      vis_msg.mutable_scene_3d_update()->CopyFrom(update);
      // std::cout << "📦 3D更新命令数量: " << update.commands_size() <<
      // std::endl;
    } else if constexpr (std::is_same_v<T, visualization::Scene2DUpdate>) {
      vis_msg.mutable_scene_2d_update()->CopyFrom(update);
      // std::cout << "📦 2D更新命令数量: " << update.commands_size() <<
      // std::endl;
    } else {
      std::cout << "❌ 未知的更新类型" << std::endl;
      return;
    }

    std::string serialized_msg;
    vis_msg.SerializeToString(&serialized_msg);

    // std::cout << "📤 发送消息大小: " << serialized_msg.size() << " 字节"
    //           << std::endl;

    try {
      m_server.send(m_current_connection, serialized_msg,
                    websocketpp::frame::opcode::binary);
      // std::cout << "✅ 消息发送成功" << std::endl;
    } catch (const std::exception& e) {
      std::cerr << "❌ 发送失败: " << e.what() << std::endl;
    }
  }

  void add(std::shared_ptr<Vis::Observable> obj, const std::string& name,
           const visualization::Material& material, bool is_3d) {
    if (!obj) return;

    // 1. 根据名称查找窗口的UUID
    std::string window_uuid = get_uuid_for_name(name, is_3d);
    if (window_uuid.empty()) {
      std::cerr << "❌ 错误：在名为 '" << name
                << "' 的窗口中添加图元失败，找不到该窗口。" << std::endl;
      return;
    }

    // 2. 调用原有的、基于UUID的add方法
    add_internal(obj, window_uuid, material, is_3d);
  }

  // (const Vis::Observable& 版本)
  void add(const Vis::Observable& obj, const std::string& name,
           const visualization::Material& material, bool is_3d) {
    std::string window_uuid = get_uuid_for_name(name, is_3d);
    if (window_uuid.empty()) {
      std::cerr << "❌ 错误：在名为 '" << name
                << "' 的窗口中添加图元失败，找不到该窗口。" << std::endl;
      return;
    }

    // 克隆对象并调用基于UUID的add方法
    auto obj_copy = clone_to_shared(obj);
    if (obj_copy) {
      add_internal(obj_copy, window_uuid, material, is_3d);
    }
  }
  void add_internal(std::shared_ptr<Vis::Observable> obj,
                    const std::string& window_uuid,
                    const visualization::Material& material, bool is_3d) {
    if (!obj) return;
    std::lock_guard<std::mutex> lock(m_mutex);
    cleanup_expired_objects();

    // 获取窗口名称
    std::string window_name = "";
    auto window_it = m_windows.find(window_uuid);
    if (window_it != m_windows.end()) {
      window_name = window_it->second.display_name;
    }
    std::string object_id = "obj_" + std::to_string(m_next_object_id++);

    TrackedObject tracked;
    tracked.id = object_id;
    tracked.obj_ptr = obj;
    tracked.is_3d = is_3d;
    tracked.window_uuid = window_uuid;  //
    tracked.material = material;

    m_tracked_objects[object_id] = tracked;
    m_object_ptr_to_id[obj.get()] = object_id;
    m_window_objects[window_uuid].insert(object_id);  //

    obj->set_observer(this);  //

    if (is_3d) {
      visualization::Scene3DUpdate scene_update;
      scene_update.set_window_id(window_uuid);
      scene_update.set_window_name(window_name);
      auto* cmd = scene_update.add_commands()->mutable_add_object();  //
      cmd->set_id(object_id);
      cmd->mutable_material()->CopyFrom(material);
      populate_3d_geometry(obj, cmd);  //
      send_update(scene_update);
    } else {
      visualization::Scene2DUpdate scene_update;
      scene_update.set_window_id(window_uuid);
      scene_update.set_window_name(window_name);
      auto* cmd = scene_update.add_commands()->mutable_add_object();  //
      cmd->set_id(object_id);
      cmd->mutable_material()->CopyFrom(material);
      populate_2d_geometry(obj, cmd);  //
      send_update(scene_update);
    }
  }

  void clear_static(const std::string& window_name, bool is_3d) {
    std::lock_guard<std::mutex> lock(m_mutex);
    cleanup_expired_objects();

    // 将窗口名称转换为UUID
    std::string window_uuid = get_uuid_for_name(window_name, is_3d);
    if (window_uuid.empty()) {
      std::cout << "❌ 清除静态对象失败：找不到窗口 '" << window_name << "'"
                << std::endl;
      return;
    }

    auto it = m_window_objects.find(window_uuid);  // 使用UUID查找
    if (it == m_window_objects.end()) {
      std::cout << "❌ 清除静态对象失败：窗口 '" << window_name
                << "' 中没有对象" << std::endl;
      return;
    }

    std::vector<std::string> to_remove;
    for (const auto& object_id : it->second) {
      auto tracked_it = m_tracked_objects.find(object_id);
      if (tracked_it != m_tracked_objects.end()) {
        if (tracked_it->second.obj_ptr.expired()) {
          to_remove.push_back(object_id);
        }
      }
    }

    // std::cout << "🗑️ 清除静态对象：找到 " << to_remove.size() << "
    // 个过期对象"
    //           << std::endl;
    for (const auto& id : to_remove) {
      remove_object_internal(id);
    }
  }

  void clear_dynamic(const std::string& window_name, bool is_3d) {
    (void)is_3d;
    std::lock_guard<std::mutex> lock(m_mutex);
    cleanup_expired_objects();

    // std::cout << "🔍 开始清除动态对象 - 窗口名称: " << window_name <<
    // std::endl;

    // 将窗口名称转换为UUID
    std::string window_uuid = get_uuid_for_name(window_name, is_3d);
    if (window_uuid.empty()) {
      std::cout << "❌ 找不到窗口名称对应的UUID: " << window_name << std::endl;
      return;
    }

    auto it = m_window_objects.find(window_uuid);
    if (it == m_window_objects.end()) {
      std::cout << "❌ 找不到窗口UUID对应的对象集合: " << window_uuid
                << std::endl;
      return;
    }

    // std::cout << "📊 窗口 " << window_name
    //           << " 中的对象数量: " << it->second.size() << std::endl;

    std::vector<std::string> to_remove;
    for (const auto& object_id : it->second) {
      auto tracked_it = m_tracked_objects.find(object_id);
      if (tracked_it == m_tracked_objects.end()) {
        continue;
      }

      const auto& tracked = tracked_it->second;
      auto obj = tracked.obj_ptr.lock();
      if (obj) {
        // std::cout << "🗑️ 标记要删除的动态对象: " << object_id << std::endl;
        to_remove.push_back(object_id);
      } else {
        std::cout << "⚠️ 对象已过期: " << object_id << std::endl;
      }
    }

    // std::cout << "🔨 准备删除 " << to_remove.size() << " 个对象" <<
    // std::endl;

    for (const auto& id : to_remove) {
      remove_object_internal(id);
    }

    // std::cout << "✅ 动态对象清除完成" << std::endl;
  }

  void clear(const std::string& window_name, bool is_3d) {
    std::lock_guard<std::mutex> lock(m_mutex);

    // 将窗口名称转换为UUID
    std::string window_uuid = get_uuid_for_name(window_name, is_3d);
    if (window_uuid.empty()) {
      std::cout << "❌ 清除所有对象失败：找不到窗口 '" << window_name << "'"
                << std::endl;
      return;
    }

    clear_unlocked(window_uuid);  // 传入UUID而不是名称
  }

  void on_update(Vis::Observable* subject) override {
    std::lock_guard<std::mutex> lock(m_mutex);
    cleanup_expired_objects();

    auto it = m_object_ptr_to_id.find(subject);
    if (it == m_object_ptr_to_id.end()) return;

    const std::string& object_id = it->second;
    auto tracked_it = m_tracked_objects.find(object_id);
    if (tracked_it == m_tracked_objects.end()) return;

    const auto& tracked = tracked_it->second;

    if (tracked.is_3d) {
      m_dirty_objects_3d[tracked.window_uuid].insert(object_id);
      if (m_auto_update_enabled &&
          m_dirty_objects_3d[tracked.window_uuid].size() >=
              static_cast<size_t>(m_update_threshold)) {
        flush_dirty_set_3d_unlocked(tracked.window_uuid);
      }
    } else {
      m_dirty_objects_2d[tracked.window_uuid].insert(object_id);
      if (m_auto_update_enabled &&
          m_dirty_objects_2d[tracked.window_uuid].size() >=
              static_cast<size_t>(m_update_threshold)) {
        flush_dirty_set_2d_unlocked(tracked.window_uuid);
      }
    }
  }

  void drawnow(const std::string& name, const bool& is_3d) {
    std::lock_guard<std::mutex> lock(m_mutex);
    cleanup_expired_objects();
    // 将窗口名称转换为UUID
    std::string window_uuid = get_uuid_for_name(name, is_3d);
    if (window_uuid.empty()) {
      std::cerr << "❌ 错误：找不到名为 '" << name << "' 的窗口" << std::endl;
      return;
    }
    if (is_3d) {
      flush_dirty_set_3d_unlocked(window_uuid);
    } else {
      flush_dirty_set_2d_unlocked(window_uuid);
    }
  }

  void set_auto_update_policy(bool enabled, int threshold, int interval_ms) {
    std::lock_guard<std::mutex> lock(m_mutex);
    bool was_enabled = m_auto_update_enabled && m_update_interval > 0;
    m_auto_update_enabled = enabled;
    m_update_threshold = threshold;
    m_update_interval = interval_ms;
    bool is_enabled = m_auto_update_enabled && m_update_interval > 0;

    if (!was_enabled && is_enabled) {
      m_server.get_io_service().post([this]() { schedule_auto_flush(); });
    } else if (was_enabled && !is_enabled) {
      m_server.get_io_service().post([this]() { m_timer->cancel(); });
    }
  }

  std::vector<std::string> get_connected_windows() {
    std::lock_guard<std::mutex> lock(m_mutex);
    std::vector<std::string> ids;
    if (m_has_connection) {
      // 返回所有窗口名称
      for (const auto& [name, _] : m_windows) {
        ids.push_back(name);
      }
    }
    return ids;
  }

  bool create_window(const std::string& name, bool is_3d) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (name.empty()) {
      std::cerr << "❌ 错误：窗口名称不能为空。" << std::endl;
      return false;
    }
    // 检查名称是否重复（统一检查）
    if (m_window_name_to_uuid.count(name)) {
      std::cerr << "❌ 错误：已存在名为 '" << name << "' 的窗口。" << std::endl;
      return false;
    }
    // 创建UUID和窗口信息
    boost::uuids::uuid uuid = boost::uuids::random_generator()();
    std::string window_uuid = to_string(uuid);

    // 存储双向映射关系
    m_window_name_to_uuid[name] = window_uuid;
    m_windows[window_uuid] = WindowInfo{window_uuid, is_3d, name};

    if (m_has_connection) {
      send_window_create_command(window_uuid, name, is_3d);
    }

    std::cout << "✅ 成功创建窗口: UUID=" << window_uuid << ", 名称=" << name
              << ", 类型=" << (is_3d ? "3D" : "2D") << std::endl;
    return true;
  }
  bool rename_window(const std::string& old_name, const std::string& new_name,
                     bool is_3d) {
    std::lock_guard<std::mutex> lock(m_mutex);

    if (new_name.empty()) {
      std::cerr << "❌ 错误：新窗口名称不能为空。" << std::endl;
      return false;
    }

    // 检查新名称是否已存在（并且不是自己）
    if (old_name != new_name && m_window_name_to_uuid.count(new_name)) {
      std::cerr << "❌ 错误：已存在名为 '" << new_name << "' 的窗口。"
                << std::endl;
      return false;
    }

    // 查找旧名称对应的UUID
    auto it = m_window_name_to_uuid.find(old_name);
    if (it == m_window_name_to_uuid.end()) {
      std::cerr << "❌ 错误：找不到名为 '" << old_name << "' 的窗口。"
                << std::endl;
      return false;
    }

    std::string uuid = it->second;

    // 更新名称映射
    m_window_name_to_uuid.erase(it);
    m_window_name_to_uuid[new_name] = uuid;

    // 更新 m_windows 中的显示名称
    m_windows[uuid].display_name = new_name;

    // 向前端发送SetTitle命令
    if (is_3d) {
      visualization::Scene3DUpdate u;
      u.set_window_id(uuid);
      u.add_commands()->mutable_set_title()->set_title(new_name);
      send_update(u);
    } else {
      visualization::Scene2DUpdate u;
      u.set_window_id(uuid);
      u.add_commands()->mutable_set_title()->set_title(new_name);
      send_update(u);
    }

    return true;
  }
  bool remove_window(const std::string& name, bool is_3d) {
    std::lock_guard<std::mutex> lock(m_mutex);

    // 使用统一映射查找UUID
    auto it = m_window_name_to_uuid.find(name);
    if (it == m_window_name_to_uuid.end()) {
      std::cout << "⚠️ 尝试删除不存在的窗口: " << name << std::endl;
      return false;
    }

    std::string uuid = it->second;

    // 验证窗口类型是否匹配
    auto window_it = m_windows.find(uuid);
    if (window_it == m_windows.end() || window_it->second.is_3d != is_3d) {
      std::cerr << "❌ 错误：窗口类型不匹配。" << std::endl;
      return false;
    }

    send_window_delete_command(uuid, is_3d);
    clear_unlocked(uuid);
    m_windows.erase(uuid);
    m_window_name_to_uuid.erase(it);

    std::cout << "🗑️ 删除窗口: 名称=" << name << ", UUID=" << uuid << std::endl;
    return true;
  }
  /**
   * 发送窗口删除命令到前端
   */
  void send_window_delete_command(const std::string& window_uuid, bool is_3d) {
    if (!m_has_connection) return;

    std::string window_name = "";
    auto window_it = m_windows.find(window_uuid);
    if (window_it != m_windows.end()) {
      window_name = window_it->second.display_name;
    }

    if (is_3d) {
      visualization::Scene3DUpdate scene_update;
      scene_update.set_window_id(window_uuid);
      scene_update.set_window_name(window_name);
      auto* cmd = scene_update.add_commands()->mutable_delete_window();
      cmd->set_window_id(window_uuid);
      send_update(scene_update);
    } else {
      visualization::Scene2DUpdate scene_update;
      scene_update.set_window_id(window_uuid);
      scene_update.set_window_name(window_name);
      auto* cmd = scene_update.add_commands()->mutable_delete_window();
      cmd->set_window_id(window_uuid);
      send_update(scene_update);
    }

    std::cout << "📤 发送窗口删除命令: UUID=" << window_uuid
              << ", 名称=" << window_name << std::endl;
  }
  template <typename CommandType, typename SceneUpdateType>
  void send_window_command(const std::string& window_name, bool is_3d,
                           std::function<void(CommandType*)> cmd_filler) {
    std::string window_id = get_window_id_for_name(window_name, is_3d);
    if (window_id.empty()) return;

    SceneUpdateType u;
    u.set_window_id(window_id);
    cmd_filler(u.add_commands());
    send_update(u);
  }

  std::vector<std::string> get_window_names(const bool& is_3d) {
    std::lock_guard<std::mutex> lock(m_mutex);
    std::vector<std::string> names;
    for (const auto& [name, uuid] : m_window_name_to_uuid) {
      auto window_it = m_windows.find(uuid);
      if (window_it != m_windows.end() && window_it->second.is_3d == is_3d) {
        names.push_back(name);
      }
    }
    return names;
  }

  size_t get_windows_number() const {
    std::lock_guard<std::mutex> lock(m_mutex);
    return m_windows.size();
  }

  size_t get_observables_number() const {
    std::lock_guard<std::mutex> lock(m_mutex);
    return m_tracked_objects.size();
  }

 private:
  server m_server;
  std::unique_ptr<steady_timer> m_timer;
  uint16_t m_port;
  std::thread m_thread;
  mutable std::mutex m_mutex;
  std::atomic<uint64_t> m_next_object_id{1};

  // 单连接模式
  connection_hdl m_current_connection;
  bool m_has_connection = false;

  std::unordered_map<std::string, TrackedObject> m_tracked_objects;
  std::unordered_map<Vis::Observable*, std::string> m_object_ptr_to_id;
  std::unordered_map<std::string, std::unordered_set<std::string>>
      m_window_objects;
  std::unordered_map<std::string, std::unordered_set<std::string>>
      m_dirty_objects_2d;
  std::unordered_map<std::string, std::unordered_set<std::string>>
      m_dirty_objects_3d;
  // 窗口名称到UUID的映射（2D和3D统一管理）
  std::unordered_map<std::string, std::string> m_window_name_to_uuid;
  std::unordered_map<std::string, WindowInfo> m_windows;
  std::atomic<size_t> m_next_window_index{0};

  bool m_auto_update_enabled;
  int m_update_threshold;
  int m_update_interval;

  // 私有方法实现...
  std::string get_uuid_for_name(const std::string& name, bool is_3d) const {
    auto it = m_window_name_to_uuid.find(name);
    if (it != m_window_name_to_uuid.end()) {
      // 验证窗口类型
      auto window_it = m_windows.find(it->second);
      if (window_it != m_windows.end() && window_it->second.is_3d == is_3d) {
        return it->second;
      }
    }
    return "";  // 返回空字符串表示未找到
  }
  // 内部不加锁的清除方法
  void clear_unlocked(const std::string& window_uuid) {
    cleanup_expired_objects();

    auto it = m_window_objects.find(window_uuid);
    if (it == m_window_objects.end()) {
      // std::cout << "窗口UUID '" << window_uuid
      //           << "' 中没有对象" << std::endl;
      return;
    }

    std::vector<std::string> to_remove(it->second.begin(), it->second.end());
    // std::cout << "🗑️ 清除所有对象：找到 " << to_remove.size() << " 个对象"
    //           << std::endl;

    for (const auto& id : to_remove) {
      remove_object_internal(id);
    }

    // 清理窗口对象集合
    m_window_objects.erase(window_uuid);
    // std::cout << "✅ 窗口 '" << window_uuid << "' 的所有对象已清除"
    //           << std::endl;
  }

  void cleanup_expired_objects() {
    std::vector<std::string> expired_ids;

    for (const auto& [object_id, tracked] : m_tracked_objects) {
      if (tracked.obj_ptr.expired()) {
        expired_ids.push_back(object_id);
      }
    }

    for (const auto& id : expired_ids) {
      remove_object_internal(id);
    }
  }

  void remove_object_internal(const std::string& object_id) {
    auto it = m_tracked_objects.find(object_id);
    if (it == m_tracked_objects.end()) return;

    const auto& tracked = it->second;

    if (auto obj = tracked.obj_ptr.lock()) {
      obj->set_observer(nullptr);
      m_object_ptr_to_id.erase(obj.get());
    }

    m_window_objects[tracked.window_uuid].erase(object_id);

    if (tracked.is_3d) {
      m_dirty_objects_3d[tracked.window_uuid].erase(object_id);
    } else {
      m_dirty_objects_2d[tracked.window_uuid].erase(object_id);
    }

    // 这里直接使用 tracked.window_uuid，不需要再次查找
    std::string window_name = "";
    auto window_it = m_windows.find(tracked.window_uuid);
    if (window_it != m_windows.end()) {
      window_name = window_it->second.display_name;
    }

    if (tracked.is_3d) {
      visualization::Scene3DUpdate u;
      u.set_window_id(tracked.window_uuid);  // 直接使用窗口UUID
      u.set_window_name(window_name);
      u.add_commands()->mutable_delete_object()->set_id(object_id);
      send_update(u);
      // std::cout << "📤 发送3D删除命令 - 窗口: " << window_name
      //           << ", 对象: " << object_id << std::endl;
    } else {
      visualization::Scene2DUpdate u;
      u.set_window_id(tracked.window_uuid);  // 直接使用窗口UUID
      u.set_window_name(window_name);
      u.add_commands()->mutable_delete_object()->set_id(object_id);
      send_update(u);
      // std::cout << "📤 发送2D删除命令 - 窗口: " << window_name
      //           << ", 对象: " << object_id << std::endl;
    }

    m_tracked_objects.erase(it);
  }

  void flush_dirty_set_2d_unlocked(const std::string& window_uuid) {
    auto& dirty_set = m_dirty_objects_2d[window_uuid];
    if (dirty_set.empty()) return;

    std::string window_name = "";
    auto window_it = m_windows.find(window_uuid);
    if (window_it != m_windows.end()) {
      window_name = window_it->second.display_name;
    }

    visualization::Scene2DUpdate scene_update;
    scene_update.set_window_id(window_uuid);
    scene_update.set_window_name(window_name);

    std::vector<std::string> processed_ids;

    for (const auto& object_id : dirty_set) {
      auto it = m_tracked_objects.find(object_id);
      if (it == m_tracked_objects.end()) continue;

      const auto& tracked = it->second;
      auto obj = tracked.obj_ptr.lock();
      if (!obj) continue;

      auto* update_geom =
          scene_update.add_commands()->mutable_update_object_geometry();
      update_geom->set_id(object_id);
      populate_2d_geometry_update(obj, update_geom);

      processed_ids.push_back(object_id);
    }

    for (const auto& id : processed_ids) {
      dirty_set.erase(id);
    }

    if (scene_update.commands_size() > 0) {
      send_update(scene_update);
    }
  }

  void flush_dirty_set_3d_unlocked(const std::string& window_uuid) {
    auto& dirty_set = m_dirty_objects_3d[window_uuid];
    if (dirty_set.empty()) return;

    std::string window_name = "";
    auto window_it = m_windows.find(window_uuid);
    if (window_it != m_windows.end()) {
      window_name = window_it->second.display_name;
    }

    visualization::Scene3DUpdate scene_update;
    scene_update.set_window_id(window_uuid);
    scene_update.set_window_name(window_name);

    std::vector<std::string> processed_ids;

    for (const auto& object_id : dirty_set) {
      auto it = m_tracked_objects.find(object_id);
      if (it == m_tracked_objects.end()) continue;

      const auto& tracked = it->second;
      auto obj = tracked.obj_ptr.lock();
      if (!obj) continue;

      auto* update_geom =
          scene_update.add_commands()->mutable_update_object_geometry();
      update_geom->set_id(object_id);
      populate_3d_geometry_update(obj, update_geom);

      processed_ids.push_back(object_id);
    }

    for (const auto& id : processed_ids) {
      dirty_set.erase(id);
    }

    if (scene_update.commands_size() > 0) {
      send_update(scene_update);
    }
  }

  std::string get_window_id_for_name(const std::string& window_name,
                                     bool is_3d) {
    return get_uuid_for_name(window_name, is_3d);
  }

  void populate_2d_geometry(std::shared_ptr<Vis::Observable> obj,
                            visualization::Add2DObject* cmd) {
    if (!obj) return;
    if (auto p = std::dynamic_pointer_cast<Vis::Point2D>(obj)) {
      to_proto(*p, cmd->mutable_point_2d());
    } else if (auto p = std::dynamic_pointer_cast<Vis::Pose2D>(obj)) {
      to_proto(*p, cmd->mutable_pose_2d());
    } else if (auto p = std::dynamic_pointer_cast<Vis::Circle>(obj)) {
      to_proto(*p, cmd->mutable_circle());
    } else if (auto p = std::dynamic_pointer_cast<Vis::Box2D>(obj)) {
      to_proto(*p, cmd->mutable_box_2d());
    } else if (auto p = std::dynamic_pointer_cast<Vis::Line2D>(obj)) {
      to_proto(*p, cmd->mutable_line_2d());
    } else if (auto p = std::dynamic_pointer_cast<Vis::Trajectory2D>(obj)) {
      to_proto(*p, cmd->mutable_trajectory_2d());
    } else if (auto p = std::dynamic_pointer_cast<Vis::Polygon>(obj)) {
      to_proto(*p, cmd->mutable_polygon());
    } else {
      std::cerr << "Warning: Unknown 2D object type" << std::endl;
    }
  }

  void populate_3d_geometry(std::shared_ptr<Vis::Observable> obj,
                            visualization::Add3DObject* cmd) {
    if (auto p = std::dynamic_pointer_cast<Vis::Point3D>(obj)) {
      to_proto(*p, cmd->mutable_point_3d());
    } else if (auto p = std::dynamic_pointer_cast<Vis::Pose3D>(obj)) {
      to_proto(*p, cmd->mutable_pose_3d());
    } else if (auto p = std::dynamic_pointer_cast<Vis::Ball>(obj)) {
      to_proto(*p, cmd->mutable_ball());
    } else if (auto p = std::dynamic_pointer_cast<Vis::Box3D>(obj)) {
      to_proto(*p, cmd->mutable_box_3d());
    }
  }

  void populate_2d_geometry_update(std::shared_ptr<Vis::Observable> obj,
                                   visualization::Update2DObjectGeometry* cmd) {
    if (auto p = std::dynamic_pointer_cast<Vis::Point2D>(obj)) {
      to_proto(*p, cmd->mutable_point_2d());
    } else if (auto p = std::dynamic_pointer_cast<Vis::Pose2D>(obj)) {
      to_proto(*p, cmd->mutable_pose_2d());
    } else if (auto p = std::dynamic_pointer_cast<Vis::Circle>(obj)) {
      to_proto(*p, cmd->mutable_circle());
    } else if (auto p = std::dynamic_pointer_cast<Vis::Box2D>(obj)) {
      to_proto(*p, cmd->mutable_box_2d());
    } else if (auto p = std::dynamic_pointer_cast<Vis::Line2D>(obj)) {
      to_proto(*p, cmd->mutable_line_2d());
    } else if (auto p = std::dynamic_pointer_cast<Vis::Trajectory2D>(obj)) {
      to_proto(*p, cmd->mutable_trajectory_2d());
    } else if (auto p = std::dynamic_pointer_cast<Vis::Polygon>(obj)) {
      to_proto(*p, cmd->mutable_polygon());
    }
  }

  void populate_3d_geometry_update(std::shared_ptr<Vis::Observable> obj,
                                   visualization::Update3DObjectGeometry* cmd) {
    if (auto p = std::dynamic_pointer_cast<Vis::Point3D>(obj)) {
      to_proto(*p, cmd->mutable_point_3d());
    } else if (auto p = std::dynamic_pointer_cast<Vis::Pose3D>(obj)) {
      to_proto(*p, cmd->mutable_pose_3d());
    } else if (auto p = std::dynamic_pointer_cast<Vis::Ball>(obj)) {
      to_proto(*p, cmd->mutable_ball());
    } else if (auto p = std::dynamic_pointer_cast<Vis::Box3D>(obj)) {
      to_proto(*p, cmd->mutable_box_3d());
    }
  }

  void schedule_auto_flush() {
    m_timer->expires_after(std::chrono::milliseconds(m_update_interval));
    m_timer->async_wait(
        std::bind(&ServerImpl::handle_auto_flush, this, std::placeholders::_1));
  }

  void handle_auto_flush(const boost::system::error_code& ec) {
    if (ec) return;

    std::lock_guard<std::mutex> lock(m_mutex);
    cleanup_expired_objects();

    for (const auto& [window_name, _] : m_dirty_objects_2d) {
      flush_dirty_set_2d_unlocked(window_name);
    }
    for (const auto& [window_name, _] : m_dirty_objects_3d) {
      flush_dirty_set_3d_unlocked(window_name);
    }

    if (m_auto_update_enabled && m_update_interval > 0) {
      schedule_auto_flush();
    }
  }
  /**
   * 发送窗口创建命令到前端
   */
  void send_window_create_command(const std::string& uuid,
                                  const std::string& window_name, bool is_3d) {
    if (!m_has_connection) return;

    if (is_3d) {
      visualization::Scene3DUpdate scene_update;
      scene_update.set_window_id(uuid);
      scene_update.set_window_name(window_name);
      auto* cmd = scene_update.add_commands()->mutable_create_window();
      cmd->set_window_name(window_name);
      cmd->set_window_id(uuid);
      send_update(scene_update);
    } else {
      visualization::Scene2DUpdate scene_update;
      scene_update.set_window_id(uuid);
      scene_update.set_window_name(window_name);
      auto* cmd = scene_update.add_commands()->mutable_create_window();
      cmd->set_window_name(window_name);
      cmd->set_window_id(uuid);
      send_update(scene_update);
    }

    // std::cout << "📤 发送窗口创建命令: " << window_name << std::endl;
  }

  void send_existing_objects(const std::string& window_uuid, bool is_3d) {
    auto it = m_window_objects.find(window_uuid);
    if (it == m_window_objects.end()) return;

    for (const auto& object_id : it->second) {
      auto tracked_it = m_tracked_objects.find(object_id);
      if (tracked_it == m_tracked_objects.end()) continue;

      const auto& tracked = tracked_it->second;
      auto obj = tracked.obj_ptr.lock();
      if (!obj) continue;

      if (is_3d) {
        visualization::Scene3DUpdate scene_update;
        scene_update.set_window_id(window_uuid);
        auto* cmd = scene_update.add_commands()->mutable_add_object();
        cmd->set_id(object_id);
        cmd->mutable_material()->CopyFrom(tracked.material);
        populate_3d_geometry(obj, cmd);
        send_update(scene_update);
      } else {
        visualization::Scene2DUpdate scene_update;
        scene_update.set_window_id(window_uuid);
        auto* cmd = scene_update.add_commands()->mutable_add_object();
        cmd->set_id(object_id);
        cmd->mutable_material()->CopyFrom(tracked.material);
        populate_2d_geometry(obj, cmd);
        send_update(scene_update);
      }
    }
  }

  void on_open(connection_hdl hdl) {
    std::lock_guard<std::mutex> lock(m_mutex);
    m_current_connection = hdl;
    m_has_connection = true;

    // 为所有已创建的窗口发送创建命令和现有对象
    for (const auto& [window_uuid, window_info] : m_windows) {
      send_window_create_command(window_uuid, window_info.display_name,
                                 window_info.is_3d);
      send_existing_objects(window_uuid, window_info.is_3d);
    }

    std::cout << "✅ 客户端连接成功，已发送 " << m_windows.size()
              << " 个窗口信息" << std::endl;
  }

  void on_close(connection_hdl hdl) {
    (void)hdl;  // 明确标记参数未使用
    std::lock_guard<std::mutex> lock(m_mutex);
    m_has_connection = false;
    std::cout << "Client disconnected." << std::endl;
  }

};  // ServerImpl 类定义结束

// --- VisualizationServer 实现 ---
uint16_t VisualizationServer::m_port = 0;
bool VisualizationServer::m_initialized = false;

void VisualizationServer::init(uint16_t port) {
  if (!m_initialized) {
    m_port = port;
    m_initialized = true;
  }
}

VisualizationServer& VisualizationServer::get() {
  if (!m_initialized) {
    throw std::runtime_error(
        "VisualizationServer::init() must be called before get().");
  }
  static VisualizationServer instance;
  return instance;
}

VisualizationServer::VisualizationServer()
    : m_impl(std::make_unique<ServerImpl>(m_port)) {}

VisualizationServer::~VisualizationServer() = default;
VisualizationServer::VisualizationServer(VisualizationServer&&) noexcept =
    default;
VisualizationServer& VisualizationServer::operator=(
    VisualizationServer&&) noexcept = default;

// Public API forwarding
void VisualizationServer::run() { m_impl->run(); }
void VisualizationServer::stop() { m_impl->stop(); }
std::vector<std::string> VisualizationServer::get_connected_windows() {
  return m_impl->get_connected_windows();
}
bool VisualizationServer::is_connected() const {
  return m_impl->is_connected();
}
void VisualizationServer::add(std::shared_ptr<Vis::Observable> obj,
                              const std::string& name,
                              const visualization::Material& material,
                              bool is_3d) {
  m_impl->add(obj, name, material, is_3d);
}

void VisualizationServer::add(const Vis::Observable& obj,
                              const std::string& name,
                              const visualization::Material& material,
                              bool is_3d) {
  m_impl->add(obj, name, material, is_3d);
}

void VisualizationServer::clear_static(const std::string& name, bool is_3d) {
  m_impl->clear_static(name, is_3d);
}

void VisualizationServer::clear_dynamic(const std::string& name, bool is_3d) {
  m_impl->clear_dynamic(name, is_3d);
}

void VisualizationServer::clear(const std::string& name, bool is_3d) {
  m_impl->clear(name, is_3d);
}

void VisualizationServer::drawnow(const std::string& name, const bool& is_3d) {
  m_impl->drawnow(name, is_3d);
}

void VisualizationServer::set_auto_update_policy(bool enabled, int threshold,
                                                 int interval_ms) {
  m_impl->set_auto_update_policy(enabled, threshold, interval_ms);
}

bool VisualizationServer::create_window(const std::string& name,
                                        const bool& is_3d) {
  m_impl->create_window(name, is_3d);
}

bool VisualizationServer::remove_window(const std::string& name,
                                        const bool& is_3d) {
  return m_impl->remove_window(name, is_3d);
}

bool VisualizationServer::rename_window(const std::string& old_name,
                                        const std::string& new_name,
                                        bool is_3d) {
  return m_impl->rename_window(old_name, new_name, is_3d);
}

void VisualizationServer::set_grid_visible(const std::string& name,
                                           bool visible, bool is_3d) {
  m_impl->send_window_command<visualization::Command3D,
                              visualization::Scene3DUpdate>(
      name, is_3d, [&](auto* cmd) {
        cmd->mutable_set_grid_visible()->set_visible(visible);
      });
}

void VisualizationServer::set_axes_visible(const std::string& name,
                                           bool visible, bool is_3d) {
  m_impl->send_window_command<visualization::Command3D,
                              visualization::Scene3DUpdate>(
      name, is_3d, [&](auto* cmd) {
        cmd->mutable_set_axes_visible()->set_visible(visible);
      });
}

void VisualizationServer::set_legend_visible(const std::string& name,
                                             bool visible, bool is_3d) {
  m_impl->send_window_command<visualization::Command3D,
                              visualization::Scene3DUpdate>(
      name, is_3d,
      [&](auto* cmd) { cmd->mutable_set_legend()->set_visible(visible); });
}

std::vector<std::string> VisualizationServer::get_window_names(
    const bool& is_3d) {
  return m_impl->get_window_names(is_3d);
}

size_t VisualizationServer::get_windows_number() const {
  return m_impl->get_windows_number();
}

size_t VisualizationServer::get_observables_number() const {
  return m_impl->get_observables_number();
}