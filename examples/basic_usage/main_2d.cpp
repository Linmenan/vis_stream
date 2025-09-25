#include <vis_primitives.h>
#include <vis_stream.h>

#include <chrono>
#include <cmath>
#include <iostream>
#include <thread>
#include <vector>

#include "visualization.pb.h"

void sleep_ms(int milliseconds) {
  std::this_thread::sleep_for(std::chrono::milliseconds(milliseconds));
}

int main() {
  try {
    VisualizationServer::init(9002);
    auto& server = VisualizationServer::get();
    server.run();

    std::cout << "Server is running..." << std::endl;
    std::string window_id;
    while (server.get_connected_windows().empty()) {
      sleep_ms(100);
    }
    window_id = server.get_connected_windows()[0];
    std::cout << "Client connected." << std::endl;

    server.set_title(window_id, "Full 2D Demo with Legends", false);

    // --- 演示添加所有已实现的2D几何体 ---
    std::cout << "\n--- DEMO: Adding All 2D Geometries ---" << std::endl;

    // a. 创建一个点 (Point2D)
    auto point = Vis::Point2D::create({-3.5f, 2.0f});
    visualization::Material point_mat;
    point_mat.mutable_color()->set_r(1.0f);  // Red
    point_mat.set_point_size(10.0f);
    point_mat.set_legend("Single Point");
    server.show(point, "my_point2d", point_mat, false);
    std::cout << "Added Point2D." << std::endl;

    // b. 创建一个位姿 (Pose2D)
    auto pose = Vis::Pose2D::create({-3.5f, 0.5f}, 0.785f);
    visualization::Material pose_mat;
    pose_mat.mutable_color()->set_g(1.0f);  // Green
    pose_mat.set_point_size(15.0f);
    pose_mat.set_legend("Pose (Arrow)");
    server.show(pose, "my_pose2d", pose_mat, false);
    std::cout << "Added Pose2D." << std::endl;

    // c. 创建一个填充的圆 (Circle)
    auto circle = Vis::Circle::create({-3.5f, -1.0f}, 0.5f);
    visualization::Material circle_mat;
    circle_mat.set_filled(true);
    circle_mat.mutable_color()->set_b(1.0f);
    circle_mat.mutable_fill_color()->set_b(1.0f);
    circle_mat.mutable_fill_color()->set_a(0.5f);
    circle_mat.set_legend("Circle");
    server.show(circle, "my_circle", circle_mat, false);
    std::cout << "Added Circle." << std::endl;

    // d. 创建一个线框矩形 (Box2D)
    Vis::Pose2D box_center_pose;
    box_center_pose.set_position({-3.5f, -2.5f});
    auto box = Vis::Box2D::create(box_center_pose, 1.0f, 0.5f, 0.5f);
    visualization::Material box_mat;
    box_mat.mutable_color()->set_r(1.0f);
    box_mat.mutable_color()->set_g(1.0f);  // Yellow
    box_mat.set_line_width(2.0f);
    box_mat.set_legend("Box");
    server.show(box, "my_box2d", box_mat, false);
    std::cout << "Added Box2D." << std::endl;

    // e. 创建第一条曲线 (实线)
    auto line1 = Vis::Line2D::create();
    visualization::Material line1_mat;
    line1_mat.mutable_color()->set_b(1.0f);  // Blue
    line1_mat.set_line_width(3.0f);
    line1_mat.set_legend("Sine Wave (Solid)");
    line1_mat.set_line_style(visualization::Material::SOLID);
    server.show(line1, "line1_sine", line1_mat, false);
    std::cout << "Added Line2D #1." << std::endl;

    // f. 创建第二条曲线 (虚线)
    auto line2 = Vis::Line2D::create();
    visualization::Material line2_mat;
    line2_mat.mutable_color()->set_r(1.0f);  // Orange
    line2_mat.mutable_color()->set_g(0.4f);
    line2_mat.set_line_width(2.0f);
    line2_mat.set_legend("Cosine Wave (Dashed)");
    line2_mat.set_line_style(visualization::Material::DASHED);
    server.show(line2, "line2_cosine", line2_mat, false);
    std::cout << "Added Line2D #2." << std::endl;

    // g. 创建一个多边形 (Polygon)
    auto polygon = Vis::Polygon::create(
        {{0.0f, -1.0f}, {1.0f, -1.5f}, {0.5f, -2.5f}, {-0.5f, -2.0f}});
    visualization::Material polygon_mat;
    polygon_mat.set_filled(true);
    polygon_mat.mutable_color()->set_r(1.0f);  // Magenta
    polygon_mat.mutable_color()->set_b(1.0f);
    polygon_mat.mutable_fill_color()->CopyFrom(polygon_mat.color());
    polygon_mat.mutable_fill_color()->set_a(0.5f);
    polygon_mat.set_legend("Polygon");
    server.show(polygon, "my_polygon", polygon_mat, false);
    std::cout << "Added Polygon." << std::endl;

    server.set_auto_update_policy(true, 10, 33);

    for (int i = 0; i <= 360; ++i) {
      float angle = i * 3.14159f / 180.0f;
      float cos_a = cosf(angle);
      float sin_a = sinf(angle);

      // 更新左侧的独立图元
      point->set_position({-3.5f + cos_a * 0.5f, 2.0f});
      pose->set_angle(angle * 2.0f);
      circle->set_radius(0.25f + (sin_a + 1.0f) * 0.25f);
      auto current_box_pose = box->get_center();
      current_box_pose.set_position({-3.5f, -2.5f + sin_a * 0.5f});
      current_box_pose.set_angle(-angle);
      box->set_center(current_box_pose);

      // 更新右侧的曲线和多边形
      std::vector<Vis::Vec2> sin_points, cos_points;
      for (int j = 0; j <= 50; ++j) {
        float seg = j / 50.0f;
        sin_points.push_back({seg * 3.0f, sinf(angle * 2.0f + seg * 10.0f)});
        cos_points.push_back({seg * 3.0f, cosf(angle * 2.0f + seg * 10.0f)});
      }
      line1->set_points(sin_points);
      line2->set_points(cos_points);

      std::vector<Vis::Vec2> poly_points = {
          {0.0f * (1 + sin_a * 0.1f), -1.0f * (1 + sin_a * 0.1f)},
          {1.0f * (1 + sin_a * 0.1f), -1.5f * (1 + sin_a * 0.1f)},
          {0.5f * (1 + sin_a * 0.1f), -2.5f * (1 + sin_a * 0.1f)},
          {-0.5f * (1 + sin_a * 0.1f), -2.0f * (1 + sin_a * 0.1f)}};
      polygon->set_vertices(poly_points);

      sleep_ms(20);
    }

    server.set_auto_update_policy(false);
    std::cout << "Animation finished." << std::endl;
    sleep_ms(3000);

    server.stop();

  } catch (const std::exception& e) {
    std::cerr << "An exception occurred: " << e.what() << std::endl;
    return 1;
  }
  return 0;
}