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

Vis::MaterialProps create_random_material(const std::string& legend = "") {
  static std::random_device rd;
  static std::mt19937 gen(rd());
  static std::uniform_real_distribution<float> dist(0.0f, 1.0f);

  Vis::MaterialProps mat;
  mat.color = Vis::ColorRGBA(dist(gen), dist(gen), dist(gen));
  mat.point_size = 5.0f + dist(gen) * 10.0f;
  mat.line_width = 1.0f + dist(gen) * 3.0f;
  mat.legend = legend;

  static std::vector<Vis::MaterialProps::PointShape> shapes = {
      Vis::MaterialProps::PointShape::SQUARE,
      Vis::MaterialProps::PointShape::CIRCLE,
      Vis::MaterialProps::PointShape::CROSS,
      Vis::MaterialProps::PointShape::DIAMOND};
  mat.point_shape = (shapes[std::uniform_int_distribution<>(0, 3)(gen)]);

  static std::vector<Vis::MaterialProps::LineStyle> line_styles = {
      Vis::MaterialProps::LineStyle::SOLID,
      Vis::MaterialProps::LineStyle::DASHED,
      Vis::MaterialProps::LineStyle::DOTTED};
  mat.line_style = (line_styles[std::uniform_int_distribution<>(0, 2)(gen)]);

  return mat;
}

class ObjectManagementDemo {
 private:
  VisualizationServer& server;
  const std::string window_name = "对象管理演示";

 public:
  ObjectManagementDemo(VisualizationServer& srv) : server(srv) {}

  void run() {
    std::cout << "\n📊 对象管理操作演示" << std::endl;
    std::cout << "按 Ctrl+C 停止演示" << std::endl;

    // 清理现有窗口
    cleanup_all_windows();

    server.create_window(window_name, false);
    sleep_ms(500);

    // 开启自动更新策略，确保操作能及时发送到前端
    server.set_auto_update_policy(true, 2, 50);

    // 阶段1: 添加多个对象
    add_multiple_objects();

    // 阶段2: 清除动态对象
    clear_dynamic_objects();

    // 阶段3: 重新添加对象
    readd_objects();

    // 阶段4: 清除所有对象
    clear_all_objects();

    // 关闭自动更新
    server.set_auto_update_policy(false);

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

  void add_multiple_objects() {
    std::cout << "添加多个对象..." << std::endl;

    // 创建并添加对象，让它们保持作用域
    std::vector<std::shared_ptr<Vis::Observable>> objects;

    for (int i = 0; i < 6; ++i) {
      float x = -3.0f + 1.2f * i;
      auto point = Vis::Point2D::create({x, 0.0f});
      server.add(point, window_name,
                 create_random_material("对象" + std::to_string(i + 1)), false);
      objects.push_back(point);  // 保持对象引用，防止析构
      sleep_ms(300);
    }

    // 等待一下让所有对象都显示出来
    sleep_ms(1000);
    std::cout << "对象总数: " << server.get_observables_number() << std::endl;
    sleep_ms(2000);

    // 注意：objects 离开作用域时会析构，但服务器应该已经复制了对象数据
  }

  void clear_dynamic_objects() {
    std::cout << "清除动态对象..." << std::endl;

    // 使用 clear_dynamic 清除动态对象
    server.clear_dynamic(window_name, false);

    // 等待清除操作生效
    sleep_ms(1500);
    std::cout << "清除动态对象后对象数: " << server.get_observables_number()
              << std::endl;
  }

  void readd_objects() {
    std::cout << "重新添加对象..." << std::endl;

    // 重新创建一些对象
    std::vector<std::shared_ptr<Vis::Observable>> new_objects;

    for (int i = 0; i < 4; ++i) {
      float x = -2.0f + i * 1.0f;
      auto circle = Vis::Circle::create({x, 1.0f}, 0.3f);
      server.add(circle, window_name,
                 create_random_material("新对象" + std::to_string(i + 1)),
                 false);
      new_objects.push_back(circle);  // 保持对象引用
      sleep_ms(500);
    }

    // 等待新对象显示
    sleep_ms(1000);
    std::cout << "重新添加后对象数: " << server.get_observables_number()
              << std::endl;
    sleep_ms(2000);
  }

  void clear_all_objects() {
    std::cout << "清除所有对象..." << std::endl;

    // 使用 clear 清除所有对象
    server.clear(window_name, false);

    // 等待清除操作生效
    sleep_ms(1500);
    std::cout << "最终对象数: " << server.get_observables_number() << std::endl;
    sleep_ms(2000);
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

    ObjectManagementDemo demo(server);
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