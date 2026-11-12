const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

function position(displays, primary, displayId, corner) {
  const display = displays.find(item => item.id === displayId) || primary;
  const work = display.workArea;
  const width = Math.min(600, work.width);
  const height = Math.min(420, work.height);
  const side = corners.includes(corner) ? corner : 'top-right';
  return {
    display,
    bounds: {
      x: work.x + (side.endsWith('right') ? work.width - width : 0),
      y: work.y + (side.startsWith('bottom') ? work.height - height : 0),
      width, height
    }
  };
}

module.exports = {corners, position};
