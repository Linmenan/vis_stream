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

// 修正的四元数转换函数 - 添加轴归一化
Vis::Quaternion axis_angle_to_quaternion(float angle_rad, Vis::Vec3 axis) {
  // 归一化旋转轴
  float length = sqrtf(axis.x * axis.x + axis.y * axis.y + axis.z * axis.z);
  if (length > 0.0f) {
    axis.x /= length;
    axis.y /= length;
    axis.z /= length;
  }

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

// 使用欧拉角创建四元数的辅助函数（更直观）
Vis::Quaternion euler_to_quaternion(float roll, float pitch, float yaw) {
  float cy = cosf(yaw * 0.5f);
  float sy = sinf(yaw * 0.5f);
  float cp = cosf(pitch * 0.5f);
  float sp = sinf(pitch * 0.5f);
  float cr = cosf(roll * 0.5f);
  float sr = sinf(roll * 0.5f);

  Vis::Quaternion q;
  q.w = cr * cp * cy + sr * sp * sy;
  q.x = sr * cp * cy - cr * sp * sy;
  q.y = cr * sp * cy + sr * cp * sy;
  q.z = cr * cp * sy - sr * sp * cy;

  return q;
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

// 创建特定颜色的材质
visualization::Material create_color_material(float r, float g, float b,
                                              const std::string& legend = "") {
  visualization::Material mat;
  mat.mutable_color()->set_r(r);
  mat.mutable_color()->set_g(g);
  mat.mutable_color()->set_b(b);
  mat.set_point_size(8.0f);
  mat.set_line_width(2.0f);
  mat.set_legend(legend);
  mat.set_point_shape(visualization::Material::CIRCLE);
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
  std::shared_ptr<Vis::Line2D> smooth_wave_line;
  std::shared_ptr<Vis::Line2D> spiral_line;

  // 3D对象
  std::shared_ptr<Vis::Box3D> spinning_cube;
  std::shared_ptr<Vis::Ball> orbiting_ball;
  std::shared_ptr<Vis::Ball> orbiting_ball2;

  // 3D窗口中的2D图元
  std::shared_ptr<Vis::Point2D> point_3d_window;
  std::shared_ptr<Vis::Line2D> circle_3d_window;
  std::shared_ptr<Vis::Line2D> square_3d_window;
  std::shared_ptr<Vis::Line2D> triangle_3d_window;

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

    // 运行无限动画
    run_infinite_animations();

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

    // 2D窗口中的对象
    setup_2d_window_objects();

    // 3D窗口中的对象
    setup_3d_window_objects();

    sleep_ms(1000);
  }

  void setup_2d_window_objects() {
    std::cout << "设置2D窗口对象..." << std::endl;

    // 创建多个2D点并保存引用
    for (int i = 0; i < 8; ++i) {
      auto point = Vis::Point2D::create({0.0f, 0.0f});
      server.add(point, window_2d_name,
                 create_random_material("动态点" + std::to_string(i)), false);
      points_2d.push_back(point);
    }

    // 创建标准波形线条
    wave_line = Vis::Line2D::create();
    server.add(wave_line, window_2d_name,
               create_color_material(1.0f, 0.0f, 0.0f, "标准波形"), false);

    // 创建更光滑的波形线条（高采样率）
    smooth_wave_line = Vis::Line2D::create();
    server.add(smooth_wave_line, window_2d_name,
               create_color_material(0.0f, 0.8f, 0.0f, "光滑波形"), false);

    // 创建螺旋线
    spiral_line = Vis::Line2D::create();
    server.add(spiral_line, window_2d_name,
               create_color_material(0.0f, 0.5f, 1.0f, "螺旋线"), false);
  }

  void setup_3d_window_objects() {
    std::cout << "设置3D窗口对象..." << std::endl;

    // 3D对象
    spinning_cube = Vis::Box3D::create(Vis::Pose3D(), 1.0f, 1.0f, 1.0f);
    server.add(spinning_cube, window_3d_name,
               create_color_material(1.0f, 0.5f, 0.0f, "旋转立方体"), true);

    orbiting_ball = Vis::Ball::create({0.0f, 0.0f, 0.0f}, 0.3f);
    server.add(orbiting_ball, window_3d_name,
               create_color_material(0.0f, 1.0f, 0.0f, "轨道球1"), true);

    orbiting_ball2 = Vis::Ball::create({0.0f, 0.0f, 0.0f}, 0.2f);
    server.add(orbiting_ball2, window_3d_name,
               create_color_material(1.0f, 0.0f, 1.0f, "轨道球2"), true);

    // 在3D窗口中添加2D图元
    setup_2d_primitives_in_3d_window();
  }

  void setup_2d_primitives_in_3d_window() {
    std::cout << "在3D窗口中添加2D图元..." << std::endl;

    // 在3D窗口中创建一个移动的点
    point_3d_window = Vis::Point2D::create({0.0f, 0.0f});
    server.add(point_3d_window, window_3d_name,
               create_color_material(1.0f, 1.0f, 0.0f, "3D窗口中的点"), true);

    // 在3D窗口中创建一个圆形
    circle_3d_window = Vis::Line2D::create();
    server.add(circle_3d_window, window_3d_name,
               create_color_material(0.0f, 1.0f, 1.0f, "圆形"), true);

    // 在3D窗口中创建一个正方形
    square_3d_window = Vis::Line2D::create();
    server.add(square_3d_window, window_3d_name,
               create_color_material(1.0f, 0.0f, 0.5f, "正方形"), true);

    // 在3D窗口中创建一个三角形
    triangle_3d_window = Vis::Line2D::create();
    server.add(triangle_3d_window, window_3d_name,
               create_color_material(0.5f, 0.0f, 1.0f, "三角形"), true);
  }

  void run_infinite_animations() {
    std::cout << "开始无限动画..." << std::endl;

    // 开启自动更新策略
    server.set_auto_update_policy(true, 5, 33);

    auto start_time = std::chrono::steady_clock::now();

    while (g_running) {
      auto current_time = std::chrono::steady_clock::now();
      auto elapsed = std::chrono::duration_cast<std::chrono::duration<float>>(
          current_time - start_time);
      float t = elapsed.count();

      // 更新2D动画
      update_2d_animations(t);

      // 更新3D动画
      update_3d_animations(t);

      sleep_ms(33);
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

    // 标准波形（50个采样点）
    if (wave_line) {
      std::vector<Vis::Vec2> wave_points;
      for (int i = 0; i < 100; ++i) {
        float x = -4.0f + 8.0f * (i / 99.0f);
        float y = sinf(x * 3.0f + t * 2.0f) * cosf(x + t) * 1.5f;
        wave_points.push_back({x, y});
      }
      wave_line->set_points(wave_points);
    }

    // 更光滑的波形（200个采样点）
    if (smooth_wave_line) {
      std::vector<Vis::Vec2> smooth_points;
      for (int i = 0; i < 300; ++i) {
        float x = -4.0f + 8.0f * (i / 299.0f);
        // 更复杂的波形函数，产生更光滑的曲线
        float y = sinf(x * 2.0f + t * 1.5f) * 0.8f +
                  sinf(x * 4.0f + t * 2.5f) * 0.4f +
                  cosf(x * 1.5f + t * 0.8f) * 0.6f;
        y *= 1.2f;
        smooth_points.push_back({x, y});
      }
      smooth_wave_line->set_points(smooth_points);
    }

    // 螺旋线动画
    if (spiral_line) {
      std::vector<Vis::Vec2> spiral_points;
      int spiral_points_count = 150;  // 高采样率使螺旋线更光滑
      for (int i = 0; i < spiral_points_count; ++i) {
        float angle = i * 0.1f + t * 0.5f;
        float radius = 0.5f + std::fmod(angle * 0.1f, 5.0f);
        spiral_points.push_back({radius * cosf(angle), radius * sinf(angle)});
      }
      spiral_line->set_points(spiral_points);
    }
  }

  void update_3d_animations(float t) {
    // 3D对象动画
    update_3d_objects(t);

    // 3D窗口中的2D图元动画
    update_2d_primitives_in_3d_window(t);
  }

  void update_3d_objects(float t) {
    // 旋转立方体 - 使用欧拉角
    if (spinning_cube) {
      Vis::Pose3D cube_pose;
      cube_pose.set_position({0.0f, 0.0f, 0.0f});

      Vis::Quaternion quat = euler_to_quaternion(t * 0.8f,  // roll (绕X轴)
                                                 t * 1.2f,  // pitch (绕Y轴)
                                                 t * 1.0f   // yaw (绕Z轴)
      );
      cube_pose.set_orientation(quat);

      spinning_cube->set_center(cube_pose);
    }

    // 轨道球体1 - 圆形轨道
    if (orbiting_ball) {
      orbiting_ball->set_center(
          {3.0f * cosf(t), 2.0f * sinf(t), 1.0f * sinf(t * 1.5f)});
    }

    // 轨道球体2 - 八字形轨道
    if (orbiting_ball2) {
      orbiting_ball2->set_center({2.0f * sinf(t * 1.2f), 1.5f * cosf(t * 0.8f),
                                  2.0f * sinf(t * 0.5f) * cosf(t * 0.5f)});
    }
  }

  void update_2d_primitives_in_3d_window(float t) {
    // 移动的点 - 在XY平面做8字形运动
    if (point_3d_window) {
      point_3d_window->set_position(
          {sinf(t * 1.5f) * 2.0f, sinf(t * 3.0f) * 1.0f});
    }

    // 圆形 - 在XY平面
    if (circle_3d_window) {
      std::vector<Vis::Vec2> circle_points;
      int circle_segments = 100;                    // 高采样率使圆形更光滑
      float radius = 1.5f + 0.3f * sinf(t * 0.7f);  // 半径动态变化
      for (int i = 0; i <= circle_segments; ++i) {
        float angle = 2.0f * M_PI * i / circle_segments;
        circle_points.push_back({radius * cosf(angle), radius * sinf(angle)});
      }
      circle_3d_window->set_points(circle_points);
    }

    // 正方形 - 旋转动画
    if (square_3d_window) {
      std::vector<Vis::Vec2> square_points;
      float size = 1.2f + 0.2f * sinf(t * 0.5f);
      float rotation = t * 0.3f;

      for (int i = 0; i < 4; ++i) {
        float angle = rotation + i * M_PI / 2.0f;
        square_points.push_back({size * cosf(angle), size * sinf(angle)});
      }
      // 闭合正方形
      square_points.push_back(square_points[0]);
      square_3d_window->set_points(square_points);
    }

    // 三角形 - 缩放和旋转动画
    if (triangle_3d_window) {
      std::vector<Vis::Vec2> triangle_points;
      float scale = 1.0f + 0.3f * sinf(t * 0.8f);
      float rotation = t * 0.4f;

      for (int i = 0; i < 3; ++i) {
        float angle = rotation + i * 2.0f * M_PI / 3.0f;
        triangle_points.push_back({scale * cosf(angle), scale * sinf(angle)});
      }
      // 闭合三角形
      triangle_points.push_back(triangle_points[0]);
      triangle_3d_window->set_points(triangle_points);
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