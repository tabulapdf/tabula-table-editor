(function (name, context, definition) {
  if (typeof module != 'undefined' && module.exports) module.exports = definition();
  else if (typeof define == 'function' && define.amd) define(definition);
  else context[name] = definition();
})('AppView', this, function (name, context) {

// main app controller
var AppView = Backbone.View.extend({

  tagName: 'div',
  id: 'main',

  initialize: function initialize(options) {
    this.render();
    this.pdfListView = new PDFListView(this.$('#pdf-list-view').get(0));
    this.pdfListView.loadPdf(options.pdfURL);
    this.rectangularSelector = new RectangularSelector(this.pdfListView,
      { end: _.bind(this.endSelection, this) });
  },

  render: function() {
    this.$el.append("<div id='pdf-list-view'></div>");
    return this;
  },

  endSelection: function(event) {
    var tv = new TableView({ position: event.absolutePos });
    this.$el.append(tv.el);
    console.log('endSelection', event);
  }

});

return AppView;

});