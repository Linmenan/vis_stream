#include <vis_primitives.h>
#include <vis_stream.h>

#include <atomic>  // [新增]
#include <chrono>
#include <cmath>
#include <csignal>  // [新增]
#include <iostream>
#include <thread>
#include <vector>

#include "visualization.pb.h"

// [新增] 全局原子标志
std::atomic<bool> g_running(true);

// [新增] 信号处理函数
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
  return {
      .w = cosf(half_angle), .x = axis.x * s, .y = axis.y * s, .z = axis.z * s};
}

int main() {
  // [新增] 注册信号处理程序
  signal(SIGINT, signal_handler);

  try {
    VisualizationServer::init(9002);
    auto& server = VisualizationServer::get();
    server.run();

    std::cout << "Server is running. Press Ctrl+C to exit." << std::endl;
    std::string window_id;
    while (g_running && server.get_connected_windows().empty()) {
      sleep_ms(100);
    }

    if (!g_running) {
      server.stop();
      return 0;
    }

    window_id = server.get_connected_windows()[0];
    std::cout << "Client connected." << std::endl;

    server.set_title(window_id, "VisStream 3D Demo", true);

    // --- 在循环外创建所有几何体 ---
    auto point = Vis::Point3D::create({1.0f, 0.0f, 0.0f});
    visualization::Material point_mat;
    point_mat.mutable_color()->set_r(1.0f);
    point_mat.set_point_size(1.0f);
    point_mat.set_point_shape(
        visualization::Material::CROSS);  // 设置点的形状为圆形
    server.show(point, "my_point", point_mat, true);

    auto ball = Vis::Ball::create({-1.0f, 0.0f, 0.0f}, 0.2f);
    visualization::Material ball_mat;
    ball_mat.mutable_color()->set_g(1.0f);
    server.show(ball, "my_ball", ball_mat, true);

    Vis::Pose3D box_pose;
    box_pose.set_position({0.0f, 0.0f, 1.0f});
    auto box = Vis::Box3D::create(box_pose, 0.5f, 0.5f, 0.5f);
    visualization::Material box_mat;
    box_mat.mutable_color()->set_b(1.0f);
    server.show(box, "my_box", box_mat, true);

    auto pose_viz = Vis::Pose3D::create();
    pose_viz->set_position({0.0f, 0.0f, -1.0f});
    visualization::Material pose_mat;
    server.show(pose_viz, "my_pose", pose_mat, true);

    server.set_auto_update_policy(true, 10, 33);

    int i = 0;
    // [修改] 主循环
    while (g_running) {
      float angle = i * 3.14159f / 180.0f;

      point->set_position({cosf(angle) * 2.0f, 0.0f, sinf(angle) * 2.0f});
      ball->set_center({-1.0f, sinf(angle * 3.0f), 0.0f});

      auto current_box_pose = box->get_center();
      current_box_pose.set_position(
          {sinf(angle) * 1.5f, cosf(angle) * 1.5f, 1.0f});
      current_box_pose.set_orientation(
          axis_angle_to_quaternion(angle * 2.0f, {0.0f, 0.0f, 1.0f}));
      box->set_center(current_box_pose);

      pose_viz->set_position(
          {cosf(angle) * 1.5f, -1.0f, sinf(angle) * 1.5f - 1.0f});
      pose_viz->set_orientation(
          axis_angle_to_quaternion(angle, {0.0f, 1.0f, 0.0f}));

      sleep_ms(20);
      i++;
    }

    // --- 循环结束后，执行清理和退出 ---
    server.set_auto_update_policy(false);
    std::cout << "Animation loop finished. Cleaning up..." << std::endl;
    sleep_ms(500);

    server.stop();
    std::cout << "Server stopped." << std::endl;

  } catch (const std::exception& e) {
    std::cerr << "An exception occurred: " << e.what() << std::endl;
    return 1;
  }

  return 0;
}