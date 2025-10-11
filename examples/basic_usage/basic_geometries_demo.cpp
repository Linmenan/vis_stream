#include <vis_primitives.h>
#include <vis_stream.h>

#include <atomic>
#include <chrono>
#include <cmath>
#include <csignal>
#include <iostream>
#include <random>
#include <thread>
#include <vector>

#include "visualization.pb.h"

std::atomic<bool> g_running(true);

void signal_handler(int signum) {
  std::cout << "\nInterrupt signal (" << signum
            << ") received. Shutting down..." << std::endl;
  g_running = false;
}

void sleep_ms(int milliseconds) {
  std::this_thread::sleep_for(std::chrono::milliseconds(milliseconds));
}

Vis::Quaternion axis_angle_to_quaternion(float angle_rad, Vis::Vec3 axis) {
  float half_angle = angle_rad / 2.0f;
  float s = sinf(half_angle);
  float c = cosf(half_angle);
  Vis::Quaternion quat;
  quat.w = c;
  quat.x = axis.x * s;
  quat.y = axis.y * s;
  quat.z = axis.z * s;
  return quat;
}

visualization::Material create_random_material(const std::string& legend = "") {
  static std::random_device rd;
  static std::mt19937 gen(rd());
  static std::uniform_real_distribution<float> dist(0.0f, 1.0f);

  visualization::Material mat;
  mat.mutable_color()->set_r(dist(gen));
  mat.mutable_color()->set_g(dist(gen));
  mat.mutable_color()->set_b(dist(gen));
  mat.set_point_size(5.0f + dist(gen) * 10.0f);
  mat.set_line_width(1.0f + dist(gen) * 3.0f);
  mat.set_legend(legend);

  static std::vector<visualization::Material::PointShape> shapes = {
      visualization::Material::SQUARE, visualization::Material::CIRCLE,
      visualization::Material::CROSS, visualization::Material::DIAMOND};
  mat.set_point_shape(shapes[std::uniform_int_distribution<>(0, 3)(gen)]);

  static std::vector<visualization::Material::LineStyle> line_styles = {
      visualization::Material::SOLID, visualization::Material::DASHED,
      visualization::Material::DOTTED};
  mat.set_line_style(line_styles[std::uniform_int_distribution<>(0, 2)(gen)]);

  return mat;
}

class BasicGeometriesDemo {
 private:
  VisualizationServer& server;
  std::string window_2d_name = "basic_2d";  // 初始名称
  std::string window_3d_name = "basic_3d";  // 初始名称

 public:
  BasicGeometriesDemo(VisualizationServer& srv) : server(srv) {}

  void run() {
    std::cout << "\n🎨 基础几何体展示演示" << std::endl;
    std::cout << "按 Ctrl+C 停止演示" << std::endl;

    // 清理现有窗口
    cleanup_all_windows();

    // 创建基础窗口
    server.create_window(window_2d_name, false);
    sleep_ms(1000);
    server.create_window(window_3d_name, true);
    sleep_ms(1000);

    // 重命名窗口并更新名称变量
    if (server.rename_window(window_2d_name, "基础2D几何体", false)) {
      window_2d_name = "基础2D几何体";
      std::cout << "✅ 2D窗口重命名成功" << std::endl;
    }
    sleep_ms(1000);

    if (server.rename_window(window_3d_name, "基础3D几何体", true)) {
      window_3d_name = "基础3D几何体";
      std::cout << "✅ 3D窗口重命名成功" << std::endl;
    }
    sleep_ms(1000);

    // 2D几何体展示 - 使用更新后的窗口名称
    add_2d_geometries();
    sleep_ms(1000);

    // 3D几何体展示 - 使用更新后的窗口名称
    add_3d_geometries();
    sleep_ms(1000);

    // 简单动画演示
    std::cout << "播放简单动画..." << std::endl;
    run_animation();

    std::cout << "演示结束" << std::endl;
  }

 private:
  void cleanup_all_windows() {
    std::cout << "清理现有窗口..." << std::endl;
    auto windows_2d = server.get_window_names(false);
    auto windows_3d = server.get_window_names(true);

    for (const auto& win : windows_2d) {
      server.remove_window(win, false);
    }
    for (const auto& win : windows_3d) {
      server.remove_window(win, true);
    }
    sleep_ms(1000);
  }

  void add_2d_geometries() {
    std::cout << "添加2D几何体..." << std::endl;

    // 点 - 使用更新后的窗口名称
    auto point1 = Vis::Point2D::create({-3.0f, 2.0f});
    server.add(point1, window_2d_name, create_random_material("点1"), false);

    auto point2 = Vis::Point2D::create({3.0f, 2.0f});
    server.add(point2, window_2d_name, create_random_material("点2"), false);

    // 姿态
    auto pose = Vis::Pose2D::create({0.0f, 0.0f}, 0.0f);
    server.add(pose, window_2d_name, create_random_material("姿态"), false);

    // 圆形
    auto circle = Vis::Circle::create({-2.0f, -1.5f}, 0.8f);
    server.add(circle, window_2d_name, create_random_material("圆形"), false);

    // 矩形
    Vis::Pose2D box_pose;
    box_pose.set_position({2.0f, -1.5f});
    auto box = Vis::Box2D::create(box_pose, 1.2f, 0.8f, 0.6f);
    server.add(box, window_2d_name, create_random_material("矩形"), false);

    // 线条
    auto line = Vis::Line2D::create();
    std::vector<Vis::Vec2> line_points = {{-3, -2}, {-1, 3}, {1, -3}, {3, 2}};
    line->set_points(line_points);
    server.add(line, window_2d_name, create_random_material("线条"), false);

    // 多边形
    auto polygon = Vis::Polygon::create(
        {{-1, -2}, {0, -3}, {1, -2}, {0.5, -1}, {-0.5, -1}});
    server.add(polygon, window_2d_name, create_random_material("多边形"),
               false);

    std::cout << "✅ 2D几何体添加完成" << std::endl;
  }

  void add_3d_geometries() {
    std::cout << "添加3D几何体..." << std::endl;

    // 3D点 - 使用更新后的窗口名称
    auto point3d = Vis::Point3D::create({0.0f, 0.0f, 0.0f});
    server.add(point3d, window_3d_name, create_random_material("3D点"), true);

    // 球体
    auto ball = Vis::Ball::create({-2.0f, 0.0f, 0.0f}, 0.6f);
    server.add(ball, window_3d_name, create_random_material("球体"), true);

    // 立方体
    Vis::Pose3D cube_pose;
    cube_pose.set_position({2.0f, 0.0f, 0.0f});
    auto cube = Vis::Box3D::create(cube_pose, 1.0f, 1.0f, 1.0f);
    server.add(cube, window_3d_name, create_random_material("立方体"), true);

    // 3D姿态
    auto pose3d = Vis::Pose3D::create();
    pose3d->set_position({0.0f, 2.0f, 0.0f});
    server.add(pose3d, window_3d_name, create_random_material("3D姿态"), true);

    std::cout << "✅ 3D几何体添加完成" << std::endl;
  }

  void run_animation() {
    std::cout << "开始动画演示..." << std::endl;

    // 创建新的动画对象（避免使用之前可能失败的对象）
    auto animated_point_2d = Vis::Point2D::create({-3.0f, 2.0f});
    auto animated_point2_2d = Vis::Point2D::create({3.0f, 2.0f});
    auto animated_pose_2d = Vis::Pose2D::create({0.0f, 0.0f}, 0.0f);
    auto animated_circle = Vis::Circle::create({-2.0f, -1.5f}, 0.8f);
    auto animated_point_3d = Vis::Point3D::create({0.0f, 0.0f, 0.0f});
    auto animated_ball = Vis::Ball::create({-2.0f, 0.0f, 0.0f}, 0.6f);
    auto animated_cube = Vis::Box3D::create(Vis::Pose3D(), 1.0f, 1.0f, 1.0f);

    // 添加到窗口
    server.add(animated_point_2d, window_2d_name,
               create_random_material("动画点1"), false);
    server.add(animated_point2_2d, window_2d_name,
               create_random_material("动画点2"), false);
    server.add(animated_pose_2d, window_2d_name,
               create_random_material("动画姿态"), false);
    server.add(animated_circle, window_2d_name,
               create_random_material("动画圆"), false);
    server.add(animated_point_3d, window_3d_name,
               create_random_material("3D动画点"), true);
    server.add(animated_ball, window_3d_name,
               create_random_material("3D动画球"), true);
    server.add(animated_cube, window_3d_name,
               create_random_material("3D动画立方体"), true);

    sleep_ms(1000);

    // 启用自动更新
    server.set_auto_update_policy(true, 1, 50);

    for (int i = 0; i < 100 && g_running; ++i) {
      float t = i * 0.1f;

      // 2D动画
      animated_point_2d->set_position({-3.0f + sinf(t), 2.0f + cosf(t)});
      animated_point2_2d->set_position({3.0f + cosf(t), 2.0f + sinf(t)});
      animated_pose_2d->set_angle(t);
      animated_circle->set_radius(0.5f + 0.3f * sinf(t));

      // 3D动画
      animated_point_3d->set_position({sinf(t), cosf(t), sinf(t) * cosf(t)});
      animated_ball->set_center({-2.0f, sinf(t), cosf(t)});

      Vis::Pose3D animated_cube_pose;
      animated_cube_pose.set_position({2.0f, cosf(t), sinf(t)});
      animated_cube_pose.set_orientation(
          axis_angle_to_quaternion(t, {0.0f, 1.0f, 0.0f}));
      animated_cube->set_center(animated_cube_pose);

      sleep_ms(50);
    }

    server.set_auto_update_policy(false, 0, 0);
    std::cout << "✅ 动画演示完成" << std::endl;
  }
};

int main() {
  signal(SIGINT, signal_handler);

  try {
    VisualizationServer::init(9002);
    auto& server = VisualizationServer::get();
    server.run();

    std::cout << "服务器已启动，等待客户端连接..." << std::endl;
    while (g_running && !server.is_connected()) {
      sleep_ms(100);
    }

    if (!g_running) {
      server.stop();
      return 0;
    }

    std::cout << "客户端已连接，开始演示..." << std::endl;

    BasicGeometriesDemo demo(server);
    demo.run();

    // 保持运行直到Ctrl+C
    while (g_running) {
      sleep_ms(1000);
    }

    server.stop();
    std::cout << "服务器已停止" << std::endl;

  } catch (const std::exception& e) {
    std::cerr << "发生异常: " << e.what() << std::endl;
    return 1;
  }
  return 0;
}