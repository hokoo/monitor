const assert = require('node:assert/strict');
const {test} = require('node:test');
const {position} = require('../desktop/position.cjs');

const primary = {id: 11, workArea: {x: 0, y: 40, width: 1440, height: 860}};
const left = {id: 22, workArea: {x: -1280, y: -80, width: 1200, height: 700}};
const third = {id: 33, workArea: {x: 1440, y: 0, width: 320, height: 240}};

test('corners use display work areas in DIP, including negative origins and taskbars', () => {
  assert.deepEqual(position([primary, left], primary, 22, 'bottom-left').bounds, {x: -1280, y: 200, width: 600, height: 420});
  assert.deepEqual(position([primary, left], primary, 22, 'top-right').bounds, {x: -680, y: -80, width: 600, height: 420});
  assert.deepEqual(position([primary, left], primary, 22, 'top-left').bounds, {x: -1280, y: -80, width: 600, height: 420});
  assert.deepEqual(position([primary], primary, 11, 'bottom-right').bounds, {x: 840, y: 480, width: 600, height: 420});
});

test('small work area contains the entire window', () => {
  assert.deepEqual(position([primary, third], primary, 33, 'bottom-right').bounds, {x: 1440, y: 0, width: 320, height: 240});
});

test('missing preferred ID falls back, then returns to the same ID and corner', () => {
  const preferredId = 22;
  assert.equal(position([primary], primary, preferredId, 'bottom-left').display.id, 11);
  assert.deepEqual(position([third], third, preferredId, 'bottom-left').bounds, {x: 1440, y: 0, width: 320, height: 240});
  assert.deepEqual(position([primary, left], primary, preferredId, 'bottom-left').bounds, {x: -1280, y: 200, width: 600, height: 420});
});
