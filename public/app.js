/* jshint undef: true, unused: true */
/* global $, paper, Backbone, _ */

var TableView = Backbone.View.extend({
  hitOptions: {
    segments: true,
    stroke: true,
    fill: true,
    tolerance: 5
  },
  rectangleStyle: {
    fillColor: 'white',
    strokeWidth: 0,
    opacity: 0

  },
  tool: null,
  lastHitRectangle: null,
  paperScope: {},
  cells: null,

  initialize: function(options) {
    this.bounds = options.bounds;
    paper.install(this.paperScope);
    this.render();
  },

  render: function() {
    paper.setup(this.el);
    this.tool = new this.paperScope.Tool();
    this._installHandlers();
    var that = this;
    $.get('/cells.json', function(data) {
      _.each(data.vertical_rulings, function(r) {
        var line = new that.paperScope.Path.Line(new that.paperScope.Point(r[0], r[1]), new that.paperScope.Point(r[2], r[3]));
        line.strokeColor = 'red';
      });
      _.each(data.horizontal_rulings, function(r) {
        var line = new that.paperScope.Path.Line(new that.paperScope.Point(r[0], r[1]), new that.paperScope.Point(r[2], r[3]));
        line.strokeColor = 'red';
      });
      _.each(data.cells, function(cell) {
         var r = new that.paperScope.Path.Rectangle(cell[1], cell[0], cell[2], cell[3]).scale(0.95);
         r.style = that.rectangleStyle;
       });

      paper.view.draw();
    });
  },

  _installHandlers: function() {

    this.tool.onMouseMove = _.bind(function(event) {
                              var hitResult = this.paperScope.project.hitTest(event.point, this.hitOptions);
                              if (!hitResult || this.lastHitRectangle === hitResult.item) {
                                return;
                              }

                              if (this.lastHitRectangle !== null) {
                                this.lastHitRectangle.fillColor = 'white';
                              }
                              hitResult.item.fillColor = 'blue';
                              this.lastHitRectangle = hitResult.item;
                            }, this);
  }
});

$(function() {
  new TableView({ el: $('canvas#paper') });
});