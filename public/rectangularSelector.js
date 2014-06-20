(function (name, context, definition) {
  if (typeof module != 'undefined' && module.exports) module.exports = definition();
  else if (typeof define == 'function' && define.amd) define(definition);
  else context[name] = definition();
})('RectangularSelector', this, function (name, context) {

var rectangularSelector = function(pdfListView, options) {
    var isDragging = false;
    var target = null;
    var start = null;
    var box = $('<div></div>').addClass('selection-box').appendTo($('body'));
    var self = this;
    var pdfListView = pdfListView;
    var options = _.extend({
        selector: options.selector || 'div.page-view canvas',
        start: function() {},
        end: function() {},
        drag: function() {}
    }, options);
    var dims = ['top', 'left', 'width', 'height'];
    var fullSelector = options.selector + ', .selection-box';

    this.areas = {};

    $(document).on({
        mousedown: function(event) {
            target = this;
            isDragging = true;
            start = { x: event.pageX, y: event.pageY };
            box.css({
                'top': event.clientY,
                'left': event.clientX,
                'width': 0,
                'height': 0,
                'visibility': 'visible'
            });
            options.start(event);
        },

        mousemove: function(event) {

            if (!isDragging || ($(event.target).is(options.selector) && event.target !== target)) {
                return;
            }

            var targetOffset = $(target).offset();
            var ds = {
                'left': Math.min(start.x, event.pageX),
                'top': Math.min(start.y, event.pageY),
                'width': Math.abs(start.x - event.pageX),
                'height': Math.abs(start.y - event.pageY)
            }
            box.css(ds);
            options.drag(ds);
        },

        mouseup: function(event) {
            if (isDragging) { // selection ended
                var pvs = pdfListView.listView.pageViews, targetPageView;
                for (var i = 0; i < pvs.length; i++) {
                    if (pvs[i].canvas == target) {
                        targetPageView = pvs[i];
                        break;
                    }
                }
                var cOffset = $(target).offset();
                console.log(cOffset);
                var d = {
                    'absolutePos': _.object(dims, _.map(dims, function(d) { return parseFloat(box.css(d)); })),
                    'relativePos': {
                        'width': parseFloat(box.css('width')),
                        'height': parseFloat(box.css('height')),
                        'top': parseFloat(box.css('top')) - cOffset.top,
                        'left': parseFloat(box.css('left')) - cOffset.left
                    },
                    'pageView': targetPageView
                };
                options.end(d);
            }
            target = null;
            start = null;
            isDragging = false;
            box.css('visibility', 'hidden');
        }
    }, fullSelector);
};

return rectangularSelector;

});
