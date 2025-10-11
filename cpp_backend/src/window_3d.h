// cpp_backend/src/window_3d.h
#pragma once

#include <memory>
#include <string>
#include <unordered_set>

#include "vis_primitives.h"

class Window3D {
 public:
  Window3D(const std::string& name = "", int width = 800, int height = 600);
  ~Window3D() = default;

  // 窗口基本属性
  void setTitle(const std::string& title) { title_ = title; }
  const std::string& getTitle() const { return title_; }

  void setName(const std::string& name) { name_ = name; }
  const std::string& getName() const { return name_; }

  void setSize(int width, int height) {
    width_ = width;
    height_ = height;
  }
  int getWidth() const { return width_; }
  int getHeight() const { return height_; }

  void setVisible(bool visible) { visible_ = visible; }
  bool isVisible() const { return visible_; }

  // 显示设置
  void setGridVisible(bool visible) { gridVisible_ = visible; }
  bool isGridVisible() const { return gridVisible_; }

  void setAxesVisible(bool visible) { axesVisible_ = visible; }
  bool isAxesVisible() const { return axesVisible_; }

  void setLegendVisible(bool visible) { legendVisible_ = visible; }
  bool isLegendVisible() const { return legendVisible_; }

  // 图元管理
  bool addObservable(Vis::Observable* obs);
  bool addObservable(const std::shared_ptr<Vis::Observable>& obs);
  bool containsObservable(Vis::Observable* obs) const;
  bool containsObservable(const std::shared_ptr<Vis::Observable>& obs) const;
  bool removeObservable(Vis::Observable* obs);
  bool removeObservable(const std::shared_ptr<Vis::Observable>& obs);
  void clearObservables();

  // 图元查询
  const std::unordered_set<Vis::Observable*>& getRawObservables() const {
    return rawObservables_;
  }
  const std::unordered_set<std::shared_ptr<Vis::Observable>>&
  getSharedObservables() const {
    return sharedObservables_;
  }
  size_t getObservableCount() const;

 private:
  // 窗口属性
  std::string title_;
  std::string name_;
  int width_;
  int height_;
  bool visible_;

  // 显示设置
  bool gridVisible_;
  bool axesVisible_;
  bool legendVisible_;

  // 图元数据
  std::unordered_set<Vis::Observable*> rawObservables_;
  std::unordered_set<std::shared_ptr<Vis::Observable>> sharedObservables_;
};