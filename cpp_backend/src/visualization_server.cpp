// vis_stream/cpp_backend/src/visualization_server.cpp
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

#include "vis_primitives.h"
#include "vis_stream.h"
#include "visualization.pb.h"

// Helper function to convert Vis types to Proto types
namespace {
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

}  // namespace

class VisualizationServer::ServerImpl : public Vis::IObserver {
 public:
  using server = websocketpp::server<websocketpp::config::asio>;
  using connection_hdl = websocketpp::connection_hdl;
  using steady_timer = boost::asio::steady_timer;

  ServerImpl(uint16_t port)
      : m_port(port),
        m_auto_update_enabled(false),
        m_update_threshold(0),
        m_update_interval(0) {
    m_server.init_asio();
    m_server.set_reuse_addr(true);
    m_server.set_open_handler(
        bind(&ServerImpl::on_open, this, std::placeholders::_1));
    m_server.set_close_handler(
        bind(&ServerImpl::on_close, this, std::placeholders::_1));
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
      // Gracefully close all connections
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
    // 创建顶层包装消息
    visualization::VisMessage vis_msg;
    // 根据传入的 update 类型，设置 oneof 字段
    if constexpr (std::is_same_v<T, visualization::Scene3DUpdate>) {
      vis_msg.mutable_scene_3d_update()->CopyFrom(update);
    } else if constexpr (std::is_same_v<T, visualization::Scene2DUpdate>) {
      vis_msg.mutable_scene_2d_update()->CopyFrom(update);
    } else {
      // 如果有其他类型，可以在这里扩展
      return;
    }
    std::string serialized_msg;
    vis_msg.SerializeToString(&serialized_msg);  // 序列化包装消息
    m_server.send(hdl, serialized_msg, websocketpp::frame::opcode::binary);
  }

  void show(std::shared_ptr<Vis::Observable> obj, const std::string& id,
            const visualization::Material& material, bool is_3d) {
    if (!obj) return;
    std::lock_guard<std::mutex> lock(m_mutex);

    Vis::Observable* obj_ptr = obj.get();
    obj->set_observer(this);
    m_tracked_objects[obj_ptr] = {id, obj, is_3d};
    m_id_to_object_ptr[id] = obj_ptr;

    if (m_connections.empty()) return;
    // By default, send to the first connected client.
    // A more advanced implementation might allow specifying a window_id.
    std::string window_id = m_connections.begin()->first;

    if (is_3d) {
      visualization::Scene3DUpdate scene_update;
      scene_update.set_window_id(window_id);
      auto* cmd = scene_update.add_commands()->mutable_add_object();
      cmd->set_id(id);
      cmd->mutable_material()->CopyFrom(material);
      populate_3d_geometry(obj, cmd);
      send_update(scene_update);
    } else {
      visualization::Scene2DUpdate scene_update;
      scene_update.set_window_id(window_id);
      auto* cmd = scene_update.add_commands()->mutable_add_object();
      cmd->set_id(id);
      cmd->mutable_material()->CopyFrom(material);
      populate_2d_geometry(obj, cmd);
      send_update(scene_update);
    }
  }

  void remove(const std::string& id) {
    std::lock_guard<std::mutex> lock(m_mutex);
    auto it_id = m_id_to_object_ptr.find(id);
    if (it_id == m_id_to_object_ptr.end()) return;

    Vis::Observable* obj_ptr = it_id->second;
    auto tracked_info = m_tracked_objects.at(obj_ptr);

    m_id_to_object_ptr.erase(it_id);
    m_tracked_objects.erase(obj_ptr);
    m_dirty_set_2d.erase(obj_ptr);
    m_dirty_set_3d.erase(obj_ptr);
    obj_ptr->set_observer(nullptr);

    if (m_connections.empty()) return;
    std::string window_id = m_connections.begin()->first;

    if (tracked_info.is_3d) {
      visualization::Scene3DUpdate u;
      u.set_window_id(window_id);
      u.add_commands()->mutable_delete_object()->set_id(id);
      send_update(u);
    } else {
      visualization::Scene2DUpdate u;
      u.set_window_id(window_id);
      u.add_commands()->mutable_delete_object()->set_id(id);
      send_update(u);
    }
  }

  void on_update(Vis::Observable* subject) override {
    std::lock_guard<std::mutex> lock(m_mutex);
    auto it = m_tracked_objects.find(subject);
    if (it != m_tracked_objects.end()) {
      if (it->second.is_3d) {
        m_dirty_set_3d.insert(subject);
        if (m_auto_update_enabled && m_update_threshold > 0 &&
            m_dirty_set_3d.size() >= m_update_threshold) {
          flush_dirty_set_3d_unlocked();
        }
      } else {
        m_dirty_set_2d.insert(subject);
        if (m_auto_update_enabled && m_update_threshold > 0 &&
            m_dirty_set_2d.size() >= m_update_threshold) {
          flush_dirty_set_2d_unlocked();
        }
      }
    }
  }

  void set_auto_update_policy(bool enabled, int threshold, int interval_ms) {
    std::lock_guard<std::mutex> lock(m_mutex);
    bool was_enabled = m_auto_update_enabled && m_update_interval > 0;
    m_auto_update_enabled = enabled;
    m_update_threshold = threshold;
    m_update_interval = interval_ms;
    bool is_enabled = m_auto_update_enabled && m_update_interval > 0;

    // Schedule or cancel the timer outside the lock to avoid deadlock if the
    // timer callback also tries to lock. The use of io_service::post safely
    // queues the operation.
    if (!was_enabled && is_enabled) {
      m_server.get_io_service().post([this]() { schedule_auto_flush(); });
    } else if (was_enabled && !is_enabled) {
      m_server.get_io_service().post([this]() { m_timer->cancel(); });
    }
  }

  void drawnow2D() {
    std::lock_guard<std::mutex> lock(m_mutex);
    flush_dirty_set_2d_unlocked();
  }

  void drawnow3D() {
    std::lock_guard<std::mutex> lock(m_mutex);
    flush_dirty_set_3d_unlocked();
  }

  template <typename CommandType, typename SceneUpdateType>
  void send_window_command(const std::string& window_id,
                           std::function<void(CommandType*)> cmd_filler) {
    if (m_connections.count(window_id) == 0) return;
    SceneUpdateType u;
    u.set_window_id(window_id);
    cmd_filler(u.add_commands());
    send_update(u);
  }

  std::vector<std::string> get_connected_windows() {
    std::lock_guard<std::mutex> lock(m_mutex);
    std::vector<std::string> ids;
    ids.reserve(m_connections.size());
    for (const auto& pair : m_connections) ids.push_back(pair.first);
    return ids;
  }

 private:
  struct TrackedObject {
    std::string id;
    std::weak_ptr<Vis::Observable> obj_ptr;
    bool is_3d;
  };

  server m_server;
  std::unique_ptr<steady_timer> m_timer;
  uint16_t m_port;
  std::thread m_thread;
  std::mutex m_mutex;
  std::map<Vis::Observable*, TrackedObject> m_tracked_objects;
  std::map<std::string, Vis::Observable*> m_id_to_object_ptr;
  bool m_auto_update_enabled;
  int m_update_threshold;
  int m_update_interval;
  std::set<Vis::Observable*> m_dirty_set_2d;
  std::set<Vis::Observable*> m_dirty_set_3d;
  std::map<std::string, connection_hdl> m_connections;

  void flush_dirty_set_unlocked(bool is_3d) {
    auto& dirty_set = is_3d ? m_dirty_set_3d : m_dirty_set_2d;
    if (dirty_set.empty() || m_connections.empty()) return;

    std::string target_window = m_connections.begin()->first;

    if (is_3d) {
      visualization::Scene3DUpdate scene_update;
      for (Vis::Observable* subject : dirty_set) {
        auto it = m_tracked_objects.find(subject);
        if (it == m_tracked_objects.end() || it->second.obj_ptr.expired()) {
          continue;
        }
        auto* update_geom =
            scene_update.add_commands()->mutable_update_object_geometry();
        update_geom->set_id(it->second.id);
        populate_3d_geometry_update(it->second.obj_ptr.lock(), update_geom);
      }
      if (scene_update.commands_size() > 0) {
        scene_update.set_window_id(target_window);
        send_update(scene_update);
      }
    } else {
      visualization::Scene2DUpdate scene_update;
      for (Vis::Observable* subject : dirty_set) {
        auto it = m_tracked_objects.find(subject);
        if (it == m_tracked_objects.end() || it->second.obj_ptr.expired()) {
          continue;
        }
        auto* update_geom =
            scene_update.add_commands()->mutable_update_object_geometry();
        update_geom->set_id(it->second.id);
        populate_2d_geometry_update(it->second.obj_ptr.lock(), update_geom);
      }
      if (scene_update.commands_size() > 0) {
        scene_update.set_window_id(target_window);
        send_update(scene_update);
      }
    }
    dirty_set.clear();
  }

  void flush_dirty_set_2d_unlocked() { flush_dirty_set_unlocked(false); }
  void flush_dirty_set_3d_unlocked() { flush_dirty_set_unlocked(true); }

  template <typename CmdType>
  void populate_2d_geometry(std::shared_ptr<Vis::Observable> obj,
                            CmdType* cmd) {
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
    } else {
      // It might be a 2D object being added to a 3D scene (e.g., for overlays).
      populate_2d_geometry(obj, cmd);
    }
  }

  void populate_2d_geometry_update(std::shared_ptr<Vis::Observable> obj,
                                   visualization::Update2DObjectGeometry* cmd) {
    // This is the completed implementation, mirroring populate_2d_geometry.
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
    // This is the completed implementation, mirroring populate_3d_geometry.
    if (auto p = std::dynamic_pointer_cast<Vis::Point3D>(obj)) {
      to_proto(*p, cmd->mutable_point_3d());
    } else if (auto p = std::dynamic_pointer_cast<Vis::Pose3D>(obj)) {
      to_proto(*p, cmd->mutable_pose_3d());
    } else if (auto p = std::dynamic_pointer_cast<Vis::Ball>(obj)) {
      to_proto(*p, cmd->mutable_ball());
    } else if (auto p = std::dynamic_pointer_cast<Vis::Box3D>(obj)) {
      to_proto(*p, cmd->mutable_box_3d());
    } else {
      // Handle update for 2D objects in a 3D scene.
      populate_2d_geometry(obj, cmd);
    }
  }

  void schedule_auto_flush() {
    m_timer->expires_after(std::chrono::milliseconds(m_update_interval));
    m_timer->async_wait(
        bind(&ServerImpl::handle_auto_flush, this, std::placeholders::_1));
  }

  void handle_auto_flush(const boost::system::error_code& ec) {
    if (ec) {  // Operation cancelled or other error
      return;
    }
    drawnow2D();
    drawnow3D();
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

// --- Singleton and public API forwarding implementation ---
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
void VisualizationServer::run() { m_impl->run(); }
void VisualizationServer::stop() { m_impl->stop(); }
std::vector<std::string> VisualizationServer::get_connected_windows() {
  return m_impl->get_connected_windows();
}
void VisualizationServer::show(std::shared_ptr<Vis::Observable> obj,
                               const std::string& id,
                               const visualization::Material& material,
                               bool is_3d) {
  m_impl->show(obj, id, material, is_3d);
}
void VisualizationServer::remove(const std::string& id) { m_impl->remove(id); }
void VisualizationServer::drawnow2D() { m_impl->drawnow2D(); }
void VisualizationServer::drawnow3D() { m_impl->drawnow3D(); }
void VisualizationServer::set_auto_update_policy(bool enabled, int threshold,
                                                 int interval_ms) {
  m_impl->set_auto_update_policy(enabled, threshold, interval_ms);
}
void VisualizationServer::set_title(const std::string& window_id,
                                    const std::string& title, bool is_3d) {
  if (is_3d)
    m_impl->send_window_command<visualization::Command3D,
                                visualization::Scene3DUpdate>(
        window_id,
        [&](auto* cmd) { cmd->mutable_set_title()->set_title(title); });
  else
    m_impl->send_window_command<visualization::Command2D,
                                visualization::Scene2DUpdate>(
        window_id,
        [&](auto* cmd) { cmd->mutable_set_title()->set_title(title); });
}
void VisualizationServer::set_grid_visible(const std::string& window_id,
                                           bool visible, bool is_3d) {
  if (is_3d)
    m_impl->send_window_command<visualization::Command3D,
                                visualization::Scene3DUpdate>(
        window_id, [&](auto* cmd) {
          cmd->mutable_set_grid_visible()->set_visible(visible);
        });
  else
    m_impl->send_window_command<visualization::Command2D,
                                visualization::Scene2DUpdate>(
        window_id, [&](auto* cmd) {
          cmd->mutable_set_grid_visible()->set_visible(visible);
        });
}
void VisualizationServer::set_axes_visible(const std::string& window_id,
                                           bool visible, bool is_3d) {
  if (is_3d)
    m_impl->send_window_command<visualization::Command3D,
                                visualization::Scene3DUpdate>(
        window_id, [&](auto* cmd) {
          cmd->mutable_set_axes_visible()->set_visible(visible);
        });
  else
    m_impl->send_window_command<visualization::Command2D,
                                visualization::Scene2DUpdate>(
        window_id, [&](auto* cmd) {
          cmd->mutable_set_axes_visible()->set_visible(visible);
        });
}
void VisualizationServer::set_legend_visible(const std::string& window_id,
                                             bool visible, bool is_3d) {
  if (is_3d)
    m_impl->send_window_command<visualization::Command3D,
                                visualization::Scene3DUpdate>(
        window_id,
        [&](auto* cmd) { cmd->mutable_set_legend()->set_visible(visible); });
  else
    m_impl->send_window_command<visualization::Command2D,
                                visualization::Scene2DUpdate>(
        window_id,
        [&](auto* cmd) { cmd->mutable_set_legend()->set_visible(visible); });
}