// vis_stream/cpp_backend/src/visualization_server.cpp
#include "vis_stream.h"  // 必须首先包含自己的头文件

// 在这里包含所有必要的头文件
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
    std::string id;
    std::weak_ptr<Vis::Observable> obj_ptr;
    bool is_3d;
    std::string window_name;
    size_t window_idx;
    visualization::Material material;
  };

  struct WindowInfo {
    std::string name;
    bool is_3d;
    std::string display_name;
  };

  ServerImpl(uint16_t port)
      : m_port(port),
        m_auto_update_enabled(false),
        m_update_threshold(0),
        m_update_interval(0) {
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
      for (const auto& pair : m_connections) {
        websocketpp::lib::error_code ec;
        m_server.close(pair.second, websocketpp::close::status::going_away, "",
                       ec);
      }
      m_server.stop();
    }
    if (m_thread.joinable()) {
      m_thread.join();
    }
  }

  template <typename T>
  void send_update(const T& update) {
    if (m_connections.empty() || update.window_id().empty()) return;
    if (m_connections.count(update.window_id()) == 0) return;
    auto hdl = m_connections.at(update.window_id());
    visualization::VisMessage vis_msg;
    if constexpr (std::is_same_v<T, visualization::Scene3DUpdate>) {
      vis_msg.mutable_scene_3d_update()->CopyFrom(update);
    } else if constexpr (std::is_same_v<T, visualization::Scene2DUpdate>) {
      vis_msg.mutable_scene_2d_update()->CopyFrom(update);
    } else {
      return;
    }
    std::string serialized_msg;
    vis_msg.SerializeToString(&serialized_msg);
    m_server.send(hdl, serialized_msg, websocketpp::frame::opcode::binary);
  }

  void add(std::shared_ptr<Vis::Observable> obj, const std::string& window_name,
           const visualization::Material& material, bool is_3d) {
    if (!obj) return;
    std::lock_guard<std::mutex> lock(m_mutex);
    cleanup_expired_objects();

    std::string object_id = "obj_" + std::to_string(m_next_object_id++);

    TrackedObject tracked;
    tracked.id = object_id;
    tracked.obj_ptr = obj;
    tracked.is_3d = is_3d;
    tracked.window_name = window_name;
    tracked.window_idx = 0;
    tracked.material = material;

    m_tracked_objects[object_id] = tracked;
    m_object_ptr_to_id[obj.get()] = object_id;
    m_window_objects[window_name].insert(object_id);

    obj->set_observer(this);

    std::string window_id = get_window_id_for_name(window_name, is_3d);
    if (window_id.empty()) return;

    if (is_3d) {
      visualization::Scene3DUpdate scene_update;
      scene_update.set_window_id(window_id);
      auto* cmd = scene_update.add_commands()->mutable_add_object();
      cmd->set_id(object_id);
      cmd->mutable_material()->CopyFrom(material);
      populate_3d_geometry(obj, cmd);
      send_update(scene_update);
    } else {
      visualization::Scene2DUpdate scene_update;
      scene_update.set_window_id(window_id);
      auto* cmd = scene_update.add_commands()->mutable_add_object();
      cmd->set_id(object_id);
      cmd->mutable_material()->CopyFrom(material);
      populate_2d_geometry(obj, cmd);
      send_update(scene_update);
    }
  }

  void add(const Vis::Observable& obj, const std::string& window_name,
           const visualization::Material& material, bool is_3d) {
    auto obj_copy = clone_to_shared(obj);
    if (obj_copy) {
      add(obj_copy, window_name, material, is_3d);
    }
  }

  void clear_dynamic(const std::string& window_name) {
    std::lock_guard<std::mutex> lock(m_mutex);
    cleanup_expired_objects();

    auto it = m_window_objects.find(window_name);
    if (it == m_window_objects.end()) return;

    std::vector<std::string> to_remove;
    for (const auto& object_id : it->second) {
      auto tracked_it = m_tracked_objects.find(object_id);
      if (tracked_it != m_tracked_objects.end()) {
        auto obj = tracked_it->second.obj_ptr.lock();
        if (obj) {
          to_remove.push_back(object_id);
        }
      }
    }

    for (const auto& id : to_remove) {
      remove_object_internal(id);
    }
  }

  void clear_static(const std::string& window_name) {
    std::lock_guard<std::mutex> lock(m_mutex);
    cleanup_expired_objects();

    auto it = m_window_objects.find(window_name);
    if (it == m_window_objects.end()) return;

    std::vector<std::string> to_remove;
    for (const auto& object_id : it->second) {
      auto tracked_it = m_tracked_objects.find(object_id);
      if (tracked_it != m_tracked_objects.end()) {
        if (tracked_it->second.obj_ptr.expired()) {
          to_remove.push_back(object_id);
        }
      }
    }

    for (const auto& id : to_remove) {
      remove_object_internal(id);
    }
  }

  void clear(const std::string& window_name) {
    std::lock_guard<std::mutex> lock(m_mutex);
    cleanup_expired_objects();

    auto it = m_window_objects.find(window_name);
    if (it == m_window_objects.end()) return;

    std::vector<std::string> to_remove(it->second.begin(), it->second.end());
    for (const auto& id : to_remove) {
      remove_object_internal(id);
    }
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
      m_dirty_objects_3d[tracked.window_name].insert(object_id);
      if (m_auto_update_enabled &&
          m_dirty_objects_3d[tracked.window_name].size() >=
              static_cast<size_t>(m_update_threshold)) {
        flush_dirty_set_3d_unlocked(tracked.window_name);
      }
    } else {
      m_dirty_objects_2d[tracked.window_name].insert(object_id);
      if (m_auto_update_enabled &&
          m_dirty_objects_2d[tracked.window_name].size() >=
              static_cast<size_t>(m_update_threshold)) {
        flush_dirty_set_2d_unlocked(tracked.window_name);
      }
    }
  }

  void drawnow(const std::string& name, const bool& is_3d) {
    std::lock_guard<std::mutex> lock(m_mutex);
    cleanup_expired_objects();

    if (is_3d) {
      flush_dirty_set_3d_unlocked(name);
    } else {
      flush_dirty_set_2d_unlocked(name);
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
    ids.reserve(m_connections.size());
    for (const auto& pair : m_connections) ids.push_back(pair.first);
    return ids;
  }

  void create_window(const std::string& name, bool is_3d) {
    std::lock_guard<std::mutex> lock(m_mutex);

    std::string window_name =
        name.empty() ? "window_" + std::to_string(m_next_window_index++) : name;

    m_windows[window_name] = WindowInfo{window_name, is_3d, window_name};

    std::cout << "Created " << (is_3d ? "3D" : "2D")
              << " window: " << window_name << std::endl;
  }

  bool remove_window(const std::string& name, bool is_3d) {
    std::lock_guard<std::mutex> lock(m_mutex);

    auto it = m_windows.find(name);
    if (it == m_windows.end() || it->second.is_3d != is_3d) {
      return false;
    }

    clear(name);
    m_windows.erase(it);

    std::cout << "Removed window: " << name << std::endl;
    return true;
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

  std::vector<std::string> get_windows_name(const bool& is_3d) {
    std::lock_guard<std::mutex> lock(m_mutex);
    std::vector<std::string> names;
    for (const auto& [name, info] : m_windows) {
      if (info.is_3d == is_3d) {
        names.push_back(name);
      }
    }
    return names;
  }

  size_t getTotalWindows() const { return m_windows.size(); }

  size_t getTotalObservables() const { return m_tracked_objects.size(); }

 private:
  server m_server;
  std::unique_ptr<steady_timer> m_timer;
  uint16_t m_port;
  std::thread m_thread;
  std::mutex m_mutex;
  std::atomic<uint64_t> m_next_object_id{1};

  std::unordered_map<std::string, TrackedObject> m_tracked_objects;
  std::unordered_map<Vis::Observable*, std::string> m_object_ptr_to_id;
  std::unordered_map<std::string, std::unordered_set<std::string>>
      m_window_objects;
  std::unordered_map<std::string, std::unordered_set<std::string>>
      m_dirty_objects_2d;
  std::unordered_map<std::string, std::unordered_set<std::string>>
      m_dirty_objects_3d;

  std::unordered_map<std::string, WindowInfo> m_windows;
  std::atomic<size_t> m_next_window_index{0};

  bool m_auto_update_enabled;
  int m_update_threshold;
  int m_update_interval;
  std::map<std::string, connection_hdl> m_connections;

  // 私有方法实现...
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

    m_window_objects[tracked.window_name].erase(object_id);

    if (tracked.is_3d) {
      m_dirty_objects_3d[tracked.window_name].erase(object_id);
    } else {
      m_dirty_objects_2d[tracked.window_name].erase(object_id);
    }

    std::string window_id =
        get_window_id_for_name(tracked.window_name, tracked.is_3d);
    if (!window_id.empty()) {
      if (tracked.is_3d) {
        visualization::Scene3DUpdate u;
        u.set_window_id(window_id);
        u.add_commands()->mutable_delete_object()->set_id(object_id);
        send_update(u);
      } else {
        visualization::Scene2DUpdate u;
        u.set_window_id(window_id);
        u.add_commands()->mutable_delete_object()->set_id(object_id);
        send_update(u);
      }
    }

    m_tracked_objects.erase(it);
  }

  void flush_dirty_set_2d_unlocked(const std::string& window_name) {
    auto& dirty_set = m_dirty_objects_2d[window_name];
    if (dirty_set.empty()) return;

    std::string window_id = get_window_id_for_name(window_name, false);
    if (window_id.empty()) return;

    visualization::Scene2DUpdate scene_update;
    scene_update.set_window_id(window_id);

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

  void flush_dirty_set_3d_unlocked(const std::string& window_name) {
    auto& dirty_set = m_dirty_objects_3d[window_name];
    if (dirty_set.empty()) return;

    std::string window_id = get_window_id_for_name(window_name, true);
    if (window_id.empty()) return;

    visualization::Scene3DUpdate scene_update;
    scene_update.set_window_id(window_id);

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
    auto window_it = m_windows.find(window_name);
    if (window_it == m_windows.end() || window_it->second.is_3d != is_3d) {
      return "";
    }

    for (const auto& pair : m_connections) {
      return pair.first;
    }
    return "";
  }

  void populate_2d_geometry(std::shared_ptr<Vis::Observable> obj,
                            visualization::Add2DObject* cmd) {
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

  void on_open(connection_hdl hdl) {
    std::lock_guard<std::mutex> lock(m_mutex);
    std::string window_id =
        boost::uuids::to_string(boost::uuids::random_generator()());
    m_connections[window_id] = hdl;
    std::cout << "Client connected. Assigned window_id: " << window_id
              << std::endl;
  }

  void on_close(connection_hdl hdl) {
    std::lock_guard<std::mutex> lock(m_mutex);
    for (auto it = m_connections.begin(); it != m_connections.end(); ++it) {
      if (!it->second.owner_before(hdl) && !hdl.owner_before(it->second)) {
        std::cout << "Client disconnected: " << it->first << std::endl;
        m_connections.erase(it);
        break;
      }
    }
  }
};

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

void VisualizationServer::add(std::shared_ptr<Vis::Observable> obj,
                              const std::string& window_name,
                              const visualization::Material& material,
                              bool is_3d) {
  m_impl->add(obj, window_name, material, is_3d);
}

void VisualizationServer::add(std::shared_ptr<Vis::Observable> obj,
                              const size_t& window_idx,
                              const visualization::Material& material,
                              bool is_3d) {
  m_impl->add(obj, "window_" + std::to_string(window_idx), material, is_3d);
}

void VisualizationServer::add(const Vis::Observable& obj,
                              const std::string& window_name,
                              const visualization::Material& material,
                              bool is_3d) {
  m_impl->add(obj, window_name, material, is_3d);
}

void VisualizationServer::add(const Vis::Observable& obj,
                              const size_t& window_idx,
                              const visualization::Material& material,
                              bool is_3d) {
  m_impl->add(obj, "window_" + std::to_string(window_idx), material, is_3d);
}

void VisualizationServer::clear_static(const std::string& window_name) {
  m_impl->clear_static(window_name);
}

void VisualizationServer::clear_static(const size_t& window_idx) {
  m_impl->clear_static("window_" + std::to_string(window_idx));
}

void VisualizationServer::clear_dynamic(const std::string& window_name) {
  m_impl->clear_dynamic(window_name);
}

void VisualizationServer::clear_dynamic(const size_t& window_idx) {
  m_impl->clear_dynamic("window_" + std::to_string(window_idx));
}

void VisualizationServer::clear(const std::string& window_name) {
  m_impl->clear(window_name);
}

void VisualizationServer::clear(const size_t& window_idx) {
  m_impl->clear("window_" + std::to_string(window_idx));
}

void VisualizationServer::drawnow(const std::string& name, const bool& is_3d) {
  m_impl->drawnow(name, is_3d);
}

void VisualizationServer::drawnow(const size_t& window_idx, const bool& is_3d) {
  m_impl->drawnow("window_" + std::to_string(window_idx), is_3d);
}

void VisualizationServer::set_auto_update_policy(bool enabled, int threshold,
                                                 int interval_ms) {
  m_impl->set_auto_update_policy(enabled, threshold, interval_ms);
}

void VisualizationServer::create_window(const std::string& name,
                                        const bool& is_3d) {
  m_impl->create_window(name, is_3d);
}

bool VisualizationServer::remove_window(const std::string& name,
                                        const bool& is_3d) {
  return m_impl->remove_window(name, is_3d);
}

void VisualizationServer::set_title(const std::string& old_name,
                                    const std::string& name, bool is_3d) {
  m_impl->send_window_command<visualization::Command3D,
                              visualization::Scene3DUpdate>(
      old_name, is_3d,
      [&](auto* cmd) { cmd->mutable_set_title()->set_title(name); });
}

void VisualizationServer::set_title(const size_t& window_idx,
                                    const std::string& name, bool is_3d) {
  set_title("window_" + std::to_string(window_idx), name, is_3d);
}

void VisualizationServer::set_grid_visible(const std::string& name,
                                           bool visible, bool is_3d) {
  m_impl->send_window_command<visualization::Command3D,
                              visualization::Scene3DUpdate>(
      name, is_3d, [&](auto* cmd) {
        cmd->mutable_set_grid_visible()->set_visible(visible);
      });
}

void VisualizationServer::set_grid_visible(const size_t& window_idx,
                                           bool visible, bool is_3d) {
  set_grid_visible("window_" + std::to_string(window_idx), visible, is_3d);
}

void VisualizationServer::set_axes_visible(const std::string& name,
                                           bool visible, bool is_3d) {
  m_impl->send_window_command<visualization::Command3D,
                              visualization::Scene3DUpdate>(
      name, is_3d, [&](auto* cmd) {
        cmd->mutable_set_axes_visible()->set_visible(visible);
      });
}

void VisualizationServer::set_axes_visible(const size_t& window_idx,
                                           bool visible, bool is_3d) {
  set_axes_visible("window_" + std::to_string(window_idx), visible, is_3d);
}

void VisualizationServer::set_legend_visible(const std::string& name,
                                             bool visible, bool is_3d) {
  m_impl->send_window_command<visualization::Command3D,
                              visualization::Scene3DUpdate>(
      name, is_3d,
      [&](auto* cmd) { cmd->mutable_set_legend()->set_visible(visible); });
}

void VisualizationServer::set_legend_visible(const size_t& window_idx,
                                             bool visible, bool is_3d) {
  set_legend_visible("window_" + std::to_string(window_idx), visible, is_3d);
}

std::vector<std::string> VisualizationServer::get_windows_name(
    const bool& is_3d) {
  return m_impl->get_windows_name(is_3d);
}

size_t VisualizationServer::getTotalWindows() const {
  return m_impl->getTotalWindows();
}

size_t VisualizationServer::getTotalObservables() const {
  return m_impl->getTotalObservables();
}