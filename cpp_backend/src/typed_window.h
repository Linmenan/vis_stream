// cpp_backend/src/typed_window.h
#pragma once
#include <memory>
#include <string>
#include <unordered_set>

#include "window_2d.h"
#include "window_3d.h"
#include "window_base.h"

template <typename WindowType>
class TypedWindow : public WindowBase {
 public:
  explicit TypedWindow(const std::string& name = "", int width = 800,
                       int height = 600)
      : windowData_(name, width, height) {}

  virtual ~TypedWindow() = default;

  // 获取底层窗口数据对象
  WindowType& getWindowData() { return windowData_; }
  const WindowType& getWindowData() const { return windowData_; }

  // WindowBase 接口实现 - 直接委托给windowData_
  bool addObservable(Vis::Observable* obs) override {
    return windowData_.addObservable(obs);
  }

  bool addObservable(const std::shared_ptr<Vis::Observable>& obs) override {
    return windowData_.addObservable(obs);
  }

  bool containsObservable(Vis::Observable* obs) const override {
    return windowData_.containsObservable(obs);
  }

  bool containsObservable(
      const std::shared_ptr<Vis::Observable>& obs) const override {
    return windowData_.containsObservable(obs);
  }

  bool removeObservable(Vis::Observable* obs) override {
    return windowData_.removeObservable(obs);
  }

  bool removeObservable(const std::shared_ptr<Vis::Observable>& obs) override {
    return windowData_.removeObservable(obs);
  }

  void clearObservables() override { windowData_.clearObservables(); }

  const std::unordered_set<Vis::Observable*>& getRawObservables()
      const override {
    return windowData_.getRawObservables();
  }

  const std::unordered_set<std::shared_ptr<Vis::Observable>>&
  getSharedObservables() const override {
    return windowData_.getSharedObservables();
  }

  size_t getObservableCount() const override {
    return windowData_.getObservableCount();
  }

  // 窗口属性接口
  const std::string& getName() const override { return windowData_.getName(); }

  void setTitle(const std::string& title) override {
    windowData_.setTitle(title);
  }

  const std::string& getTitle() const override {
    return windowData_.getTitle();
  }

  void setGridVisible(bool visible) override {
    windowData_.setGridVisible(visible);
  }

  bool isGridVisible() const override { return windowData_.isGridVisible(); }

  void setAxesVisible(bool visible) override {
    windowData_.setAxesVisible(visible);
  }

  bool isAxesVisible() const override { return windowData_.isAxesVisible(); }

  void setLegendVisible(bool visible) override {
    windowData_.setLegendVisible(visible);
  }

  bool isLegendVisible() const override {
    return windowData_.isLegendVisible();
  }

  bool isVisible() const override { return windowData_.isVisible(); }

  void setVisible(bool visible) override { windowData_.setVisible(visible); }

  int getWidth() const override { return windowData_.getWidth(); }

  int getHeight() const override { return windowData_.getHeight(); }

  void resize(int width, int height) override {
    windowData_.setSize(width, height);
  }

  const void* getWindowIdentifier() const override {
    return static_cast<const void*>(this);
  }

 private:
  WindowType windowData_;
};