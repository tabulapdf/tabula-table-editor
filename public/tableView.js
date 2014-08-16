/* jshint undef: true, unused: true */
/* global $, paper, Backbone, _, console */

(function (name, context, definition) {
  if (typeof module != 'undefined' && module.exports) module.exports = definition();
  else if (typeof define == 'function' && define.amd) define(definition);
  else context[name] = definition();
})('TableView', this, function (name, context) {


var yFirstPointComparator = function(arg0, arg1, intersectionPoints) {
  var rv = 0;
  arg0 = intersectionPoints[arg0].point; arg1 = intersectionPoints[arg1].point;
  if (arg0.y > arg1.y) {
    rv = 1;
  }
  else if (arg0.y < arg1.y) {
    rv = -1;
  }
  else if (arg0.x > arg1.x) {
    rv = 1;
  }
  else if (arg0.x < arg1.x) {
    rv = -1;
  }
  return rv;
};

var pathsIntersect = function(path1, path2) {
  return path1.getIntersections(path2).length > 0;
};

var FLOAT_CMP_DELTA = 0.01;
var fEQ = function(a, b) {
  return a == b || (Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b))) < FLOAT_CMP_DELTA;
};
var fLTE = function(a, b) {
  return a < b || fEQ(a,b);
};

var fGTE = function(a, b) {
  return a > b || fEQ(a, b);
};

var resizeDirectionMatch = /(n|s|w|e|ne|nw|se|sw)-border/;

var TableView = Backbone.View.extend({
  hitOptions: {
    segments: true,
    stroke: true,
    fill: true,
    tolerance: 2
  },

  currentSelectionStyle: {
    fillColor: 'blue',
    opacity: 0.1,
    data: 'currentSelection'
  },

  rulingStyle: {
    strokeColor: 'green',
    strokeWidth: 2
  },

  tools: {},
  paperScope: {},
  draggedElement: null, // TODO move inside selectool
  verticalRulings: null,
  horizontalRulings: null,
  intersectionPoints: {},
  horizontalSeparators: [],
  verticalSeparators: [],
  verticalLinesIntersections: {},
  horizontalLinesIntersections: {},
  sortedIntersectionPoints: null,
  selectedRectangles: null,
  currentSelection: null,
  intersectionGroup: null,
  undoStack: [],

  tagName: 'div',
  className: 'table-region',

  events: {
    'click .toolbar input[type=radio]': 'activateTool',
    'click .toolbar button[name=merge]': 'mergeCells',
    'click .toolbar button[name=close]': 'remove',
    'mousedown .resize-handle': 'mouseDownResize',
    'mousemove': 'mouseMoveResize',
    'mouseup': 'mouseUpResize'
  },

  template:
    "<div class='resize-handle n-border'></div>" +
    "<div class='resize-handle s-border'></div>" +
    "<div class='resize-handle w-border'></div>" +
    "<div class='resize-handle e-border'></div>" +
    "<div class='resize-handle nw-border'></div>" +
    "<div class='resize-handle sw-border'></div>" +
    "<div class='resize-handle se-border'></div>" +
    "<div class='resize-handle ne-border'></div>" +
    "<canvas></canvas>" +
    "<ul class='toolbar' unselectable='on'>" +
    // "<li><input type='radio' name='tool' id='select' value='select' checked='true'><label for='select'>Select</label>" +
    // "<li><input type='radio' name='tool' id='addVertical' value='addVertical'><label for='addVertical'>Add vertical separator</label>" +
    // "<li><input type='radio' name='tool' id='addHorizontal' value='addHorizontal'><label for='addHorizontal'>Add horizontal separator</label>" +
    // "<li><input type='radio' name='tool' id='deleteSeparator' value='deleteSeparator' disabled='true'><label for='deleteSeparator'>Delete separator</label>" +
    // "<li><button name='merge' disabled='true'>Merge cells</button></li>" +
    "<li><button name='close'>×</button></li>" +
    "</ul>",

  initialize: function(options) {
    this.bounds = options.bounds;
    this.pageView = options.target;
    paper.install(this.paperScope);

    this.id = String.fromCharCode(65 + Math.floor(Math.random() * 26)) + Date.now();

    this.render();
    this.$el.css(options.position);

    this.intersectionGroup = new this.paperScope.Group();
    this.selectedRectangles = new this.paperScope.Group();
    this.selectedRectangles.sendToBack();
    this._createSelectTool();
    this._createAddSeparatorTools();
    this._createDeleteSeparatorTool();

    $(options.target.canvas).on({
      mousemove: _.bind(this.mouseMoveResize, this),
      mouseup: _.bind(this.mouseUpResize, this)
    });
  },

  render: function() {
    this.$el.append(this.template);
    paper.setup(this.$('canvas').get(0));

    this.verticalRulings = new this.paperScope.CompoundPath(this.rulingStyle);
    this.verticalRulings.data = 'vertical';
    this.horizontalRulings = new this.paperScope.CompoundPath(this.rulingStyle);
    this.horizontalRulings.data = 'horizontal';

    var that = this;

    $.get('cells.json', function(data) {
      _.each(data.vertical_rulings, function(r) {

        new that.paperScope.Path.Line({
          from: new paper.Point(r[0], r[1]),
          to: new paper.Point(r[2], r[3]),
          parent: that.verticalRulings,
          data: 'vertical'
        });
      });
      _.each(data.horizontal_rulings, function(r) {
        new that.paperScope.Path.Line({
          from: new that.paperScope.Point(r[0], r[1]),
          to: new that.paperScope.Point(r[2], r[3]),
          parent: that.horizontalRulings,
          data: 'horizontal'
        });
      });
      that._findIntersections();
      that.paperScope.view.draw();
    });
    return this;
  },

  getDims: function() {
    var o = this.$el.offset();
    return {
      id: this.id,
      top: o.top,
      left: o.left,
      width: this.$el.width(),
      height: this.$el.height()
    };
  },

  mouseDownResize: function(event) {
    var d = resizeDirectionMatch.exec($(event.target).attr('class'));
    if (!d || d.length < 2) {
      this.resizing = false;
    }
    else {
      this.resizing = d[1];
    }
  },

  mouseMoveResize: function(event) {
    if (!this.resizing) return;
    var ev = event;
    var css = {};
    var oldDims = this.getDims();

    if (this.resizing.indexOf('n') !== -1) {
      css.height = oldDims.height + oldDims.top - ev.pageY;
      css.top = ev.pageY;
    }
    else if (this.resizing.indexOf('s') !== -1) {
      css.height = ev.pageY - oldDims.top;
    }

    if (this.resizing.indexOf('w') !== -1) {
      css.width =  oldDims.width + oldDims.left - ev.pageX;
      css.left = ev.pageX;
    }
    else if (this.resizing.indexOf('e') !== -1) {
      css.width = ev.pageX - oldDims.left;
    }

    this.$el.css(css);
    if (!this.checkOverlaps()) {
      this.$el.css(oldDims);
    }
  },

  mouseUpResize: function(event) {
    if (this.resizing) {
      this.trigger('resize', this.getDims());
    }
    this.resizing = false;
  },

  // returns true if this tableView does not overlap
  // with any other on the same page
  checkOverlaps: function() {
    var thisDims = this.getDims();
    return _.every(
      _.reject(this.pageView.selections, function(s) {
        return s.id === this.id;
      }, this),
      function(s) {
        var sDims = s.getDims();
        return thisDims.left + thisDims.width < sDims.left ||
            sDims.left + sDims.width < thisDims.left ||
            thisDims.top + thisDims.height < sDims.top ||
            sDims.top + sDims.height < thisDims.top;
      }, this);
  },

  remove: function() {
    this.trigger('remove', this);
    Backbone.View.prototype.remove.call(this);
  },

  activateTool: function(event) {
    this.tools[$(event.target).val()].activate();
    this.paperScope.view.draw();
  },

  // merge the cells contained in this.currentSelection
  mergeCells: function() {
    var p = _.partial(pathsIntersect, this.currentSelection);
    var verticals = _.initial(_.rest(_.sortBy(_.filter(this.verticalRulings.children, p), function(v) { return v.position.x; })));
    _.each(verticals, _.bind(function(v) {
                          if (v.bounds.top < this.currentSelection.bounds.top) {
                            new this.paperScope.Path.Line(_.extend(this.rulingStyle, {
                              from: new paper.Point(v.position.x, v.bounds.top),
                              to: new paper.Point(v.position.x, this.currentSelection.bounds.top + this.rulingStyle.strokeWidth),
                              parent: this.verticalRulings,
                              data: 'vertical'
                            }));
                          }
                          if (v.bounds.bottom > this.currentSelection.bounds.bottom) {
                            new this.paperScope.Path.Line(_.extend(this.rulingStyle, {
                              from: new paper.Point(v.position.x, this.currentSelection.bounds.bottom),
                              to: new paper.Point(v.position.x, v.bounds.bottom),
                              parent: this.verticalRulings,
                              data: 'vertical'
                            }));
                          }
                          v.remove();
                      }, this));

    var horizontals = _.initial(_.rest(_.sortBy(_.filter(this.horizontalRulings.children, p), function(h) { return h.position.y; })));
    _.each(horizontals, _.bind(function(h) {
                          if (h.bounds.left < this.currentSelection.bounds.left) {
                            new this.paperScope.Path.Line(_.extend(this.rulingStyle, {
                              from: new paper.Point(h.bounds.left, h.bounds.y),
                              to: new paper.Point(this.currentSelection.bounds.left, h.position.y),
                              parent: this.horizontalRulings,
                              data: 'horizontal'
                            }));
                          }
                          if (h.bounds.right > this.currentSelection.bounds.right) {
                            new this.paperScope.Path.Line(_.extend(this.rulingStyle, {
                              from: new paper.Point(this.currentSelection.bounds.right, h.position.y),
                              to: new paper.Point(h.bounds.right, h.position.y),
                              parent: this.horizontalRulings,
                              data: 'horizontal'
                            }));
                          }
                          h.remove();
                      }, this));

    this._findIntersections();
    this.paperScope.view.draw();
  },

  // returns a Rectangle: bounds of this table region
  // TODO: return the defined bounds instead of the bounds of the existin rulings
  getBounds: function() {
    return this.verticalRulings.bounds.unite(this.horizontalRulings.bounds);
  },

  _findIntersections: function() {
    this.intersectionPoints = {};
    this.verticalLinesIntersections = {};
    this.horizontalLinesIntersections = {};
    this.intersectionGroup.removeChildren();
    this.verticalRulings
        .getIntersections(this.horizontalRulings)
        .forEach(_.bind(function(inters) {
                   // TODO remove this circle when finishing debugging
                   new this.paperScope.Path.Circle({
		     center: inters.point,
		     radius: 0,
		     fillColor: '#009dec',
                     parent: this.intersectionGroup
		   });

                   this.intersectionPoints[inters.point] = inters;

                   if (_.has(this.verticalLinesIntersections, inters.curve)) {
                     this.verticalLinesIntersections[inters.curve].push(inters.point);
                   }
                   else {
                     this.verticalLinesIntersections[inters.curve] = [inters.point];
                   }

                   if (_.has(this.horizontalLinesIntersections, inters.intersection.curve)) {
                     this.horizontalLinesIntersections[inters.intersection.curve].push(inters.point);
                   }
                   else {
                     this.horizontalLinesIntersections[inters.intersection.curve] = [inters.point];
                   }
                 }, this));

    var keys =  _.keys(this.intersectionPoints)
                 .sort(_.bind(function(arg1, arg2) {
                         return yFirstPointComparator(arg1, arg2,
                           this.intersectionPoints); },
                   this));

    this.verticalSeparators = _.uniq(
      _.map(this.verticalRulings.children, function(vr) { return vr.position.x; }),
      function(p) {
        return p.toFixed(2);
      }).sort(function(a,b) { return a - b; });

    this.horizontalSeparators = _.uniq(
      _.map(this.horizontalRulings.children, function(vr) { return vr.position.y; }),
      function(p) {
        return p.toFixed(2);
      }).sort(function(a,b) { return a - b; });

    this.sortedIntersectionPoints = [];
    for (var i = 0; i < keys.length; i++) {
      this.sortedIntersectionPoints.push(this.intersectionPoints[keys[i]].point);
    }
  },

  // finds the minimal rectangle defined by lines, such that point == top left corner
  // returns null if not found
  _findRectangleFrom: function(point) {
    var h = this.intersectionPoints[point].intersection.path,
        v = this.intersectionPoints[point].curve.path,
        topLeft = this.intersectionPoints[point].point,
        xPoints = [], yPoints = [],
        xPoint, yPoint, btmRight;

    for (var pi = _.indexOf(this.sortedIntersectionPoints, point) + 1; pi < this.sortedIntersectionPoints.length; pi++) {
      var p = this.sortedIntersectionPoints[pi];
      if (p.x.toFixed(4) === topLeft.x.toFixed(4) && p.y > topLeft.y) {
        xPoints.push(p);
        continue;
      }
      if (p.y.toFixed(4) === topLeft.y.toFixed(4) && p.x > topLeft.x) {
        yPoints.push(p);
        continue;
      }
    }

    for (var j = 0; j < xPoints.length; j++) {
      xPoint = xPoints[j];

      // is there an vertical edge b/w topLeft and yPoint ?
      if (v !== this.intersectionPoints[xPoint].curve.path) {
        continue;
      }
      for (var k = 0; k < yPoints.length; k++) {
        yPoint = yPoints[k];

        // is there an horizontal edge b/w topLeft and yPoint ?
        if (h !== this.intersectionPoints[yPoint].intersection.path) {
          continue;
        }

        btmRight = new paper.Point(yPoint.x, xPoint.y);

        if (this.intersectionPoints[btmRight] !== undefined &&
            this.intersectionPoints[btmRight].intersection.path == this.intersectionPoints[xPoint].intersection.path &&
            this.intersectionPoints[btmRight].curve.path == this.intersectionPoints[yPoint].curve.path) {
          return new paper.Rectangle(topLeft, btmRight);
        }
      }
    }
    return null;
  },

  _findDefinedRectangle: function(point) {
    var bounds = new paper.Rectangle(
      new paper.Point(this.getBounds().left,
        this.getBounds().top),
      point),
        p = null;

    for (var i = this.sortedIntersectionPoints.length - 1, r = null; i >= 0; i--) {
      p = this.sortedIntersectionPoints[i];
      if (!this._checkBounds(p, bounds)) continue;
      r = this._findRectangleFrom(p);
      if (r !== null && r.contains(point)) {
        return r;
      }
    }

    return null;
  },


  // find the closest point to target in the NW direction
  _findClosestTopLeft: function(target) {
    // TODO this might be optimized by keeping a reverseSortedIntersectionPoints
    // list and binary searching the closest NW point from target
    var p;
    for (var i = this.sortedIntersectionPoints.length - 1; i >= 0; i--) {
      p = this.sortedIntersectionPoints[i];
      if (p.y < target.y && p.x < target.x) return p;
    }
    return this.sortedIntersectionPoints[0];
  },


  _createAddSeparatorTools: function() {
    var verticalIndicatorLine = null, horizontalIndicatorLine = null;

    this.tools.addVertical = new this.paperScope.Tool();

    this.tools.addVertical.onMouseMove = _.bind(function(event) {
                                           if (!this._checkBounds(event.point)) return;
                                           verticalIndicatorLine.position.x = event.point.x;
                                         }, this);

    this.tools.addVertical.onMouseDown = _.bind(function(event) {
                                           if (!this._checkBounds(event.point)) return;
                                           new this.paperScope.Path.Line({
                                             from: new paper.Point(event.point.x, this.getBounds().y),
                                             to: new paper.Point(event.point.x, this.getBounds().height + this.getBounds().y),
                                             data: 'vertical',
                                             parent: this.verticalRulings
                                           });
                                           this._findIntersections();
                                         }, this);

    this.tools.addVertical.onActivate = _.bind(function() {
                                          var b = this.getBounds();
                                          verticalIndicatorLine = new this.paperScope.Path.Line({
                                            from: new paper.Point(b.x, b.y),
                                            to: new paper.Point(b.x, b.height + b.y),
                                            strokeColor: 'black',
                                            strokeWidth: 1,
                                            dashArray: [3, 2]
                                          });
                                        },this);

    this.tools.addVertical.onDeactivate = function() { verticalIndicatorLine.remove(); };


    this.tools.addHorizontal = new this.paperScope.Tool();

    this.tools.addHorizontal.onMouseMove = _.bind(function(event) {
                                             if (!this._checkBounds(event.point)) return;
                                             horizontalIndicatorLine.position.y = event.point.y;
                                         }, this);

    this.tools.addHorizontal.onMouseDown = _.bind(function(event) {
                                             if (!this._checkBounds(event.point)) return;
                                             var b = this.getBounds();
                                             new this.paperScope.Path.Line({
                                               from: new paper.Point(b.x, event.point.y),
                                               to: new paper.Point(b.width + b.x, event.point.y),
                                               data: 'horizontal',
                                               parent: this.horizontalRulings
                                             });
                                           this._findIntersections();
                                         }, this);

    this.tools.addHorizontal.onActivate = _.bind(function() {
                                          var b = this.getBounds();
                                          horizontalIndicatorLine = new this.paperScope.Path.Line({
                                            from: new paper.Point(b.x, b.y),
                                            to: new paper.Point(b.x + b.width, b.y),
                                            strokeColor: 'black',
                                            strokeWidth: 1,
                                            dashArray: [3, 2]
                                          });
                                        },this);

    this.tools.addHorizontal.onDeactivate = function() { horizontalIndicatorLine.remove(); };

  },

  _createDeleteSeparatorTool: function() {
    var lastHoveredSeparator = null;
    this.tools.deleteSeparator = new this.paperScope.Tool();
    this.tools.deleteSeparator.onMouseMove = _.bind(function(event) {
                                               var hitResult = this.hitTest(event.point);
                                               if (!hitResult) {
                                                 if (lastHoveredSeparator !== null) {
                                                   lastHoveredSeparator.strokeColor = 'green';
                                                   lastHoveredSeparator = null;
                                                 }
                                                 return;
                                               }
                                               if (hitResult.item.data === 'vertical' || hitResult.item.data === 'horizontal') {
                                                 lastHoveredSeparator = hitResult.item;
                                               }
                                             }, this);

    this.tools.deleteSeparator.onMouseDown = _.bind(function(event) {
                                               var hitResult = this.hitTest(event.point);
                                               if (!hitResult) {
                                                 return;
                                               }
                                               if (hitResult.item.data === 'vertical' || hitResult.item.data === 'horizontal') {
                                                 hitResult.item.remove();
                                                 this._findIntersections();
                                               }
                                             }, this);

  },


  _createSelectTool: function() {
    var firstSelected = null, dragBounds = [], pathsToChange = [];

    var extendSelection = _.bind(function(targetRectangle) {
                            this.selectedRectangles.removeChildren();
                            this.selectedRectangles.addChild(firstSelected);
                            var r = new this.paperScope.Path.Rectangle(targetRectangle);
                            if (!firstSelected.bounds.contains(targetRectangle)) {
                              this.selectedRectangles.addChild(r);
                            }
                            this.$('button[name=merge]').prop('disabled', this.selectedRectangles.children.length <= 1);
                            this.$('input#deleteSeparator').prop('disabled', false);
                          }, this);

    var drawSelection = _.bind(function() {
                          if (this.currentSelection !== null) this.currentSelection.remove();
                          this.currentSelection = _.extend(new this.paperScope.Path.Rectangle(this.selectedRectangles.bounds), this.currentSelectionStyle);
                          this.currentSelection.sendToBack();
                        }, this);

    var resetSelection = _.bind(function() {
                           if (this.currentSelection !== null) {
                             this.currentSelection.remove();
                             this.currentSelection = null;
                             this.selectedRectangles.removeChildren();
                             this.$('button[name=merge]').prop('disabled', true);
                             this.$('input#deleteseparator').prop('disabled', true);
                           }
                         }, this);

    var findBounds = _.bind(function(position, direction) {
                       var i;
                       switch(direction) {
                         case 'horizontal':
                         i = _.indexOf(this.horizontalSeparators, function(p) { return fEQ(p, position); });
                         return [i === 0 ? this.getBounds().top : this.horizontalSeparators[i-1],
                                 i === this.horizontalSeparators.length - 1 ? this.getBounds().bottom : this.horizontalSeparators[i+1]];
                         case 'vertical':
                         i = _.indexOf(this.verticalSeparators, function(p) { return fEQ(p, position); });
                         return [i === 0 ? this.getBounds().left : this.verticalSeparators[i-1],
                                 i === this.verticalSeparators.length - 1 ? this.getBounds().right : this.verticalSeparators[i+1]];
                       }
                       return null;
                     }, this);

    this.tools.select = new this.paperScope.Tool();
    this.tools.select.onMouseDrag = _.bind(function(event) {
                                      var targetRectangle = this._findDefinedRectangle(event.point), newP, si;
                                      if (this.draggedElement !== null) {
                                        resetSelection();
                                        switch (this.draggedElement.data) {
                                          case 'vertical':
                                          if (event.point.x > dragBounds[0] && event.point.x < dragBounds[1]) {
                                            this.draggedElement.position.x = event.point.x;
                                            _.each(pathsToChange, _.bind(function(p) {
                                                                    si = event.point.getDistance(p.firstSegment.point) < event.point.getDistance(p.lastSegment.point) ? 0 : 1;
                                                                    p.removeSegment(si);
                                                                    p.add(new paper.Point(event.point.x, p.position.y));
                                            }, this));
                                          }
                                          break;
                                          case 'horizontal':
                                          if (event.point.y > dragBounds[0] && event.point.y < dragBounds[1]) {
                                            this.draggedElement.position.y = event.point.y;
                                            _.each(pathsToChange, function(p) {
                                              si = event.point.getDistance(p.firstSegment.point) < event.point.getDistance(p.lastSegment.point) ? 0 : 1;
                                              p.removeSegment(si);
                                              p.add(new paper.Point(p.position.x, event.point.y));
                                            });

                                          }
                                          break;
                                        }
                                      }
                                      else if (this.currentSelection !== null && targetRectangle !== null) {
                                        extendSelection(targetRectangle);
                                        drawSelection();
                                      }
                                    }, this);

    this.tools.select.onMouseUp = _.bind(function() {
                                    if (this.draggedElement !== null) {
                                      if (this.draggedElement instanceof paper.Group) {
                                        var parent = this.draggedElement.data === 'vertical' ? this.verticalRulings : this.horizontalRulings;
                                        parent.addChildren(this.draggedElement.removeChildren());
                                        this.draggedElement.remove();
                                      }
                                      this._findIntersections();
                                    }
                                    this.draggedElement = null;
                                  }, this);

    this.tools.select.onMouseDown = _.bind(function(event) {

                                      var hitResult = this.hitTest(event.point);

                                      if (!hitResult || hitResult.item.data === 'currentSelection') {
                                        // shift-click: get range of rectangles
                                        var clickedRectangle = this._findDefinedRectangle(event.point);
                                        if (clickedRectangle === null) return;

                                        if (this.paperScope.Key.isDown('shift')) {
                                          if (this.currentSelection === null) {
                                            firstSelected = new this.paperScope.Path.Rectangle(clickedRectangle);
                                          }
                                          else {
                                            extendSelection(clickedRectangle);
                                            drawSelection();
                                          }
                                        }
                                        else {
                                          this.selectedRectangles.removeChildren();
                                          firstSelected = new this.paperScope.Path.Rectangle(clickedRectangle);
                                          this.selectedRectangles.addChild(firstSelected);
                                          this.$('button[name=merge]').prop('disabled', true);

                                        }
                                        drawSelection();
                                        this.draggedElement = null;
                                      }
                                      else if (hitResult.item.data === 'vertical') {
                                        // find lines that we need to shrink/grow
                                        console.log('horizontal', hitResult.item.firstSegment.point, hitResult.item.lastSegment.point);

                                        pathsToChange = _.reduce(this.verticalLinesIntersections[hitResult.item.curves[0]],
                                          _.bind(function(memo, p) {
                                             // new this.paperScope.Path.Circle({
		                             //   center: p,
		                             //   radius: 2,
		                             //   fillColor: 'red'
		                             // }).removeOnMove();

                                            return memo.concat(_.filter(this.horizontalRulings.children,
                                              function(hr) {
                                                return p.getDistance(hr.firstSegment.point) < FLOAT_CMP_DELTA ||
                                                  p.getDistance(hr.lastSegment.point) < FLOAT_CMP_DELTA;
                                              }));
                                          }, this),
                                          []);
                                        dragBounds = findBounds(hitResult.item.position.x, 'vertical');

                                        var rs = _.filter(this.verticalRulings.children,
                                          function(vr) {
                                            return fEQ(vr.position.x, hitResult.item.position.x);
                                          });

                                        if (rs.length > 1) {
                                          this.draggedElement = new this.paperScope.Group({
                                            children: rs,
                                            data: 'vertical'
                                          });
                                        }
                                        else {
                                          this.draggedElement = rs[0];
                                        }
                                      }
                                      else if (hitResult.item.data === 'horizontal') {

                                        pathsToChange = _.reduce(this.horizontalLinesIntersections[hitResult.item.curves[0]],
                                          _.bind(function(memo, p) {
                                          new this.paperScope.Path.Circle({
		                               center: p,
		                               radius: 2,
		                               fillColor: 'red'
		                             }).removeOnMove();

                                            return memo.concat(_.filter(this.verticalRulings.children,
                                              _.bind(function(vr) {
                                                return p.getDistance(vr.firstSegment.point) <= this.rulingStyle.strokeWidth ||
                                                  p.getDistance(vr.lastSegment.point) <= this.rulingStyle.strokeWidth;
                                              }, this)));
                                          }, this),
                                        []);

                                        console.log(pathsToChange);

                                        dragBounds = findBounds(hitResult.item.position.y, 'horizontal');
                                        var rs = _.filter(this.horizontalRulings.children,
                                          function(vr) {
                                            return fEQ(vr.position.y, hitResult.item.position.y);
                                          });

                                        if (rs.length > 1) {
                                          this.draggedElement = new this.paperScope.Group({
                                            children: rs,
                                            data: 'horizontal'
                                          });
                                        }
                                        else {
                                          this.draggedElement = rs[0];
                                        }

                                      }
                                   }, this);

    this.tools.select.onMouseMove = _.bind(function(event) {
                                      var hitResult = this.hitTest(event.point);
                                      this.$el.removeClass('horizontalMove verticalMove cellSelect');
                                      if (!hitResult) {
                                        this.$el.addClass('cellSelect');
                                        return;
                                      }
                                      switch(hitResult.item.data) {
                                        case 'currentSelection':
                                        this.$el.addClass('cellSelect');
                                        break;
                                        case 'horizontal':
                                        this.$el.addClass('horizontalMove');
                                        break;
                                        case 'vertical':
                                        this.$el.addClass('verticalMove');
                                        break;
                                      }
                                    }, this);

    this.tools.select.onDeactivate = _.bind(function() {
                                       resetSelection();
                                       this.$('button[name=merge]').prop('disabled', true);
                                       this.$el.removeClass('horizontalMove verticalMove cellSelect');
                                     }, this);

  },

  hitTest: function(point) {
    return this.paperScope.project.hitTest(point, this.hitOptions);
  },

  _checkBounds: function(point, bounds) {
    if (bounds === undefined) {
      bounds = this.getBounds();
    }
    //return bounds.contains(point);
    return fLTE(bounds.left, point.x) && fGTE(bounds.right, point.x) && fLTE(bounds.top, point.y) && fGTE(bounds.bottom, point.y);
  }
});

return TableView;

});
