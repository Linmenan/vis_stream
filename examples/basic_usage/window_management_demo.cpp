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

class WindowManagementDemo {
 private:
  VisualizationServer& server;
  std::string window2d_name = "动态演示2D窗口";
  std::string window3d_name = "动态演示3D窗口";

 public:
  WindowManagementDemo(VisualizationServer& srv) : server(srv) {}

  void run() {
    std::cout << "\n🪟 动态窗口管理演示" << std::endl;
    std::cout << "按 Ctrl+C 停止演示" << std::endl;

    // 清理现有窗口
    cleanup_all_windows();

    // 阶段1: 创建窗口并设置属性
    create_windows();

    // 阶段2: 创建动态图元并在多个窗口中显示
    create_dynamic_objects();

    // 阶段3: 动态运动演示
    dynamic_animation();

    // 阶段4: 清理演示
    cleanup_demo();

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

  void create_windows() {
    std::cout << "创建演示窗口..." << std::endl;

    // 创建2D窗口
    if (!server.create_window(window2d_name, false)) {
      std::cerr << "❌ 创建2D窗口失败" << std::endl;
      return;
    }
    std::cout << "✅ 2D窗口创建成功" << std::endl;

    // 创建3D窗口
    if (!server.create_window(window3d_name, true)) {
      std::cerr << "❌ 创建3D窗口失败" << std::endl;
      return;
    }
    std::cout << "✅ 3D窗口创建成功" << std::endl;

    // 设置窗口属性
    server.set_grid_visible(window2d_name, true, false);
    server.set_axes_visible(window2d_name, true, false);
    server.set_grid_visible(window3d_name, true, true);
    server.set_axes_visible(window3d_name, true, true);

    sleep_ms(1000);
  }

  void create_dynamic_objects() {
    std::cout << "创建动态图元..." << std::endl;

    // 创建动态点（将在2D和3D窗口中同时显示）
    auto dynamic_point_2d = Vis::Point2D::create({0.0f, 0.0f});
    auto dynamic_point_3d = Vis::Point3D::create({0.0f, 0.0f, 0.0f});

    // 创建动态轨迹线
    auto trajectory_line = Vis::Line2D::create();
    std::vector<Vis::Vec2> initial_points = {{0.0f, 0.0f}};
    trajectory_line->set_points(initial_points);

    // 创建动态圆
    auto dynamic_circle = Vis::Circle::create({0.0f, 0.0f}, 0.5f);

    // 在2D窗口添加图元
    server.add(dynamic_point_2d, window2d_name,
               create_random_material("动态点"), false);
    server.add(trajectory_line, window2d_name,
               create_random_material("运动轨迹"), false);
    server.add(dynamic_circle, window2d_name, create_random_material("动态圆"),
               false);

    // 在3D窗口添加图元（3D窗口也可以显示2D图元）
    server.add(dynamic_point_3d, window3d_name,
               create_random_material("3D动态点"), true);
    server.add(trajectory_line, window3d_name,
               create_random_material("3D运动轨迹"), true);
    server.add(dynamic_circle, window3d_name,
               create_random_material("3D动态圆"), true);

    std::cout << "✅ 动态图元创建完成" << std::endl;
    sleep_ms(2000);
  }

  void dynamic_animation() {
    std::cout << "开始动态运动演示..." << std::endl;

    // 创建新的动态图元用于演示
    auto animated_point_2d = Vis::Point2D::create({0.0f, 0.0f});
    auto animated_point_3d = Vis::Point3D::create({0.0f, 0.0f, 0.0f});
    auto animated_trajectory = Vis::Line2D::create();
    auto animated_circle = Vis::Circle::create({0.0f, 0.0f}, 0.5f);

    // 添加到两个窗口
    server.add(animated_point_2d, window2d_name,
               create_random_material("动画点"), false);
    server.add(animated_point_3d, window3d_name,
               create_random_material("3D动画点"), true);
    server.add(animated_trajectory, window2d_name,
               create_random_material("动画轨迹"), false);
    server.add(animated_trajectory, window3d_name,
               create_random_material("3D动画轨迹"), true);
    server.add(animated_circle, window2d_name, create_random_material("动态圆"),
               false);
    server.add(animated_circle, window3d_name,
               create_random_material("3D动态圆"), true);

    std::cout << "✅ 动画图元添加完成，开始运动..." << std::endl;
    sleep_ms(1000);

    // 设置自动更新策略（重要！）
    server.set_auto_update_policy(true);  // 启用自动更新

    // 动态运动循环
    const int animation_steps = 100;
    const float radius = 3.0f;
    std::vector<Vis::Vec2> trajectory_points;

    for (int i = 0; i < animation_steps && g_running; i++) {
      float angle = 2.0f * M_PI * i / animation_steps;
      float x = radius * cos(angle);
      float y = radius * sin(angle);

      // 更新2D点位置
      animated_point_2d->set_position({x, y});

      // 更新3D点位置（在Z=0平面上运动）
      animated_point_3d->set_position({x, y, 0.0f});

      // 更新轨迹
      trajectory_points.push_back({x, y});
      if (trajectory_points.size() > 30) {  // 保持轨迹长度
        trajectory_points.erase(trajectory_points.begin());
      }
      animated_trajectory->set_points(trajectory_points);

      // 更新圆的位置和大小（跟随运动点）
      float circle_radius = 0.3f + 0.2f * sin(angle * 3.0f);
      animated_circle->set_center({x, y});
      animated_circle->set_radius(circle_radius);

      // 手动触发刷新（确保立即更新）
      server.drawnow(window2d_name, false);
      server.drawnow(window3d_name, true);

      sleep_ms(100);  // 增加延迟以便观察
    }

    // 关闭自动更新
    server.set_auto_update_policy(false, 0, 0);

    std::cout << "✅ 动态运动演示完成" << std::endl;
    sleep_ms(2000);
  }

  void cleanup_demo() {
    std::cout << "清理演示..." << std::endl;

    // 先清除窗口内容但不删除窗口
    std::cout << "清除窗口内容..." << std::endl;
    server.clear(window2d_name, false);
    server.clear(window3d_name, true);
    sleep_ms(1000);

    // 显示窗口统计信息
    show_window_stats();

    // 最后删除窗口
    std::cout << "删除演示窗口..." << std::endl;
    server.remove_window(window2d_name, false);
    server.remove_window(window3d_name, true);
    sleep_ms(1000);

    // 最终统计
    show_final_stats();
  }

  void show_window_stats() {
    auto windows_2d = server.get_window_names(false);
    auto windows_3d = server.get_window_names(true);

    std::cout << "当前2D窗口: " << windows_2d.size() << " 个" << std::endl;
    std::cout << "当前3D窗口: " << windows_3d.size() << " 个" << std::endl;

    std::cout << "2D窗口列表: ";
    for (const auto& win : windows_2d) {
      std::cout << win << " ";
    }
    std::cout << std::endl;

    std::cout << "3D窗口列表: ";
    for (const auto& win : windows_3d) {
      std::cout << win << " ";
    }
    std::cout << std::endl;

    sleep_ms(2000);
  }

  void show_final_stats() {
    std::cout << "最终统计:" << std::endl;
    std::cout << "窗口总数: " << server.get_windows_number() << std::endl;
    std::cout << "图元总数: " << server.get_observables_number() << std::endl;
    sleep_ms(1000);
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

    WindowManagementDemo demo(server);
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