/* jshint undef: true, unused: true */
/* global $, _, console, document, define, PDFListView, RectangularSelector, TableView, Backbone */

(function (name, context, definition) {
  if (typeof module != 'undefined' && module.exports) module.exports = definition();
  else if (typeof define == 'function' && define.amd) define(definition);
  else context[name] = definition();
})('AppView', this, function (name, context) {

// main app controller
var AppView = Backbone.View.extend({

  tagName: 'div',
  id: 'main',

  initialize: function(options) {
    this.render();
    this.pdfListView = new PDFListView(this.$('#pdf-list-view').get(0));
    this.options = options;

    if (options.pdfURL !== undefined) {
      this.loadPdf(options.pdfURL);
    }

    this.rectangularSelector = new RectangularSelector(this.pdfListView,
      {
        end: _.bind(this.endSelection, this)
      });
  },

  loadPdf: function(url) {
    this.pdfListView.loadPdf(url, this.options.onLoadProgress);
  },

  render: function() {
    this.$el.append("<div id='pdf-list-view'></div>");
    return this;
  },

  endSelection: function(event) {
    var tv = new TableView({
      position: event.absolutePos,
      target: event.pageView
    });
    this.$el.append(tv.el);
  },

  remove: function() {
    this.rectangularSelector.box.remove();
    Backbone.View.prototype.remove.call(this);
  }

});

return AppView;

});