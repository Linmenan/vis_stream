#include <vis_primitives.h>
#include <vis_stream.h>

#include <chrono>
#include <cmath>
#include <iostream>
#include <thread>
#include <vector>

#include "visualization.pb.h"
// 一个简单的辅助函数，用于代码延时
void sleep_ms(int milliseconds) {
  std::this_thread::sleep_for(std::chrono::milliseconds(milliseconds));
}

// 辅助函数：从轴-角创建一个四元数
Vis::Quaternion axis_angle_to_quaternion(float angle_rad, Vis::Vec3 axis) {
  float half_angle = angle_rad / 2.0f;
  float s = sinf(half_angle);
  return {
      .w = cosf(half_angle), .x = axis.x * s, .y = axis.y * s, .z = axis.z * s};
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

    // --- 功能演示开始 ---

    // 3. 演示场景控制指令
    std::cout << "\n--- DEMO: Scene Control ---" << std::endl;
    server.set_title(window_id, "VisStream Demo", true);
    std::cout << "Set window title." << std::endl;
    sleep_ms(2000);

    server.set_grid_visible(window_id, false, true);
    std::cout << "Grid is now hidden." << std::endl;
    sleep_ms(2000);

    server.set_axes_visible(window_id, false, true);
    std::cout << "Axes are now hidden." << std::endl;
    sleep_ms(2000);

    server.set_grid_visible(window_id, true, true);
    server.set_axes_visible(window_id, true, true);
    std::cout << "Grid and Axes are visible again." << std::endl;
    sleep_ms(2000);

    // 4. 演示添加所有已实现的几何体
    std::cout << "\n--- DEMO: Adding Geometries ---" << std::endl;

    // a. 创建一个红色的 Point3D
    auto point = Vis::Point3D::create({1.0f, 0.0f, 0.0f});
    visualization::Material point_mat;
    point_mat.mutable_color()->set_r(1.0f);
    point_mat.set_point_size(20.0f);
    server.show(point, "my_point", point_mat, true);
    std::cout << "Added Point3D (red)." << std::endl;

    // b. 创建一个绿色的 Ball
    auto ball = Vis::Ball::create({-1.0f, 0.0f, 0.0f}, 0.2f);
    visualization::Material ball_mat;
    ball_mat.mutable_color()->set_g(1.0f);
    server.show(ball, "my_ball", ball_mat, true);
    std::cout << "Added Ball (green)." << std::endl;

    // c. 创建一个蓝色的 Box3D
    Vis::Pose3D box_pose;
    box_pose.set_position({0.0f, 0.0f, 1.0f});
    auto box = Vis::Box3D::create(box_pose, 0.5f, 0.5f, 0.5f);
    visualization::Material box_mat;
    box_mat.mutable_color()->set_b(1.0f);
    server.show(box, "my_box", box_mat, true);
    std::cout << "Added Box3D (blue)." << std::endl;

    // d. 创建一个黄色的 Pose3D (显示为坐标轴)
    auto pose_viz = Vis::Pose3D::create();
    pose_viz->set_position({0.0f, 0.0f, -1.0f});
    visualization::Material
        pose_mat;  // Pose3D
                   // 通常没有自己的材质，前端会为其默认创建一个坐标轴表示
    server.show(pose_viz, "my_pose", pose_mat, true);
    std::cout << "Added Pose3D (yellow axes)." << std::endl;

    sleep_ms(2000);

    // 5. 演示动态更新
    std::cout << "\n--- DEMO: Dynamic Updates (Animation) ---" << std::endl;
    server.set_auto_update_policy(true, 10, 33);  // 启用自动刷新，动画更流畅

    for (int i = 0; i <= 360; ++i) {
      float angle = i * 3.14159f / 180.0f;

      // 更新点: 绕Y轴做圆形运动
      point->set_position({cosf(angle) * 2.0f, 0.0f, sinf(angle) * 2.0f});

      // 更新球: 上下运动
      ball->set_center({-1.0f, sinf(angle * 3.0f), 0.0f});

      // 更新立方体: 移动并自转
      auto current_box_pose = box->get_center();
      current_box_pose.set_position(
          {sinf(angle) * 1.5f, cosf(angle) * 1.5f, 1.0f});
      current_box_pose.set_orientation(
          axis_angle_to_quaternion(angle * 2.0f, {0.0f, 0.0f, 1.0f}));
      box->set_center(current_box_pose);

      // 更新Pose可视化: 绕着一个点公转，并指向中心
      pose_viz->set_position(
          {cosf(angle) * 1.5f, -1.0f, sinf(angle) * 1.5f - 1.0f});
      pose_viz->set_orientation(
          axis_angle_to_quaternion(angle, {0.0f, 1.0f, 0.0f}));

      sleep_ms(20);
    }

    server.set_auto_update_policy(false);  // 演示结束，关闭自动刷新
    std::cout << "Animation finished." << std::endl;
    sleep_ms(2000);

    // 6. 演示移除对象
    std::cout << "\n--- DEMO: Removing Objects ---" << std::endl;
    server.remove("my_point");
    std::cout << "Removed Point3D." << std::endl;
    sleep_ms(1000);

    server.remove("my_ball");
    std::cout << "Removed Ball." << std::endl;
    sleep_ms(1000);

    server.remove("my_box");
    std::cout << "Removed Box3D." << std::endl;
    sleep_ms(1000);

    server.remove("my_pose");
    std::cout << "Removed Pose3D." << std::endl;
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