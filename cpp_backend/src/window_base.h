// cpp_backend/src/window_base.h
#pragma once
#include <memory>

#include "vis_primitives.h"

namespace Vis {

class Observable;

}  // namespace Vis

class WindowBase {
 public:
  virtual ~WindowBase() = default;

  // 图元管理接口 - 新增添加图元接口
  virtual bool addObservable(Vis::Observable* obs) = 0;
  virtual bool addObservable(const std::shared_ptr<Vis::Observable>& obs) = 0;
  virtual bool containsObservable(Vis::Observable* obs) const = 0;
  virtual bool containsObservable(
      const std::shared_ptr<Vis::Observable>& obs) const = 0;
  virtual bool removeObservable(Vis::Observable* obs) = 0;
  virtual bool removeObservable(
      const std::shared_ptr<Vis::Observable>& obs) = 0;
  virtual void clearObservables() = 0;

  // 获取图元集合
  virtual const std::unordered_set<Vis::Observable*>& getRawObservables()
      const = 0;
  virtual const std::unordered_set<std::shared_ptr<Vis::Observable>>&
  getSharedObservables() const = 0;
  virtual size_t getObservableCount() const = 0;

  // 窗口基本属性接口
  virtual const std::string& getName() const = 0;

  // 窗口显示设置接口
  virtual void setTitle(const std::string& title) = 0;
  virtual const std::string& getTitle() const = 0;

  virtual void setGridVisible(bool visible) = 0;
  virtual bool isGridVisible() const = 0;

  virtual void setAxesVisible(bool visible) = 0;
  virtual bool isAxesVisible() const = 0;

  virtual void setLegendVisible(bool visible) = 0;
  virtual bool isLegendVisible() const = 0;

  // 窗口状态接口
  virtual bool isVisible() const = 0;
  virtual void setVisible(bool visible) = 0;

  virtual int getWidth() const = 0;
  virtual int getHeight() const = 0;
  virtual void resize(int width, int height) = 0;

  // 窗口标识（使用指针地址）
  virtual const void* getWindowIdentifier() const = 0;
};