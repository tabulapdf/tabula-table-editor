/* jshint undef: true, unused: true */
/* global $, paper, Backbone, _, console */

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

var toolbarTemplate = "<ul class='toolbar'>" +
                      "<li><input type='radio' name='tool' id='select' value='select' checked='true'><label for='select'>Select</label>" +
                      "<li><input type='radio' name='tool' id='addVertical' value='addVertical'><label for='addVertical'>Add vertical separator</label>" +
                      "<li><input type='radio' name='tool' id='addHorizontal' value='addHorizontal'><label for='addHorizontal'>Add horizontal separator</label>" +
                      "<li><input type='radio' name='tool' id='deleteSeparator' value='deleteSeparator'><label for='deleteSeparator'>Delete separator</label>" +
                      "<li><button name='merge' disabled='true'>Merge cells</button></li>" +
                      "</ul>";


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
  tools: {},
  paperScope: {},
  draggedElement: null,
  verticalRulings: null,
  horizontalRulings: null,
  selectedRectangles: null,
  currentSelection: null,
  intersectionPoints: {},
  sortedIntersectionPoints: null,
  intersectionGroup: null,

  events: {
    'click .toolbar input[type=radio]': 'activateTool',
    'click .toolbar button[name=merge]': 'mergeCells'
  },

  initialize: function(options) {
    this.bounds = options.bounds;
    paper.install(this.paperScope);
    this.render();
    this.intersectionGroup = new this.paperScope.Group();
    this.selectedRectangles = new this.paperScope.Group();
    this.selectedRectangles.sendToBack();
    this._createSelectTool();
    this._createAddSeparatorTools();
    this._createDeleteSeparatorTool();
  },

  render: function() {
    $(this.el).append(toolbarTemplate);
    $(this.el).append('<canvas />');
    paper.setup($('canvas', this.el).get(0));

    this.verticalRulings = new this.paperScope.CompoundPath( { strokeColor: 'green', strokeWidth: 2 });
    this.verticalRulings.data = 'vertical';
    this.horizontalRulings = new this.paperScope.CompoundPath( { strokeColor: 'green', strokeWidth: 2 } );
    this.horizontalRulings.data = 'horizontal';

    var that = this;

    $.get('cells.json', function(data) {
      _.each(data.vertical_rulings, function(r) {
        var line = new that.paperScope.Path.Line({
          from: new paper.Point(r[0], r[1]),
          to: new paper.Point(r[2], r[3]),
          parent: that.verticalRulings,
          data: 'vertical'
        });
      });
      _.each(data.horizontal_rulings, function(r) {
        var line = new that.paperScope.Path.Line({
          from: new that.paperScope.Point(r[0], r[1]),
          to: new that.paperScope.Point(r[2], r[3]),
          data: 'horizontal',
          parent: that.horizontalRulings
        });
      });
      that._findIntersections();
      that.paperScope.view.draw();
    });
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
                            new this.paperScope.Path.Line({
                              from: new paper.Point(v.position.x, v.bounds.top),
                              to: new paper.Point(v.position.x, this.currentSelection.bounds.top),
                              parent: this.verticalRulings,
                              data: 'vertical'
                            });
                          }
                          if (v.bounds.bottom > this.currentSelection.bounds.bottom) {
                            new this.paperScope.Path.Line({
                              from: new paper.Point(v.position.x, this.currentSelection.bounds.bottom),
                              to: new paper.Point(v.position.x, v.bounds.bottom),
                              parent: this.verticalRulings,
                              data: 'vertical'
                            });
                          }
                          v.remove();
                      }, this));
    var horizontals = _.initial(_.rest(_.sortBy(_.filter(this.horizontalRulings.children, p), function(h) { return h.position.y; })));
    _.each(horizontals, _.bind(function(h) {
                          if (h.bounds.left < this.currentSelection.bounds.left) {
                            new this.paperScope.Path.Line({
                              from: new paper.Point(h.bounds.left, h.bounds.y),
                              to: new paper.Point(this.currentSelection.bounds.left, h.position.y),
                              parent: this.horizontalRulings,
                              data: 'horizontal'
                            });
                          }
                          if (h.bounds.right > this.currentSelection.bounds.right) {
                            new this.paperScope.Path.Line({
                              from: new paper.Point(this.currentSelection.bounds.right, h.position.y),
                              to: new paper.Point(h.bounds.right, h.position.y),
                              parent: this.horizontalRulings,
                              data: 'horizontal'
                            });
                          }
                          h.remove();
                      }, this));

    this._findIntersections();
    this.paperScope.view.draw();
  },

  // returns a Rectangle: bounds of this table region
  getBounds: function() {
    return this.verticalRulings.bounds.unite(this.horizontalRulings.bounds);
  },

  _findIntersections: function() {
    this.intersectionPoints = {};
    this.intersectionGroup.removeChildren();
    this.verticalRulings
        .getIntersections(this.horizontalRulings)
        .forEach(_.bind(function(inters) {
                   new this.paperScope.Path.Circle({
		     center: inters.point,
		     radius: 2,
		     fillColor: '#009dec',
                     parent: this.intersectionGroup
		   });
                   this.intersectionPoints[inters.point] = inters;
                 }, this));



    var keys =  _.keys(this.intersectionPoints)
                 .sort(_.bind(function(arg1, arg2) {
                         return yFirstPointComparator(arg1, arg2,
                           this.intersectionPoints); },
                   this));

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

  _findDefinedRectangles: function(topLeftPoints) {
    var rectangles = [];

    if (topLeftPoints === undefined) {
      topLeftPoints = this.sortedIntersectionPoints;
    }

    _.each(
      this.sortedIntersectionPoints,
      _.bind(function(topLeft) {
        var r = this._findRectangleFrom(topLeft);
        if (r !== null) {
          rectangles.push(r);
        }
      }, this));
    return rectangles;
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
    var firstSelected = null;

    var extendSelection = _.bind(function(targetRectangle) {
                            this.selectedRectangles.removeChildren();
                            this.selectedRectangles.addChild(firstSelected);
                            this.selectedRectangles.addChild(new this.paperScope.Path.Rectangle(targetRectangle));
                            $('button[name=merge]', this.$el).prop('disabled', false);
                          }, this);

    var drawSelection = _.bind(function() {
                          if (this.currentSelection !== null) this.currentSelection.remove();
                          //this.currentSelection = new this.paperScope.Path.Rectangle(this.selectedRectangles.bounds);
                          this.currentSelection = _.extend(new this.paperScope.Path.Rectangle(this.selectedRectangles.bounds), this.currentSelectionStyle);
                          this.currentSelection.sendToBack();
                        }, this);

    var resetSelection = _.bind(function() {
                           if (this.currentSelection !== null) {
                             this.currentSelection.remove();
                             this.currentSelection = null;
                             this.selectedRectangles.removeChildren();
                             $('button[name=merge]', this.$el).prop('disabled', true);
                           }
                         }, this);

    this.tools.select = new this.paperScope.Tool();
    this.tools.select.onMouseDrag = _.bind(function(event) {
                                      var targetRectangle = this._findRectangleFrom(this._findClosestTopLeft(event.point));
                                      if (this.draggedElement !== null) {
                                        resetSelection();
                                        switch (this.draggedElement.data) {
                                          case 'vertical':
                                          this.draggedElement.position.x = event.point.x;
                                          break;
                                          case 'horizontal':
                                          this.draggedElement.position.y = event.point.y;
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
                                     this._findIntersections();
                                   }
                                   this.draggedElement = null;
                                 }, this);

    this.tools.select.onMouseDown = _.bind(function(event) {
                                     var hitResult = this.hitTest(event.point);
                                     if (!hitResult || hitResult.item.data === 'currentSelection') {
                                       // shift-click: get range of rectangles
                                       var clickedRectangle = this._findRectangleFrom(this._findClosestTopLeft(event.point));
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
                                         $('button[name=merge]', this.$el).prop('disabled', true);

                                       }
                                       drawSelection();
                                       this.draggedElement = null;
                                     }
                                     else if (hitResult.item.data === 'horizontal' || hitResult.item.data === 'vertical') {
                                       this.draggedElement = hitResult.item;
                                     }
                                   }, this);

    this.tools.select.onMouseMove = _.bind(function(event) {
                                      var hitResult = this.hitTest(event.point);
                                      $(this.el).removeClass('horizontalMove verticalMove cellSelect');
                                      if (!hitResult) {
                                        $(this.el).addClass('cellSelect');
                                        return;
                                      }
                                      switch(hitResult.item.data) {
                                        case 'currentSelection':
                                        $(this.el).addClass('cellSelect');
                                        break;
                                        case 'horizontal':
                                        $(this.el).addClass('horizontalMove');
                                        break;
                                        case 'vertical':
                                        $(this.el).addClass('verticalMove');
                                        break;
                                      }
                                    }, this);

    this.tools.select.onDeactivate = _.bind(function() {
                                       resetSelection();
                                       $('button[name=merge]', this.$el).prop('disabled', true);
                                       $(this.el).removeClass('horizontalMove verticalMove cellSelect');
                                     }, this);

  },

  hitTest: function(point) {
    return this.paperScope.project.hitTest(point, this.hitOptions);
  },

  _checkBounds: function(point, bounds) {
    if (bounds === undefined) {
      bounds = this.getBounds();
    }
    return bounds.contains(point);
  }
});

var tv;

$(function() {
  tv = new TableView({ el: $('div.table-region') });
});