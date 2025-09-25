#include <vis_primitives.h>
#include <vis_stream.h>

#include <chrono>
#include <cmath>
#include <iostream>
#include <thread>
#include <vector>

#include "visualization.pb.h"  // 包含 Material 的完整定义

// 一个简单的辅助函数，用于代码延时
void sleep_ms(int milliseconds) {
  std::this_thread::sleep_for(std::chrono::milliseconds(milliseconds));
}

int main() {
  try {
    // 1. 初始化并运行服务器
    VisualizationServer::init(9002);
    auto& server = VisualizationServer::get();
    server.run();

    std::cout << "Server is running. Waiting for a client to connect..."
              << std::endl;
    std::cout << "Please open web_client/index.html in your browser."
              << std::endl;

    // 2. 等待客户端连接
    std::string window_id;
    while (true) {
      auto windows = server.get_connected_windows();
      if (!windows.empty()) {
        window_id = windows[0];
        break;
      }
      sleep_ms(100);
    }
    std::cout << "Client connected with window_id: " << window_id << std::endl;

    // --- 2D 功能演示开始 ---

    // 3. 演示2D场景控制指令 (注意 is_3d 参数为 false)
    std::cout << "\n--- DEMO: 2D Scene Control ---" << std::endl;
    server.set_title(window_id, "VisStream 2D Demo", false);
    std::cout << "Set 2D window title." << std::endl;
    sleep_ms(2000);

    // 4. 演示添加所有已实现的2D几何体
    std::cout << "\n--- DEMO: Adding 2D Geometries ---" << std::endl;

    // a. 创建一个点 (Point2D)
    auto point = Vis::Point2D::create({-2.0f, 2.0f});
    visualization::Material point_mat;
    point_mat.mutable_color()->set_r(1.0f);  // Red
    point_mat.set_point_size(10.0f);
    server.show(point, "my_point2d", point_mat, false);
    std::cout << "Added Point2D (red)." << std::endl;

    // b. 创建一个位姿 (Pose2D)
    auto pose = Vis::Pose2D::create({-2.0f, 1.0f}, 0.785f);  // 45 degrees
    visualization::Material pose_mat;
    pose_mat.mutable_color()->set_g(1.0f);  // Green
    pose_mat.set_point_size(15.0f);
    server.show(pose, "my_pose2d", pose_mat, false);
    std::cout << "Added Pose2D (green)." << std::endl;

    // c. 创建一个填充的圆 (Circle)
    auto circle = Vis::Circle::create({-2.0f, -1.0f}, 0.5f);
    visualization::Material circle_mat;
    circle_mat.set_filled(true);
    circle_mat.mutable_color()->set_b(1.0f);  // Blue border
    circle_mat.mutable_fill_color()->set_b(1.0f);
    circle_mat.mutable_fill_color()->set_a(0.5f);  // Semi-transparent blue fill
    server.show(circle, "my_circle", circle_mat, false);
    std::cout << "Added Circle (blue, filled)." << std::endl;

    // d. 创建一个线框矩形 (Box2D)
    Vis::Pose2D box_center_pose;
    box_center_pose.set_position({-2.0f, -2.5f});
    auto box = Vis::Box2D::create(box_center_pose, 1.0f, 0.5f, 0.5f);
    visualization::Material box_mat;
    box_mat.mutable_color()->set_r(1.0f);
    box_mat.mutable_color()->set_g(1.0f);  // Yellow
    box_mat.set_line_width(2.0f);
    server.show(box, "my_box2d", box_mat, false);
    std::cout << "Added Box2D (yellow)." << std::endl;

    // e. 创建一条线 (Line2D)
    auto line = Vis::Line2D::create({{0.0f, 2.0f}, {1.0f, 2.5f}, {2.0f, 2.0f}});
    visualization::Material line_mat;
    line_mat.mutable_color()->set_b(1.0f);
    line_mat.mutable_color()->set_g(1.0f);  // Cyan
    line_mat.set_line_width(3.0f);
    server.show(line, "my_line2d", line_mat, false);
    std::cout << "Added Line2D (cyan)." << std::endl;

    // f. 创建一个多边形 (Polygon)
    auto polygon = Vis::Polygon::create(
        {{0.0f, -1.0f}, {1.0f, -1.5f}, {0.5f, -2.5f}, {-0.5f, -2.0f}});
    visualization::Material polygon_mat;
    polygon_mat.set_filled(true);
    polygon_mat.mutable_color()->set_r(1.0f);  // Magenta border
    polygon_mat.mutable_color()->set_b(1.0f);
    polygon_mat.mutable_fill_color()->set_r(1.0f);
    polygon_mat.mutable_fill_color()->set_b(1.0f);
    polygon_mat.mutable_fill_color()->set_a(
        0.5f);  // Semi-transparent magenta fill
    server.show(polygon, "my_polygon", polygon_mat, false);
    std::cout << "Added Polygon (magenta, filled)." << std::endl;

    sleep_ms(2000);

    // 5. 演示2D动态更新
    std::cout << "\n--- DEMO: Dynamic 2D Updates (Animation) ---" << std::endl;
    server.set_auto_update_policy(true, 10, 33);  // 启用自动刷新

    for (int i = 0; i <= 360; ++i) {
      float angle = i * 3.14159f / 180.0f;
      float cos_a = cosf(angle);
      float sin_a = sinf(angle);

      // 更新点: 左右移动
      point->set_position({-2.0f + cos_a, 2.0f});

      // 更新位姿: 旋转
      pose->set_angle(angle);

      // 更新圆: 改变半径
      circle->set_radius(0.25f + (sin_a + 1.0f) * 0.25f);

      // 更新矩形: 移动并旋转
      auto current_box_pose = box->get_center();
      current_box_pose.set_position({-2.0f, -2.5f + sin_a * 0.5f});
      current_box_pose.set_angle(-angle);
      box->set_center(current_box_pose);

      // 更新线: 变成动态的正弦波
      std::vector<Vis::Vec2> line_points;
      for (int j = 0; j <= 10; ++j) {
        float seg = j / 10.0f;
        line_points.push_back(
            {seg * 3.0f, 2.0f + sinf(angle * 2.0f + seg * 10.0f) * 0.5f});
      }
      line->set_points(line_points);

      // 更新多边形: 顶点呼吸效果
      std::vector<Vis::Vec2> poly_points = {
          {0.0f * (1 + sin_a * 0.1f), -1.0f * (1 + sin_a * 0.1f)},
          {1.0f * (1 + sin_a * 0.1f), -1.5f * (1 + sin_a * 0.1f)},
          {0.5f * (1 + sin_a * 0.1f), -2.5f * (1 + sin_a * 0.1f)},
          {-0.5f * (1 + sin_a * 0.1f), -2.0f * (1 + sin_a * 0.1f)}};
      polygon->set_vertices(poly_points);

      sleep_ms(20);
    }

    server.set_auto_update_policy(false);  // 关闭自动刷新
    std::cout << "Animation finished." << std::endl;
    sleep_ms(2000);

    // 6. 演示移除对象
    std::cout << "\n--- DEMO: Removing 2D Objects ---" << std::endl;
    server.remove("my_point2d");
    server.remove("my_pose2d");
    server.remove("my_circle");
    server.remove("my_box2d");
    server.remove("my_line2d");
    server.remove("my_polygon");
    std::cout << "Removed all 2D objects." << std::endl;
    sleep_ms(2000);

    // 7. 停止服务器
    std::cout << "\n--- DEMO Finished. Stopping server. ---" << std::endl;
    server.stop();

  } catch (const std::exception& e) {
    std::cerr << "An exception occurred: " << e.what() << std::endl;
    return 1;
  }

  return 0;
}