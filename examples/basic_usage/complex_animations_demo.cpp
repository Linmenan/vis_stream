#include <vis_primitives.h>
#include <vis_stream.h>

#include <atomic>
#include <chrono>
#include <cmath>
#include <csignal>
#include <iostream>
#include <memory>
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

  return mat;
}

class ComplexAnimationsDemo {
 private:
  VisualizationServer& server;
  const std::string window_2d_name = "2D复杂动画";
  const std::string window_3d_name = "3D复杂动画";

  // 维护图元引用
  std::vector<std::shared_ptr<Vis::Point2D>> points_2d;
  std::shared_ptr<Vis::Line2D> wave_line;
  std::shared_ptr<Vis::Box3D> spinning_cube;
  std::shared_ptr<Vis::Ball> orbiting_ball;

 public:
  ComplexAnimationsDemo(VisualizationServer& srv) : server(srv) {}

  void run() {
    std::cout << "\n🎬 复杂动画和交互演示" << std::endl;
    std::cout << "按 Ctrl+C 停止演示" << std::endl;

    // 清理现有窗口
    cleanup_all_windows();

    // 创建专门用于动画的窗口
    server.create_window(window_2d_name, false);
    server.create_window(window_3d_name, true);

    // 创建动画对象
    setup_animation_objects();

    // 运行复杂动画
    run_complex_animations();

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

  void setup_animation_objects() {
    std::cout << "设置动画对象..." << std::endl;

    // 清空之前的引用
    points_2d.clear();

    // 创建多个2D点并保存引用
    for (int i = 0; i < 8; ++i) {
      auto point = Vis::Point2D::create({0.0f, 0.0f});
      server.add(point, window_2d_name,
                 create_random_material("动态点" + std::to_string(i)), false);
      points_2d.push_back(point);
    }

    // 创建波形线条并保存引用
    wave_line = Vis::Line2D::create();
    server.add(wave_line, window_2d_name, create_random_material("波形"),
               false);

    // 创建3D对象并保存引用
    spinning_cube = Vis::Box3D::create(Vis::Pose3D(), 0.8f, 0.8f, 0.8f);
    server.add(spinning_cube, window_3d_name,
               create_random_material("旋转立方体"), true);

    orbiting_ball = Vis::Ball::create({0.0f, 0.0f, 0.0f}, 0.3f);
    server.add(orbiting_ball, window_3d_name, create_random_material("轨道球"),
               true);

    sleep_ms(1000);
  }

  void run_complex_animations() {
    std::cout << "开始复杂动画..." << std::endl;

    // 开启自动更新策略
    server.set_auto_update_policy(true, 5, 33);

    int frame = 0;
    while (frame < 300 && g_running) {
      float t = frame * 0.05f;

      // 更新2D动画
      update_2d_animations(t);

      // 更新3D动画
      update_3d_animations(t);

      sleep_ms(33);
      frame++;
    }

    // 关闭自动更新
    server.set_auto_update_policy(false);
  }

  void update_2d_animations(float t) {
    // 2D点围绕圆形运动
    for (size_t i = 0; i < points_2d.size(); ++i) {
      float angle = t + (i * 2.0f * M_PI / points_2d.size());
      float radius = 2.0f + 0.5f * sinf(t * 2.0f + i);
      points_2d[i]->set_position({radius * cosf(angle), radius * sinf(angle)});
    }

    // 波形动画 - 更新已存在的线条对象
    if (wave_line) {
      std::vector<Vis::Vec2> wave_points;
      for (int i = 0; i < 50; ++i) {
        float x = -4.0f + 8.0f * (i / 49.0f);
        float y = sinf(x * 3.0f + t * 2.0f) * cosf(x + t) * 1.5f;
        wave_points.push_back({x, y});
      }
      wave_line->set_points(wave_points);
    }
  }

  void update_3d_animations(float t) {
    // 旋转立方体 - 更新已存在的立方体对象
    if (spinning_cube) {
      Vis::Pose3D cube_pose;
      cube_pose.set_position({0.0f, 0.0f, 0.0f});
      cube_pose.set_orientation(
          axis_angle_to_quaternion(t * 2.0f, {1.0f, 1.0f, 0.0f}));
      spinning_cube->set_center(cube_pose);
    }

    // 轨道球体 - 更新已存在的球体对象
    if (orbiting_ball) {
      orbiting_ball->set_center(
          {3.0f * cosf(t), 2.0f * sinf(t), 1.0f * sinf(t * 1.5f)});
    }
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

    ComplexAnimationsDemo demo(server);
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