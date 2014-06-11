/* jshint undef: true, unused: true */
/* global $, paper, Backbone, _ */

var TableView = Backbone.View.extend({
  hitOptions: {
    segments: true,
    stroke: true,
    fill: true,
    tolerance: 2
  },
  rectangleStyle: {
    fillColor: 'white',
    strokeWidth: 0,
    opacity: 0

  },
  defaultTool: null,
  lastHitRectangle: null,
  paperScope: {},
  cells: null,
  draggedElement: null,

  initialize: function(options) {
    this.bounds = options.bounds;
    paper.install(this.paperScope);
    this.render();
    this._createDefaultTool();
  },

  render: function() {
    paper.setup(this.el);
    var that = this;
    $.get('/cells.json', function(data) {
      _.each(data.cells, function(cell) {
        var r = new that.paperScope.Path.Rectangle(cell[1], cell[0], cell[2], cell[3]);
        r.data = 'cell';
        r.style = that.rectangleStyle;
      });
      _.each(data.vertical_rulings, function(r) {
        var line = new that.paperScope.Path.Line(new that.paperScope.Point(r[0], r[1]), new that.paperScope.Point(r[2], r[3]));
        line.data = 'vertical';
        line.strokeColor = 'red';
      });
      _.each(data.horizontal_rulings, function(r) {
        var line = new that.paperScope.Path.Line(new that.paperScope.Point(r[0], r[1]), new that.paperScope.Point(r[2], r[3]));
        line.data = 'horizontal';
        line.strokeColor = 'red';
      });
      that.paperScope.view.draw();
    });
  },

  _createDefaultTool: function() {
    this.defaultTool = new this.paperScope.Tool();
    this.defaultTool.onMouseDrag = _.bind(function(event) {
                         if (this.draggedElement === null) {
                           return;
                         }
                         switch (this.draggedElement.data) {
                           case 'vertical':
                           this.draggedElement.position = new this.paperScope.Point(event.point.x, this.draggedElement.position.y);
                           break;
                           case 'horizontal':
                           this.draggedElement.position = new this.paperScope.Point(this.draggedElement.position.x, event.point.y);
                           break;
                         }
                       }, this);

    this.defaultTool.onMouseUp = _.bind(function() {
                       this.draggedElement = null;
                     }, this);

    this.defaultTool.onMouseDown = _.bind(function(event) {
                         var hitResult = this.paperScope.project.hitTest(event.point, this.hitOptions);
                         if (!hitResult && hitResult.item.data !== 'horizontal' && hitResult.item.data !== 'vertical') {
                           this.draggedElement = null;
                           return;
                         }


                         this.draggedElement = hitResult.item;
                       }, this);

    this.defaultTool.onMouseMove = _.bind(function(event) {
                         var hitResult = this.paperScope.project.hitTest(event.point, this.hitOptions);
                         if (!hitResult) {
                           $(this.paperScope.view.element).removeClass('horizontalMove verticalMove');
                           return;
                         }

                         switch(hitResult.item.data) {
                           case 'cell':
                           if (this.lastHitRectangle === hitResult.item) return;
                           $(this.paperScope.view.element).removeClass('horizontalMove verticalMove');
                           if (this.lastHitRectangle !== null) {
                             this.lastHitRectangle.fillColor = 'white';
                           }
                           hitResult.item.fillColor = 'blue';
                           this.lastHitRectangle = hitResult.item;
                           break;
                           case 'horizontal':
                           $(this.paperScope.view.element).addClass('horizontalMove');
                           break;
                           case 'vertical':
                           $(this.paperScope.view.element).addClass('verticalMove');
                           break;
                         }
                       }, this);
  },
});

$(function() {
  new TableView({ el: $('canvas#paper') });
});