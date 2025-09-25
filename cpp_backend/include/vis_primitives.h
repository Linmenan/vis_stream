// vis_stream/cpp_backend/include/vis_primitives.h
#pragma once

#include <memory>
#include <vector>

namespace Vis {

class IObserver;
class Observable;
class IObserver {
 public:
  virtual ~IObserver() = default;
  virtual void on_update(Observable* subject) = 0;
};
class Observable {
 public:
  virtual ~Observable() = default;
  void set_observer(IObserver* observer) { m_observer = observer; }

 protected:
  void notify_update() {
    if (m_observer) {
      m_observer->on_update(this);
    }
  }

 private:
  IObserver* m_observer = nullptr;
};

// --- 基础数据结构 ---
struct Vec2 {
  float x = 0.f;
  float y = 0.f;
};
struct Vec3 {
  float x = 0.f;
  float y = 0.f;
  float z = 0.f;
};
struct Quaternion {
  float w = 1.f;
  float x = 0.f;
  float y = 0.f;
  float z = 0.f;
};

// --- 2D 几何体类 ---

class Point2D : public Observable {
 public:
  static std::shared_ptr<Point2D> create(Vec2 pos = {}) {
    return std::shared_ptr<Point2D>(new Point2D(pos));
  }
  void set_position(Vec2 pos) {
    m_pos = pos;
    notify_update();
  }
  Vec2 get_position() const { return m_pos; }

 private:
  Point2D(Vec2 pos) : m_pos(pos) {}
  Vec2 m_pos;
};

class Pose2D : public Observable {
 public:
  Pose2D() : m_pos({}), m_theta(0.f) {}
  static std::shared_ptr<Pose2D> create(Vec2 pos = {}, float theta = 0.f) {
    return std::shared_ptr<Pose2D>(new Pose2D(pos, theta));
  }
  void set_position(Vec2 pos) {
    m_pos = pos;
    notify_update();
  }
  void set_angle(float theta) {
    m_theta = theta;
    notify_update();
  }
  void set_pose(Vec2 pos, float theta) {
    m_pos = pos;
    m_theta = theta;
    notify_update();
  }
  Vec2 get_position() const { return m_pos; }
  float get_angle() const { return m_theta; }

 private:
  Pose2D(Vec2 pos, float theta) : m_pos(pos), m_theta(theta) {}
  Vec2 m_pos;
  float m_theta;
};

class Circle : public Observable {
 public:
  static std::shared_ptr<Circle> create(Vec2 center = {}, float radius = 1.f) {
    return std::shared_ptr<Circle>(new Circle(center, radius));
  }
  void set_center(Vec2 center) {
    m_center = center;
    notify_update();
  }
  void set_radius(float radius) {
    m_radius = radius;
    notify_update();
  }
  Vec2 get_center() const { return m_center; }
  float get_radius() const { return m_radius; }

 private:
  Circle(Vec2 center, float radius) : m_center(center), m_radius(radius) {}
  Vec2 m_center;
  float m_radius;
};

class Box2D : public Observable {
 public:
  static std::shared_ptr<Box2D> create(Pose2D center = {}, float width = 1.f,
                                       float len_f = 1.f, float len_r = 1.f) {
    return std::shared_ptr<Box2D>(new Box2D(center, width, len_f, len_r));
  }
  void set_center(Pose2D center) {
    m_center = center;
    notify_update();
  }
  void set_width(float width) {
    m_width = width;
    notify_update();
  }
  void set_length_front(float len) {
    m_length_front = len;
    notify_update();
  }
  void set_length_rear(float len) {
    m_length_rear = len;
    notify_update();
  }
  Pose2D get_center() const { return m_center; }
  float get_width() const { return m_width; }
  float get_length_front() const { return m_length_front; }
  float get_length_rear() const { return m_length_rear; }

 private:
  Box2D(Pose2D center, float width, float len_f, float len_r)
      : m_center(center),
        m_width(width),
        m_length_front(len_f),
        m_length_rear(len_r) {}
  Pose2D m_center;
  float m_width, m_length_front, m_length_rear;
};

class Line2D : public Observable {
 public:
  static std::shared_ptr<Line2D> create(const std::vector<Vec2>& points = {}) {
    return std::shared_ptr<Line2D>(new Line2D(points));
  }
  void set_points(const std::vector<Vec2>& points) {
    m_points = points;
    notify_update();
  }
  void add_point(Vec2 p) {
    m_points.push_back(p);
    notify_update();
  }
  void clear() {
    m_points.clear();
    notify_update();
  }
  const std::vector<Vec2>& get_points() const { return m_points; }

 private:
  Line2D(const std::vector<Vec2>& points) : m_points(points) {}
  std::vector<Vec2> m_points;
};

class Trajectory2D : public Observable {
 public:
  static std::shared_ptr<Trajectory2D> create(
      const std::vector<Box2D>& poses = {}) {
    return std::shared_ptr<Trajectory2D>(new Trajectory2D(poses));
  }
  void set_poses(const std::vector<Box2D>& poses) {
    m_poses = poses;
    notify_update();
  }
  void add_pose(const Box2D& pose) {
    m_poses.push_back(pose);
    notify_update();
  }
  void clear() {
    m_poses.clear();
    notify_update();
  }
  const std::vector<Box2D>& get_poses() const { return m_poses; }

 private:
  Trajectory2D(const std::vector<Box2D>& poses) : m_poses(poses) {}
  std::vector<Box2D> m_poses;
};

class Polygon : public Observable {
 public:
  static std::shared_ptr<Polygon> create(
      const std::vector<Vec2>& vertices = {}) {
    return std::shared_ptr<Polygon>(new Polygon(vertices));
  }
  void set_vertices(const std::vector<Vec2>& vertices) {
    m_vertices = vertices;
    notify_update();
  }
  void add_vertex(Vec2 v) {
    m_vertices.push_back(v);
    notify_update();
  }
  void clear() {
    m_vertices.clear();
    notify_update();
  }
  const std::vector<Vec2>& get_vertices() const { return m_vertices; }

 private:
  Polygon(const std::vector<Vec2>& vertices) : m_vertices(vertices) {}
  std::vector<Vec2> m_vertices;
};

// --- 3D 几何体类 ---

class Point3D : public Observable {
 public:
  static std::shared_ptr<Point3D> create(Vec3 pos = {}) {
    return std::shared_ptr<Point3D>(new Point3D(pos));
  }
  void set_position(Vec3 pos) {
    m_pos = pos;
    notify_update();
  }
  Vec3 get_position() const { return m_pos; }

 private:
  Point3D(Vec3 pos) : m_pos(pos) {}
  Vec3 m_pos;
};

class Pose3D : public Observable {
 public:
  Pose3D() : m_pos({}), m_orientation({}) {}
  static std::shared_ptr<Pose3D> create(Vec3 pos = {}, Quaternion quat = {}) {
    return std::shared_ptr<Pose3D>(new Pose3D(pos, quat));
  }
  void set_position(Vec3 pos) {
    m_pos = pos;
    notify_update();
  }
  void set_orientation(Quaternion quat) {
    m_orientation = quat;
    notify_update();
  }
  void set_pose(Vec3 pos, Quaternion quat) {
    m_pos = pos;
    m_orientation = quat;
    notify_update();
  }
  Vec3 get_position() const { return m_pos; }
  Quaternion get_orientation() const { return m_orientation; }

 private:
  Pose3D(Vec3 pos, Quaternion quat) : m_pos(pos), m_orientation(quat) {}
  Vec3 m_pos;
  Quaternion m_orientation;
};

class Ball : public Observable {
 public:
  static std::shared_ptr<Ball> create(Vec3 center = {}, float radius = 1.f) {
    return std::shared_ptr<Ball>(new Ball(center, radius));
  }
  void set_center(Vec3 center) {
    m_center = center;
    notify_update();
  }
  void set_radius(float radius) {
    m_radius = radius;
    notify_update();
  }
  Vec3 get_center() const { return m_center; }
  float get_radius() const { return m_radius; }

 private:
  Ball(Vec3 center, float radius) : m_center(center), m_radius(radius) {}
  Vec3 m_center;
  float m_radius;
};

class Box3D : public Observable {
 public:
  static std::shared_ptr<Box3D> create(Pose3D center = {}, float x = 1.f,
                                       float y = 1.f, float z = 1.f) {
    return std::shared_ptr<Box3D>(new Box3D(center, x, y, z));
  }
  void set_center(Pose3D center) {
    m_center = center;
    notify_update();
  }
  void set_lengths(float x, float y, float z) {
    m_x_len = x;
    m_y_len = y;
    m_z_len = z;
    notify_update();
  }
  Pose3D get_center() const { return m_center; }
  Vec3 get_lengths() const { return {m_x_len, m_y_len, m_z_len}; }

 private:
  Box3D(Pose3D center, float x, float y, float z)
      : m_center(center), m_x_len(x), m_y_len(y), m_z_len(z) {}
  Pose3D m_center;
  float m_x_len, m_y_len, m_z_len;
};

}  // namespace Vis