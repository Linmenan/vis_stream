#include "window_2d.h"

Window2D::Window2D(const std::string& name, int width, int height)
    : title_(name),
      name_(name),
      width_(width),
      height_(height),
      visible_(true),
      gridVisible_(true),
      axesVisible_(true),
      legendVisible_(true) {}

bool Window2D::addObservable(Vis::Observable* obs) {
  if (!obs || containsObservable(obs)) {
    return false;
  }
  rawObservables_.insert(obs);
  return true;
}

bool Window2D::addObservable(const std::shared_ptr<Vis::Observable>& obs) {
  if (!obs || containsObservable(obs)) {
    return false;
  }
  sharedObservables_.insert(obs);
  return true;
}

bool Window2D::containsObservable(Vis::Observable* obs) const {
  return rawObservables_.find(obs) != rawObservables_.end();
}

bool Window2D::containsObservable(
    const std::shared_ptr<Vis::Observable>& obs) const {
  return sharedObservables_.find(obs) != sharedObservables_.end();
}

bool Window2D::removeObservable(Vis::Observable* obs) {
  return rawObservables_.erase(obs) > 0;
}

bool Window2D::removeObservable(const std::shared_ptr<Vis::Observable>& obs) {
  return sharedObservables_.erase(obs) > 0;
}

void Window2D::clearObservables() {
  rawObservables_.clear();
  sharedObservables_.clear();
}

size_t Window2D::getObservableCount() const {
  return rawObservables_.size() + sharedObservables_.size();
}