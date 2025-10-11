// src/Windows/Window3D.cpp
#include "window_3d.h"

Window3D::Window3D(const std::string& name, int width, int height)
    : title_(name),
      name_(name),
      width_(width),
      height_(height),
      visible_(true),
      gridVisible_(false),
      axesVisible_(true),
      legendVisible_(true) {}

bool Window3D::addObservable(Vis::Observable* obs) {
  if (!obs || containsObservable(obs)) {
    return false;
  }
  rawObservables_.insert(obs);
  return true;
}

bool Window3D::addObservable(const std::shared_ptr<Vis::Observable>& obs) {
  if (!obs || containsObservable(obs)) {
    return false;
  }
  sharedObservables_.insert(obs);
  return true;
}

bool Window3D::containsObservable(Vis::Observable* obs) const {
  return rawObservables_.find(obs) != rawObservables_.end();
}

bool Window3D::containsObservable(
    const std::shared_ptr<Vis::Observable>& obs) const {
  return sharedObservables_.find(obs) != sharedObservables_.end();
}

bool Window3D::removeObservable(Vis::Observable* obs) {
  return rawObservables_.erase(obs) > 0;
}

bool Window3D::removeObservable(const std::shared_ptr<Vis::Observable>& obs) {
  return sharedObservables_.erase(obs) > 0;
}

void Window3D::clearObservables() {
  rawObservables_.clear();
  sharedObservables_.clear();
}

size_t Window3D::getObservableCount() const {
  return rawObservables_.size() + sharedObservables_.size();
}